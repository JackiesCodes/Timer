/* TAIMER — time card & pay
   Stores everything in localStorage; no network, no accounts. */

(function () {
  'use strict';

  var STORE_KEY = 'taimer.v1';
  var SCHEMA = 1;          // bumped when saved data needs migrating
  var VERSION = '1.0';     // shown in the footer, quoted in support
  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /* ── helpers ──────────────────────────────────────────────────────── */

  function $(sel) { return document.querySelector(sel); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function fromISO(s) {
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

  function daysBetween(a, b) {
    return Math.round((fromISO(b) - fromISO(a)) / 86400000);
  }

  // Digits and a single decimal point — nothing else belongs in an hours,
  // rate or multiplier box.
  function decimalOnly(v) {
    return String(v).replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
  }

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function hrs(n) { return (Math.round(n * 100) / 100).toFixed(1); }

  function money(n) { return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  // Same amount without the thousands separators, so a CSV cell holds a
  // number rather than splitting across two columns.
  function plain(n) { return n.toFixed(2); }

  // Days read badly at one decimal: 1.25 is not 1.3 of a day.
  function days(n) {
    return (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  }

  function sheetDate(d) { return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear(); }

  /* ── public holidays (Botswana) ───────────────────────────────────── */

  var holidayCache = {};

  function easterSunday(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100,
        d = Math.floor(b / 4), e = b % 4,
        f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
        h = (19 * a + b - d - g + 15) % 30,
        i = Math.floor(c / 4), k = c % 4,
        l = (32 + 2 * e + 2 * i - h - k) % 7,
        m = Math.floor((a + 11 * h + 22 * l) / 451),
        month = Math.floor((h + l - 7 * m + 114) / 31),
        day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }

  function holidaysFor(year) {
    if (holidayCache[year]) return holidayCache[year];
    var map = {};
    var easter = easterSunday(year);

    function put(date, name) { map[iso(date)] = name; }

    put(new Date(year, 0, 1), "New Year's Day");
    put(new Date(year, 0, 2), 'Public Holiday');
    put(addDays(easter, -2), 'Good Friday');
    put(addDays(easter, -1), 'Holy Saturday');
    put(addDays(easter, 1), 'Easter Monday');
    put(new Date(year, 4, 1), 'Labour Day');
    put(addDays(easter, 39), 'Ascension Day');
    put(new Date(year, 6, 1), 'Sir Seretse Khama Day');

    // President's Day: third Monday of July, plus the day after.
    var july = new Date(year, 6, 1);
    var firstMon = addDays(july, (8 - july.getDay()) % 7);
    var presDay = addDays(firstMon, 14);
    put(presDay, "President's Day");
    put(addDays(presDay, 1), "President's Day Holiday");

    put(new Date(year, 8, 30), 'Botswana Day');
    put(new Date(year, 9, 1), 'Botswana Day Holiday');
    put(new Date(year, 11, 25), 'Christmas Day');
    put(new Date(year, 11, 26), 'Boxing Day');

    holidayCache[year] = map;
    return map;
  }

  function holidayName(dateISO) {
    return holidaysFor(+dateISO.slice(0, 4))[dateISO] || '';
  }

  /* ── plans ────────────────────────────────────────────────────────── */

  // Every feature is open today. The point of this table is that a limit
  // becomes a number here rather than a change scattered through the code.
  var PLANS = {
    free: {
      name: 'Free',
      employees: Infinity,
      historyMonths: Infinity,
      features: { print: true, csv: true, paye: true, benefits: true, share: true }
    },
    pro: {
      name: 'Pro',
      employees: Infinity,
      historyMonths: Infinity,
      features: { print: true, csv: true, paye: true, benefits: true, share: true }
    }
  };

  function plan() { return PLANS[state.account && state.account.plan] || PLANS.free; }

  /* ── licences ─────────────────────────────────────────────────────── */

  // The public half of the signing pair. Keys are signed on your own
  // machine and checked here on the device — no server is asked, so a key
  // works the same with no signal. Replace it with "node tools/keygen.mjs
  // init", which writes the private half to tools/private-key.jwk.
  var LICENCE_KEY_PUBLIC = {"kty":"EC","crv":"P-256","x":"fbi0VHZeC5xv124VzWN5o5PZ3c0aQql_C1vHoZgZz-Q","y":"6ga-FVhF0_dYtZ51jgxWfYGSKVFPPsRCGSGMRkJQ49Y"};

  function fromB64url(str) {
    str = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    var bin = atob(str);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Resolves to the licence a key carries, or to a reason it was refused.
  function readLicence(key) {
    key = String(key || '').replace(/\s+/g, '');

    if (!key) return Promise.resolve({ ok: false, why: 'empty' });
    if (!LICENCE_KEY_PUBLIC) return Promise.resolve({ ok: false, why: 'not-issuing' });

    var parts = key.split('.');
    if (parts.length !== 3 || parts[0] !== 'TAIMER1') return Promise.resolve({ ok: false, why: 'shape' });

    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle) return Promise.resolve({ ok: false, why: 'no-crypto' });

    var body, claim;
    try {
      body = fromB64url(parts[1]);
      claim = JSON.parse(new TextDecoder().decode(body));
    } catch (err) {
      return Promise.resolve({ ok: false, why: 'shape' });
    }

    return subtle.importKey('jwk', LICENCE_KEY_PUBLIC, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
      .then(function (pub) {
        return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64url(parts[2]), body);
      })
      .then(function (good) {
        if (!good) return { ok: false, why: 'signature' };
        if (claim.e && claim.e < iso(new Date())) return { ok: false, why: 'expired', claim: claim };
        if (claim.c && claim.c !== state.account.installId) return { ok: false, why: 'other-copy', claim: claim };
        if (!PLANS[claim.p]) return { ok: false, why: 'unknown-plan', claim: claim };
        return { ok: true, claim: claim };
      })
      .catch(function () { return { ok: false, why: 'shape' }; });
  }

  var LICENCE_WORDS = {
    empty: 'Enter the key you were sent.',
    shape: 'That does not look like a TAIMER key. Paste the whole thing, including the part before the first dot.',
    signature: 'That key was not issued for TAIMER, or it has been altered.',
    expired: 'That key has run out.',
    'other-copy': 'That key belongs to another copy of TAIMER.',
    'unknown-plan': 'That key names a plan this version does not know. Update the app and try again.',
    'no-crypto': 'Keys can only be checked over a secure connection. Open taimer.cards rather than a local file.',
    'not-issuing': 'Keys are not in use yet — every feature is already yours.'
  };

  // Applied at start-up too, so an expired key quietly reverts to free.
  function applyStoredLicence() {
    var key = state.account.licenceKey;
    if (!key) return;
    readLicence(key).then(function (res) {
      state.account.plan = res.ok ? res.claim.p : 'free';
      state.account.holder = res.ok ? (res.claim.n || '') : '';
      state.account.expires = res.ok ? (res.claim.e || '') : '';
      save();
      renderAccount();
    });
  }

  // Ask before doing anything that might one day be paid for.
  function can(feature) { return plan().features[feature] !== false; }
  function limitOf(name) { var v = plan()[name]; return v === undefined ? Infinity : v; }

  function newInstallId() {
    try {
      if (crypto && crypto.randomUUID) return crypto.randomUUID();
      var b = new Uint8Array(16);
      crypto.getRandomValues(b);
      return Array.prototype.map.call(b, function (n) { return ('0' + n.toString(16)).slice(-2); }).join('');
    } catch (err) {
      return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }
  }

  /* ── state ────────────────────────────────────────────────────────── */

  function defaultState() {
    var today = new Date();
    var first = new Date(today.getFullYear(), today.getMonth(), 1);
    var last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      profile: {
        name: '', employeeId: '', nationality: '', workDest: '',
        currency: 'BWP', rate: '', standardDay: '9', ot1Mult: '1.5', ot2Mult: '2',
        weekendIsOt2: true, autoHolidays: true,
        fillAm: '5', fillPm: '4', fillMode: '', fillDays: [1, 2, 3, 4, 5], fillKeep: false,

        // Paid every period
        taxOn: false, taxMethod: 'flat', taxRate: '', taxFree: '',
        payeBasis: 'monthly', payeBands: null,   // null = the shipped table
        // Paid yearly or on leaving, counted over benefitWindow
        leaveOn: false, leaveDays: '1.25',
        sevOn: false, sevDays1: '1', sevDays2: '2',
        grantOn: false, grantPct: '', grantFixed: '',
        benefitWindow: 'ytd', benefitFrom: '', benefitTo: ''
      },
      period: { start: iso(first), end: iso(last) },
      entries: {},
      account: { plan: 'free', licenceKey: '', holder: '', expires: '',
                 installId: newInstallId(), since: iso(today) },
      usage: { prints: 0, exports: 0, shares: 0, posters: 0 },
      schema: SCHEMA
    };
  }

  var state = load();

  function load() {
    var base = defaultState();
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return base;
      var saved = JSON.parse(raw);
      // Sheets saved before Saturdays counted as type 2 used a Sunday-only flag.
      if (saved.profile && saved.profile.weekendIsOt2 === undefined &&
          saved.profile.sundayIsOt2 !== undefined) {
        saved.profile.weekendIsOt2 = saved.profile.sundayIsOt2;
      }
      return {
        profile: Object.assign(base.profile, saved.profile || {}),
        period: Object.assign(base.period, saved.period || {}),
        entries: saved.entries || {},
        account: Object.assign(base.account, saved.account || {}),
        usage: Object.assign(base.usage, saved.usage || {}),
        schema: saved.schema || SCHEMA
      };
    } catch (err) {
      return base;
    }
  }

  // Toggling a flag or clearing a day leaves an empty record behind; drop
  // those so the saved sheet does not grow without bound.
  function pruneEntries() {
    Object.keys(state.entries).forEach(function (k) {
      var e = state.entries[k];
      var keep = Object.keys(e).some(function (f) {
        return e[f] !== '' && e[f] !== false && e[f] !== null && e[f] !== undefined;
      });
      if (!keep) delete state.entries[k];
    });
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 150);
  }

  function flushSave() {
    clearTimeout(saveTimer);
    pruneEntries();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (err) { /* private mode */ }
  }

  function entry(dateISO) {
    var e = state.entries[dateISO];
    if (!e) { e = state.entries[dateISO] = {}; }
    return e;
  }

  /* ── day maths ────────────────────────────────────────────────────── */

  function standardDay() {
    var n = num(state.profile.standardDay);
    return n > 0 ? n : 9;
  }

  function isHoliday(dateISO) {
    var e = state.entries[dateISO];
    if (e && typeof e.holiday === 'boolean') return e.holiday;
    return state.profile.autoHolidays && !!holidayName(dateISO);
  }

  function calcDay(dateISO) {
    var e = state.entries[dateISO] || {};
    var d = fromISO(dateISO);
    var weekend = d.getDay() === 0 || d.getDay() === 6;
    var holiday = isHoliday(dateISO);
    var restDay = !!state.profile.weekendIsOt2 && (weekend || holiday);
    var worked = num(e.am) + num(e.pm);
    var std = standardDay();

    var normal = 0, autoOt1 = 0, autoOt2 = 0;
    if (!e.off) {
      if (restDay) {
        autoOt2 = worked;
      } else {
        normal = Math.min(worked, std);
        autoOt1 = Math.max(0, worked - std);
      }
    }

    var manual1 = e.ot1 !== undefined && e.ot1 !== '' && e.ot1 !== null;
    var manual2 = e.ot2 !== undefined && e.ot2 !== '' && e.ot2 !== null;

    return {
      day: d.getDay(),
      weekend: weekend,
      holiday: holiday,
      holidayName: holidayName(dateISO),
      off: !!e.off,
      worked: worked,
      normal: normal,
      autoOt1: autoOt1,
      autoOt2: autoOt2,
      ot1: manual1 ? num(e.ot1) : autoOt1,
      ot2: manual2 ? num(e.ot2) : autoOt2,
      manual1: manual1,
      manual2: manual2
    };
  }

  function periodDates() {
    var out = [];
    var start = state.period.start, end = state.period.end;
    if (!start || !end) return out;
    var span = daysBetween(start, end);
    if (span < 0) { return out; }
    if (span > MAX_DAYS - 1) { span = MAX_DAYS - 1; }
    for (var i = 0; i <= span; i++) { out.push(iso(addDays(fromISO(start), i))); }
    return out;
  }

  /* ── rendering ────────────────────────────────────────────────────── */

  var body = $('#cardBody');

  function renderRows() {
    var dates = periodDates();
    var html = '';

    if (!dates.length) {
      body.innerHTML = '<tr><td colspan="9" class="week">Set a period start on or before the period end.</td></tr>';
      return;
    }

    dates.forEach(function (dISO, idx) {
      var d = fromISO(dISO);
      var e = state.entries[dISO] || {};
      var holFlagOn = typeof e.holiday === 'boolean' ? e.holiday : isHoliday(dISO);
      var newWeek = idx > 0 && d.getDay() === 1;

      html +=
        '<tr data-d="' + dISO + '"' + (newWeek ? ' class="newweek"' : '') + '>' +
          '<td class="week">' + DAY_NAMES[d.getDay()] + '</td>' +
          '<td class="date" title="' + (holidayName(dISO) || '') + '">' +
            '<div class="date-in">' +
              '<span class="dtxt">' + sheetDate(d) + '</span>' +
              '<span class="flags">' +
                '<button type="button" class="flag hol' + (holFlagOn ? ' on' : '') + '" data-flag="holiday" title="Mark as public holiday">H</button>' +
                '<button type="button" class="flag offf' + (e.off ? ' on' : '') + '" data-flag="off" title="Mark as day off">&times;</button>' +
              '</span>' +
            '</div>' +
          '</td>' +
          cellInput('am', e.am) +
          cellInput('pm', e.pm) +
          '<td class="normal strike"><span class="val">&nbsp;</span></td>' +
          cellInput('ot1', e.ot1) +
          cellInput('ot2', e.ot2) +
          sigCell('emp', e.emp) +
          sigCell('sup', e.sup) +
        '</tr>';
    });

    body.innerHTML = html;
    refresh();
  }

  function cellInput(field, value) {
    return '<td class="strike"><input class="cell-input" type="text" inputmode="decimal" autocomplete="off" ' +
      'data-f="' + field + '" value="' + (value == null ? '' : String(value).replace(/"/g, '&quot;')) + '" /></td>';
  }

  function sigCell(field, on) {
    return '<td class="sig strike"><input type="checkbox" data-f="' + field + '"' + (on ? ' checked' : '') + ' />' +
      '<span class="sigmark">' + (on ? '&#10003;' : '') + '</span></td>';
  }

  function refresh(opts) {
    var totals = { a: 0, b: 0, c: 0 };
    var rows = body.querySelectorAll('tr[data-d]');

    Array.prototype.forEach.call(rows, function (tr) {
      var dISO = tr.getAttribute('data-d');
      var day = calcDay(dISO);

      tr.classList.toggle('rest', day.weekend && !day.holiday && !day.off);
      tr.classList.toggle('holiday', day.holiday && !day.off);
      tr.classList.toggle('off', day.off);

      var normalCell = tr.querySelector('td.normal .val');
      normalCell.innerHTML = day.off || day.normal === 0 ? '&nbsp;' : hrs(day.normal);

      setAuto(tr, 'ot1', day.manual1, day.autoOt1);
      setAuto(tr, 'ot2', day.manual2, day.autoOt2);

      Array.prototype.forEach.call(tr.querySelectorAll('td.sig'), function (td) {
        var box = td.querySelector('input');
        td.querySelector('.sigmark').innerHTML = box.checked ? '&#10003;' : '';
      });

      totals.a += day.normal;
      totals.b += day.ot1;
      totals.c += day.ot2;
    });

    $('#totA').firstChild.nodeValue = hrs(totals.a);
    $('#totB').firstChild.nodeValue = hrs(totals.b);
    $('#totC').firstChild.nodeValue = hrs(totals.c);
    $('#totAll').textContent = hrs(totals.a + totals.b + totals.c);

    renderPay(totals);
    renderBenefits();
    renderAccount();
    if (!(opts && opts.keepBands)) renderBandTable();
    syncQuickFill();
    save();
  }

  function setAuto(tr, field, manual, autoValue) {
    var input = tr.querySelector('input[data-f="' + field + '"]');
    if (!input) return;
    input.classList.toggle('auto', !manual);
    if (manual || input === document.activeElement) return;
    input.value = autoValue > 0 ? hrs(autoValue) : '';
  }

  /* ── how this copy is being used ──────────────────────────────────── */

  function countUse(what) {
    if (!state.usage) state.usage = { prints: 0, exports: 0, shares: 0, posters: 0 };
    state.usage[what] = (state.usage[what] || 0) + 1;
    save();
    renderAccount();
  }

  function recorded() {
    var months = {}, days = 0;
    Object.keys(state.entries).forEach(function (d) {
      var e = state.entries[d];
      if (num(e.am) + num(e.pm) > 0) { days += 1; months[d.slice(0, 7)] = true; }
    });
    return { months: Object.keys(months).length, days: days };
  }

  function renderAccount() {
    var a = state.account, u = state.usage || {}, r = recorded();
    $('#planName').textContent = plan().name +
      (a.holder ? ' · ' + a.holder : '') +
      (a.expires ? ' · until ' + a.expires : '');
    $('#installId').textContent = (a.installId || '').slice(0, 8);
    $('#usageLine').textContent =
      r.months + ' month' + (r.months === 1 ? '' : 's') + ' recorded · ' +
      r.days + ' day' + (r.days === 1 ? '' : 's') + ' of hours · ' +
      (u.prints || 0) + ' printed · ' + (u.exports || 0) + ' exported';
    if ($('#licenceKey') !== document.activeElement) $('#licenceKey').value = a.licenceKey || '';
  }

  /* ── PAYE bands ───────────────────────────────────────────────────── */

  // Thresholds are held per year; the monthly view is a twelfth of each.
  // These are the rates published for resident individuals before Botswana's
  // tax statutes changed on 1 July 2026 — they ship as a starting point and
  // every figure is editable in pay settings.
  var SHIPPED_BANDS = [
    { from: 0, rate: 0 },
    { from: 48000, rate: 5 },
    { from: 84000, rate: 12.5 },
    { from: 120000, rate: 18.75 },
    { from: 156000, rate: 25 }
  ];

  function payeBands() {
    var saved = state.profile.payeBands;
    if (!Array.isArray(saved) || !saved.length) {
      return SHIPPED_BANDS.map(function (b) { return { from: b.from, rate: b.rate }; });
    }
    return saved.slice().sort(function (a, b) { return num(a.from) - num(b.from); });
  }

  function bandDivisor() { return state.profile.payeBasis === 'annual' ? 1 : 12; }

  // Progressive tax: each band is charged only on the slice of income inside
  // it. Returns the tax and which band the income came to rest in.
  function payeOn(income) {
    var bands = payeBands();
    var div = bandDivisor();
    var tax = 0, hit = 0, base = 0, bases = [];

    for (var i = 0; i < bands.length; i++) {
      var from = num(bands[i].from) / div;
      var to = i + 1 < bands.length ? num(bands[i + 1].from) / div : Infinity;
      bases.push(base);
      if (income > from) {
        tax += (Math.min(income, to) - from) * num(bands[i].rate) / 100;
        hit = i;
      }
      base += (to - from) * num(bands[i].rate) / 100;
    }
    return { tax: tax, band: hit, bases: bases, bands: bands, div: div };
  }

  function renderBandTable() {
    var bands = payeBands();
    var div = bandDivisor();
    $('#bandScaleLbl').textContent = 'Income above · per ' + (div === 12 ? 'month' : 'year');
    var gross = lastGross;
    var result = payeOn(gross);

    $('#payeRows').innerHTML = bands.map(function (b, i) {
      var isHit = state.profile.taxOn && state.profile.taxMethod === 'paye' &&
                  gross > 0 && i === result.band;
      return '<tr' + (isHit ? ' class="hit"' : '') + '>' +
        '<td><input type="text" inputmode="decimal" data-band="' + i + '" data-k="from" ' +
          'value="' + money(num(b.from) / div) + '" /></td>' +
        '<td class="base">' + money(result.bases[i]) + '</td>' +
        '<td><input type="text" inputmode="decimal" data-band="' + i + '" data-k="rate" ' +
          'value="' + days(num(b.rate)) + '%" /></td>' +
        '<td class="drop">' + (i === 0 ? '' :
          '<button type="button" class="band-x" data-drop="' + i + '" title="Remove band">&times;</button>') +
        '</td></tr>';
    }).join('');
  }

  function saveBands(bands) {
    state.profile.payeBands = bands.map(function (b) {
      return { from: num(b.from), rate: num(b.rate) };
    }).sort(function (a, b) { return a.from - b.from; });
  }

  /* ── deductions & end-of-term benefits ────────────────────────────── */

  // What one standard working day is worth at the current rate.
  function dailyRate() { return standardDay() * num(state.profile.rate); }

  function payFor(day) {
    var p = state.profile;
    var rate = num(p.rate);
    return day.normal * rate +
           day.ot1 * rate * (num(p.ot1Mult) || 1.5) +
           day.ot2 * rate * (num(p.ot2Mult) || 2);
  }

  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); }

  // Service between two dates: whole months completed, and the same figure
  // carrying the part-month on the end. 8 Jan to 26 Sep is 8 whole months
  // and 8.6 counting the odd days.
  function serviceMonths(fromDate, toDate) {
    var a = fromISO(fromDate);
    // The last day is worked too, so service runs to the following morning:
    // 1 to 30 September is a whole month, not 29 days of one.
    var b = addDays(fromISO(toDate), 1);
    if (b < a) return { whole: 0, exact: 0 };

    var whole = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) whole -= 1;
    if (whole < 0) whole = 0;

    var anchor = addMonths(a, whole);
    var nextAnchor = addMonths(a, whole + 1);
    var frac = (b - anchor) / (nextAnchor - anchor);
    if (!isFinite(frac) || frac < 0) frac = 0;
    return { whole: whole, exact: whole + frac };
  }

  // The stretch of time the yearly / on-leaving figures are counted over.
  function benefitRange() {
    var p = state.profile;
    var end = state.period.end;
    var dates;

    switch (p.benefitWindow) {
      case 'period':
        return { from: state.period.start, to: end, label: 'this pay period', name: 'Same as pay period' };
      case '12m':
        return { from: iso(addDays(addMonths(fromISO(end), -12), 1)), to: end,
                 label: 'the last 12 months', name: 'Last 12 months' };
      case 'all':
        dates = Object.keys(state.entries).sort();
        if (!dates.length) return { from: state.period.start, to: end,
                                    label: 'every month recorded', name: 'First to last day on record' };
        return { from: dates[0], to: dates[dates.length - 1],
                 label: 'every month recorded', name: 'First to last day on record' };
      case 'custom':
        // Missing dates used to fall back to the pay period without saying
        // so, which read as the setting being ignored.
        return {
          from: p.benefitFrom || state.period.start,
          to: p.benefitTo || end,
          label: 'the dates of service',
          name: 'Dates of service',
          incomplete: !p.benefitFrom || !p.benefitTo
        };
      default:
        return { from: end.slice(0, 4) + '-01-01', to: end,
                 label: 'the year to date', name: 'Year to date' };
    }
  }

  // Leave and severance accrue because someone was employed, so they count
  // the months between the dates of the window. Earnings can only come from
  // the days actually written on a sheet, so both figures are reported.
  function benefitStats() {
    var range = benefitRange();
    var months = {};
    var gross = 0, days = 0;

    Object.keys(state.entries).forEach(function (dISO) {
      if (dISO < range.from || dISO > range.to) return;
      var day = calcDay(dISO);
      if (day.off || day.worked <= 0) return;
      gross += payFor(day);
      days += 1;
      months[dISO.slice(0, 7)] = true;
    });

    var service = serviceMonths(range.from, range.to);
    range.gross = gross;
    range.days = days;
    range.months = service.whole;          // completed months of service
    range.exactMonths = service.exact;     // with the part-month on the end
    range.recordedMonths = Object.keys(months).length;
    return range;
  }

  function renderBenefits() {
    var p = state.profile;
    var on = p.leaveOn || p.sevOn || p.grantOn;
    $('#benefitBlock').hidden = !on;
    if (!on) return;

    var cur = (p.currency || '').trim();
    var stats = benefitStats();
    var rate = dailyRate();
    var total = 0;

    function show(rowId, visible) { $(rowId).hidden = !visible; }
    function cash(n) { return num(p.rate) > 0 ? cur + ' ' + money(n) : '—'; }

    show('#leaveRow', p.leaveOn);
    if (p.leaveOn) {
      var leaveDays = stats.exactMonths * num(p.leaveDays);
      var leavePay = leaveDays * rate;
      total += leavePay;
      $('#leaveQty').textContent = days(leaveDays) + ' d';
      $('#leaveRate').textContent = '× ' + money(rate) + '/day';
      $('#leavePay').textContent = cash(leavePay);
    }

    show('#sevRow', p.sevOn);
    if (p.sevOn) {
      var first = Math.min(stats.months, 60);
      var later = Math.max(0, stats.months - 60);
      var sevDays = first * num(p.sevDays1) + later * num(p.sevDays2);
      var sevPay = sevDays * rate;
      total += sevPay;
      $('#sevQty').textContent = days(sevDays) + ' d';
      $('#sevRate').textContent = '× ' + money(rate) + '/day';
      $('#sevPay').textContent = cash(sevPay);
    }

    show('#grantRow', p.grantOn);
    if (p.grantOn) {
      var pct = num(p.grantPct);
      var grantPay = stats.gross * pct / 100 + num(p.grantFixed) * stats.months;
      // grant keeps whole months for the fixed part, earnings for the rest
      total += grantPay;
      $('#grantQty').textContent = pct ? days(pct) + '%' : '—';
      $('#grantRate').textContent = num(p.grantFixed) > 0
        ? '+ ' + money(num(p.grantFixed)) + '/month' : 'of earnings';
      $('#grantPay').textContent = cash(grantPay);
    }

    $('#benefitTotal').textContent = cash(total);
    $('#benefitWindowLbl').textContent = stats.name + '   ·   ' +
      stats.from + '  →  ' + stats.to + '   ·   ' +
      days(stats.exactMonths) + ' month' + (stats.exactMonths === 1 ? '' : 's') + ' of service' +
      (stats.incomplete ? '   ·   dates of service not set, showing the pay period' : '');

    if (num(p.rate) <= 0) {
      $('#benefitNote').textContent = 'Add a rate per hour to see these amounts.';
      return;
    }

    var note = 'Leave and severance count the ' + days(stats.exactMonths) +
      ' months between these dates, whether or not the hours were captured here. ' +
      'A day is paid at ' + standardDay() + ' hours, ' + cur + ' ' + money(rate) + '.';
    if (p.grantOn) {
      note += ' The grant uses what this sheet recorded in the window: ' +
        stats.recordedMonths + ' month' + (stats.recordedMonths === 1 ? '' : 's') +
        ' with hours, ' + stats.days + ' day' + (stats.days === 1 ? '' : 's') +
        ', ' + cur + ' ' + money(stats.gross) + ' earned.';
    }
    $('#benefitNote').textContent = note;
  }

  var lastGross = 0;

  function renderPay(totals) {
    var p = state.profile;
    var rate = num(p.rate);
    var m1 = num(p.ot1Mult) || 1.5;
    var m2 = num(p.ot2Mult) || 2;
    var cur = (p.currency || '').trim();

    $('#payAHrs').textContent = hrs(totals.a);
    $('#payBHrs').textContent = hrs(totals.b);
    $('#payCHrs').textContent = hrs(totals.c);
    $('#payARate').textContent = '× ' + money(rate);
    $('#payBRate').textContent = '× ' + money(rate * m1);
    $('#payCRate').textContent = '× ' + money(rate * m2);
    $('#hdrOt1').textContent = m1 + '×';
    $('#hdrOt2').textContent = m2 + '×';

    if (rate <= 0) {
      lastGross = 0;
      $('#payA').textContent = '—';
      $('#payB').textContent = '—';
      $('#payC').textContent = '—';
      $('#payTotal').textContent = '—';
      $('#payNote').textContent = 'Add a rate per hour to see earnings.';
      $('#payTax').textContent = '—';
      $('#payNet').textContent = '—';
      $('#taxRow').hidden = !p.taxOn;
      $('#netRow').hidden = !p.taxOn;
      $('#taxRateLbl').textContent = days(num(p.taxRate)) + '%';
      return;
    }

    var a = totals.a * rate, b = totals.b * rate * m1, c = totals.c * rate * m2;
    var gross = a + b + c;
    lastGross = gross;
    $('#payA').textContent = cur + ' ' + money(a);
    $('#payB').textContent = cur + ' ' + money(b);
    $('#payC').textContent = cur + ' ' + money(c);
    $('#payTotal').textContent = cur + ' ' + money(gross);
    $('#payNote').textContent = 'Type 1 pays ' + m1 + '× the hourly rate; type 2 pays ' + m2 + '×.';

    renderTax(gross, cur);
  }

  function renderTax(gross, cur) {
    var p = state.profile;
    $('#taxRow').hidden = !p.taxOn;
    $('#netRow').hidden = !p.taxOn;
    if (!p.taxOn) return;

    var tax, label;

    if (p.taxMethod === 'paye') {
      var r = payeOn(gross);
      var b = r.bands[r.band];
      tax = r.tax;
      label = 'band ' + (r.band + 1) + ' · ' + days(num(b.rate)) + '%';
      $('#taxRow').querySelector('th').textContent = 'Less PAYE';
      $('#payNote').textContent = gross > 0
        ? 'PAYE on ' + cur + ' ' + money(gross) + ': ' + money(r.bases[r.band]) +
          ' + ' + days(num(b.rate)) + '% above ' + money(num(b.from) / r.div) +
          ' (' + (r.div === 12 ? 'monthly' : 'annual') + ' bands).'
        : 'PAYE bands apply once there are earnings.';
    } else {
      var taxable = Math.max(0, gross - num(p.taxFree));
      tax = taxable * num(p.taxRate) / 100;
      label = days(num(p.taxRate)) + '% of ' + money(taxable);
      $('#taxRow').querySelector('th').textContent = 'Less tax';
    }

    $('#taxRateLbl').textContent = label;
    $('#payTax').textContent = cur + ' ' + money(tax);
    $('#payNet').textContent = cur + ' ' + money(gross - tax);
  }

  var MAX_DAYS = 367;

  function renderHeader() {
    var s = state.period.start, e = state.period.end;
    var span = (s && e) ? daysBetween(s, e) + 1 : 0;
    if (!s || !e || !(span > 0)) { $('#sheetSub').textContent = '—'; return; }
    $('#sheetSub').textContent = s + '  →  ' + e + '   ·   ' +
      (span > MAX_DAYS
        ? span + ' days · showing the first ' + MAX_DAYS
        : span + ' day' + (span === 1 ? '' : 's'));
  }

  /* ── bindings: profile & settings fields ──────────────────────────── */

  var FIELD_MAP = [
    ['#empName', 'name'], ['#empId', 'employeeId'], ['#empNationality', 'nationality'],
    ['#workDest', 'workDest'], ['#rate', 'rate'], ['#rateMirror', 'rate'],
    ['#currency', 'currency'],
    ['#standardDay', 'standardDay'], ['#ot1Mult', 'ot1Mult'], ['#ot2Mult', 'ot2Mult'],
    ['#taxRate', 'taxRate'], ['#taxFree', 'taxFree'], ['#leaveDays', 'leaveDays'],
    ['#sevDays1', 'sevDays1'], ['#sevDays2', 'sevDays2'],
    ['#grantPct', 'grantPct'], ['#grantFixed', 'grantFixed'],
    ['#benefitFrom', 'benefitFrom'], ['#benefitTo', 'benefitTo']
  ];

  function syncProfileInputs() {
    FIELD_MAP.forEach(function (pair) {
      var el = $(pair[0]);
      if (el && el !== document.activeElement) el.value = state.profile[pair[1]] || '';
    });
    $('#weekendIsOt2').checked = !!state.profile.weekendIsOt2;
    $('#autoHolidays').checked = !!state.profile.autoHolidays;
    $('#periodStart').value = state.period.start;
    $('#periodEnd').value = state.period.end;

    OPTIONS.forEach(function (opt) {
      $(opt[0]).checked = !!state.profile[opt[1]];
      $(opt[2]).hidden = !state.profile[opt[1]];
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="taxMethod"]'), function (r) {
      r.checked = r.value === state.profile.taxMethod;
    });
    $('#flatFields').hidden = state.profile.taxMethod === 'paye';
    $('#payeFields').hidden = state.profile.taxMethod !== 'paye';
    $('#payeBasis').value = state.profile.payeBasis;
    $('#benefitWindow').value = state.profile.benefitWindow;
    $('#benefitCustom').hidden = state.profile.benefitWindow !== 'custom';
  }

  var NUMERIC_FIELDS = ['rate', 'standardDay', 'ot1Mult', 'ot2Mult', 'taxRate', 'taxFree',
    'leaveDays', 'sevDays1', 'sevDays2', 'grantPct', 'grantFixed'];

  // Each switch in pay settings, with the fields it reveals.
  var OPTIONS = [
    ['#taxOn', 'taxOn', '#taxFields'],
    ['#leaveOn', 'leaveOn', '#leaveFields'],
    ['#sevOn', 'sevOn', '#sevFields'],
    ['#grantOn', 'grantOn', '#grantFields']
  ];

  FIELD_MAP.forEach(function (pair) {
    var el = $(pair[0]);
    if (!el) return;
    function take() {
      var value = el.value;
      if (NUMERIC_FIELDS.indexOf(pair[1]) !== -1) {
        value = decimalOnly(value);
        if (value !== el.value) el.value = value;
      }
      state.profile[pair[1]] = value;
      syncProfileInputs();
      refresh();
    }
    // A phone's date picker commits with 'change', a keyboard with 'input';
    // listening for one alone loses the other.
    el.addEventListener('input', take);
    el.addEventListener('change', take);
  });

  OPTIONS.forEach(function (opt) {
    $(opt[0]).addEventListener('change', function () {
      state.profile[opt[1]] = this.checked;
      $(opt[2]).hidden = !this.checked;
      refresh();
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('input[name="taxMethod"]'), function (radio) {
    radio.addEventListener('change', function () {
      state.profile.taxMethod = radio.value;
      syncProfileInputs();
      refresh();
    });
  });

  $('#payeBasis').addEventListener('change', function () {
    state.profile.payeBasis = this.value;
    refresh();
  });

  // Editing a threshold or a rate in the table
  $('#payeRows').addEventListener('input', function (ev) {
    var el = ev.target;
    if (!el.hasAttribute || !el.hasAttribute('data-band')) return;
    var clean = decimalOnly(el.value);
    var bands = payeBands();
    var i = +el.getAttribute('data-band');
    if (!bands[i]) return;
    bands[i][el.getAttribute('data-k')] = el.getAttribute('data-k') === 'from'
      ? num(clean) * bandDivisor()
      : num(clean);
    saveBands(bands);
    refresh({ keepBands: true });
  });

  $('#payeRows').addEventListener('change', function () { renderBandTable(); });

  $('#payeRows').addEventListener('click', function (ev) {
    var btn = ev.target.closest('.band-x');
    if (!btn) return;
    var bands = payeBands();
    bands.splice(+btn.getAttribute('data-drop'), 1);
    saveBands(bands);
    refresh();
  });

  $('#addBand').addEventListener('click', function () {
    var bands = payeBands();
    var last = bands[bands.length - 1];
    bands.push({ from: num(last.from) + 12000 * bandDivisor() / 12, rate: num(last.rate) });
    saveBands(bands);
    refresh();
  });

  $('#resetBands').addEventListener('click', function () {
    state.profile.payeBands = null;
    refresh();
  });

  $('#benefitWindow').addEventListener('change', function () {
    state.profile.benefitWindow = this.value;
    $('#benefitCustom').hidden = this.value !== 'custom';
    if (this.value === 'custom') {
      if (!state.profile.benefitFrom) state.profile.benefitFrom = state.period.start;
      if (!state.profile.benefitTo) state.profile.benefitTo = state.period.end;
      syncProfileInputs();
    }
    refresh();
  });

  $('#weekendIsOt2').addEventListener('change', function () {
    state.profile.weekendIsOt2 = this.checked;
    refresh();
  });

  $('#autoHolidays').addEventListener('change', function () {
    state.profile.autoHolidays = this.checked;
    renderRows();
  });

  /* ── bindings: period ─────────────────────────────────────────────── */

  function setPeriod(startISO, endISO) {
    state.period.start = startISO;
    state.period.end = endISO;
    syncProfileInputs();
    renderHeader();
    renderRows();
  }

  $('#periodStart').addEventListener('change', function () {
    if (this.value) setPeriod(this.value, state.period.end);
  });
  $('#periodEnd').addEventListener('change', function () {
    if (this.value) setPeriod(state.period.start, this.value);
  });

  function isWholeMonth() {
    var s = fromISO(state.period.start), e = fromISO(state.period.end);
    return s.getDate() === 1 &&
      e.getDate() === new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate() &&
      s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  }

  function shiftPeriod(dir) {
    var s = fromISO(state.period.start), e = fromISO(state.period.end);
    if (isWholeMonth()) {
      var m = new Date(s.getFullYear(), s.getMonth() + dir, 1);
      setPeriod(iso(m), iso(new Date(m.getFullYear(), m.getMonth() + 1, 0)));
      return;
    }
    var len = daysBetween(state.period.start, state.period.end) + 1;
    setPeriod(iso(addDays(s, dir * len)), iso(addDays(e, dir * len)));
  }

  $('#prevPeriod').addEventListener('click', function () { shiftPeriod(-1); });
  $('#nextPeriod').addEventListener('click', function () { shiftPeriod(1); });

  Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (btn) {
    btn.addEventListener('click', function () {
      var today = new Date();
      var preset = btn.getAttribute('data-preset');

      if (preset === 'month') {
        setPeriod(iso(new Date(today.getFullYear(), today.getMonth(), 1)),
                  iso(new Date(today.getFullYear(), today.getMonth() + 1, 0)));
      } else if (preset === 'cycle') {
        // Pay run from the 23rd of one month to the 22nd of the next.
        var start = today.getDate() >= 23
          ? new Date(today.getFullYear(), today.getMonth(), 23)
          : new Date(today.getFullYear(), today.getMonth() - 1, 23);
        setPeriod(iso(start), iso(new Date(start.getFullYear(), start.getMonth() + 1, 22)));
      } else if (preset === 'week') {
        var back = (today.getDay() + 6) % 7; // week starts Monday
        var mon = addDays(today, -back);
        setPeriod(iso(mon), iso(addDays(mon, 6)));
      }
    });
  });

  /* ── bindings: the grid ───────────────────────────────────────────── */

  body.addEventListener('input', function (ev) {
    var el = ev.target;
    if (!el.classList.contains('cell-input')) return;
    var clean = decimalOnly(el.value);
    if (clean !== el.value) el.value = clean;
    var dISO = el.closest('tr').getAttribute('data-d');
    entry(dISO)[el.getAttribute('data-f')] = clean;
    refresh();
  });

  body.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el.type !== 'checkbox') return;
    var dISO = el.closest('tr').getAttribute('data-d');
    entry(dISO)[el.getAttribute('data-f')] = el.checked;
    refresh();
  });

  body.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.flag');
    if (!btn) return;
    var tr = btn.closest('tr');
    var dISO = tr.getAttribute('data-d');
    var e = entry(dISO);
    var flag = btn.getAttribute('data-flag');

    if (flag === 'holiday') {
      e.holiday = !isHoliday(dISO);
      btn.classList.toggle('on', e.holiday);
    } else {
      e.off = !e.off;
      btn.classList.toggle('on', e.off);
    }
    refresh();
  });

  // Enter / arrows walk down the same column, like filling in a paper column.
  body.addEventListener('keydown', function (ev) {
    if (['Enter', 'ArrowDown', 'ArrowUp'].indexOf(ev.key) === -1) return;
    var el = ev.target;
    if (!el.classList.contains('cell-input')) return;
    var tr = el.closest('tr');
    var next = ev.key === 'ArrowUp' ? tr.previousElementSibling : tr.nextElementSibling;
    if (!next) return;
    var target = next.querySelector('input[data-f="' + el.getAttribute('data-f') + '"]');
    if (!target) return;
    ev.preventDefault();
    target.focus();
    target.select();
  });

  body.addEventListener('focusout', function (ev) {
    if (ev.target.classList && ev.target.classList.contains('cell-input')) refresh();
  });

  /* ── actions ──────────────────────────────────────────────────────── */

  $('#printBtn').addEventListener('click', function () { countUse('prints'); window.print(); });

  // Hand the link to whatever the phone shares with — WhatsApp, messages,
  // mail — and fall back to the clipboard on a desktop that has no sheet.
  $('#posterBtn').addEventListener('click', function () { countUse('posters'); });

  $('#shareBtn').addEventListener('click', function () {
    var btn = this;
    var share = {
      title: 'TAIMER — from hours to pay in seconds',
      text: 'TAIMER turns your time card into hours and pay. Fill a month in one tick and it counts the overtime, the weekends and the public holidays. Works offline, and installs to your home screen.',
      url: 'https://taimer.cards/'
    };

    function said(word) {
      var was = btn.textContent;
      btn.textContent = word;
      setTimeout(function () { btn.textContent = was; }, 2200);
    }

    countUse('shares');
    if (navigator.share) {
      navigator.share(share).catch(function () { /* the person closed the sheet */ });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(share.text + ' ' + share.url)
        .then(function () { said('Link copied'); })
        .catch(function () { said('taimer.cards'); });
      return;
    }
    said('taimer.cards');
  });

  $('#clearBtn').addEventListener('click', function () {
    if (!window.confirm('Clear all hours entered in this period?')) return;
    periodDates().forEach(function (d) { delete state.entries[d]; });
    renderRows();
  });

  $('#csvBtn').addEventListener('click', function () {
    countUse('exports');
    var p = state.profile;
    var rate = num(p.rate), m1 = num(p.ot1Mult) || 1.5, m2 = num(p.ot2Mult) || 2;
    var lines = [];
    var t = { a: 0, b: 0, c: 0 };

    lines.push(['TAIMER time sheet'].join(','));
    lines.push(['Name', csv(p.name)].join(','));
    lines.push(['Employee ID', csv(p.employeeId)].join(','));
    lines.push(['Nationality', csv(p.nationality)].join(','));
    lines.push(['Work destination', csv(p.workDest)].join(','));
    lines.push(['Period', csv(state.period.start + ' to ' + state.period.end)].join(','));
    lines.push(['Rate per hour', csv((p.currency || '') + ' ' + plain(rate))].join(','));
    lines.push('');
    lines.push('Week,Date,Morning,Afternoon,Normal (A),Type 1 (B),Type 2 (C),Day total,Note');

    periodDates().forEach(function (dISO) {
      var e = state.entries[dISO] || {};
      var day = calcDay(dISO);
      t.a += day.normal; t.b += day.ot1; t.c += day.ot2;
      var note = day.off ? 'Day off'
        : day.holiday ? (day.holidayName || 'Public holiday')
        : day.weekend ? DAY_NAMES[day.day] + ' (weekend)' : '';
      lines.push([
        DAY_NAMES[fromISO(dISO).getDay()], dISO,
        e.am || '', e.pm || '',
        hrs(day.normal), hrs(day.ot1), hrs(day.ot2),
        hrs(day.normal + day.ot1 + day.ot2), csv(note)
      ].join(','));
    });

    lines.push('');
    lines.push(['Totals', '', '', '', hrs(t.a), hrs(t.b), hrs(t.c), hrs(t.a + t.b + t.c), ''].join(','));
    var gross = t.a * rate + t.b * rate * m1 + t.c * rate * m2;
    lines.push(['Pay', '', '', '',
      plain(t.a * rate), plain(t.b * rate * m1), plain(t.c * rate * m2),
      plain(gross), csv(p.currency || '')].join(','));

    if (p.taxOn) {
      var tax, how;
      if (p.taxMethod === 'paye') {
        var r = payeOn(gross);
        tax = r.tax;
        how = 'PAYE band ' + (r.band + 1) + ' · ' + days(num(r.bands[r.band].rate)) + '% above ' +
              money(num(r.bands[r.band].from) / r.div) + ' (' + (r.div === 12 ? 'monthly' : 'annual') + ' bands)';
      } else {
        tax = Math.max(0, gross - num(p.taxFree)) * num(p.taxRate) / 100;
        how = days(num(p.taxRate)) + '% above ' + money(num(p.taxFree));
      }
      lines.push('');
      lines.push(['Tax', csv(how), plain(tax)].join(','));
      lines.push(['Net pay', '', plain(gross - tax)].join(','));
    }

    if (p.leaveOn || p.sevOn || p.grantOn) {
      var st = benefitStats();
      var dr = dailyRate();
      lines.push('');
      lines.push(['Paid yearly or on leaving', csv(st.from + ' to ' + st.to),
                  csv(days(st.exactMonths) + ' months of service'),
                  csv(money(st.gross) + ' earned on this sheet')].join(','));
      var due = 0;
      if (p.leaveOn) {
        var lv = st.exactMonths * num(p.leaveDays) * dr;
        due += lv;
        lines.push(['Leave pay', csv(days(st.exactMonths * num(p.leaveDays)) + ' days'), plain(lv)].join(','));
      }
      if (p.sevOn) {
        var sd = Math.min(st.months, 60) * num(p.sevDays1) + Math.max(0, st.months - 60) * num(p.sevDays2);
        due += sd * dr;
        lines.push(['Severance pay', csv(days(sd) + ' days'), plain(sd * dr)].join(','));
      }
      if (p.grantOn) {
        var gr = st.gross * num(p.grantPct) / 100 + num(p.grantFixed) * st.months;
        due += gr;
        lines.push(['Grant / gratuity', csv(hrs(num(p.grantPct)) + '% + ' + money(num(p.grantFixed)) + '/month'), plain(gr)].join(','));
      }
      lines.push(['Total due on leaving', '', plain(due)].join(','));
    }

    download('taimer-' + state.period.start + '-to-' + state.period.end + '.csv',
             lines.join('\n'), 'text/csv;charset=utf-8');
  });

  function csv(v) {
    v = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;          // not a spreadsheet formula
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // A debounced save must not be lost when the tab closes.
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushSave();
  });

  /* ── quick fill ───────────────────────────────────────────────────── */

  var FILL_MODES = {
    all:      { label: 'every day in the period', match: function () { return true; } },
    weekdays: { label: 'Monday to Friday',        match: function (dow) { return dow >= 1 && dow <= 5; } },
    weekend:  { label: 'Saturdays and Sundays',   match: function (dow) { return dow === 0 || dow === 6; } },
    custom:   { label: 'the days you picked',     match: function (dow) { return customDays().indexOf(dow) !== -1; } }
  };

  var MODE_NAMES = { all: 'All days', weekdays: 'Weekdays', weekend: 'Weekend', custom: 'Custom' };

  // Chips run Monday-first, the way the week reads on a roster.
  var CHIP_ORDER = [1, 2, 3, 4, 5, 6, 0];

  // The panel eats a lot of a phone screen, so it starts closed there and
  // remembers whichever way it was left.
  var QF_OPEN_KEY = 'taimer.qfOpen';

  function restoreQuickFillOpen() {
    var panel = $('#quickFill');
    var saved = null;
    try { saved = localStorage.getItem(QF_OPEN_KEY); } catch (err) { /* private mode */ }
    panel.open = saved === null ? window.innerWidth > 640 : saved === '1';
    panel.addEventListener('toggle', function () {
      try { localStorage.setItem(QF_OPEN_KEY, panel.open ? '1' : '0'); } catch (err) { /* private mode */ }
    });
  }

  function customDays() {
    return Array.isArray(state.profile.fillDays) ? state.profile.fillDays : [];
  }

  function renderDayChips() {
    $('#qfDays').innerHTML = CHIP_ORDER.map(function (dow) {
      var picked = customDays().indexOf(dow) !== -1;
      var rest = dow === 0 || dow === 6;
      return '<label class="daychip' + (rest ? ' is-rest' : '') + '">' +
        '<input type="checkbox" data-day="' + dow + '"' + (picked ? ' checked' : '') + ' />' +
        '<span>' + DAY_NAMES[dow] + '</span></label>';
    }).join('');
  }

  // Days the current pattern would touch: inside the period, not struck out.
  function selectedDates() {
    var mode = FILL_MODES[state.profile.fillMode];
    if (!mode) return [];
    return periodDates().filter(function (dISO) {
      var e = state.entries[dISO];
      if (e && e.off) return false;
      return mode.match(fromISO(dISO).getDay());
    });
  }

  function hasHours(dISO) {
    var e = state.entries[dISO];
    return !!e && (num(e.am) > 0 || num(e.pm) > 0);
  }

  function fillTargets() {
    var dates = selectedDates();
    return state.profile.fillKeep ? dates.filter(function (d) { return !hasHours(d); }) : dates;
  }

  function syncQuickFill() {
    var mode = state.profile.fillMode;

    Array.prototype.forEach.call(document.querySelectorAll('input[name="fillMode"]'), function (r) {
      r.checked = r.value === mode;
    });
    $('#qfCustom').hidden = mode !== 'custom';
    $('#fillKeep').checked = !!state.profile.fillKeep;
    if ($('#fillAm') !== document.activeElement) $('#fillAm').value = state.profile.fillAm;
    if ($('#fillPm') !== document.activeElement) $('#fillPm').value = state.profile.fillPm;

    var targets = fillTargets();
    var lookup = {};
    targets.forEach(function (d) { lookup[d] = true; });

    Array.prototype.forEach.call(body.querySelectorAll('tr[data-d]'), function (tr) {
      tr.classList.toggle('target', !!lookup[tr.getAttribute('data-d')]);
    });

    var day = num(state.profile.fillAm) + num(state.profile.fillPm);

    $('#fillCount').textContent = targets.length;
    $('#fillBtn').disabled = targets.length === 0 || day <= 0;
    $('#fillClearBtn').disabled = selectedDates().length === 0;

    if (!FILL_MODES[mode]) {
      $('#qfNote').textContent = 'Pick a pattern to fill the sheet.';
    } else if (day <= 0) {
      $('#qfNote').textContent = 'Set the morning and afternoon hours to fill with.';
    } else if (mode === 'custom' && !customDays().length) {
      $('#qfNote').textContent = 'Tick the days of the week you want to fill.';
    } else if (!targets.length) {
      $('#qfNote').textContent = 'Nothing to fill — no matching day is left in this period.';
    } else {
      $('#qfNote').textContent = targets.length + ' day' + (targets.length === 1 ? '' : 's') +
        ' · ' + FILL_MODES[mode].label + ' · ' + hrs(day) + ' hours each' +
        (state.profile.weekendIsOt2 ? '. Weekend and public-holiday hours land in type 2 automatically.' : '.');
    }

    // The closed panel still has to say what it is set to.
    $('#qfState').textContent = FILL_MODES[mode]
      ? MODE_NAMES[mode] + ' · ' + hrs(day) + ' h · ' + targets.length + ' day' + (targets.length === 1 ? '' : 's')
      : 'Not set';
  }

  function bindQuickFill() {
    renderDayChips();
    restoreQuickFillOpen();

    Array.prototype.forEach.call(document.querySelectorAll('input[name="fillMode"]'), function (radio) {
      radio.addEventListener('change', function () {
        state.profile.fillMode = radio.value;
        syncQuickFill();
        save();
      });
    });

    $('#qfDays').addEventListener('change', function (ev) {
      var box = ev.target;
      if (!box.hasAttribute('data-day')) return;
      var dow = +box.getAttribute('data-day');
      var days = customDays().filter(function (d) { return d !== dow; });
      if (box.checked) days.push(dow);
      state.profile.fillDays = days.sort();
      state.profile.fillMode = 'custom';
      syncQuickFill();
      save();
    });

    [['#fillAm', 'fillAm'], ['#fillPm', 'fillPm']].forEach(function (pair) {
      $(pair[0]).addEventListener('input', function () {
        var clean = decimalOnly(this.value);
        if (clean !== this.value) this.value = clean;
        state.profile[pair[1]] = clean;
        syncQuickFill();
        save();
      });
    });

    $('#fillKeep').addEventListener('change', function () {
      state.profile.fillKeep = this.checked;
      syncQuickFill();
      save();
    });

    $('#fillBtn').addEventListener('click', function () {
      var targets = fillTargets();
      if (!targets.length) return;
      targets.forEach(function (dISO) {
        var e = entry(dISO);
        e.am = state.profile.fillAm;
        e.pm = state.profile.fillPm;
      });
      renderRows();
      $('#qfNote').textContent = 'Filled ' + targets.length + ' day' + (targets.length === 1 ? '' : 's') +
        ' — edit any of them by hand from here.';
      $('#fillBtn').focus();
    });

    $('#fillClearBtn').addEventListener('click', function () {
      var targets = selectedDates();
      if (!targets.length) return;
      if (!window.confirm('Clear the hours on ' + targets.length + ' selected day' +
                          (targets.length === 1 ? '' : 's') + '?')) return;
      targets.forEach(function (dISO) {
        var e = state.entries[dISO];
        if (!e) return;
        delete e.am; delete e.pm; delete e.ot1; delete e.ot2;
      });
      renderRows();
      $('#qfNote').textContent = 'Cleared ' + targets.length + ' day' + (targets.length === 1 ? '' : 's') + '.';
    });
  }

  $('#licenceKey').addEventListener('input', function () {
    state.account.licenceKey = this.value.trim();
    save();
  });

  $('#licenceApply').addEventListener('click', function () {
    var note = $('#licenceNote');
    note.textContent = 'Checking…';
    readLicence(state.account.licenceKey).then(function (res) {
      if (res.ok) {
        state.account.plan = res.claim.p;
        state.account.holder = res.claim.n || '';
        state.account.expires = res.claim.e || '';
        note.textContent = 'Key accepted — ' + PLANS[res.claim.p].name +
          (res.claim.n ? ' for ' + res.claim.n : '') +
          (res.claim.e ? ', until ' + res.claim.e : ', with no end date') + '.';
      } else {
        state.account.plan = 'free';
        state.account.holder = '';
        state.account.expires = '';
        note.textContent = LICENCE_WORDS[res.why] || LICENCE_WORDS.shape;
      }
      save();
      renderAccount();
    });
  });

  /* ── offline ──────────────────────────────────────────────────────── */

  // Registering the worker keeps the sheet openable with no connection at
  // all. It needs a real origin, so opening the file straight from disk
  // (file://) simply skips it — that copy is already offline anyway.
  function goOffline() {
    var note = $('#offlineNote');
    var https = location.protocol === 'https:' || location.hostname === 'localhost' ||
                location.hostname === '127.0.0.1';

    if (!('serviceWorker' in navigator) || !https) {
      if (note && location.protocol === 'file:') note.textContent = 'Opened from this device — works offline.';
      return;
    }

    navigator.serviceWorker.register('sw.js').then(function () {
      if (note) note.textContent = 'Saved for offline use — open it again with no connection.';
    }).catch(function () { /* nothing to tell the user if it could not register */ });
  }

  /* ── go ───────────────────────────────────────────────────────────── */

  syncProfileInputs();
  renderAccount();
  applyStoredLicence();
  bindQuickFill();
  renderHeader();
  renderRows();
  goOffline();
})();
