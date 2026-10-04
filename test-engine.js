'use strict';
var D = require('./engine.js'), cp = require('child_process');
var checks = 0, fails = 0;
function eq(a, b, m) { checks++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; if (fails < 25) console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } }
var seed = 7; function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function ri(n) { return Math.floor(rnd() * n); }
function pick(a) { return a[ri(a.length)]; }

// 1. Fixed vectors. Strict = RFC 3339 Appendix A grammar.
[['P1M', 1], ['PT1M', 1], ['P3Y6M4DT12H30M5S', 1], ['P1W', 1], ['PT36H', 1], ['P0D', 1], ['P1Y2M3D', 1], ['P1Y2M', 1],
 ['P1Y2D', 0], ['PT1H30S', 0], ['P1W2D', 0], ['P1.5D', 0], ['PT0.5S', 0], ['-P1D', 0], ['p1d', 0], ['P', 0], ['PT', 0], ['P1DT', 0], ['1D', 0], ['P1D1Y', 0], ['P1Y2M3DT4H5M6S', 1], ['P1YT1S', 1]
].forEach(function (v) { eq(D.parse(v[0]).strict, !!v[1], 'strict ' + v[0]); });
eq(D.parse('P1M').parts.M.value, 1, 'P1M is months'); eq(!!D.parse('PT1M').parts.TM, true, 'PT1M is minutes'); eq(!!D.parse('PT1M').parts.M, false, 'PT1M not months');
var jan31 = D.parseStart('2024-01-31 10:00');
eq(D.add(jan31, D.parse('P1M')).iso, '2024-02-29T10:00:00', 'Jan 31 + P1M leap'); eq(D.add(D.parseStart('2023-01-31'), D.parse('P1M')).iso, '2023-02-28T00:00:00', 'Jan 31 + P1M');
eq(D.add(D.parseStart('2024-02-29'), D.parse('P1Y')).iso, '2025-02-28T00:00:00', 'Feb 29 + P1Y');
eq(D.add(D.parseStart('2024-03-31'), D.parse('-P1M')).iso, '2024-02-29T00:00:00', 'Mar 31 - P1M');
eq(D.add(D.parseStart('2024-01-31'), D.parse('P1M1D')).iso, '2024-03-01T00:00:00', 'month clamp before days');
eq(D.add(D.parseStart('2024-01-31'), D.parse('P1DT36H')).iso, '2024-02-02T12:00:00', 'days and hours');
eq(D.add(D.parseStart('2024-01-31'), D.parse('P1.5D')).iso, '2024-02-01T12:00:00', 'fraction of a day');
eq(D.add(D.parseStart('2024-01-31'), D.parse('PT0,5S')).iso, '2024-01-31T00:00:00.500', 'decimal comma');
eq(typeof D.add(D.parseStart('2024-01-31'), D.parse('P0.5M')).error, 'string', 'fractional month refused');
eq(D.parseStart('2023-02-29'), null, 'invalid date'); eq(D.parseStart('2024-02-29').d, 29, 'valid leap date');

