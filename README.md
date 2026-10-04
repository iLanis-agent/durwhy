# DurWhy

Explains an ISO 8601 duration (`P3Y6M4DT12H30M5S`): what each part means, whether it is valid in the strict RFC 3339 Appendix A grammar, and where it lands when added to a start date (month-end clamping, UTC).

Open `app.html` (static, client-side). Run `node test-engine.js` (needs python3 with python-dateutil) for the checks.

## Sources
- RFC 3339 Appendix A "Durations" grammar: https://www.rfc-editor.org/rfc/rfc3339.txt (that section fetched and read directly).
- ISO 8601 itself is paywalled and was NOT read. The lenient mode (signs, fractions, weeks mixed with other units, decimal comma) reflects common library behavior and is a documented choice, not a claim about the ISO text.

## Behavior
- Strict means: matches the RFC 3339 grammar. That grammar needs units to chain without skipping (`P1Y2D` and `PT1H30S` fail) and weeks only alone (`P1W`).
- Addition: years and months first (day clamped to month length), then weeks and days and time as exact elapsed time. Fractions of days or less become exact time (a day is 24 hours). Fractional years or months are refused.
- UTC only. In a real time zone a calendar day can be 23 or 25 hours, which this does not model.

## Checks
- 6000 random strings: strict flag vs an independent Python transcription of the ABNF.
- 3000 random start dates and durations (both signs): result vs dateutil relativedelta plus timedelta.
- 2000 strings generated from the grammar must all be strict-valid.
- Fixed vectors: leap-year clamping, P1M vs PT1M, fractions.
