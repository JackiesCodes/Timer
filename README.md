# TAIMER

**[taimer.cards](https://taimer.cards/)**

A paper-style employee time card that adds up the hours and works out the pay.
It is a faithful digital copy of the printed time sheet — same columns, same
A / B / C summary — with the arithmetic done for you.

Open `index.html` in a browser. No build step, no server, no account.

## What it does

* **Same layout as the paper sheet** — Week · Date · Work hour record
  (Morning / Afternoon) · Normal hours · Overtime type 1 & type 2 ·
  Employee confirm · Supervisor check, with the `Summary: A · B · C` and
  `Total hours A + B + C` rows at the bottom.
* **Adds up the hours as you type.** Morning + afternoon fills the *normal
  hours* column, capped at the standard working day (9 hours by default).
  Anything over the cap drops into overtime type 1.
* **Saturdays, Sundays and public holidays** go under overtime type 2
  automatically (switch it off in *Pay settings* if your workplace does it
  differently). Botswana public holidays are built in, including the
  Easter-based ones.
* **Quick fill**, sitting right above the table, fills the sheet in one tick
  (on a phone it starts collapsed to a single line showing what it is set to,
  and it remembers whether you left it open):
  *fill all*, *weekdays* (Mon–Fri), *weekend* (Sat & Sun), or *custom* — where
  you pick whichever days you like, Mondays only, Tuesdays and Thursdays, and
  so on. Set the morning and afternoon hours once (5 and 4 by default); the
  days the pattern covers are marked in the table before you commit, and
  *Clear those days* wipes the same selection. Tick *leave days that already
  have hours* to top up the empty days only; struck-out days off are never
  touched.
* **Overtime stays editable.** The type 1 / type 2 boxes show the calculated
  figure in grey; type your own number to override a day, clear the box to go
  back to the calculated one.
* **Pay.** Enter a rate per hour and the sheet shows
  `A × rate`, `B × rate × 1.5`, `C × rate × 2` and the total. The multipliers
  and the currency are yours to set.
* **Any pay period** — a calendar month, a 23rd-to-22nd pay run, a single week
  or any custom range, with `‹` `›` to step to the period before or after.
* **Day flags.** `H` marks a day as a public holiday, `×` strikes a day out as
  a day off (the row is ruled through, just like on paper).
* **Print / PDF** gives you a clean sheet with the controls stripped out, and
  **Export CSV** hands the same figures to a spreadsheet.

## Look

The sheet uses the *Financial Stability* palette — navy `#0A3C6E`, white
`#FFFFFF`, blue `#1783C1` and charcoal `#333333` — with Arial (falling back to
Helvetica and Segoe UI) throughout, so it reads like a payroll document on
screen and on paper. Tints of the same blues mark weekends, public holidays and
days off, and figures are set in tabular numerals so the columns line up.

## Putting it on taimer.cards

The repository is the site — there is nothing to build. `CNAME` already holds
`taimer.cards`, so on **GitHub Pages**: *Settings → Pages*, source *Deploy from
a branch*, pick this branch and the `/ (root)` folder, then set the custom
domain to `taimer.cards` and tick **Enforce HTTPS** once the certificate is
issued.

At the registrar, point the domain at Pages:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `<your-github-username>.github.io.` |

DNS usually settles within an hour, and the HTTPS certificate follows a few
minutes later. HTTPS matters here beyond privacy: the service worker that makes
the sheet work offline only runs on a secure origin.

Hosting it somewhere else instead (Netlify, Vercel, Cloudflare Pages) needs no
change to the files — publish the folder as-is, add `taimer.cards` as the
custom domain there, and delete `CNAME`, which only GitHub Pages reads.

The canonical URL, the social-preview card and the sitemap all name
`https://taimer.cards/`; if the domain ever changes, those live in
`index.html`, `sitemap.xml` and `robots.txt`.

## Offline and on the home screen

The sheet is a small installable app. Served over HTTPS (or from `localhost`),
it registers `sw.js`, which caches the page, the stylesheet, the script and the
icons, so it opens with no connection at all — useful on site where there is no
signal. `manifest.webmanifest` lets a phone add it to the home screen, where it
opens full screen without browser chrome.

Opened straight from disk (`file:///…/index.html`) it is offline by definition;
the worker is skipped and the sheet works the same.

When deploying a change, bump `CACHE` in `sw.js` (`taimer-v1` → `taimer-v2`) so
every device picks the new files up at once; otherwise they arrive on the second
visit, since the cached copy is served first and refreshed behind it.

## Notes

* Everything is stored in the browser's local storage on that device only —
  nothing is uploaded anywhere, and clearing the browser's site data clears
  the time card.
* Hours are entered as decimals: half an hour is `0.5`, a quarter is `0.25`.

## Files

| File | What's in it |
| --- | --- |
| `index.html` | The sheet's structure — header block, table, pay block |
| `styles.css` | The paper look, plus the mobile and print layouts |
| `app.js` | Dates, holidays, the hour and pay calculations, saving, CSV |
| `sw.js` | Service worker — caches the app so it runs with no connection |
| `manifest.webmanifest` | Name, colours and icons for installing it on a phone |
| `icon-*.png` | Home-screen icons (192, 512 and a maskable 512) |
| `social-card.png` | The preview image shown when the link is shared |
| `CNAME`, `robots.txt`, `sitemap.xml` | Custom domain and search-engine files |
| `404.html` | The not-found page, in the same colours |