// 2. Strict grammar vs an independent ABNF transcription (Python), random and generated strings.
var cases = [], N = 6000, alpha = ['P', 'T', 'Y', 'M', 'W', 'D', 'H', 'S', '1', '2', '10', '0', '.', '-'];
for (var i = 0; i < N; i++) {
  var s;
  if (rnd() < 0.5) { s = 'P'; var n = ri(7), us = ['Y', 'M', 'W', 'D', 'T', 'H', 'M', 'S']; for (var j = 0; j < n; j++) { var u = pick(us); s += u === 'T' ? 'T' : pick(['1', '2', '15', '0']) + u; } }
  else { s = ''; var L = 1 + ri(9); for (var k = 0; k < L; k++) s += pick(alpha); if (rnd() < 0.7) s = 'P' + s; }
  cases.push({ kind: 'strict', s: s });
}
// 3. Date arithmetic vs dateutil relativedelta + timedelta, integer components, both signs.
var NA = 3000, arith = [];
for (var i2 = 0; i2 < NA; i2++) {
  var st = [1990 + ri(60), 1 + ri(12), 1 + ri(31), ri(24), ri(60), ri(60)];
  if (!D.parseStart(st[0] + '-' + (st[1] < 10 ? '0' : '') + st[1] + '-' + (st[2] < 10 ? '0' : '') + st[2])) { st[2] = 28 + ri(3); if (!D.parseStart(st[0] + '-' + (st[1] < 10 ? '0' : '') + st[1] + '-' + st[2])) st[2] = 28; }
  var comp = { Y: 0, M: 0, W: 0, D: 0, H: 0, MI: 0, S: 0 }, txt = 'P', tt = '';
  if (rnd() < .5) { comp.Y = ri(30); txt += comp.Y + 'Y'; } if (rnd() < .6) { comp.M = ri(30); txt += comp.M + 'M'; }
  if (rnd() < .2) { comp.W = ri(10); txt += comp.W + 'W'; } if (rnd() < .6) { comp.D = ri(100); txt += comp.D + 'D'; }
  if (rnd() < .5) tt += (comp.H = ri(100)) + 'H'; if (rnd() < .5) tt += (comp.MI = ri(200)) + 'M'; if (rnd() < .5) tt += (comp.S = ri(5000)) + 'S';
  if (tt) txt += 'T' + tt; if (txt === 'P') txt = 'P1D', comp.D = 1;
  var sign = rnd() < .3 ? -1 : 1; if (sign < 0) txt = '-' + txt;
  arith.push({ kind: 'arith', start: st, p: comp, sign: sign, txt: txt });
}
function py(list) { return JSON.parse(cp.execFileSync('python3', ['oracle.py'], { input: JSON.stringify(list), maxBuffer: 1 << 28, cwd: __dirname }).toString()); }
var o1 = py(cases);
cases.forEach(function (c, i) { eq(D.parse(c.s).strict, o1[i], 'ABNF ' + JSON.stringify(c.s)); });
var o2 = py(arith), skipped = 0;
arith.forEach(function (c, i) {
  var st = c.start, str = st[0] + '-' + (st[1] < 10 ? '0' : '') + st[1] + '-' + (st[2] < 10 ? '0' : '') + st[2] + 'T' + (st[3] < 10 ? '0' : '') + st[3] + ':' + (st[4] < 10 ? '0' : '') + st[4] + ':' + (st[5] < 10 ? '0' : '') + st[5];
  var r = D.add(D.parseStart(str), D.parse(c.txt));
  if (o2[i] === 'ERR') { skipped++; return; }
  eq(r.iso, o2[i], 'arith ' + str + ' ' + c.txt);
});
// 4. Generated from the grammar: every derivation must be strict-valid.
function gen() { var t = function () { var r = rnd(); if (r < .33) return 'T' + ri(50) + 'H' + (rnd() < .5 ? ri(50) + 'M' + (rnd() < .5 ? ri(50) + 'S' : '') : ''); if (r < .66) return 'T' + ri(50) + 'M' + (rnd() < .5 ? ri(50) + 'S' : ''); return 'T' + ri(50) + 'S'; };
  var r = rnd(); if (r < .2) return 'P' + t(); if (r < .3) return 'P' + ri(50) + 'W';
  var d = rnd() < .33 ? ri(50) + 'D' : rnd() < .5 ? ri(50) + 'M' + (rnd() < .5 ? ri(50) + 'D' : '') : ri(50) + 'Y' + (rnd() < .5 ? ri(50) + 'M' + (rnd() < .5 ? ri(50) + 'D' : '') : '');
  return 'P' + d + (rnd() < .5 ? t() : ''); }
for (var g = 0; g < 2000; g++) { var gs = gen(); eq(D.parse(gs).strict, true, 'generated ' + gs); eq(D.parse(gs).ok, true, 'generated lenient ' + gs); }
console.log('strict grammar: ' + N + ' random strings vs Python ABNF regex; arithmetic: ' + (NA - skipped) + ' cases vs dateutil relativedelta (' + skipped + ' out of range skipped); 2000 grammar-generated strings');
console.log(checks + ' checks, ' + fails + ' failures');
process.exit(fails ? 1 : 0);
