/* Find a value (name, number, date, amount) among the words of a document page. Pure — browser and Node. */
(function (V) {
  'use strict';
  const U = V.util;
  const L = (V.locate = {});
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const MONTH = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const norm = (L.norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, ''));

  function dateParts(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    return { yyyy: m[1], yy: m[1].slice(2), mm: m[2], m: String(+m[2]), dd: m[3], d: String(+m[3]), mon: MON[+m[2] - 1], month: MONTH[+m[2] - 1] };
  }
  /** All the ways a value can be printed, as separator-free upper-case strings. */
  L.variants = function (q) {
    if (q.date) {
      const p = dateParts(q.date);
      if (!p) return [];
      return [...new Set([
        p.dd + p.mm + p.yyyy, p.d + p.m + p.yyyy, p.d + p.mm + p.yyyy, p.dd + p.m + p.yyyy, p.yyyy + p.mm + p.dd, p.yyyy + p.m + p.d,
        p.mm + p.dd + p.yyyy, p.m + p.d + p.yyyy, p.dd + p.mm + p.yy, p.m + p.d + p.yy,
        p.d + p.month + p.yyyy, p.dd + p.month + p.yyyy, p.month + p.d + p.yyyy, p.month + p.dd + p.yyyy,
        p.d + p.mon + p.yyyy, p.dd + p.mon + p.yyyy, p.mon + p.d + p.yyyy, p.dd + p.mon + p.yy, p.d + p.mon + p.yy,
      ])];
    }
    if (q.amount !== undefined && q.amount !== null && q.amount !== '') {
      const n = Number(q.amount);
      if (!isFinite(n)) return [];
      return [...new Set([String(Math.round(n)), n.toFixed(2).replace('.', ''), String(n).replace('.', '')])];
    }
    const t = norm(q.text);
    return t ? [t] : [];
  };
  /** Human spellings of a value, for searching plain text (Word documents). */
  L.needles = function (q) {
    if (q.date) {
      const p = dateParts(q.date);
      if (!p) return [];
      const cap = (s) => s[0] + s.slice(1).toLowerCase();
      return [p.d + ' ' + cap(p.month) + ' ' + p.yyyy, p.dd + '/' + p.mm + '/' + p.yyyy, p.d + '/' + p.m + '/' + p.yyyy, cap(p.month) + ' ' + p.d + ', ' + p.yyyy,
        p.d + ' ' + cap(p.mon) + ' ' + p.yyyy, p.yyyy + '-' + p.mm + '-' + p.dd, p.dd + '.' + p.mm + '.' + p.yyyy, p.dd + '-' + p.mm + '-' + p.yyyy, p.d + ' ' + cap(p.month)];
    }
    if (q.amount !== undefined && q.amount !== null && q.amount !== '') {
      const n = Number(q.amount);
      return [n.toLocaleString('en-US'), String(n)];
    }
    return [String(q.text || '')];
  };

  function onPage(words, targets, fuzzy) {
    const nw = words.map((w) => norm(w.t));
    for (const target of targets) {
      for (let i = 0; i < nw.length; i++) {
        if (!nw[i]) continue;
        let acc = '';
        for (let j = i; j < Math.min(nw.length, i + 8); j++) {
          acc += nw[j];
          if (acc.length > target.length + 2 || (!fuzzy && target.indexOf(acc) !== 0)) break;
          const tol = fuzzy && /[A-Z]/.test(target) ? Math.floor(target.length / 7) : 0;
          if (acc === target || (tol && Math.abs(acc.length - target.length) <= tol && U.lev(acc, target) <= tol)) return words.slice(i, j + 1);
        }
      }
    }
    // a single word that contains the value (e.g. a name inside a passport MRZ line)
    for (const target of targets) {
      if (target.length < 5) continue;
      const k = nw.findIndex((w) => w.length > target.length && w.indexOf(target) !== -1);
      if (k !== -1) return [words[k]];
    }
    return null;
  }
  /** @returns {{page, words}|null} */
  L.find = function (layout, q) {
    const targets = L.variants(q);
    if (!targets.length || !layout) return null;
    for (const fuzzy of [false, true]) {
      for (const p of layout.pages || []) {
        const hit = onPage(p.words || [], targets, fuzzy);
        if (hit) return { page: p, words: hit };
      }
    }
    return null;
  };
  /** Crop rectangle (page coordinates) around a hit: the value, its label on the left or above, a little context. */
  L.cropBox = function (p, words) {
    const box = words.reduce((b, w) => ({ x0: Math.min(b.x0, w.x0), y0: Math.min(b.y0, w.y0), x1: Math.max(b.x1, w.x1), y1: Math.max(b.y1, w.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    const lh = Math.max(12, box.y1 - box.y0);
    const lineWords = (p.words || []).filter((w) => w.y1 > box.y0 - lh * 0.3 && w.y0 < box.y1 + lh * 0.3 && w.x1 <= box.x0 && box.x0 - w.x1 < p.w * 0.45);
    const left = lineWords.length ? Math.min(...lineWords.map((w) => w.x0)) : box.x0;
    let cx0 = Math.max(0, Math.min(left, box.x0) - lh * 1.5);
    let cx1 = Math.min(p.w, box.x1 + Math.max(lh * 4, p.w * 0.12));
    if (cx1 - cx0 < p.w * 0.45) {
      const grow = (p.w * 0.45 - (cx1 - cx0)) / 2;
      cx0 = Math.max(0, cx0 - grow);
      cx1 = Math.min(p.w, cx1 + grow);
    }
    let cy0 = Math.max(0, box.y0 - lh * 2.2);
    const cy1 = Math.min(p.h, box.y1 + lh * 2.2);
    // the field label often wraps over the lines just above the value (forms) — include them
    const labelText = lineWords.map((w) => w.t).join(' ').replace(/[^A-Za-z]/g, '');
    const reach = labelText.length >= 18 ? 1.6 : 4;
    const above = (p.words || []).filter((w) => w.y1 <= box.y0 + 1 && w.y0 >= box.y0 - lh * reach && w.x1 >= box.x0 - p.w * 0.3 && w.x0 <= box.x1 + p.w * 0.05);
    if (above.length) {
      cy0 = Math.max(0, Math.min(cy0, Math.min(...above.map((w) => w.y0)) - lh * 0.5));
      cx0 = Math.max(0, Math.min(cx0, Math.min(...above.map((w) => w.x0)) - lh * 0.5));
    }
    return { box, crop: { x0: cx0, y0: cy0, x1: cx1, y1: cy1 } };
  };
})(typeof globalThis !== 'undefined' ? (globalThis.VFR = globalThis.VFR || {}) : (window.VFR = window.VFR || {}));
