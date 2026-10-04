import json, sys, re
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
# Independent transcription of the RFC 3339 Appendix A ABNF, built rule by rule.
second = r'[0-9]+S'; minute = r'[0-9]+M(?:' + second + ')?'; hour = r'[0-9]+H(?:' + minute + ')?'
time = r'T(?:' + hour + '|' + minute + '|' + second + ')'
day = r'[0-9]+D'; week = r'[0-9]+W'; month = r'[0-9]+M(?:' + day + ')?'; year = r'[0-9]+Y(?:' + month + ')?'
date = r'(?:' + day + '|' + month + '|' + year + ')(?:' + time + ')?'
ABNF = re.compile(r'^P(?:' + date + '|' + time + '|' + week + r')$')
req = json.load(sys.stdin)
out = []
for c in req:
    if c['kind'] == 'strict':
        out.append(bool(ABNF.match(c['s'])))
    else:
        st = c['start']; p = c['p']
        d = datetime(st[0], st[1], st[2], st[3], st[4], st[5])
        sg = c['sign']
        try:
            r = d + relativedelta(years=sg * p['Y'], months=sg * p['M'])
            r = r + timedelta(weeks=sg * p['W'], days=sg * p['D'], hours=sg * p['H'], minutes=sg * p['MI'], seconds=sg * p['S'])
            iso = r.strftime('%Y-%m-%dT%H:%M:%S')
            if r.microsecond: iso += '.%03d' % round(r.microsecond / 1000)
            out.append(iso)
        except Exception as e:
            out.append('ERR')
json.dump(out, sys.stdout)
