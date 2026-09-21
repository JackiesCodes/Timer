/* TAIMER — time card & pay
   Stores everything in localStorage; no network, no accounts. */

(function () {
  'use strict';

  var STORE_KEY = 'taimer.v1';
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

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function hrs(n) { return (Math.round(n * 100) / 100).toFixed(1); }

  function money(n) { return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

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

  /* ── state ────────────────────────────────────────────────────────── */

  function defaultState() {
    var today = new Date();
    var first = new Date(today.getFullYear(), today.getMonth(), 1);
    var last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      profile: {
        name: '', employeeId: '', nationality: '', startDate: '',
        currency: 'BWP', rate: '', standardDay: '9', ot1Mult: '1.5', ot2Mult: '2',
        weekendIsOt2: true, autoHolidays: true,
        fillAm: '5', fillPm: '4', fillMode: '', fillDays: [1, 2, 3, 4, 5], fillKeep: false
      },
      period: { start: iso(first), end: iso(last) },
      entries: {}
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
        entries: saved.entries || {}
      };
    } catch (err) {
      return base;
    }
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (err) { /* private mode */ }
    }, 150);
  }

  function flushSave() {
    clearTimeout(saveTimer);
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
    if (span > 366) { span = 366; }
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

  function refresh() {
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
      $('#payA').textContent = '—';
      $('#payB').textContent = '—';
      $('#payC').textContent = '—';
      $('#payTotal').textContent = '—';
      $('#payNote').textContent = 'Add a rate per hour to see earnings.';
      return;
    }

    var a = totals.a * rate, b = totals.b * rate * m1, c = totals.c * rate * m2;
    $('#payA').textContent = cur + ' ' + money(a);
    $('#payB').textContent = cur + ' ' + money(b);
    $('#payC').textContent = cur + ' ' + money(c);
    $('#payTotal').textContent = cur + ' ' + money(a + b + c);
    $('#payNote').textContent = 'Type 1 pays ' + m1 + '× the hourly rate; type 2 pays ' + m2 + '×.';
  }

  function renderHeader() {
    var s = state.period.start, e = state.period.end;
    var span = (s && e) ? daysBetween(s, e) + 1 : 0;
    $('#sheetSub').textContent = (s && e && span > 0)
      ? s + '  →  ' + e + '   ·   ' + span + ' day' + (span === 1 ? '' : 's')
      : '—';
  }

  /* ── bindings: profile & settings fields ──────────────────────────── */

  var FIELD_MAP = [
    ['#empName', 'name'], ['#empId', 'employeeId'], ['#empNationality', 'nationality'],
    ['#empStart', 'startDate'], ['#rate', 'rate'], ['#rateMirror', 'rate'],
    ['#currency', 'currency'], ['#currencyMirror', 'currency'],
    ['#standardDay', 'standardDay'], ['#ot1Mult', 'ot1Mult'], ['#ot2Mult', 'ot2Mult']
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
  }

  FIELD_MAP.forEach(function (pair) {
    var el = $(pair[0]);
    if (!el) return;
    el.addEventListener('input', function () {
      state.profile[pair[1]] = el.value;
      syncProfileInputs();
      refresh();
    });
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
    var clean = el.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
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

  $('#printBtn').addEventListener('click', function () { window.print(); });

  $('#clearBtn').addEventListener('click', function () {
    if (!window.confirm('Clear all hours entered in this period?')) return;
    periodDates().forEach(function (d) { delete state.entries[d]; });
    renderRows();
  });

  $('#csvBtn').addEventListener('click', function () {
    var p = state.profile;
    var rate = num(p.rate), m1 = num(p.ot1Mult) || 1.5, m2 = num(p.ot2Mult) || 2;
    var lines = [];
    var t = { a: 0, b: 0, c: 0 };

    lines.push(['TAIMER time sheet'].join(','));
    lines.push(['Name', csv(p.name)].join(','));
    lines.push(['Employee ID', csv(p.employeeId)].join(','));
    lines.push(['Nationality', csv(p.nationality)].join(','));
    lines.push(['Start date', csv(p.startDate)].join(','));
    lines.push(['Period', csv(state.period.start + ' to ' + state.period.end)].join(','));
    lines.push(['Rate per hour', csv((p.currency || '') + ' ' + money(rate))].join(','));
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
    lines.push(['Pay', '', '', '',
      money(t.a * rate), money(t.b * rate * m1), money(t.c * rate * m2),
      money(t.a * rate + t.b * rate * m1 + t.c * rate * m2), csv(p.currency || '')].join(','));

    download('taimer-' + state.period.start + '-to-' + state.period.end + '.csv',
             lines.join('\n'), 'text/csv;charset=utf-8');
  });

  function csv(v) {
    v = v == null ? '' : String(v);
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

  // Chips run Monday-first, the way the week reads on a roster.
  var CHIP_ORDER = [1, 2, 3, 4, 5, 6, 0];

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

    $('#fillCount').textContent = targets.length;
    $('#fillBtn').disabled = targets.length === 0;
    $('#fillClearBtn').disabled = selectedDates().length === 0;

    var day = num(state.profile.fillAm) + num(state.profile.fillPm);
    if (!FILL_MODES[mode]) {
      $('#qfNote').textContent = 'Pick a pattern to fill the sheet.';
    } else if (!targets.length) {
      $('#qfNote').textContent = 'Nothing to fill — no matching day is left in this period.';
    } else {
      $('#qfNote').textContent = targets.length + ' day' + (targets.length === 1 ? '' : 's') +
        ' · ' + FILL_MODES[mode].label + ' · ' + hrs(day) + ' hours each' +
        (state.profile.weekendIsOt2 ? '. Weekend and public-holiday hours land in type 2 automatically.' : '.');
    }
  }

  function bindQuickFill() {
    renderDayChips();

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
        var clean = this.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
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

  /* ── go ───────────────────────────────────────────────────────────── */

  syncProfileInputs();
  bindQuickFill();
  renderHeader();
  renderRows();
})();
