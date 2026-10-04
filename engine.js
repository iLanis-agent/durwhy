(function (root) {
  'use strict';
  // RFC 3339 Appendix A duration grammar, transcribed as a regular expression:
  //   dur-second = 1*DIGIT "S"; dur-minute = 1*DIGIT "M" [dur-second]; dur-hour = 1*DIGIT "H" [dur-minute]
  //   dur-time = "T" (dur-hour / dur-minute / dur-second); dur-day = 1*DIGIT "D"; dur-week = 1*DIGIT "W"
  //   dur-month = 1*DIGIT "M" [dur-day]; dur-year = 1*DIGIT "Y" [dur-month]
  //   dur-date = (dur-day / dur-month / dur-year) [dur-time]; duration = "P" (dur-date / dur-time / dur-week)
  var TIME = 'T(?:[0-9]+H(?:[0-9]+M(?:[0-9]+S)?)?|[0-9]+M(?:[0-9]+S)?|[0-9]+S)';
  var DATE = '(?:[0-9]+D|[0-9]+M(?:[0-9]+D)?|[0-9]+Y(?:[0-9]+M(?:[0-9]+D)?)?)';
  var STRICT = new RegExp('^P(?:' + DATE + '(?:' + TIME + ')?|' + TIME + '|[0-9]+W)$');
  var ORDER_D = ['Y', 'M', 'W', 'D'], ORDER_T = ['H', 'M', 'S'];
  var NUM = '([0-9]+(?:[.,][0-9]+)?)';

  // Lenient parse: what most libraries accept. Optional sign, any subset of components in order,
  // weeks mixed with others, one decimal fraction on the last component only.
  function parse(input) {
    var s = String(input).trim(), out = { input: s, strict: STRICT.test(s), ok: false, sign: 1, parts: {}, errors: [], notes: [] };
    var m = /^([-+]?)P(.*)$/.exec(s);
    if (!m) { out.errors.push('Must start with P (after an optional sign).'); return out; }
    if (m[1] === '-') out.sign = -1;
    if (m[1]) out.notes.push('A leading sign is accepted by many libraries but is not in the RFC 3339 grammar.');
    var body = m[2];
    if (!body) { out.errors.push('Nothing after P.'); return out; }
    var tpos = body.indexOf('T'), datePart = tpos < 0 ? body : body.slice(0, tpos), timePart = tpos < 0 ? '' : body.slice(tpos + 1);
    if (tpos >= 0 && !timePart) { out.errors.push('T must be followed by hours, minutes or seconds.'); return out; }
    var seq = [];
    function scan(str, order, prefix) {
      var re = new RegExp(NUM + '([A-Z])', 'g'), pos = 0, last = -1, x;
      while (pos < str.length) {
        re.lastIndex = pos; x = re.exec(str);
        if (!x || x.index !== pos) { out.errors.push('Cannot read "' + str.slice(pos) + '" at that spot.'); return false; }
        var u = x[2], idx = order.indexOf(u);
        if (idx < 0) { out.errors.push('Unit ' + u + ' is not allowed ' + (prefix ? 'after T' : 'before T') + '.'); return false; }
        if (idx <= last) { out.errors.push('Units must appear once, in order ' + order.join(', ') + '.'); return false; }
        last = idx; var key = prefix + u; seq.push(key);
        out.parts[key] = { text: x[1].replace(',', '.'), value: parseFloat(x[1].replace(',', '.')) };
        if (out.parts[key].value > 1e9) { out.errors.push('Number too large.'); return false; }
        pos = re.lastIndex;
      }
      return true;
    }
    if (!scan(datePart, ORDER_D, '') || !scan(timePart, ORDER_T, 'T')) return out;
    if (!seq.length) { out.errors.push('No components.'); return out; }
    for (var i = 0; i < seq.length - 1; i++) if (/[.]/.test(out.parts[seq[i]].text)) { out.errors.push('Only the last component may have a fraction.'); return out; }
    out.ok = true;
    var p = out.parts, frac = /[.]/.test(out.parts[seq[seq.length - 1]].text), mixW = !!p.W && seq.length > 1;
    if (frac) out.notes.push('Fractions are not in the RFC 3339 grammar.');
    if (mixW) out.notes.push('Weeks mixed with other units are accepted by many libraries, but RFC 3339 allows weeks only alone (PnW).');
    if (!out.strict && !m[1] && !frac && !mixW) out.notes.push('Not in the RFC 3339 grammar: each unit must follow the previous one without skipping (P1Y2D skips months, PT1H30S skips minutes).');
    return out;
  }

  function dim(y, mo) { return [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo]; }
  // Calendar addition: years and months first (day clamped to month length), then days/weeks and time as exact elapsed time.
  function add(start, parsed) {
    var p = parsed.parts, sg = parsed.sign, g = function (k) { return p[k] ? p[k].value : 0; };
    if ((p.Y && p.Y.text.indexOf('.') >= 0) || (p.M && p.M.text.indexOf('.') >= 0)) return { error: 'Fractional years or months have no calendar meaning, so no date is computed.' };
    var y = start.y + sg * g('Y'), mo0 = start.mo - 1 + sg * g('M');
    y += Math.floor(mo0 / 12); var mo = ((mo0 % 12) + 12) % 12;
    if (y < 1 || y > 9999) return { error: 'Result year is outside 0001 to 9999.' };
    var d = Math.min(start.d, dim(y, mo)), clamped = d !== start.d;
    var dt = new Date(0); dt.setUTCFullYear(y, mo, d); dt.setUTCHours(start.h, start.mi, start.s, 0);
    var ms = sg * Math.round(((g('W') * 7 + g('D')) * 86400 + g('TH') * 3600 + g('TM') * 60 + g('TS')) * 1000);
    var t = dt.getTime() + ms; var r = new Date(t);
    if (isNaN(t) || r.getUTCFullYear() < 1 || r.getUTCFullYear() > 9999) return { error: 'Result year is outside 0001 to 9999.' };
    return { date: r, iso: iso(r), clamped: clamped, elapsedDays: (t - startMs(start)) / 86400000 };
  }
  function startMs(s) { var d = new Date(0); d.setUTCFullYear(s.y, s.mo - 1, s.d); d.setUTCHours(s.h, s.mi, s.s, 0); return d.getTime(); }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function iso(d) { var f = d.getUTCMilliseconds(); return pad(d.getUTCFullYear(), 4) + '-' + pad(d.getUTCMonth() + 1, 2) + '-' + pad(d.getUTCDate(), 2) + 'T' + pad(d.getUTCHours(), 2) + ':' + pad(d.getUTCMinutes(), 2) + ':' + pad(d.getUTCSeconds(), 2) + (f ? '.' + pad(f, 3) : ''); }
  // Fixed-length reading: year 365 days, month 30 days. Only a rough size.
  function fixedDays(parsed) { var p = parsed.parts, g = function (k) { return p[k] ? p[k].value : 0; }; return parsed.sign * (g('Y') * 365 + g('M') * 30 + g('W') * 7 + g('D') + g('TH') / 24 + g('TM') / 1440 + g('TS') / 86400); }
  function parseStart(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(str).trim());
    if (!m) return null; var o = { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
    if (o.y < 1 || o.mo < 1 || o.mo > 12 || o.d < 1 || o.d > dim(o.y, o.mo - 1) || o.h > 23 || o.mi > 59 || o.s > 59) return null; return o;
  }
  var api = { parse: parse, add: add, fixedDays: fixedDays, parseStart: parseStart, STRICT: STRICT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DurWhy = api;
})(typeof window !== 'undefined' ? window : this);
