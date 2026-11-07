# Exercises for the Recovery of Childhood

Static version of https://exercisesfortherecoveryofchildhood.com, for GitHub Pages.

Converted from the original PHP site by James Lindeman (Studio Lindeman). Typeface: Roslindale by David Jonathan Ross. Text © 2019 Andy Stallings and Peter Nilsson.

- `index.html` shows a random exercise; old `/?n=12` links redirect to `/12/`.
- `1/` … `62/` are one page per exercise, so social share previews work.
- `img/` holds the share-preview images.

## Visit notes (stats)

Private stats page at `/stats/` (noindex, not linked), modeled on the peternilsson.us and Schooled stats pages.

- `js/notes.js` — the tracker, loaded by every page. Reports views, which exercise was on screen (including the home page's random pick), "Show me another!" vs. number-list clicks, book-form signups, and time on page.
- `collector/` — the Cloudflare Worker (`childhood-notes`) and its D1 table.
- `.github/workflows/visit-notes.yml` — pulls rows from the collector twice a day. Skips quietly until the repo secret `CHILDHOOD_NOTES_KEY` exists.
- `scripts/split-days.js` → `data/days/*.json`; `scripts/build-summary.js` → `data/summary.json`, which the stats page reads.
- Silence your own browsers by loading any page once with `?notrack=1` (Chrome, Safari, phone).
