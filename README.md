# TAIMER

**[taimer.cards](https://taimer.cards/)** — *from hours to pay in seconds*

A paper-style employee time card that adds up the hours and works out the pay.
It is a faithful digital copy of the printed time sheet — same columns, same
A / B / C summary — with the arithmetic done for you.

Open `index.html` in a browser. No build step, no server, no account.

## What it does

* **Sheet header** — name, employee ID, nationality, work destination and the
  hourly wage standard. The pay period lives above the sheet and the currency
  in *Pay settings*, so neither is asked for twice.
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
* **Deductions and benefits**, each switched on in *Pay settings* and worked
  out automatically once ticked:
  * **Tax** — either a **flat rate** above a tax-free amount, or **PAYE
    bands**, which charge each slice of pay at its own rate and name the band
    the pay landed in. Either way a *Less tax* and *Net pay* line appears under
    the period's total. The band table ships with the rates long published for
    resident individuals in Botswana (nil to 48,000 a year, then 5%, 12.5%,
    18.75%, 25%), shown per month or per year, **but every threshold and rate
    is editable and should be checked against BURS** — the tax statutes changed
    on 1 July 2026 and published accounts of the new table disagree. *Reset
    table* returns to the shipped figures.
  * **Leave days**, **severance pay** and **grant / gratuity** — the things a
    company pays at the end of the year or when someone leaves. They appear in
    their own block, under a **Service period** setting — the dates of service,
    which are not the pay period above: this pay period, year to date, the last
    12 months, first to last day on record, or the dates you started and
    finished. Leave and severance count every month between those dates
    whether or not the hours reached this sheet, since they accrue on service;
    only the grant's percentage uses what the sheet recorded.
  * Leave accrues per month at a rate you set (1.25 days a month is Botswana's
    15-day minimum). Severance takes days per month for the first five years
    and a second, higher rate after that (one day, then two, matching the
    statutory pattern). The grant is a percentage of what was earned in the
    window, plus an optional fixed amount per month. A day is paid at the
    standard day's hours times the hourly rate.
* **Pay.** Enter a rate per hour and the sheet shows
  `A × rate`, `B × rate × 1.5`, `C × rate × 2` and the total. The multipliers
  and the currency are yours to set.
* **Any pay period** — a calendar month, a 23rd-to-22nd pay run, a single week
  or any custom range, with `‹` `›` to step to the period before or after.
* **Day flags.** `H` marks a day as a public holiday, `×` strikes a day out as
  a day off (the row is ruled through, just like on paper).
* **Print / PDF** gives you a clean sheet with the controls stripped out, and
  **Export CSV** hands the same figures to a spreadsheet.
* **Share TAIMER** opens the phone's own share sheet with the link, and
  **Get the poster** downloads a QR-code poster to print or pass on. Both work
  with no connection, since the poster is cached with the app.

## Look

The sheet uses the *Financial Stability* palette — navy `#0A3C6E`, white
`#FFFFFF`, blue `#1783C1` and charcoal `#333333` — with Arial (falling back to
Helvetica and Segoe UI) throughout, so it reads like a payroll document on
screen and on paper. Tints of the same blues mark weekends, public holidays and
days off, and figures are set in tabular numerals so the columns line up.

## How it is hosted

The site runs on **Vercel**, in the project `timer` (team *JackiesCode's
projects*), linked to this repository with `main` as the production branch.
There is no build step — the files are served as they are — so a push to `main`
deploys itself, and a push to any other branch gets a preview URL instead.

`taimer.cards` was registered through Vercel, so the domain, its DNS zone
(`ns1`/`ns2.vercel-dns.com`) and the HTTPS certificate all live in the same
account; nothing needs to be configured at a registrar. The site currently
answers on `https://www.taimer.cards`, with the bare `taimer.cards` issuing a
308 redirect to it. The canonical URL in `index.html`, `sitemap.xml` and
`robots.txt` names the bare domain, so if the apex is ever made primary the two
line up exactly; if `www` stays primary, change those three files instead.

GitHub Pages is not used. Its `CNAME` file has been removed, which is what
released `taimer.cards` from Pages; `.nojekyll` is left behind because it costs
nothing and is the piece that is easy to forget if Pages is ever switched back
on, alongside a new `CNAME` holding the domain.

When deploying a change that alters the page, stylesheet or script, bump
`CACHE` in `sw.js` (`taimer-v2` → `taimer-v3`) so every device replaces its
cached copy at once; otherwise the new files arrive on the second visit, since
the cached copy is served first and refreshed behind it.

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

## Groundwork for charging later

Nothing is gated — every feature is free and the app still works with no
account and no connection. What exists is the scaffolding, so that charging for
something later is a change of configuration rather than surgery:

* `PLANS` in `app.js` holds one entry per plan, with its limits and features.
  Today both entries allow everything. `can('feature')` and `limitOf('employees')`
  are the two questions the rest of the code should ask.
* `state.account` carries the plan, an anonymous random identifier for the
  installation, the date it started and a licence key if one is ever entered.
  The key is stored and otherwise ignored.
* `state.usage` counts prints, exports, shares and posters, and the panel in pay
  settings reports them beside the months and days recorded — the numbers you
  need to decide where a free tier should end.
* `state.schema` is stamped on saved data so a future version can migrate it.
* `terms.html` and `privacy.html` say plainly what the app does with what you
  type, which is nothing: every payment processor asks for both.

### Licence keys

Keys are signed by you and checked on the device. No processor, no accounts, no
server, and a key works with no signal — which is the point, given where this
app is used.

    node tools/keygen.mjs init
        Makes the signing pair once. The private half lands in
        tools/private-key.jwk, which .gitignore keeps out of the repository;
        the public half is written into app.js for the app to check against.

    node tools/keygen.mjs issue --plan pro --name "Someone" --expires 2027-12-31
        Prints a key to send to whoever paid. Add --copy <id> to tie it to one
        installation — the code shown in that person's pay settings.

`tools/issue.html` does the same in a browser, for when there is no Node to
hand: paste the key file, fill in the name, get a key. It signs in the page and
sends nothing anywhere.

Guard the private key. If it is lost, keys already issued keep working but no
new ones can be made without replacing the pair, which invalidates every key
already out there.

A key names a plan, a holder, an optional end date and an optional
installation. The app checks the signature, the date and the installation, then
sets `account.plan`. Since both plans currently allow everything, a key changes
only what the panel says — the moment you narrow `PLANS.free`, it starts to
mean something.

Worth knowing before building on it: this is a static app, so anything enforced
only in the browser can be bypassed by whoever holds the phone — a key cannot be
forged without your private key, but a determined person can edit their own copy
of the code. Features that need a server of yours — backup, sync between phones,
a supervisor seeing a crew's sheets — are the ones that enforce themselves.

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
| `logo.png` | The wordmark, white on transparency, used in the header |
| `social-card.png` | The preview image shown when the link is shared |
| `share-card.png` | The poster with the QR code, offered as a download in the app |
| `robots.txt`, `sitemap.xml` | What search engines read |
| `404.html` | The not-found page, in the same colours |
