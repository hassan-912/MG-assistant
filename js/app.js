/* Visa File Review — upload-only UI.
 * Drop every document of the file → each is read in the browser (pdf.js + OCR) → case is built → full review.
 * Documents never leave the user's computer. */
(function (V) {
  'use strict';
  const U = V.util;
  const R = V.ref;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STORE = 'vfr.upload.v2';
  const CONCURRENCY = 4;

  /* ---------------- state ---------------- */
  const fresh = () => ({ files: [], settings: { program: 'auto', consulateOf: '', submissionDate: U.todayIso(), rateEUR: '', rateUSD: '' } });
  let state = load() || fresh();
  let fx = null; // live rates per 1 EUR
  let fxInfo = '';
  const docs = {}; // file id → { id, name, file, layout } — kept in memory for the field pictures
  let tab = 'findings';
  let sevFilter = { critical: true, major: true, minor: true, info: true };
  let lastReport = null;
  let lastCase = null;
  const blobs = {}; // id → File (for retries; not persisted)
  const openRows = new Set();

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!s || !Array.isArray(s.files)) return null;
      s.files.forEach((f) => {
        if (f.status === 'reading' || f.status === 'queued' || f.status === 'waiting') { f.status = 'error'; f.error = 'Not read yet — drop this file again.'; }
      });
      s.settings = Object.assign(fresh().settings, s.settings || {});
      return s;
    } catch (e) {
      return null;
    }
  }
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch (e) { /* storage full or blocked — review still works for this session */ }
  }

  /* ---------------- exchange rates (no client data is sent) ---------------- */
  async function loadRates() {
    const tries = ['api/rates', 'https://open.er-api.com/v6/latest/EUR'];
    for (const url of tries) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) continue;
        const j = await r.json();
        const rates = j.rates;
        if (!rates || !rates.EGP) continue;
        fx = rates;
        const d = j.date || j.time_last_update_utc || '';
        fxInfo = 'Live rates' + (d ? ' ' + String(d).replace(/ \d\d:\d\d:\d\d.*$/, '') : '');
        return;
      } catch (e) { /* try the next source */ }
    }
    fx = null;
    fxInfo = 'Live rates unavailable';
  }

  /* ---------------- reading files ---------------- */
  function mediaType(file) {
    const n = file.name.toLowerCase();
    if (file.type) return file.type;
    if (n.endsWith('.pdf')) return 'application/pdf';
    if (/\.jpe?g$/.test(n)) return 'image/jpeg';
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.webp')) return 'image/webp';
    if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (n.endsWith('.txt')) return 'text/plain';
    return 'application/octet-stream';
  }
  let running = 0;
  const queue = [];
  function enqueue(id) {
    queue.push(id);
    pump();
  }
  function pump() {
    while (running < CONCURRENCY && queue.length) {
      const id = queue.shift();
      running++;
      processFile(id).finally(() => {
        running--;
        pump();
      });
    }
  }
  async function processFile(id) {
    const f = state.files.find((x) => x.id === id);
    const file = blobs[id];
    if (!f || !file) return;
    f.status = 'reading';
    f.error = '';
    renderFiles();
    try {
      const t0 = performance.now();
      const read = await V.reader.read(file);
      f.data = V.parse.parseDocument(f.fileName, read);
      docs[id] = { id, name: f.fileName, file, layout: read.layout };
      f.docId = id;
      f.mode = 'browser';
      f.ms = Math.round(performance.now() - t0);
      f.status = 'done';
    } catch (e) {
      console.error(e);
      V.monitoring?.capture(e, 'document_read');
      f.status = 'error';
      f.error = e.message || String(e);
    }
    save();
    renderFiles();
    scheduleReview();
  }
  function addFiles(list) {
    Array.from(list || []).forEach((file) => {
      if (file.size > 80 * 1024 * 1024) {
        toast(file.name + ' is larger than 80 MB — split or compress it.');
        return;
      }
      const existing = state.files.find((x) => x.fileName === file.name && x.size === file.size);
      const id = existing ? existing.id : 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      if (!existing) state.files.push({ id, fileName: file.name, size: file.size, mediaType: mediaType(file), status: 'queued' });
      else Object.assign(existing, { status: 'queued', error: '' });
      blobs[id] = file;
      enqueue(id);
    });
    save();
    renderFiles();
  }

  /* ---------------- review ---------------- */
  let reviewTimer = null;
  function scheduleReview() {
    clearTimeout(reviewTimer);
    reviewTimer = setTimeout(review, 60);
  }
  function currentFx() {
    const s = state.settings;
    const base = fx ? Object.assign({}, fx) : null;
    const eur = U.num(s.rateEUR);
    const usd = U.num(s.rateUSD);
    if (!eur && !usd) return base;
    const out = base || { EUR: 1 };
    // manual rates are "1 EUR = x EGP" and "1 USD = x EGP"
    if (eur) out.EGP = eur;
    if (usd && out.EGP) out.USD = out.EGP / usd;
    return out;
  }
  function review() {
    const done = state.files.filter((f) => f.status === 'done' && f.data);
    if (!done.length) {
      lastReport = null;
      renderReport();
      return;
    }
    const s = state.settings;
    try {
      lastCase = V.builder.build(done.map((f) => ({ fileName: f.fileName, typeOverride: f.typeOverride, data: f.data })),
        { program: s.program, consulateOf: s.consulateOf, submissionDate: s.submissionDate, fx: currentFx() });
      lastReport = V.engine.run(lastCase);
    } catch (e) {
      console.error(e);
      V.monitoring?.capture(e, 'review');
      $('#report').innerHTML = '<div class="card pad"><b>Review error:</b> ' + esc(e.message) + '</div>';
      return;
    }
    renderTop();
    renderReport();
  }

  /* ---------------- rendering: top bar & banner ---------------- */
  function renderTop() {
    const prog = $('#program');
    prog.value = state.settings.program;
    const effective = lastCase ? lastCase.program : state.settings.program === 'auto' ? 'schengen' : state.settings.program;
    $('#detected').textContent = state.settings.program === 'auto' && lastCase ? 'Detected: ' + R.programs[lastCase.program] : '';
    $('#consulateWrap').hidden = effective !== 'schengen';
    $('#consulate').value = state.settings.consulateOf;
    $('#reviewDate').value = state.settings.submissionDate;
  }
  function renderBanner() {
    const el = $('#banner');
    if (location.protocol === 'file:') {
      el.innerHTML = '<div class="banner bad"><b>Open the app with start.bat (or the website link).</b><br>Opened directly from the folder, the browser blocks the document reader.</div>';
      return;
    }
    el.innerHTML = '';
  }

  /* ---------------- rendering: file list ---------------- */
  const typeLabel = (t) => (V.docs.catalog[t] ? V.docs.catalog[t][0] : t === 'refusal_letter' ? 'Visa refusal letter' : 'Other / unrecognised');
  function flat(obj, prefix, out) {
    Object.keys(obj || {}).forEach((k) => {
      const v = obj[k];
      const key = prefix ? prefix + ' › ' + k : k;
      if (v === null || v === '' || v === false || v === 'unknown' || v === undefined) return;
      if (Array.isArray(v)) {
        v.forEach((item, i) => (typeof item === 'object' ? flat(item, key + ' ' + (i + 1), out) : out.push([key + ' ' + (i + 1), item])));
      } else if (typeof v === 'object') flat(v, key, out);
      else out.push([key, v]);
    });
    return out;
  }
  function renderFiles() {
    const el = $('#files');
    const files = state.files;
    $('#fileCount').textContent = files.length ? files.length + ' file' + (files.length === 1 ? '' : 's') + ' · ' + files.filter((f) => f.status === 'done').length + ' read' : '';
    if (!files.length) {
      el.innerHTML = '';
      return;
    }
    const typeOptions = Object.keys(V.docs.catalog).map((k) => [k, V.docs.catalog[k][0]]).concat([['refusal_letter', 'Visa refusal letter'], ['other', 'Other / not a visa document']])
      .sort((a, b) => a[1].localeCompare(b[1]));
    const opts = (detected, chosen) => typeOptions.map(([k, l]) => '<option value="' + k + '"' + (k === chosen ? ' selected' : '') + '>' + esc(l) + (k === detected ? ' (detected)' : '') + '</option>').join('');
    el.innerHTML = files.map((f) => {
      const d = f.data;
      const t = f.typeOverride || (d && d.docType) || '';
      const issues = d && d.issues ? d.issues.length : 0;
      const pill = { queued: ['muted', 'Queued'], waiting: ['muted', 'Waiting for key'], reading: ['busy', 'Reading…'], done: ['ok', 'Read'], error: ['bad', 'Not read'] }[f.status] || ['muted', f.status];
      let html = '<div class="file' + (openRows.has(f.id) ? ' open' : '') + '" data-id="' + f.id + '">';
      html += '<div class="file-head"><span class="pill ' + pill[0] + '">' + pill[1] + '</span>';
      html += '<div class="file-main"><div class="fname" title="' + esc(f.fileName) + '">' + esc(f.fileName) + '</div>';
      html += '<div class="fmeta">' + (f.status === 'error' ? '<span class="err">' + esc(f.error) + '</span>' : d ? esc(typeLabel(t)) + (d.mainPersonName ? ' · ' + esc(d.mainPersonName) : '') + (issues ? ' · <span class="err">' + issues + ' issue' + (issues > 1 ? 's' : '') + ' noticed</span>' : '') : (Math.round(f.size / 1024) + ' KB')) + '</div></div>';
      if (d) html += '<select class="type-sel' + (f.typeOverride ? ' changed' : '') + '" aria-label="Document type of ' + esc(f.fileName) + '" title="Change if the document was recognised as the wrong type" data-act="type">' + opts(d.docType, f.typeOverride || d.docType) + '</select>';
      html += '<div class="file-btns">';
      if (d) html += '<button class="ghost small" data-act="toggle">' + (openRows.has(f.id) ? 'Hide' : 'Details') + '</button>';
      if (f.status === 'error' && blobs[f.id]) html += '<button class="ghost small" data-act="retry">Retry</button>';
      html += '<button class="danger small" data-act="remove" aria-label="Remove ' + esc(f.fileName) + '">×</button></div></div>';
      if (d && openRows.has(f.id)) {
        const rows = flat(d, '', []).filter(([k]) => k !== 'docType');
        html += '<div class="file-body">' + (d.summary ? '<p>' + esc(d.summary) + '</p>' : '') + '<table class="kv">' + rows.map(([k, v]) => '<tr><th>' + esc(k) + '</th><td>' + esc(v) + '</td></tr>').join('') + '</table></div>';
      }
      return html + '</div>';
    }).join('');
  }

  /* ---------------- rendering: report ---------------- */
  /* score ring (activity-ring style) — animates from the previous score to the new one */
  const RING_R = 36;
  const RING_C = 2 * Math.PI * RING_R;
  let shownScore = 0;
  function ring(score, level) {
    const col = level === 'bad' ? 'var(--crit)' : level === 'warn' ? 'var(--major)' : 'var(--ok)';
    return '<div class="score" role="img" aria-label="Score ' + score + ' out of 100"><svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">' +
      '<circle class="ring-track" cx="42" cy="42" r="' + RING_R + '" fill="none" stroke-width="9"/>' +
      '<circle class="ring" cx="42" cy="42" r="' + RING_R + '" fill="none" stroke="' + col + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + RING_C + '" stroke-dashoffset="' + RING_C * (1 - shownScore / 100) + '" data-to="' + RING_C * (1 - score / 100) + '"/></svg><b>' + score + '</b></div>';
  }
  function settleReport(score) {
    const r = $('#report .ring');
    if (r) requestAnimationFrame(() => requestAnimationFrame(() => r.setAttribute('stroke-dashoffset', r.getAttribute('data-to'))));
    shownScore = score;
    placeThumb(false);
  }
  /* segmented control: the white "thumb" slides under the selected tab */
  function placeThumb(animate) {
    const tabsEl = $('#report .tabs');
    if (!tabsEl) return;
    const on = tabsEl.querySelector('button.on');
    const th = tabsEl.querySelector('.seg-thumb');
    if (!on || !th) return;
    if (!animate) th.style.transition = 'none';
    th.style.width = on.offsetWidth + 'px';
    th.style.transform = 'translateX(' + (on.offsetLeft - 2) + 'px)';
    if (!animate) {
      void th.offsetWidth;
      th.style.transition = '';
    }
  }
  let seenFindings = new Set();
  let reportShown = false;
  function renderReport() {
    const el = $('#report');
    const rep = lastReport;
    const busy = state.files.some((f) => f.status === 'reading' || f.status === 'queued');
    if (!rep && state.files.some((f) => f.status === 'waiting')) {
      reportShown = false;
      el.innerHTML = '<div class="card pad empty-report anim-in"><h3>Waiting for document reading</h3><p>Your files are queued. Connect document reading on the left (step 1) and the review starts automatically.</p></div>';
      return;
    }
    if (!rep) {
      reportShown = false;
      shownScore = 0;
      el.innerHTML = '<div class="card pad empty-report anim-in"><h3>No review yet</h3><p>Drop the client\'s documents on the left — passport, application form, flights, hotel, insurance, bank statements, HR letter and so on. Each one is read automatically and the whole file is checked as soon as the first document is ready.</p></div>';
      return;
    }
    const m = rep.metrics;
    const docsReq = rep.docs.filter((d) => d.level === 'required');
    const docsOk = docsReq.filter((d) => d.present).length;
    const firstPaint = !reportShown;
    reportShown = true;
    const cardCls = 'card' + (firstPaint ? ' anim-in' : '');
    let html = '<div class="' + cardCls + '"><div class="verdict ' + rep.verdict.level + '">' + ring(rep.score, rep.verdict.level) +
      '<div><h3>' + esc(rep.verdict.label) + (busy ? ' <span class="sub">(still reading files…)</span>' : '') + '</h3><p>' + esc(rep.verdict.text) + '</p><div class="chips">' +
      ['critical', 'major', 'minor', 'info'].map((s) => '<button class="chip ' + s + (sevFilter[s] ? '' : ' off') + '" data-sev="' + s + '">' + rep.counts[s] + ' ' + s + '</button>').join('') +
      '<span class="chip ok">' + rep.passes.length + ' passed</span></div></div></div>';
    const metric = (label, value, small) => '<div class="metric"><span>' + label + '</span><b>' + value + '</b>' + (small ? '<small>' + small + '</small>' : '') + '</div>';
    html += '<div class="metrics">';
    html += metric('Applicant', esc(U.fullName(lastCase.applicant) || '—'), esc((lastCase.passport.number || '') + (m.age !== null && m.age !== undefined ? ' · age ' + m.age : '')));
    html += metric('Visa', esc(rep.programLabel.split(' (')[0]), esc(rep.program === 'schengen' && lastCase.meta.consulateOf ? 'to ' + R.countryName(lastCase.meta.consulateOf) : rep.programLabel.indexOf('(') !== -1 ? '(' + rep.programLabel.split(' (')[1] : ''));
    if (rep.program !== 'us_iv') html += metric('Trip', m.tripDays ? U.plural(m.tripDays, 'day') : '—', lastCase.trip.entryDate ? esc(U.fmt(U.day(lastCase.trip.entryDate)) + ' → ' + U.fmt(U.day(lastCase.trip.exitDate))) : '');
    if (m.mainDestination) html += metric('Main destination', esc(R.countryName(m.mainDestination)), Object.keys(m.nightsByCountry || {}).map((k) => k + ' ' + m.nightsByCountry[k] + 'n').join(' · '));
    if (m.rule90) html += metric('90/180 rule', m.rule90.maxUsed + ' / 90 days', m.rule90.over ? 'exceeded ' + U.fmt(m.rule90.over) : 'within limit');
    if (m.fundsRequired) {
      html += metric(rep.program === 'us_iv' ? 'I-864 income' : 'Funds', m.fundsAvailable !== undefined && m.fundsAvailable !== null ? U.money(m.fundsAvailable, m.fundsCur) : '—',
        'required ' + U.money(m.fundsRequired, m.fundsCur) + ' — ' + esc(m.fundsBasis || ''));
    }
    if (m.ties && rep.program !== 'us_iv') html += metric('Return ties', m.ties.score + '/100 · ' + m.ties.label, esc(m.ties.why.join(', ')));
    html += metric('Required documents', docsOk + ' / ' + docsReq.length, docsOk === docsReq.length ? 'complete' : docsReq.length - docsOk + ' missing');
    html += '</div></div>';

    const tabs = [['findings', 'Findings'], ['matrix', 'Consistency'], ['docs', 'Checklist & order'], ['case', 'Extracted case']];
    html += '<div class="' + cardCls + '" style="animation-delay:80ms"><div class="tabs-wrap"><div class="tabs" role="tablist"><span class="seg-thumb" aria-hidden="true"></span>' + tabs.map(([k, l]) => '<button role="tab" aria-selected="' + (tab === k) + '" data-tab="' + k + '" class="' + (tab === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div></div>';

    const pane = (k, inner) => '<div class="tab-pane" data-pane="' + k + '"' + (tab === k ? '' : ' hidden') + '>' + inner + '</div>';
    // findings
    const shown = rep.findings.filter((f) => sevFilter[f.sev]);
    let fh = shown.length ? '' : '<p class="perf">No findings for the selected severities.</p>';
    // only findings that were not on screen before get the entrance animation (staggered)
    const newOnes = { n: 0, seen: seenFindings };
    seenFindings = new Set(shown.map((f) => f.sev + f.title));
    const GROUPS = [['critical', 'Must fix before submitting', 'These would most likely lead to a refusal or the file being rejected at the counter.'],
      ['major', 'Should fix', 'The officer will notice these — fix them or explain them in the cover letter.'],
      ['minor', 'Worth checking', 'Small points that make the file cleaner.'],
      ['info', 'For your information', '']];
    GROUPS.forEach(([sev, head, sub]) => {
      const list = shown.filter((f) => f.sev === sev);
      if (!list.length) return;
      fh += '<div class="fgroup ' + sev + '"><h3 class="fgroup-title"><span class="sev ' + sev + '">' + list.length + '</span>' + head + '</h3>' + (sub ? '<p class="fgroup-sub">' + sub + '</p>' : '');
      list.forEach((f) => (fh += findingHtml(f, newOnes)));
      fh += '</div>';
    });
    if (rep.passes.length) fh += '<h4 class="sec-title">Checks passed <span class="sub">' + rep.passes.length + '</span></h4><div class="passes">' + rep.passes.map((p) => '<div>' + esc(p.title) + '</div>').join('') + '</div>';
    html += pane('findings', fh);
    // matrix
    let mh = rep.matrix.length ? '' : '<p class="perf">Not enough data yet.</p>';
    rep.matrix.forEach((row) => {
      mh += '<h4 class="sec-title">' + esc(row.fact) + '</h4><table><thead><tr><th>Source</th><th>Value</th><th>Status</th></tr></thead><tbody>';
      row.values.forEach((v) => {
        const lab = { ok: 'matches', bad: 'conflict', warn: 'differs', ref: 'reference', na: '—' }[v.st] || v.st;
        mh += '<tr><td>' + esc(v.source) + '</td><td class="mono">' + esc(v.value) + '</td><td class="st-' + v.st + '"><span class="dot ' + v.st + '"></span>' + lab + '</td></tr>';
      });
      mh += '</tbody></table>';
    });
    html += pane('matrix', mh);
    // checklist & order
    let dh = '<p class="perf">Stack the physical file in this order and use these names for digital uploads.</p><table><thead><tr><th>#</th><th>Document</th><th>In file</th><th>File name</th></tr></thead><tbody>';
    rep.organize.forEach((o) => {
      const d = rep.docs.find((x) => x.id === o.id);
      const src = lastCase.documents[o.id] && lastCase.documents[o.id].file;
      dh += '<tr><td>' + o.n + '</td><td>' + esc(o.label) + '<br><small class="muted">' + esc(o.group) + ' · ' + d.level + (src ? ' · from ' + esc(src) : '') + '</small></td><td class="' + (o.present ? 'st-ok' : d.level === 'required' ? 'st-bad' : 'st-na') + '">' + (o.present ? '✓' : '✗ missing') + '</td><td class="file-name">' + esc(o.file) + '</td></tr>';
    });
    html += pane('docs', dh + '</tbody></table>');
    html += pane('case', caseHtml(lastCase));
    html += '<div class="perf">Reviewed against ' + esc(U.fmt(U.day(rep.reviewedOn))) + ' · ' + (rep.findings.length + rep.passes.length) + ' checks in ' + rep.ms + ' ms · ' + esc(fxInfo || 'no live rates') + '. Reference figures (funds per day, poverty guidelines, Apostille list) change — confirm with the consulate when a decision depends on them.</div></div>';
    el.innerHTML = html;
    settleReport(rep.score);
    hydrateEvidence();
  }
  function caseHtml(c) {
    const row = (k, v) => (v === '' || v === null || v === undefined ? '' : '<tr><th>' + esc(k) + '</th><td>' + esc(v) + '</td></tr>');
    const tbl = (title, rows) => (rows ? '<h4 class="sec-title">' + title + '</h4><table class="kv">' + rows + '</table>' : '');
    const d = (v) => (v ? U.fmt(U.day(v)) : '');
    let h = '<p class="perf">This is what was read from the documents and checked. Wrong document type? Change it in the upload list.</p>';
    h += tbl('Applicant & passport', row('Name', U.fullName(c.applicant)) + row('Date of birth', d(c.applicant.dob)) + row('Nationality', R.countryName(c.applicant.nationality)) + row('Residence', R.countryName(c.applicant.residenceCountry)) +
      row('Passport', c.passport.number) + row('Issued / expires', d(c.passport.issueDate) + ' / ' + d(c.passport.expiryDate)) + row('MRZ', c.passport.mrz1 ? 'present' : 'not read'));
    h += tbl('Trip', row('Purpose', c.trip.purpose) + row('Entry → exit', d(c.trip.entryDate) + ' → ' + d(c.trip.exitDate)) + row('Entries', c.trip.entries) + row('Accommodation', c.trip.accommodationType) + row('Funded by', c.trip.fundedBy) +
      c.trip.destinations.map((x, i) => row('Destination ' + (i + 1), R.countryName(x.country) + (x.city ? ', ' + x.city : '') + ' ' + d(x.from) + ' → ' + d(x.to))).join(''));
    h += tbl('Flights', c.flights.map((f) => row(d(f.date), (f.flightNo || '') + ' ' + f.from + ' → ' + f.to + (f.passengerName ? ' · ' + f.passengerName : ''))).join(''));
    h += tbl('Accommodation', c.stays.map((s) => row(s.name || s.city, d(s.checkIn) + ' → ' + d(s.checkOut) + ' · ' + R.countryName(s.country) + (s.guestName ? ' · ' + s.guestName : ''))).join(''));
    if (c.insurance.provider || c.insurance.start) h += tbl('Insurance', row('Insurer', c.insurance.provider) + row('Insured', c.insurance.holder) + row('Cover', c.insurance.coverage ? U.money(c.insurance.coverage, 'EUR') : '') + row('Period', d(c.insurance.start) + ' → ' + d(c.insurance.end)) + row('Territory', c.insurance.territory));
    h += tbl('Occupation', row('Status', c.employment.status) + row('Employer', c.employment.employer) + row('Since', d(c.employment.startDate)) + row('Salary', c.employment.monthlySalary ? U.money(c.employment.monthlySalary, c.employment.salaryCurrency) : '') + row('Leave', c.employment.leaveFrom ? d(c.employment.leaveFrom) + ' → ' + d(c.employment.leaveTo) : '') + row('Letter dated', d(c.employment.letterDate)));
    h += tbl('Bank statements', c.finances.statements.map((s) => row(s.bank, (s.holder || '') + ' · ' + d(s.from) + ' → ' + d(s.to) + ' · closing ' + U.money(U.num(s.closing), c.finances.currency))).join('') + row('Rates', c.finances.rateEUR ? '1 EUR = ' + c.finances.rateEUR + ' ' + c.finances.currency + (c.finances.rateUSD ? ' · 1 USD = ' + c.finances.rateUSD + ' ' + c.finances.currency : '') : ''));
    h += tbl('History', row('Refusals declared on form', c.history.refusalsDeclared) + c.history.priorVisas.map((v) => row('Visa ' + R.countryName(v.country), (v.type || '') + ' ' + d(v.from) + ' → ' + d(v.to))).join('') + c.history.refusals.map((r) => row('Refusal', R.countryName(r.country) + ' ' + d(r.date) + ' ' + r.reason)).join(''));
    return h;
  }
  const fileByName = (name) => state.files.find((x) => x.fileName === name);
  function evidenceHtml(ev) {
    const items = (ev || []).map((e) => {
      const f = fileByName(e.file);
      if (!f) return '';
      const live = f.docId && docs[f.docId];
      return '<figure class="ev' + (live ? ' ev-loading' : ' ev-missing') + '" data-doc="' + esc(f.docId || '') + '" data-q="' + esc(JSON.stringify(e.q)) + '"><figcaption>' + esc(e.label || e.file) + '</figcaption>' +
        '<button type="button" class="ev-open" data-cap="' + esc(e.label || e.file) + '" title="Open the picture"><img alt="' + esc((e.label || e.file) + ': ' + (e.q.text || e.q.date || e.q.amount)) + '"></button>' +
        '<span class="ev-fallback">Not visible in the picture — open <b>' + esc(e.file) + '</b> and look for “' + esc(e.q.text || (e.q.date ? U.fmt(U.day(e.q.date)) : e.q.amount)) + '”.</span></figure>';
    }).join('');
    return items ? '<div class="evs">' + items + '</div>' : '';
  }
  /* draw the field pictures (in the browser) and put them into the findings */
  function hydrateEvidence() {
    document.querySelectorAll('#report figure.ev-loading').forEach((fig) => {
      const doc = docs[fig.getAttribute('data-doc')];
      let q;
      try {
        q = JSON.parse(fig.getAttribute('data-q'));
      } catch (e) {
        q = null;
      }
      if (!doc || !q) return fig.classList.replace('ev-loading', 'ev-missing');
      V.snippet.render(doc, q).then((url) => {
        if (!url) return fig.classList.replace('ev-loading', 'ev-missing');
        const img = fig.querySelector('img');
        img.onload = () => fig.classList.remove('ev-loading');
        img.src = url;
      });
    });
  }
  function findingHtml(f, newOnes) {
    const isNew = newOnes && !newOnes.seen.has(f.sev + f.title);
    const anim = isNew ? ' anim-in" style="animation-delay:' + Math.min(600, 60 * newOnes.n++) + 'ms' : '';
    return '<article class="finding2 ' + f.sev + anim + '"><div class="f-head"><h4>' + esc(f.title) + '</h4><span class="cat-tag">' + esc(f.cat) + '</span></div>' +
      (f.detail ? '<p class="f-what">' + esc(f.detail) + '</p>' : '') +
      evidenceHtml(f.ev) +
      (f.fix ? '<p class="f-fix"><b>What to do:</b> ' + esc(f.fix.charAt(0).toUpperCase() + f.fix.slice(1)) + '</p>' : '') + '</article>';
  }
  /* ---------------- misc ---------------- */
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function init() {
    const prog = $('#program');
    prog.innerHTML = '<option value="auto">Auto-detect from documents</option>' + Object.keys(R.programs).map((k) => '<option value="' + k + '">' + esc(R.programs[k]) + '</option>').join('');
    $('#consulate').innerHTML = '<option value="">Auto (from documents)</option>' + R.schengen.map((a) => [a, R.countryName(a)]).sort((x, y) => x[1].localeCompare(y[1])).map(([a, n]) => '<option value="' + a + '">' + esc(n) + '</option>').join('');
    prog.addEventListener('change', () => { state.settings.program = prog.value; save(); scheduleReview(); });
    $('#consulate').addEventListener('change', (e) => { state.settings.consulateOf = e.target.value; save(); scheduleReview(); });
    $('#reviewDate').addEventListener('change', (e) => { state.settings.submissionDate = e.target.value || U.todayIso(); save(); scheduleReview(); });
    ['rateEUR', 'rateUSD'].forEach((k) => {
      const inp = $('#' + k);
      inp.value = state.settings[k] || '';
      inp.addEventListener('input', () => { state.settings[k] = inp.value.trim(); save(); scheduleReview(); });
    });

    const input = $('#fileInput');
    const drop = $('#drop');
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.target === document.documentElement) drop.classList.remove('over'); }));
    document.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

    $('#files').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn || btn.tagName === 'SELECT') return;
      const id = e.target.closest('.file').getAttribute('data-id');
      const act = btn.getAttribute('data-act');
      if (act === 'remove') {
        state.files = state.files.filter((f) => f.id !== id);
        delete blobs[id];
        delete docs[id];
        save();
        renderFiles();
        scheduleReview();
      } else if (act === 'retry') enqueue(id);
      else if (act === 'toggle') {
        openRows.has(id) ? openRows.delete(id) : openRows.add(id);
        renderFiles();
      }
    });
    $('#files').addEventListener('change', (e) => {
      if (e.target.getAttribute('data-act') !== 'type') return;
      const f = state.files.find((x) => x.id === e.target.closest('.file').getAttribute('data-id'));
      f.typeOverride = e.target.value === (f.data && f.data.docType) ? '' : e.target.value;
      save();
      renderFiles();
      scheduleReview();
    });
    $('#report').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-sev]');
      if (chip) {
        sevFilter[chip.getAttribute('data-sev')] = !sevFilter[chip.getAttribute('data-sev')];
        tab = 'findings';
        return renderReport();
      }
      const tb = e.target.closest('[data-tab]');
      if (tb) {
        tab = tb.getAttribute('data-tab');
        document.querySelectorAll('#report .tabs button').forEach((b) => {
          b.classList.toggle('on', b === tb);
          b.setAttribute('aria-selected', b === tb);
        });
        document.querySelectorAll('#report .tab-pane').forEach((p) => (p.hidden = p.getAttribute('data-pane') !== tab));
        placeThumb(true);
        return;
      }
      const pic = e.target.closest('.ev-open');
      if (pic && V.lightbox) {
        const fig = pic.closest('figure');
        const doc = docs[fig.getAttribute('data-doc')];
        const thumb = pic.querySelector('img');
        V.snippet.render(doc, JSON.parse(fig.getAttribute('data-q')), 1500).then((url) => V.lightbox.open(url || thumb.src, pic.getAttribute('data-cap'), thumb));
      }
    });
    $('#btnNew').addEventListener('click', () => {
      if (state.files.length && !confirm('Clear all uploaded documents and start a new file?')) return;
      state = fresh();
      Object.keys(docs).forEach((k) => delete docs[k]);
      V.snippet.forget();
      Object.keys(blobs).forEach((k) => delete blobs[k]);
      queue.length = 0;
      lastReport = null;
      lastCase = null;
      save();
      renderTop();
      renderFiles();
      renderReport();
      ['rateEUR', 'rateUSD'].forEach((k) => ($('#' + k).value = ''));
    });
    $('#btnPrint').addEventListener('click', () => window.print());
    $('#btnExport').addEventListener('click', () => {
      if (!lastReport) return toast('Nothing to export yet.');
      const blob = new Blob([JSON.stringify({ case: lastCase, report: lastReport }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'visa-review_' + (U.normName(lastCase.applicant.surname).replace(/ /g, '-') || 'file') + '_' + U.todayIso() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });

    renderTop();
    renderFiles();
    if (state.files.some((f) => f.status === 'done')) review();
    else renderReport();
    renderBanner();
    if (location.protocol !== 'file:') setTimeout(() => V.reader.warmUp(), 400);
    loadRates().then(scheduleReview);
  }
  window.addEventListener('resize', () => placeThumb(false));
  document.addEventListener('DOMContentLoaded', init);
})(window.VFR);
