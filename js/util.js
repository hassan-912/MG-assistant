/* Visa File Review Engine — utilities: dates, names, ids, MRZ. Pure functions, no DOM. */
(function (V) {
  'use strict';
  const U = (V.util = {});
  const MS = 86400000;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* ---------- dates: represented as integer day numbers (UTC days since epoch) ---------- */
  U.day = function (v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Math.floor(v);
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(v).trim());
    if (!m) return null;
    return U.ymd(+m[1], +m[2], +m[3]);
  };
  U.ymd = function (y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const t = Date.UTC(y, mo - 1, d);
    const dt = new Date(t);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return Math.round(t / MS);
  };
  U.iso = function (n) {
    if (n === null || n === undefined) return '';
    return new Date(n * MS).toISOString().slice(0, 10);
  };
  U.fmt = function (n) {
    if (n === null || n === undefined) return '—';
    const d = new Date(n * MS);
    return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  };
  U.todayIso = function () {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  U.addMonths = function (n, months) {
    const d = new Date(n * MS);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + months;
    const ty = y + Math.floor(m / 12);
    const tm = ((m % 12) + 12) % 12;
    const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
    return Math.round(Date.UTC(ty, tm, Math.min(d.getUTCDate(), last)) / MS);
  };
  U.addYears = (n, y) => U.addMonths(n, 12 * y);
  /** whole years between two day numbers (age) */
  U.years = function (from, to) {
    const a = new Date(from * MS);
    const b = new Date(to * MS);
    let y = b.getUTCFullYear() - a.getUTCFullYear();
    if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) y--;
    return y;
  };
  /** inclusive day count (entry and exit day both count, as in the Schengen 90/180 rule) */
  U.spanDays = (a, b) => b - a + 1;
  U.plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  /** Compress a sorted list of day numbers into human ranges. */
  U.ranges = function (days) {
    const out = [];
    let start = null;
    let prev = null;
    days.forEach((d) => {
      if (start === null) start = prev = d;
      else if (d === prev + 1) prev = d;
      else {
        out.push([start, prev]);
        start = prev = d;
      }
    });
    if (start !== null) out.push([start, prev]);
    return out.map(([a, b]) => (a === b ? U.fmt(a) : U.fmt(a) + ' – ' + U.fmt(b))).join(', ');
  };

  /* ---------- names ---------- */
  U.normName = function (s) {
    if (!s) return '';
    return String(s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
  };
  U.tokens = (s) => U.normName(s).split(' ').filter(Boolean);
  U.lev = function (a, b) {
    if (a === b) return 0;
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  };
  /** Transliteration-tolerant token similarity (MOHAMED ~ MOHAMMED, YOUSSEF ~ YOUSEF). */
  U.tokenClose = function (a, b) {
    if (a === b) return true;
    const sq = (x) => x.replace(/(.)\1+/g, '$1').replace(/OU/g, 'U').replace(/EE/g, 'I').replace(/PH/g, 'F').replace(/Y/g, 'I');
    if (sq(a) === sq(b)) return true;
    const lim = Math.max(a.length, b.length) >= 7 ? 2 : 1;
    return Math.min(a.length, b.length) >= 4 && U.lev(a, b) <= lim;
  };
  /**
   * Compare two full names.
   * status: match | order | partial | variant | mismatch | missing
   */
  /** Airline / booking formats: "HASSAN/AHMED MOHAMED MR" → "AHMED MOHAMED HASSAN"; drops titles. */
  U.canonName = function (s) {
    let t = String(s || '').toUpperCase();
    const slash = t.split('/');
    if (slash.length === 2 && slash[0].trim() && slash[1].trim()) t = slash[1] + ' ' + slash[0];
    return U.tokens(t).filter((w) => ['MR', 'MRS', 'MS', 'MISS', 'MSTR', 'DR', 'ENG', 'MME', 'HERR', 'FRAU'].indexOf(w) === -1).join(' ');
  };
  U.compareNames = function (expected, actual) {
    const a = U.tokens(U.canonName(expected));
    const b = U.tokens(U.canonName(actual));
    if (!a.length || !b.length) return { status: 'missing' };
    if (a.join(' ') === b.join(' ')) return { status: 'match' };
    const sa = a.slice().sort().join(' ');
    const sb = b.slice().sort().join(' ');
    if (sa === sb) return { status: 'order' };
    const exactCovered = (src, dst) => src.every((t) => dst.indexOf(t) !== -1);
    if (exactCovered(b, a) || exactCovered(a, b)) {
      return { status: 'partial', missing: a.filter((t) => b.indexOf(t) === -1), extra: b.filter((t) => a.indexOf(t) === -1) };
    }
    const fuzzyCovered = (src, dst) => src.every((t) => dst.some((u) => U.tokenClose(t, u)));
    if (fuzzyCovered(b, a) || fuzzyCovered(a, b)) {
      const diffs = [];
      b.forEach((t) => {
        if (a.indexOf(t) === -1) {
          const near = a.find((u) => U.tokenClose(t, u));
          if (near) diffs.push(near + ' → ' + t);
        }
      });
      return { status: 'variant', diffs };
    }
    return { status: 'mismatch' };
  };
  U.fullName = (ap) => [ap && ap.givenNames, ap && ap.surname].filter(Boolean).join(' ');

  /* ---------- ids ---------- */
  U.normId = (s) => (s ? String(s).toUpperCase().replace(/[^A-Z0-9]/g, '') : '');

  /* ---------- money ---------- */
  U.num = function (v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[, ]/g, ''));
    return isFinite(n) ? n : null;
  };
  U.money = function (n, cur) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    const s = Math.round(n).toLocaleString('en-US');
    const sym = { EUR: '€', USD: '$', GBP: '£' }[cur];
    return sym ? sym + s : s + ' ' + (cur || '');
  };

  /* ---------- MRZ (ICAO 9303 TD3 passport) ---------- */
  U.mrzCheck = function (s) {
    const w = [7, 3, 1];
    let sum = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      let v;
      if (c >= '0' && c <= '9') v = c.charCodeAt(0) - 48;
      else if (c >= 'A' && c <= 'Z') v = c.charCodeAt(0) - 55;
      else v = 0;
      sum += v * w[i % 3];
    }
    return String(sum % 10);
  };
  /** YYMMDD → day number; `future` picks the century for expiry dates. */
  U.mrzDate = function (s, future, refDay) {
    if (!/^\d{6}$/.test(s)) return null;
    const yy = +s.slice(0, 2);
    const ref = new Date((refDay || Math.floor(Date.now() / MS)) * MS).getUTCFullYear();
    let y = 2000 + yy;
    if (future) {
      if (y > ref + 50) y -= 100;
    } else if (y > ref) y -= 100;
    return U.ymd(y, +s.slice(2, 4), +s.slice(4, 6));
  };
  U.parseMRZ = function (l1, l2, refDay) {
    const clean = (s) => String(s || '').toUpperCase().replace(/\s+/g, '').replace(/[«‹]/g, '<');
    l1 = clean(l1);
    l2 = clean(l2);
    const res = { ok: false, errors: [], fields: {} };
    if (!l1 && !l2) return null;
    if (l1.length !== 44 || l2.length !== 44) {
      res.errors.push('Each MRZ line of a passport must be exactly 44 characters (got ' + l1.length + ' and ' + l2.length + ').');
      return res;
    }
    if (l1[0] !== 'P') res.errors.push('Line 1 should start with "P" for a passport.');
    const issuer = l1.slice(2, 5).replace(/</g, '');
    const nameField = l1.slice(5);
    const parts = nameField.split('<<');
    const surname = parts[0].replace(/</g, ' ').trim();
    const given = (parts.slice(1).join(' ') || '').replace(/</g, ' ').replace(/\s+/g, ' ').trim();
    const num = l2.slice(0, 9);
    const nat = l2.slice(10, 13).replace(/</g, '');
    const dob = l2.slice(13, 19);
    const sex = l2[20];
    const exp = l2.slice(21, 27);
    const pers = l2.slice(28, 42);
    const checks = [
      ['document number', num, l2[9]],
      ['date of birth', dob, l2[19]],
      ['expiry date', exp, l2[27]],
      ['composite', l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43), l2[43]],
    ];
    if (pers.replace(/</g, '') || (l2[42] !== '<' && l2[42] !== '0')) checks.splice(3, 0, ['personal number', pers, l2[42]]);
    checks.forEach(([label, data, digit]) => {
      const want = U.mrzCheck(data);
      const got = digit === '<' ? '0' : digit;
      if (want !== got) res.errors.push('MRZ check digit for ' + label + ' is wrong (expected ' + want + ', found ' + digit + ') — the MRZ was mistyped or the document is not genuine.');
    });
    const toA2 = (c) => (c in V.ref.mrzAlias ? V.ref.mrzAlias[c] : V.ref.byA3[c] ? V.ref.byA3[c].a2 : c);
    res.fields = {
      issuer: toA2(issuer),
      surname,
      givenNames: given,
      number: num.replace(/</g, ''),
      nationality: toA2(nat),
      dob: U.mrzDate(dob, false, refDay),
      sex: sex === '<' ? 'X' : sex,
      expiry: U.mrzDate(exp, true, refDay),
    };
    res.ok = res.errors.length === 0;
    return res;
  };
  /** Build a valid MRZ from data (used by the sample cases and tests). */
  U.buildMRZ = function (p) {
    const pad = (s, n) => (s + '<'.repeat(n)).slice(0, n);
    const name = (U.normName(p.surname).replace(/ /g, '<') + '<<' + U.normName(p.givenNames).replace(/ /g, '<'));
    const a3 = (a2) => (a2 === 'DE' ? 'D' : V.ref.byA2[a2] ? V.ref.byA2[a2].a3 : a2);
    const l1 = pad('P<' + pad(a3(p.issuer), 3) + name, 44);
    const yymmdd = (iso) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
    const num = pad(U.normId(p.number), 9);
    const dob = yymmdd(p.dob);
    const exp = yymmdd(p.expiry);
    const pers = pad('', 14);
    let l2 = num + U.mrzCheck(num) + pad(a3(p.nationality), 3) + dob + U.mrzCheck(dob) + (p.sex || '<') + exp + U.mrzCheck(exp) + pers + '<';
    l2 += U.mrzCheck(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43));
    return [l1, l2];
  };

  /* ---------- free-text date extraction (for scanned documents) ---------- */
  const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
    JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12 };
  const fixY = (y) => (y < 100 ? (y > 60 ? 1900 + y : 2000 + y) : y);
  /** Returns a Set of day numbers found in the text (ambiguous numeric dates yield both readings). */
  U.extractDates = function (text) {
    const found = new Set();
    const T = String(text || '').toUpperCase();
    let m;
    const add = (y, mo, d) => {
      const n = U.ymd(fixY(y), mo, d);
      if (n !== null) found.add(n);
    };
    const reIso = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g;
    while ((m = reIso.exec(T))) add(+m[1], +m[2], +m[3]);
    const reNum = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g;
    while ((m = reNum.exec(T))) {
      add(+m[3], +m[2], +m[1]); // D/M/Y
      add(+m[3], +m[1], +m[2]); // M/D/Y
    }
    const reDMonY = /\b(\d{1,2})(?:ST|ND|RD|TH)?[\s\-.]*([A-Z]{3,9})[\s\-.,]*(\d{4}|\d{2})\b/g;
    while ((m = reDMonY.exec(T))) if (MONTHS[m[2]]) add(+m[3], MONTHS[m[2]], +m[1]);
    const reMonDY = /\b([A-Z]{3,9})\.?\s+(\d{1,2})(?:ST|ND|RD|TH)?,?\s+(\d{4})\b/g;
    while ((m = reMonDY.exec(T))) if (MONTHS[m[1]]) add(+m[3], MONTHS[m[1]], +m[2]);
    return found;
  };
})(typeof globalThis !== 'undefined' ? (globalThis.VFR = globalThis.VFR || {}) : (window.VFR = window.VFR || {}));
