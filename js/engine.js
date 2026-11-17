/* Visa File Review Engine — rule engine.
 * VFR.engine.run(caseFile) → report. Pure and synchronous (runs in a few ms), no DOM. */
(function (V) {
  'use strict';
  const U = V.util;
  const R = V.ref;
  const E = (V.engine = {});

  const SEV_W = { critical: 25, major: 8, minor: 2, info: 0 };
  const CAT = {
    data: 'Core data', id: 'Identity & passport', dates: 'Dates & itinerary', ins: 'Insurance', fin: 'Finances',
    emp: 'Occupation & ties', hist: 'Travel history', legal: 'Legalization & translation', docs: 'Completeness',
    prog: 'Program rules', scan: 'Document scan', eg: 'Egypt-specific',
  };
  E.CAT = CAT;

  /* ============================== context ============================== */
  function makeCtx(c) {
    c = c || {};
    const ap = c.applicant || {};
    const t = c.trip || {};
    const fin = c.finances || {};
    const P = c.program || 'schengen';
    const T = U.day(c.meta && c.meta.submissionDate) || U.day(U.todayIso());
    const entry = U.day(t.entryDate);
    let exit = U.day(t.exitDate);
    if (P === 'us_iv' && entry !== null) exit = entry; // immigrating: no return
    const ctx = {
      c, P, T, ap, t, fin,
      pp: c.passport || {},
      entry, exit,
      validTrip: entry !== null && exit !== null && exit >= entry,
      findings: [], passes: [], matrix: {}, timeline: [], metrics: {},
      name: U.fullName(ap),
      isNIV: P === 'us_b1b2' || P === 'us_f1',
      isUS: P !== 'schengen',
    };
    ctx.days = ctx.validTrip ? exit - entry + 1 : 0;
    ctx.nights = ctx.validTrip ? exit - entry : 0;
    ctx.inRegion = P === 'schengen' ? (a2) => R.isSchengen(a2) : (a2) => a2 === 'US';
    ctx.regionName = P === 'schengen' ? 'the Schengen area' : 'the United States';
    ctx.dob = U.day(ap.dob);
    ctx.age = ctx.dob !== null ? U.years(ctx.dob, entry !== null ? entry : T) : null;
    ctx.prevPassports = String(ctx.pp.previousNumbers || '').split(/[,;\s]+/).map(U.normId).filter(Boolean);
    const cur = (fin.currency || 'EGP').toUpperCase();
    ctx.cur = cur;
    ctx.rateEUR = cur === 'EUR' ? 1 : U.num(fin.rateEUR); // 1 EUR = x <cur>
    ctx.rateUSD = cur === 'USD' ? 1 : U.num(fin.rateUSD); // 1 USD = x <cur>
    if (cur === 'EUR' && !ctx.rateUSD && U.num(fin.rateUSD)) ctx.rateUSD = U.num(fin.rateUSD);
    ctx.toEUR = (v) => (v === null ? null : ctx.rateEUR ? v / ctx.rateEUR : null);
    ctx.toUSD = (v) => (v === null ? null : ctx.rateUSD ? v / ctx.rateUSD : null);
    ctx.weekend = ['EG', 'SA', 'KW', 'QA', 'BH', 'OM', 'JO', 'IQ', 'DZ', 'LY', 'SY', 'YE', 'SD'].indexOf(ap.residenceCountry || 'EG') !== -1 ? [5, 6] : [0, 6];
    ctx.add = (sev, cat, title, detail, fix) => {
      const f = { sev, cat: CAT[cat] || cat, title, detail: detail || '', fix: fix || '' };
      ctx.findings.push(f);
      return f;
    };
    /** Attach a picture of a value inside a document: q = { text } | { date: 'YYYY-MM-DD' } | { amount } */
    ctx.ev = (f, file, q, label) => {
      if (f && file && q && (q.text || q.date || (q.amount !== undefined && q.amount !== null && q.amount !== ''))) {
        f.ev = f.ev || [];
        if (!f.ev.some((e) => e.file === file && JSON.stringify(e.q) === JSON.stringify(q))) f.ev.push({ file, q, label: label || file });
      }
      return f;
    };
    ctx.ppFile = (c.passport || {}).file || '';
    ctx.appFile = (c.meta || {}).applicationFile || '';
    ctx.ok = (cat, title) => ctx.passes.push({ cat: CAT[cat] || cat, title });
    ctx.mx = (fact, source, value, st) => {
      (ctx.matrix[fact] = ctx.matrix[fact] || []).push({ source, value: value === null || value === undefined || value === '' ? '—' : String(value), st });
    };
    ctx.tl = (label, a, b, kind, st) => {
      if (a === null || a === undefined) return;
      ctx.timeline.push({ label, a, b: b === null || b === undefined ? a : b, kind, st: st || 'ok' });
    };
    return ctx;
  }
  const dow = (n) => (((n + 4) % 7) + 7) % 7; // 0 = Sunday

  /* ============================== shared checks ============================== */
  function coreData(x) {
    const miss = [];
    const need = [
      [x.ap.surname, 'surname'], [x.ap.givenNames, 'given names'], [x.ap.dob, 'date of birth'], [x.ap.nationality, 'nationality'],
      [x.pp.number, 'passport number'], [x.pp.expiryDate, 'passport expiry date'],
      [x.t.entryDate, x.P === 'us_iv' ? 'intended travel date' : 'trip entry date'],
    ];
    if (x.P !== 'us_iv') need.push([x.t.exitDate, 'trip exit date']);
    need.forEach(([v, l]) => !v && miss.push(l));
    if (miss.length) {
      x.add('critical', 'data', 'Core data missing: ' + miss.join(', '),
        'Without these the file cannot be checked for consistency. Every one of them appears on the application form.',
        'Upload a clear scan of the passport bio page (both MRZ lines visible) and the application form.');
    } else x.ok('data', 'All core data present');
    if (x.entry !== null && x.exit !== null && x.exit < x.entry) {
      x.add('critical', 'dates', 'Exit date is before the entry date', U.fmt(x.entry) + ' → ' + U.fmt(x.exit), 'Correct the trip dates.');
    }
    if (x.entry !== null && x.entry <= x.T) {
      x.add('critical', 'dates', 'Trip starts on or before the submission date',
        'Entry ' + U.fmt(x.entry) + ', submission ' + U.fmt(x.T) + '.', 'Move the trip to a future date and re-book flights/hotel/insurance accordingly.');
    }
    if (x.dob !== null && x.dob >= x.T) x.add('critical', 'id', 'Date of birth is in the future', U.fmt(x.dob), 'Correct the date of birth.');
  }

  function passportChecks(x) {
    const pp = x.pp;
    const iss = U.day(pp.issueDate);
    const exp = U.day(pp.expiryDate);
    x.mx('Passport number', 'Passport data', U.normId(pp.number), 'ref');
    x.mx('Full name', 'Passport data', U.normName(x.name), 'ref');
    x.mx('Date of birth', 'Passport data', U.fmt(x.dob), 'ref');
    if (exp !== null && exp <= x.T) x.add('critical', 'id', 'Passport has expired', 'Expired on ' + U.fmt(exp) + '.', 'Renew the passport before applying.');
    if (iss !== null && exp !== null && iss >= exp) x.add('critical', 'id', 'Passport issue date is after its expiry date', '', 'Re-check the passport dates.');
    if (iss !== null && iss > x.T) x.add('critical', 'id', 'Passport issue date is in the future', U.fmt(iss), 'Re-check the issue date.');
    if (pp.issuer && x.ap.nationality && pp.issuer !== x.ap.nationality) {
      x.add('major', 'id', 'Passport issuing country differs from nationality',
        R.countryName(pp.issuer) + ' passport, nationality ' + R.countryName(x.ap.nationality) + '.', 'Confirm which nationality is being used for this application.');
    }
    // MRZ
    if (pp.mrz1 || pp.mrz2) {
      const m = U.parseMRZ(pp.mrz1, pp.mrz2, x.T) || { errors: [], fields: {} };
      if (m.errors.length) m.errors.forEach((e) => x.add('critical', 'id', 'Passport MRZ problem', e, 'Re-type the two MRZ lines exactly as printed at the bottom of the bio page.'));
      if (m.fields && m.fields.number) {
        const f = m.fields;
        const cmp = [];
        if (pp.number && U.normId(pp.number) !== U.normId(f.number)) cmp.push('passport number (MRZ ' + f.number + ' vs printed ' + U.normId(pp.number) + ')');
        if (x.dob !== null && f.dob !== null && f.dob !== x.dob) cmp.push('date of birth (MRZ ' + U.fmt(f.dob) + ')');
        if (exp !== null && f.expiry !== null && f.expiry !== exp) cmp.push('expiry date (MRZ ' + U.fmt(f.expiry) + ')');
        if (x.ap.nationality && f.nationality && f.nationality !== x.ap.nationality) cmp.push('nationality (MRZ ' + f.nationality + ')');
        if (x.ap.sex && f.sex && f.sex !== 'X' && f.sex !== x.ap.sex) cmp.push('sex (MRZ ' + f.sex + ')');
        if (x.ap.surname && U.normName(f.surname) !== U.normName(x.ap.surname)) cmp.push('surname (MRZ ' + f.surname + ')');
        if (x.ap.givenNames && U.normName(f.givenNames) !== U.normName(x.ap.givenNames)) {
          // MRZ may truncate long names: accept prefix truncation
          const full = U.normName(x.ap.givenNames);
          if (!(full.indexOf(U.normName(f.givenNames)) === 0 && (U.normName(f.surname).length + full.length) > 39)) cmp.push('given names (MRZ ' + f.givenNames + ')');
        }
        if (cmp.length) {
          x.add('critical', 'id', 'Entered passport data does not match the MRZ', 'Different: ' + cmp.join('; ') + '.',
            'The MRZ is the machine-read truth — fix the form data (or the MRZ typing) so they agree.');
        } else if (m.ok) x.ok('id', 'MRZ check digits valid and match passport data');
        x.mx('Passport number', 'Passport MRZ', f.number, U.normId(pp.number) === U.normId(f.number) ? 'ok' : 'bad');
        x.mx('Full name', 'Passport MRZ', U.normName(f.givenNames + ' ' + f.surname), cmp.some((s) => /name/.test(s)) ? 'bad' : 'ok');
      }
    }
  }

  /** "SHIMAA OKILY" on a booking is fine when the passport is "SHIMAA MOUSTAFA AHMED MOHAMED OKILY": first given name + surname present. */
  function minimalNameOk(x, val) {
    const t = U.tokens(U.canonName(val));
    const given = U.tokens(x.ap.givenNames);
    const sur = U.tokens(x.ap.surname);
    return given.length > 0 && sur.length > 0 && t.indexOf(given[0]) !== -1 && sur.every((s) => t.indexOf(s) !== -1);
  }
  function nameCheck(x, source, val, cat, file, lenient) {
    if (!val) return null;
    const r = U.compareNames(x.name, val);
    const map = { match: 'ok', order: 'warn', partial: 'warn', variant: 'bad', mismatch: 'bad', missing: 'warn' };
    const shortOk = r.status === 'partial' && (!r.extra || !r.extra.length) && minimalNameOk(x, val);
    // letters written by the applicant/agency (cover letter, itinerary) may use the full name or another spelling
    const letterOk = lenient && ['order', 'partial', 'variant'].indexOf(r.status) !== -1;
    x.mx('Full name', source + (letterOk && r.status !== 'match' ? ' (accepted in a letter)' : ''), U.normName(val), shortOk || letterOk ? 'ok' : map[r.status]);
    if (r.status === 'match' || shortOk || letterOk) return r;
    let f = null;
    if (r.status === 'order') f = x.add('minor', cat || 'id', 'Name order differs on ' + source, '"' + val + '" vs passport "' + x.name + '".', 'Use the exact passport order (given names, then surname).');
    else if (r.status === 'partial') {
      f = x.add('minor', cat || 'id', 'Name incomplete on ' + source,
        '"' + val + '" vs passport "' + x.name + '"' + (r.missing && r.missing.length ? ' — missing: ' + r.missing.join(' ') : '') + (r.extra && r.extra.length ? ' — extra: ' + r.extra.join(' ') : '') + '.',
        'Short names are usually accepted, but bookings and insurance should show at least the full passport surname and first name.');
    } else if (r.status === 'variant') {
      f = x.add('major', cat || 'id', 'Name spelling differs on ' + source,
        '"' + val + '" vs passport "' + x.name + '" (' + (r.diffs || []).join(', ') + '). Transliteration differences (e.g. Mohamed/Mohammed) are a frequent reason for extra checks.',
        'Re-issue the document with the exact passport spelling.');
    } else if (r.status === 'mismatch') {
      f = x.add('critical', cat || 'id', 'Name on ' + source + ' does not match the passport',
        '"' + val + '" vs passport "' + x.name + '".', 'This document appears to belong to someone else — replace it.');
    }
    if (f) {
      x.ev(f, file, { text: val }, 'As written in ' + (file || source));
      x.ev(f, x.ppFile, { text: x.ap.surname }, 'Passport');
    }
    return r;
  }

  function idChecks(x) {
    const docs = x.c.documents || {};
    const ppn = U.normId(x.pp.number);
    let checkedN = 0;
    let checkedNo = 0;
    Object.keys(docs).forEach((id) => {
      const d = docs[id];
      if (!d || !d.present) return;
      const label = (V.docs.catalog[id] || [id])[0];
      if (d.name) {
        nameCheck(x, label, d.name);
        checkedN++;
      }
      if (d.passportNo && ppn) {
        checkedNo++;
        const n = U.normId(d.passportNo);
        if (n === ppn) x.mx('Passport number', label, n, 'ok');
        else if (x.prevPassports.indexOf(n) !== -1) {
          x.mx('Passport number', label, n, 'warn');
          x.add('major', 'id', label + ' quotes an old passport number', n + ' is a previous passport; current is ' + ppn + '.',
            'Re-issue the document (or ask the provider to update it) with the current passport number.');
        } else {
          x.mx('Passport number', label, n, 'bad');
          x.add('critical', 'id', 'Passport number on ' + label + ' does not match', n + ' vs passport ' + ppn + '.', 'Correct the document — consulates cross-check this number.');
        }
      }
      if (d.dob && x.dob !== null) {
        const v = U.day(d.dob);
        x.mx('Date of birth', label, U.fmt(v), v === x.dob ? 'ok' : 'bad');
        if (v !== x.dob) x.add('critical', 'id', 'Date of birth on ' + label + ' differs', U.fmt(v) + ' vs passport ' + U.fmt(x.dob) + '.', 'Correct the document.');
      }
    });
    (x.c.docFiles || []).forEach((f) => {
      if (!f || f.role !== 'applicant') return;
      if (f.name && ['flight', 'accommodation', 'insurance', 'bank_statement', 'sponsor_bank'].indexOf(f.type) === -1) {
        nameCheck(x, f.file, f.name, undefined, f.file, f.type === 'cover_letter' || f.type === 'itinerary');
        checkedN++;
      }
      if (f.passportNo && ppn && f.type !== 'passport') {
        checkedNo++;
        if (f.passportNo === ppn) x.mx('Passport number', f.file, f.passportNo, 'ok');
        else if (x.prevPassports.indexOf(f.passportNo) !== -1) {
          x.mx('Passport number', f.file, f.passportNo, 'warn');
          x.add('major', 'id', f.file + ' quotes an old passport number', f.passportNo + ' is a previous passport; current is ' + ppn + '.', 'Have the document updated with the current passport number.');
        } else {
          x.mx('Passport number', f.file, f.passportNo, 'bad');
          x.ev(x.ev(x.add('critical', 'id', 'Passport number on ' + f.file + ' does not match', f.passportNo + ' vs passport ' + ppn + '.', 'Correct the document — consulates cross-check this number.'), f.file, { text: f.passportNo }, 'As written in ' + f.file), x.ppFile, { text: ppn }, 'Passport');
        }
      }
      if (f.dob && x.dob !== null && f.type !== 'passport') {
        const v = U.day(f.dob);
        x.mx('Date of birth', f.file, U.fmt(v), v === x.dob ? 'ok' : 'bad');
        if (v !== null && v !== x.dob) x.ev(x.add('critical', 'id', 'Date of birth on ' + f.file + ' differs', U.fmt(v) + ' vs passport ' + U.fmt(x.dob) + '.', 'Correct the document.'), f.file, { date: f.dob }, 'As written in ' + f.file);
      }
    });
    (x.c.flights || []).forEach((f, i) => f.passengerName && nameCheck(x, 'Flight ' + (f.flightNo || '#' + (i + 1)), f.passengerName, 'dates', f.file));
    (x.c.stays || []).forEach((s, i) => s.guestName && nameCheck(x, 'Booking ' + (s.name || s.city || '#' + (i + 1)), s.guestName, 'dates', s.file));
    if (x.c.insurance && x.c.insurance.holder) nameCheck(x, 'Insurance policy', x.c.insurance.holder, 'ins', x.c.insurance.file);
    if (checkedN + checkedNo) x.ok('id', 'Cross-checked identity on ' + U.plural(checkedN + checkedNo, 'document field'));
  }

  /* ---------- travel dates stated in different documents ---------- */
  function dateSourceChecks(x) {
    const src = (x.c.dateSources || []).filter((s) => s && (s.entry || s.exit));
    if (!x.validTrip || src.length < 2) return;
    const fmtR = (s) => (s.entry ? U.fmt(U.day(s.entry)) : '?') + ' → ' + (s.exit ? U.fmt(U.day(s.exit)) : '?');
    const differs = src.filter((s) => (s.entry && U.day(s.entry) !== x.entry) || (x.P !== 'us_iv' && s.exit && U.day(s.exit) !== x.exit));
    src.forEach((s) => {
      if (s.type === 'flight' || s.type === 'accommodation') return;
      if (s.entry) x.mx('Entry date', s.source, U.fmt(U.day(s.entry)), U.day(s.entry) === x.entry ? 'ok' : 'bad');
      if (s.exit && x.P !== 'us_iv') x.mx('Exit date', s.source, U.fmt(U.day(s.exit)), U.day(s.exit) === x.exit ? 'ok' : 'bad');
    });
    if (differs.length) {
      x.datesConflict = true;
      const f = x.add('critical', 'dates', 'Travel dates are not the same on all documents',
        'The documents give ' + new Set(src.map(fmtR)).size + ' different sets of travel dates (see each document below). The consulate compares them against each other — any difference reads as an unplanned or invented trip.',
        'Decide the real travel dates, then make the application form, cover letter, itinerary, flight and hotel all show exactly the same dates.');
      src.forEach((s) => x.ev(f, s.file || s.source, { date: s.entry || s.exit }, s.source + ' — ' + fmtR(s)));
    } else x.ok('dates', 'All documents state the same travel dates');
  }

  /* ---------- flights ---------- */
  function flightChecks(x) {
    const fl = (x.c.flights || []).filter((f) => f.date && (f.from || f.to)).map((f) => Object.assign({}, f, { d: U.day(f.date), arr: U.day(f.arrDate) || U.day(f.date) }));
    fl.sort((a, b) => a.d - b.d);
    const mandatory = x.P === 'schengen';
    if (!fl.length) {
      if (mandatory) x.add('major', 'dates', 'No flight reservation found', 'The flight reservation cannot be cross-checked against the trip dates, insurance and leave.', 'Upload the round-trip flight reservation.');
      else if (x.P === 'us_b1b2') x.add('info', 'dates', 'No flight reservation uploaded', 'US consulates do not require tickets — do not buy tickets before the visa is issued.', '');
      return;
    }
    if (!x.validTrip) return;
    const inbound = fl.filter((f) => !x.inRegion(f.from) && x.inRegion(f.to));
    const outbound = fl.filter((f) => x.inRegion(f.from) && !x.inRegion(f.to));
    const resid = x.ap.residenceCountry || 'EG';
    if (!inbound.length) {
      x.add(mandatory ? 'critical' : 'major', 'dates', 'No flight into ' + x.regionName, 'None of the flight legs arrives in ' + x.regionName + '.', 'Check the from/to countries of each leg.');
    } else {
      const first = inbound[0];
      x.mx('Entry date', 'Inbound flight ' + (first.flightNo || ''), U.fmt(first.arr), first.arr === x.entry ? 'ok' : 'bad');
      if (first.arr === x.entry) x.ok('dates', 'Inbound flight arrives on the declared entry date');
      else {
        x.ev(x.ev(x.add('critical', 'dates', 'Inbound flight date does not match the entry date',
          'Flight arrives ' + U.fmt(first.arr) + ' but the application says entry on ' + U.fmt(x.entry) + '.',
          'Align the application form, flight reservation, insurance and accommodation on one entry date.'), first.file, { date: first.date }, 'Flight booking'), x.appFile, { date: x.t.entryDate }, 'Application form');
      }
      if (first.from && first.from !== resid && x.P !== 'us_iv') {
        x.add('minor', 'dates', 'Journey does not start from the country of residence',
          'First leg departs from ' + R.countryName(first.from) + ', residence is ' + R.countryName(resid) + '.', 'Explain the routing in the cover letter.');
      }
    }
    if (x.P !== 'us_iv') {
      if (!outbound.length) {
        x.add(mandatory ? 'critical' : 'major', 'dates', 'No return / onward flight out of ' + x.regionName,
          'A return reservation is the main documentary proof of intention to leave.', 'Add the return leg to the reservation.');
      } else {
        const last = outbound[outbound.length - 1];
        x.mx('Exit date', 'Return flight ' + (last.flightNo || ''), U.fmt(last.d), last.d === x.exit ? 'ok' : 'bad');
        if (last.d === x.exit) x.ok('dates', 'Return flight departs on the declared exit date');
        else {
          x.ev(x.ev(x.add('critical', 'dates', 'Return flight date does not match the exit date',
            'Return departs ' + U.fmt(last.d) + ' but the application says exit on ' + U.fmt(x.exit) + '.', 'Make the return flight and the declared exit date the same day.'), last.file, { date: last.date }, 'Flight booking'), x.appFile, { date: x.t.exitDate }, 'Application form');
        }
        if (last.to && last.to !== resid) {
          x.add('major', 'dates', 'Return flight does not go back to the country of residence',
            'Final leg goes to ' + R.countryName(last.to) + ' instead of ' + R.countryName(resid) + '.', 'Show a return to ' + R.countryName(resid) + ' or document the onward travel (visa/residence there).');
        }
      }
    }
    // legs outside the trip window
    fl.forEach((f) => {
      if (!x.datesConflict && (f.d < x.entry - 1 || f.d > x.exit)) {
        x.add('major', 'dates', 'Flight ' + (f.flightNo || '') + ' is outside the trip dates', U.fmt(f.d) + ' (trip ' + U.fmt(x.entry) + ' – ' + U.fmt(x.exit) + ').', 'Remove or correct this leg.');
      }
      x.tl('Flight ' + (f.flightNo || '') + ' ' + (f.from || '?') + '→' + (f.to || '?'), f.d, f.d, 'flight');
    });
    // leaving and re-entering → entries
    if (x.P === 'schengen') {
      let exits = 0;
      fl.forEach((f) => {
        if (x.inRegion(f.from) && !x.inRegion(f.to) && f.d < x.exit) exits++;
      });
      if (exits > 0) x.metrics.reentries = exits;
    }
    // internal legs vs destinations
    const dests = (x.t.destinations || []).filter((d) => d.country && d.from);
    fl.filter((f) => x.inRegion(f.from) && x.inRegion(f.to) && f.from !== f.to).forEach((f) => {
      if (dests.length && !dests.some((d) => d.country === f.to && Math.abs(U.day(d.from) - f.arr) <= 1)) {
        x.add('major', 'dates', 'Internal flight to ' + R.countryName(f.to) + ' does not match the itinerary',
          'Flight on ' + U.fmt(f.d) + ' but the itinerary has no stay in ' + R.countryName(f.to) + ' starting then.', 'Align the itinerary with the flight legs.');
      }
    });
  }

  /* ---------- accommodation ---------- */
  function stayChecks(x) {
    const stays = (x.c.stays || []).filter((s) => s.checkIn && s.checkOut).map((s) => Object.assign({}, s, { a: U.day(s.checkIn), b: U.day(s.checkOut) }));
    const accType = x.t.accommodationType || 'hotel';
    const host = x.c.host || {};
    if (!x.validTrip || x.P === 'us_iv' || x.P === 'us_f1') return;
    stays.forEach((s) => {
      const lbl = 'Booking ' + (s.name || s.city || R.countryName(s.country));
      x.tl(lbl, s.a, s.b, 'stay');
      if (s.b <= s.a) x.add('major', 'dates', lbl + ': check-out is not after check-in', U.fmt(s.a) + ' → ' + U.fmt(s.b), 'Correct the booking dates.');
      if (!x.datesConflict && (s.a < x.entry || s.b > x.exit)) x.add('minor', 'dates', lbl + ' extends outside the trip', U.fmt(s.a) + ' – ' + U.fmt(s.b) + ' vs trip ' + U.fmt(x.entry) + ' – ' + U.fmt(x.exit) + '.', 'Adjust the booking so it matches the travel dates.');
    });
    if (stays.length) {
      const sorted = stays.slice().sort((p, q) => p.a - q.a);
      x.mx('Entry date', 'First check-in', U.fmt(sorted[0].a), sorted[0].a === x.entry ? 'ok' : 'warn');
      const lastOut = Math.max.apply(null, stays.map((s) => s.b));
      x.mx('Exit date', 'Last check-out', U.fmt(lastOut), lastOut === x.exit ? 'ok' : 'warn');
    }
    const hostCovers = accType === 'host' && host.name;
    const missing = [];
    const overlap = [];
    const wrongCountry = [];
    const dests = (x.t.destinations || []).filter((d) => d.country && d.from && d.to);
    for (let n = x.entry; n < x.exit; n++) {
      const cov = stays.filter((s) => s.a <= n && n < s.b);
      if (!cov.length && !hostCovers) missing.push(n);
      if (cov.length > 1) overlap.push(n);
      if (cov.length && dests.length) {
        const expected = dests.filter((d) => U.day(d.from) <= n && n < U.day(d.to)).map((d) => d.country);
        if (expected.length && cov.every((s) => s.country && expected.indexOf(s.country) === -1)) wrongCountry.push(n);
      }
    }
    if (accType === 'host') {
      if (!host.name) x.add('major', 'dates', 'Staying with a host but host details are missing', '', "Upload the invitation letter and the host's ID or residence permit.");
      else x.ok('dates', 'Accommodation covered by host invitation');
    }
    if (missing.length) {
      const share = missing.length / Math.max(1, x.nights);
      const sev = x.P === 'schengen' ? (share > 0.5 && accType !== 'mixed' && !x.datesConflict ? 'critical' : 'major') : 'minor';
      x.add(sev, 'dates', U.plural(missing.length, 'night') + ' without accommodation',
        'Uncovered: ' + U.ranges(missing) + (accType === 'mixed' && host.name ? ' (if you stay with ' + host.name + ' on these nights, say so in the invitation and itinerary).' : '.'),
        'Book accommodation for every night between entry and exit, or document where the applicant stays.');
    } else if (stays.length || hostCovers) x.ok('dates', 'Every night of the stay is covered');
    if (overlap.length) x.add('minor', 'dates', 'Overlapping bookings', 'Two bookings on: ' + U.ranges(overlap) + '.', 'Cancel duplicate bookings — they suggest the itinerary is not real.');
    if (wrongCountry.length) {
      x.add('major', 'dates', 'Hotel country does not match the itinerary', 'On ' + U.ranges(wrongCountry) + ' the booking is in a different country from the itinerary.', 'Align the itinerary with the bookings.');
    }
  }

  /* ---------- employment & leave ---------- */
  function employmentChecks(x) {
    const e = x.c.employment || {};
    const st = e.status || '';
    if (!st) {
      x.add('major', 'emp', 'Occupation could not be determined', 'No HR letter, commercial register, enrollment certificate or pension statement was found.', 'Upload the document that proves the applicant\'s occupation.');
      return;
    }
    if (st === 'unemployed') {
      x.add('major', 'emp', 'Applicant has no current occupation',
        'Without employment the officer must rely on family ties, assets and a sponsor to believe the applicant will return.',
        'Strengthen the file: sponsor documents, property, family ties, travel history and a clear cover letter.');
    }
    if (st !== 'employed') return;
    const letter = U.day(e.letterDate);
    if (letter !== null) {
      const age = x.T - letter;
      if (letter > x.T) x.add('critical', 'emp', 'Employment letter is dated in the future', U.fmt(letter), 'Get a letter dated on or before the submission date.');
      else if (age > 90) x.ev(x.add('major', 'emp', 'Employment letter is old', 'Issued ' + U.plural(age, 'day') + ' before submission (consulates expect ≤ 1 month).', 'Request a fresh HR letter.'), e.file, { date: e.letterDate }, 'HR letter date');
      else if (age > 31) x.add('minor', 'emp', 'Employment letter is more than a month old', 'Issued ' + U.fmt(letter) + '.', 'A letter issued within the last 30 days is safest.');
    }
    const start = U.day(e.startDate);
    if (start !== null && x.T - start < 183) x.add('minor', 'emp', 'Recently employed', 'Started ' + U.fmt(start) + ' (< 6 months). Short tenure weakens the return anchor.', 'Add previous employment history or other ties.');
    if (x.P === 'us_iv' || x.P === 'us_f1') return;
    const lf = U.day(e.leaveFrom);
    const lt = U.day(e.leaveTo);
    if (lf === null || lt === null) {
      x.add(x.P === 'schengen' ? 'major' : 'minor', 'emp', 'HR letter does not state the approved leave dates', 'The leave approval on the HR letter must cover the whole trip.', 'Ask HR to re-issue the letter with the exact leave period.');
      return;
    }
    x.tl('Approved leave', lf, lt, 'leave');
    x.mx('Entry date', 'Leave starts', U.fmt(lf), lf <= x.entry ? 'ok' : 'bad');
    x.mx('Exit date', 'Leave ends', U.fmt(lt), lt >= x.exit ? 'ok' : 'bad');
    if (!x.validTrip) return;
    const uncovered = [];
    for (let n = x.entry; n <= x.exit; n++) if (n < lf || n > lt) uncovered.push(n);
    if (!uncovered.length) {
      x.ok('emp', 'Approved leave covers the whole trip');
      if (lf < x.entry - 7 || lt > x.exit + 7) x.add('info', 'emp', 'Leave is much longer than the trip', 'Leave ' + U.fmt(lf) + ' – ' + U.fmt(lt) + '.', 'Fine, but make sure the cover letter explains it.');
    } else {
      const working = uncovered.filter((n) => x.weekend.indexOf(dow(n)) === -1);
      if (!working.length) {
        x.add('minor', 'emp', 'Trip days outside the leave fall on the weekend', 'Not covered: ' + U.ranges(uncovered) + ' — all weekend days.', 'Acceptable, but some officers expect the leave to span the exact travel dates.');
      } else {
        x.ev(x.add('critical', 'emp', 'Trip dates exceed the approved leave',
          'Working days outside the leave: ' + U.ranges(working) + '. A leave letter that does not cover the trip is a classic refusal reason.',
          'Get the HR letter re-issued with leave covering ' + U.fmt(x.entry) + ' – ' + U.fmt(x.exit) + ', or change the trip dates.'), e.file, { date: e.leaveTo }, 'Leave approved until');
      }
    }
    if (U.day(e.returnDate) !== null && U.day(e.returnDate) <= x.exit) {
      x.add('major', 'emp', 'Return-to-work date is on/before the exit date', 'Back to work ' + U.fmt(U.day(e.returnDate)) + ', leaving ' + U.fmt(x.exit) + '.', 'Fix the leave letter or the flight.');
    }
  }

  /* ---------- finances ---------- */
  function financeChecks(x) {
    const fin = x.fin;
    const sts = fin.statements || [];
    const sp = fin.sponsor || {};
    const sponsorName = sp.name || '';
    let own = 0;
    let spons = 0;
    let anyBal = false;
    if (!sts.length) {
      if (x.P !== 'us_iv') x.add('info', 'fin', 'Funds could not be assessed', 'No bank statement was found, so available funds are unknown.', 'Upload stamped bank statements for the last 3–6 months.');
    }
    sts.forEach((s, i) => {
      const lbl = 'Statement ' + (s.bank || '#' + (i + 1));
      const from = U.day(s.from);
      const to = U.day(s.to);
      const issued = U.day(s.issued) !== null ? U.day(s.issued) : to;
      const open = U.num(s.opening);
      const close = U.num(s.closing);
      const inc = U.num(s.avgIncome);
      const dep = U.num(s.largestDeposit);
      // holder
      let who = 'applicant';
      if (s.holder) {
        const r = U.compareNames(x.name, s.holder);
        const rs0 = sponsorName ? U.compareNames(sponsorName, s.holder) : { status: 'mismatch' };
        if (rs0.status === 'match' && r.status !== 'match') {
          who = 'sponsor';
          if (x.t.fundedBy !== 'sponsor') x.add('major', 'fin', lbl + ' belongs to the sponsor but the trip is not marked as sponsored', 'Holder: ' + s.holder + '.', 'Set "Funded by" to sponsor and add the sponsorship letter.');
        } else if (r.status === 'mismatch') {
          const rs = rs0;
          if (rs.status !== 'mismatch' && x.t.fundedBy === 'sponsor') who = 'sponsor';
          else if (rs.status !== 'mismatch') {
            who = 'sponsor';
            x.add('major', 'fin', lbl + ' belongs to the sponsor but the trip is not marked as sponsored', 'Holder: ' + s.holder + '.', 'Set "Funded by" to sponsor and add the sponsorship letter.');
          } else {
            who = 'nobody';
            x.ev(x.add('critical', 'fin', lbl + ' is in someone else\'s name', 'Holder "' + s.holder + '" is neither the applicant nor the declared sponsor.', 'Use statements in the applicant\'s name, or declare that person as sponsor with a sponsorship letter.'), s.file, { text: s.holder }, 'Account holder');
          }
        } else if (r.status === 'variant') nameCheck(x, lbl, s.holder, 'fin');
      }
      if (close !== null && who !== 'nobody') {
        anyBal = true;
        if (who === 'sponsor') spons += close;
        else own += close;
      }
      if (from !== null && to !== null) {
        x.tl(lbl, from, to, 'bank');
        const len = to - from;
        const need = x.P === 'schengen' ? 85 : 85;
        if (len < need) x.add('major', 'fin', lbl + ' covers only ' + U.plural(len, 'day'), 'Consulates expect at least the last 3 months (many Schengen consulates in Egypt ask for 6).', 'Request a statement covering at least 3–6 months.');
        if (x.T - to > 31) x.ev(x.add('major', 'fin', lbl + ' is stale', 'Ends ' + U.fmt(to) + ', ' + (x.T - to) + ' days before submission.', 'Get a statement running up to the last few days before submission.'), s.file, { date: s.to }, 'Statement end date');
      }
      if (issued !== null && x.T - issued > 31) x.add('major', 'fin', lbl + ' was issued more than a month ago', 'Issued ' + U.fmt(issued) + '.', 'Request a newly stamped statement.');
      if (issued !== null && issued > x.T) x.add('critical', 'fin', lbl + ' issue date is in the future', U.fmt(issued), 'Correct the issue date.');
      // funds parking
      if (dep !== null && dep > 0) {
        const depDay = U.day(s.largestDepositDate);
        const recent = depDay === null || to === null || to - depDay <= 60;
        const big = (inc !== null && dep > 2 * Math.max(inc, 1)) || (close !== null && dep > 0.4 * close);
        if (big && recent && !s.depositExplained) {
          x.ev(x.add('major', 'fin', lbl + ': large unexplained deposit',
            U.money(dep, x.cur) + (depDay !== null ? ' on ' + U.fmt(depDay) : '') + (inc ? ' (monthly income ' + U.money(inc, x.cur) + ')' : '') + '. Sudden lump sums before applying read as "borrowed funds" and are a top refusal reason.',
            'Document the source (sale contract, certificate maturity, bonus letter, gift deed), or remove reliance on it.'), s.file, { amount: s.largestDepositRaw !== undefined ? s.largestDepositRaw : dep }, 'The deposit');
        } else if (big && s.depositExplained) x.add('info', 'fin', lbl + ': large deposit is documented', U.money(dep, x.cur), 'Keep the supporting proof next to the statement.');
      }
      if (open !== null && close !== null && open > 0 && close / open >= 3 && !s.depositExplained) {
        x.add('major', 'fin', lbl + ': balance jumped sharply', 'From ' + U.money(open, x.cur) + ' to ' + U.money(close, x.cur) + ' during the statement period.', 'Explain the increase with documents.');
      }
      if (close !== null && close < 0) x.add('critical', 'fin', lbl + ' is overdrawn', U.money(close, x.cur), 'Funds must be positive and available.');
      // salary consistency
      const e = x.c.employment || {};
      const sal = U.num(e.monthlySalary);
      if (who === 'applicant' && sal && inc && (!e.salaryCurrency || e.salaryCurrency === x.cur)) {
        const diff = Math.abs(inc - sal) / sal;
        if (diff > 0.2) {
          x.add('major', 'fin', 'Salary on employment letter does not match statement income',
            'Letter: ' + U.money(sal, x.cur) + '/month; average credited: ' + U.money(inc, x.cur) + '/month (' + Math.round(diff * 100) + '% difference).',
            'Make sure the HR letter states the net salary actually paid into this account, or explain other income.');
        } else x.ok('fin', 'Salary credited matches the employment letter');
      }
    });
    if (sponsorName && x.t.fundedBy === 'sponsor' && !sts.some((s) => s.holder && U.compareNames(sponsorName, s.holder).status !== 'mismatch')) {
      x.add('major', 'fin', 'Sponsor declared but no sponsor bank statement found', 'Sponsor: ' + sponsorName + '.', "Add the sponsor's statement.");
    }
    x.metrics.fundsOwn = own;
    x.metrics.fundsSponsor = spons;
    x.metrics.fundsTotal = own + spons;
    x.metrics.hasBalance = anyBal;
  }

  function requireFunds(x, required, curLabel, basis) {
    const conv = curLabel === 'EUR' ? x.toEUR : x.toUSD;
    const total = x.metrics.fundsTotal;
    x.metrics.fundsRequired = required;
    x.metrics.fundsCur = curLabel;
    x.metrics.fundsBasis = basis;
    if (!x.metrics.hasBalance) return;
    const avail = conv(total);
    if (avail === null) {
      x.add('major', 'fin', 'Exchange rate missing — funds cannot be compared', 'Statements are in ' + x.cur + '; the requirement is in ' + curLabel + '.',
        'Live exchange rates could not be loaded — check the internet connection and re-run the review.');
      return;
    }
    x.metrics.fundsAvailable = avail;
    if (required === null) return;
    if (avail < required) {
      x.add('critical', 'fin', 'Insufficient funds', 'Available ≈ ' + U.money(avail, curLabel) + ' vs required ≈ ' + U.money(required, curLabel) + ' (' + basis + ').',
        'Add funds with a documented source, a sponsor, or shorten the trip.');
    } else if (avail < required * 1.5) {
      x.add('minor', 'fin', 'Funds only just cover the requirement', U.money(avail, curLabel) + ' vs ' + U.money(required, curLabel) + ' (' + basis + '). Flights and hotels are on top of this.', 'A comfortable buffer (≥ 1.5×) reads better.');
    } else x.ok('fin', 'Funds cover the requirement (' + U.money(avail, curLabel) + ' vs ' + U.money(required, curLabel) + ')');
  }

  /* ---------- history ---------- */
  function historyChecks(x) {
    const h = x.c.history || {};
    const refs = (h.refusals || []).filter((r) => r.country || r.date);
    if (refs.length && h.refusalsDeclared === 'no') {
      x.add('critical', 'hist', 'Refusals exist but the form says "no previous refusals"',
        U.plural(refs.length, 'refusal') + ' listed. Hiding a refusal is treated as misrepresentation' + (x.isUS ? ' — for the US a permanent bar under INA 212(a)(6)(C)(i).' : ' and leads to refusal / SIS alert.'),
        'Declare every refusal on the form and address it in the cover letter.');
    } else if (h.refusalsDeclared === 'yes' && !refs.length) x.add('minor', 'hist', 'Form declares a refusal but none is listed', '', 'Upload the refusal letter.');
    refs.forEach((r) => {
      const d = U.day(r.date);
      if (d !== null && x.T - d < 365) {
        x.add('major', 'hist', 'Recent refusal (' + R.countryName(r.country) + ', ' + U.fmt(d) + ')',
          'Reason: ' + (r.reason || 'not given') + '. A new application must show what changed since then.', 'Fix the refusal reason with new evidence and explain it in the cover letter.');
      }
    });
    if (h.refusalsDeclared === 'no' && !refs.length) x.ok('hist', 'No refusals declared');
  }

  /* ---------- documents: completeness, recency, originals, legalization, translation ---------- */
  function documentChecks(x, list) {
    const docs = x.c.documents || {};
    const missingReq = [];
    const missingRec = [];
    const destLangs = x.P === 'schengen' ? ['en'].concat(R.languages[(x.c.meta || {}).consulateOf] || []) : ['en'];
    const extras = Object.keys(docs).filter((id) => docs[id] && docs[id].present && V.docs.catalog[id] && !list.some((d) => d.id === id))
      .map((id) => ({ id, label: V.docs.catalog[id][0], cls: V.docs.catalog[id][1], level: 'extra' }));
    list.concat(extras).forEach((d) => {
      const st = docs[d.id] || {};
      d.present = !!st.present;
      if (!st.present) {
        if (d.level !== 'extra') (d.level === 'required' ? missingReq : missingRec).push(d);
        return;
      }
      const issued = U.day(st.issued);
      const max = V.docs.maxAge[d.id];
      if (st.signed === 'no' && STAMP_REQUIRED[d.id]) {
        x.add(STAMP_REQUIRED[d.id], 'docs', d.label + ' is not signed / stamped', st.file ? 'File: ' + st.file + '.' : '', d.id === 'application_form' ? 'The applicant must sign the application form.' : 'Get the original stamped and signed by the issuer.');
      }
      if (issued !== null && issued > x.T) x.add('critical', 'docs', d.label + ' is dated in the future', U.fmt(issued), 'Correct the date or re-issue.');
      else if (issued !== null && max && x.T - issued > max) {
        x.add('major', 'docs', d.label + ' is too old', 'Issued ' + U.fmt(issued) + ' (' + (x.T - issued) + ' days; maximum ~' + max + ').', 'Get a freshly issued copy.');
      }
      const issuer = st.issuer || (d.cls === 'civil' ? x.ap.nationality || 'EG' : '');
      const lang = st.language || '';
      // originals
      if (d.cls === 'civil' && st.form === 'copy') {
        x.add(x.P === 'us_iv' ? 'critical' : 'major', 'legal', d.label + ': only a plain copy',
          x.P === 'us_iv' ? 'Immigrant visa interviews require the original (or certified copy from the issuing authority) — photocopies are not accepted at the document review.' : 'Consulates expect the original/certified extract plus a copy.',
          x.P === 'us_iv' ? 'Bring the original computerized certificate issued by the Egyptian Civil Registry (or certified copy).' : 'Obtain a recently issued certified extract.');
      }
      // translation
      if (lang && destLangs.indexOf(lang) === -1) {
        if (!st.translation || st.translation === 'none') {
          x.add(x.P === 'us_iv' ? 'critical' : 'major', 'legal', d.label + ' needs a translation',
            'Document language: ' + lang.toUpperCase() + '. Accepted: ' + destLangs.join(', ').toUpperCase() + '.',
            x.P === 'us_iv' ? 'Attach a certified English translation (translator certifies competence and accuracy).' : 'Attach a certified (sworn) translation into English or the consulate language.');
        } else x.ok('legal', d.label + ' translated');
      }
      // legalization (Schengen)
      if (x.P === 'schengen' && d.cls === 'civil' && d.level === 'extra' && issuer && !R.isApostille(issuer) && !R.isSchengen(issuer)) {
        x.add('info', 'legal', d.label + ': legalization', 'Supporting civil document from ' + R.countryName(issuer) + '. If the consulate asks for it to be legalized: issuing office → Ministry of Foreign Affairs → embassy, plus a certified translation.', '');
      } else if (x.P === 'schengen' && d.cls === 'civil' && issuer && !R.isSchengen(issuer) && R.eu.indexOf(issuer) === -1) {
        const apost = st.apostilleMember === 'yes' ? true : st.apostilleMember === 'no' ? false : R.isApostille(issuer);
        const ch = st.chain || {};
        if (apost) {
          if (st.legal !== 'apostille' && !(ch.issuer && ch.mfa && ch.embassy)) {
            x.add('major', 'legal', d.label + ' needs an apostille', R.countryName(issuer) + ' is a party to the Apostille Convention.', 'Get an apostille from the competent authority in ' + R.countryName(issuer) + '.');
          } else x.ok('legal', d.label + ' apostilled');
        } else {
          const miss = [];
          if (!ch.issuer) miss.push('certification by the issuing authority');
          if (!ch.mfa) miss.push('authentication by the ' + R.countryName(issuer) + ' Ministry of Foreign Affairs');
          if (!ch.embassy) miss.push('legalization by the embassy/consulate of ' + R.countryName((x.c.meta || {}).consulateOf));
          if (miss.length) {
            x.add('major', 'legal', d.label + ': legalization chain incomplete',
              R.countryName(issuer) + ' is not an Apostille Convention party, so the full chain is needed. Missing: ' + miss.join(' → ') + '.',
              issuer === 'EG' ? 'Certify at the issuing office → authenticate at the Egyptian MFA consular office → legalize at the embassy in Cairo, then translate.' : 'Complete each step of the chain in order.');
          } else x.ok('legal', d.label + ' fully legalized');
        }
      }
    });
    missingReq.forEach((d) => (V.docs.atCounter[d.id] ? x.add('minor', 'docs', 'Bring to the appointment: ' + d.label, 'Not in the uploaded file — usually handed over or paid at the visa centre.', '') : x.add('critical', 'docs', 'Missing: ' + d.label, d.why || 'Required for this application.', 'Add it to the file.')));
    if (missingRec.length) {
      x.add('minor', 'docs', U.plural(missingRec.length, 'recommended document') + ' not included', missingRec.map((d) => d.label).join('; ') + '.', 'Not mandatory, but each one strengthens the file.');
    }
    if (!missingReq.length) x.ok('docs', 'All required documents present');
  }

  const STAMP_REQUIRED = { application_form: 'critical', bank_statement: 'major', sponsor_bank: 'major', employment_letter: 'major', sponsor_letter: 'major',
    invitation_letter: 'major', insurance_print: 'minor', business_reg: 'minor', police_certificates: 'major', i20: 'critical', i864: 'critical' };

  /* ---------- return ties score (0–100) ---------- */
  function tiesScore(x) {
    const e = x.c.employment || {};
    const ties = x.c.ties || {};
    const h = x.c.history || {};
    let s = 0;
    const why = [];
    const start = U.day(e.startDate);
    const tenure = start !== null ? (x.T - start) / 365 : null;
    const emp = { employed: tenure !== null && tenure < 1 ? 15 : 25, self_employed: 20, student: 18, retired: 18, unemployed: 0 }[e.status] || 0;
    if (emp) why.push('occupation +' + emp);
    s += emp;
    if (ties.property) { s += 15; why.push('property +15'); }
    if (ties.spouseHome || ties.childrenHome) { s += 20; why.push('family staying home +20'); }
    const trips = ((h.schengenStays || []).length) + ((h.usVisits || []).length) + ((h.priorVisas || []).length) + Math.floor(((h.otherTrips || []).length) / 3);
    if (trips >= 3) { s += 20; why.push('strong travel history +20'); } else if (trips >= 1) { s += 10; why.push('travel history +10'); }
    const req = x.metrics.fundsRequired;
    const av = x.metrics.fundsAvailable;
    if (req && av) {
      if (av >= 2 * req) { s += 15; why.push('funds ≥ 2× requirement +15'); } else if (av >= req) { s += 8; why.push('funds cover requirement +8'); }
    }
    if (x.days && x.days <= 21) { s += 5; why.push('short trip +5'); }
    const recentRef = (h.refusals || []).filter((r) => U.day(r.date) !== null && x.T - U.day(r.date) < 730).length;
    if (recentRef) { s -= 10 * recentRef; why.push('recent refusals −' + 10 * recentRef); }
    s = Math.max(0, Math.min(100, s));
    x.metrics.ties = { score: s, why, label: s >= 70 ? 'Strong' : s >= 45 ? 'Moderate' : 'Weak' };
    if (x.P !== 'us_iv' && s < 45) {
      x.add('major', 'emp', 'Weak return anchors (score ' + s + '/100)',
        (x.isUS ? 'Under INA 214(b) the officer presumes immigrant intent until ties are shown.' : 'Schengen Visa Code Art. 32(1)(b): refusal if there are reasonable doubts about the intention to leave.') + ' Factors: ' + (why.join(', ') || 'none') + '.',
        'Add evidence of job, property, family responsibilities, business, and previous compliant travel.');
    }
  }

  /* ---------- Egypt specifics ---------- */
  function egyptChecks(x) {
    if (x.ap.nationality !== 'EG') {
      x.add('info', 'eg', 'Applicant is not an Egyptian national', 'This engine is tuned for Egyptian passport holders; checks still run but Egypt-specific guidance may not apply.', '');
      return;
    }
    if (x.ap.sex === 'M' && x.age !== null && x.age >= 18 && x.age <= 30) {
      x.add('info', 'eg', 'Military service status', 'Egyptian men of conscription age need their military status (completed / exempted / postponed with travel permit) to allow leaving Egypt.', 'Confirm the passport/occupation page and travel permit before booking.');
    }
    if (x.cur === 'EGP' && x.metrics.hasBalance) {
      x.add('info', 'eg', 'Statements in EGP', 'Funds are converted at live rates (1 EUR = ' + (x.rateEUR || '?') + ' EGP, 1 USD = ' + (x.rateUSD || '?') + ' EGP).', '');
    }
  }

  /* ---------- document text scan ---------- */
  const SCAN_DATES = {
    flight: (x) => [['entry', x.t.entryDate], ['exit', x.P === 'us_iv' ? null : x.t.exitDate]],
    insurance: (x) => [['cover start', (x.c.insurance || {}).start], ['cover end', (x.c.insurance || {}).end]],
    employment_letter: (x) => [['leave start', (x.c.employment || {}).leaveFrom], ['leave end', (x.c.employment || {}).leaveTo]],
    accommodation: (x) => (x.c.stays || []).reduce((a, s) => a.concat([['check-in', s.checkIn], ['check-out', s.checkOut]]), []),
    passport: (x) => [['birth date', x.ap.dob], ['expiry', x.pp.expiryDate]],
    i20: (x) => [['program start', ((x.c.us || {}).f1 || {}).programStart]],
    invitation_letter: (x) => [['entry', x.t.entryDate], ['exit', x.t.exitDate]],
    business_invitation: (x) => [['entry', x.t.entryDate], ['exit', x.t.exitDate]],
  };
  E.scanText = function (x, scan) {
    const text = String(scan.text || '');
    const up = U.normName(text.toUpperCase().replace(/P<([A-Z<]{3})/g, 'P<$1<'));
    const words = new Set(up.split(' '));
    const res = { file: scan.fileName, docType: scan.docType || '', chars: text.length, checks: [] };
    const label = scan.fileName + (scan.docType && V.docs.catalog[scan.docType] ? ' (' + V.docs.catalog[scan.docType][0] + ')' : '');
    if (text.replace(/\s/g, '').length < 20) {
      res.checks.push({ what: 'Readable text', st: 'warn', detail: 'No text layer — scanned image. Enable OCR or check manually.' });
      x.add('info', 'scan', label + ': no readable text', 'The file looks like a scanned image.', 'Turn on OCR in the scanner or verify this document by eye.');
      return res;
    }
    const tokenSt = (tok) => {
      if (words.has(tok)) return 'ok';
      for (const w of words) if (w.length >= 4 && U.tokenClose(tok, w)) return 'variant:' + w;
      return 'missing';
    };
    // surname & given names
    const sur = U.tokens(x.ap.surname);
    const giv = U.tokens(x.ap.givenNames);
    const chk = (toks, what) => {
      if (!toks.length) return;
      const sts = toks.map((t) => [t, tokenSt(t)]);
      const miss = sts.filter((s) => s[1] === 'missing').map((s) => s[0]);
      const vars = sts.filter((s) => s[1].indexOf('variant') === 0).map((s) => s[0] + '→' + s[1].slice(8));
      const st = miss.length === toks.length ? 'bad' : miss.length || vars.length ? 'warn' : 'ok';
      res.checks.push({ what, st, detail: st === 'ok' ? 'found' : (miss.length ? 'not found: ' + miss.join(' ') : '') + (vars.length ? ' spelled: ' + vars.join(', ') : '') });
      if (vars.length) x.add('major', 'scan', label + ': ' + what + ' spelled differently', vars.join(', '), 'Have the document corrected to the passport spelling.');
      if (st === 'bad' && what === 'Surname') x.add('major', 'scan', label + ': applicant surname not found', 'The document text does not contain "' + x.ap.surname + '".', 'Make sure this document belongs to the applicant (or the sponsor) and is the right file.');
    };
    chk(sur, 'Surname');
    chk(giv, 'Given names');
    // passport number
    const ppn = U.normId(x.pp.number);
    if (ppn) {
      const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const found = compact.indexOf(ppn) !== -1;
      const re = /PASSPORT\s*(?:NO\.?|NUMBER|NUM|#|N°)?\s*[:\-.]?\s*([A-Z]{0,2}[0-9]{6,9}|[A-Z][0-9A-Z]{6,8})\b/gi;
      let m;
      const others = new Set();
      while ((m = re.exec(text))) {
        const v = U.normId(m[1]);
        if (v && v !== ppn && /\d/.test(v)) others.add(v);
      }
      const old = [...others].filter((o) => x.prevPassports.indexOf(o) !== -1);
      const wrong = [...others].filter((o) => x.prevPassports.indexOf(o) === -1);
      if (wrong.length) {
        res.checks.push({ what: 'Passport number', st: 'bad', detail: 'document shows ' + wrong.join(', ') });
        x.add('critical', 'scan', label + ': different passport number', 'Text shows ' + wrong.join(', ') + ' — passport is ' + ppn + '.', 'Correct the document.');
      } else if (old.length) {
        res.checks.push({ what: 'Passport number', st: 'warn', detail: 'old passport ' + old.join(', ') });
        x.add('major', 'scan', label + ': quotes the old passport number', old.join(', '), 'Update the document to the current passport.');
      } else res.checks.push({ what: 'Passport number', st: found ? 'ok' : 'na', detail: found ? 'found' : 'not shown' });
    }
    // MRZ in text
    const lines = text.toUpperCase().split(/\r?\n/).map((l) => l.replace(/\s/g, '')).filter((l) => /^[A-Z0-9<]{44}$/.test(l));
    const i = lines.findIndex((l) => l[0] === 'P');
    if (i !== -1 && lines[i + 1]) {
      const mr = U.parseMRZ(lines[i], lines[i + 1], x.T);
      const okNo = mr.fields.number === ppn;
      res.checks.push({ what: 'MRZ', st: mr.ok && okNo ? 'ok' : 'bad', detail: mr.ok ? (okNo ? 'valid, matches' : 'valid but number ' + mr.fields.number) : mr.errors[0] });
      if (!mr.ok || !okNo) x.add('critical', 'scan', label + ': MRZ invalid or not matching', mr.ok ? 'MRZ number ' + mr.fields.number + ' vs ' + ppn : mr.errors.join(' '), 'Check that the passport copy is the current, genuine passport.');
    }
    // expected dates
    const exp = SCAN_DATES[scan.docType];
    if (exp) {
      const dates = U.extractDates(text);
      exp(x).forEach(([what, iso]) => {
        const d = U.day(iso);
        if (d === null) return;
        const ok = dates.has(d);
        res.checks.push({ what: 'Date: ' + what, st: ok ? 'ok' : 'bad', detail: ok ? U.fmt(d) + ' found' : U.fmt(d) + ' not found in document' });
        if (!ok) x.add('major', 'scan', label + ': ' + what + ' date ' + U.fmt(d) + ' not found', 'The date entered in the case file does not appear in the document text — the document and the application may disagree.', 'Open the document and confirm the ' + what + ' date.');
      });
    }
    return res;
  };

  /* ============================== program modules ============================== */
  function schengen(x) {
    const meta = x.c.meta || {};
    const cons = meta.consulateOf;
    const ins = x.c.insurance || {};
    if (!cons) x.add('critical', 'prog', 'Consulate (Schengen state applied to) not set', '', 'Choose the Schengen state in "Applying to" at the top.');
    else if (!R.isSchengen(cons)) x.add('critical', 'prog', R.countryName(cons) + ' is not a Schengen state', 'Cyprus and Ireland issue national visas, not Schengen visas.', 'Choose a Schengen state.');
    // where to apply (Art. 6)
    const resid = x.ap.residenceCountry || 'EG';
    if (meta.applyingIn && meta.applyingIn !== resid) {
      x.add('major', 'prog', 'Applying outside the country of residence',
        'Applying in ' + R.countryName(meta.applyingIn) + ', residence ' + R.countryName(resid) + '. Visa Code Art. 6: lodge in the consulate competent for your place of legal residence.',
        'Apply in ' + R.countryName(resid) + ' or justify the exception.');
    }
    if (!x.validTrip) return;
    // length & timing
    if (x.days > 90) x.add('critical', 'prog', 'Stay exceeds 90 days', U.plural(x.days, 'day') + ' requested. A short-stay visa allows at most 90 days in any 180.', 'Shorten the trip or apply for a national (type D) visa.');
    const lead = x.entry - x.T;
    if (x.entry > U.addMonths(x.T, 6)) x.add('critical', 'prog', 'Applying too early', 'Trip starts ' + U.plural(lead, 'day') + ' after submission; applications may be lodged at most 6 months before travel.', 'Submit later.');
    else if (lead < 15) x.add('major', 'prog', 'Applying less than 15 days before travel', 'Only ' + U.plural(lead, 'day') + ' before entry. Standard processing is 15 calendar days and may be extended to 45.', 'Move the trip or request urgent processing with justification.');
    else x.ok('prog', 'Submission timing within the 15-day – 6-month window');
    // passport
    const exp = U.day(x.pp.expiryDate);
    const iss = U.day(x.pp.issueDate);
    if (exp !== null) {
      const need = U.addMonths(x.exit, 3);
      x.tl('Passport validity', iss !== null ? iss : x.T, exp, 'passport', exp >= need ? 'ok' : 'bad');
      if (exp < need) x.ev(x.add('critical', 'id', 'Passport not valid 3 months beyond departure', 'Expires ' + U.fmt(exp) + '; must be valid until at least ' + U.fmt(need) + '.', 'Renew the passport before applying.'), x.ppFile, { date: x.pp.expiryDate }, 'Passport expiry');
      else x.ok('id', 'Passport valid ≥ 3 months after leaving Schengen');
    }
    if (iss !== null && iss < U.addYears(x.T, -10)) x.add('critical', 'id', 'Passport issued more than 10 years ago', 'Issued ' + U.fmt(iss) + '.', 'Renew the passport.');
    const bp = U.num(x.pp.blankPages);
    if (bp !== null && bp < 2) x.add('critical', 'id', 'Passport needs at least 2 blank pages', bp + ' blank.', 'Renew the passport.');
    // residence permit when resident outside nationality
    if (x.ap.nationality && resid !== x.ap.nationality) {
      const rp = U.day(x.ap.residencePermitExpiry);
      if (rp === null) x.add('major', 'id', 'Residence permit not found', 'Applicant lives in ' + R.countryName(resid) + '.', 'Upload the residence permit (valid ≥ 3 months after return).');
      else if (rp < U.addMonths(x.exit, 3)) x.add('major', 'id', 'Residence permit expires too soon', 'Expires ' + U.fmt(rp) + '; consulates expect validity ≥ 3 months after return.', 'Renew the residence permit first.');
      if (rp !== null) x.tl('Residence permit', x.T, rp, 'permit');
    }
    // destinations & main destination (Art. 5)
    let dests = (x.t.destinations || []).filter((d) => d.country && U.day(d.from) !== null && U.day(d.to) !== null).map((d) => ({ country: d.country, city: d.city, a: U.day(d.from), b: U.day(d.to) }));
    if (!dests.length && cons) {
      dests = [{ country: cons, a: x.entry, b: x.exit, assumed: true }];
      x.add('info', 'prog', 'No itinerary found — assuming the whole stay is in ' + R.countryName(cons), '', 'Upload the itinerary or hotel bookings for each destination.');
    }
    dests.sort((p, q) => p.a - q.a);
    dests.forEach((d) => {
      if (!d.assumed) x.tl('Stay in ' + (d.city ? d.city + ', ' : '') + R.countryName(d.country), d.a, d.b, 'dest');
      if (d.b < d.a) x.add('major', 'dates', 'Itinerary leg in ' + R.countryName(d.country) + ' ends before it starts', '', 'Fix the itinerary dates.');
      if (d.a < x.entry || d.b > x.exit) x.add('major', 'dates', 'Itinerary leg in ' + R.countryName(d.country) + ' is outside the trip dates', U.fmt(d.a) + ' – ' + U.fmt(d.b), 'Align the itinerary with the trip dates.');
    });
    if (dests.length && !dests[0].assumed) {
      if (dests[0].a !== x.entry) x.add('major', 'dates', 'Itinerary does not start on the entry date', 'First leg starts ' + U.fmt(dests[0].a) + ', entry ' + U.fmt(x.entry) + '.', 'Align the itinerary.');
      const lastB = Math.max.apply(null, dests.map((d) => d.b));
      if (lastB !== x.exit) x.add('major', 'dates', 'Itinerary does not end on the exit date', 'Last leg ends ' + U.fmt(lastB) + ', exit ' + U.fmt(x.exit) + '.', 'Align the itinerary.');
      for (let i = 1; i < dests.length; i++) {
        if (dests[i].a > dests[i - 1].b + 0) {
          const gapA = dests[i - 1].b + 1;
          const gapB = dests[i].a - 1;
          if (gapB >= gapA) x.add('minor', 'dates', 'Gap in the itinerary', U.fmt(gapA) + (gapB > gapA ? ' – ' + U.fmt(gapB) : '') + ' is not assigned to any destination.', 'Fill the gap in the itinerary.');
        }
      }
    }
    const sch = dests.filter((d) => R.isSchengen(d.country));
    const nights = {};
    sch.forEach((d) => (nights[d.country] = (nights[d.country] || 0) + Math.max(0, d.b - d.a)));
    const maxN = Math.max.apply(null, [0].concat(Object.values(nights)));
    const top = Object.keys(nights).filter((k) => nights[k] === maxN);
    let main = null;
    if (top.length === 1) main = top[0];
    else if (top.length > 1) {
      const fl = (x.c.flights || []).filter((f) => !R.isSchengen(f.from) && R.isSchengen(f.to)).sort((p, q) => U.day(p.date) - U.day(q.date));
      main = fl.length && fl[0].to ? fl[0].to : sch[0].country;
    }
    x.metrics.mainDestination = main;
    x.metrics.nightsByCountry = nights;
    if (main && cons && R.isSchengen(cons)) {
      if (main !== cons) {
        x.ev(x.add('critical', 'prog', 'Wrong consulate: main destination is ' + R.countryName(main),
          'Nights per country: ' + Object.keys(nights).map((k) => R.countryName(k) + ' ' + nights[k]).join(', ') + '. Visa Code Art. 5: apply to the state of the main destination (longest stay; if equal, first entry).',
          'Apply to ' + R.countryName(main) + ' — or change the itinerary so ' + R.countryName(cons) + ' really is the main destination.'), x.appFile, { text: R.countryName(cons) }, 'Application form — main destination');
      } else x.ok('prog', 'Applying to the correct consulate (main destination ' + R.countryName(main) + ')');
    }
    // entries
    const nonSchMid = dests.some((d, i) => i > 0 && i < dests.length - 1 && !R.isSchengen(d.country));
    const reentries = x.metrics.reentries || 0;
    const entries = x.t.entries || 'unknown';
    if ((nonSchMid || reentries) && entries === 'single') {
      x.add('critical', 'prog', 'Itinerary leaves and re-enters Schengen but a single entry is requested',
        nonSchMid ? 'The itinerary includes a non-Schengen country in the middle of the trip.' : 'A flight leaves the Schengen area before the end of the trip.',
        'Request a double/multiple-entry visa.');
    }
    // 90/180 with previous stays
    const h = x.c.history || {};
    const set = new Set();
    (h.schengenStays || []).forEach((s) => {
      const a = U.day(s.entry);
      const b = U.day(s.exit);
      if (a === null || b === null) return;
      for (let d = a; d <= b; d++) set.add(d);
      const vu = U.day(s.visaValidUntil);
      if (vu !== null && b > vu) {
        x.add('critical', 'hist', 'Previous Schengen overstay', 'Left on ' + U.fmt(b) + ', visa valid until ' + U.fmt(vu) + ' (' + U.plural(b - vu, 'day') + ' over).', 'Address the overstay honestly in the cover letter; expect strict scrutiny.');
      }
    });
    for (let d = x.entry; d <= x.exit; d++) set.add(d);
    let maxUsed = 0;
    let over = null;
    for (let d = x.entry; d <= x.exit; d++) {
      let n = 0;
      for (let k = d - 179; k <= d; k++) if (set.has(k)) n++;
      if (n > maxUsed) maxUsed = n;
      if (n > 90 && over === null) over = d;
    }
    x.metrics.rule90 = { maxUsed, over };
    if (over !== null) x.add('critical', 'prog', '90/180-day rule exceeded', 'With previous stays, the 90-day limit is exceeded on ' + U.fmt(over) + ' (max ' + maxUsed + ' days in a 180-day window).', 'Shorten the trip or move it later.');
    else x.ok('prog', '90/180 rule respected (max ' + maxUsed + '/90 days)');
    // insurance
    const ia = U.day(ins.start);
    const ib = U.day(ins.end);
    const cov = U.num(ins.coverage);
    if (!ins.provider && ia === null && cov === null) x.add('critical', 'ins', 'Travel medical insurance not found', '', 'Upload the travel insurance certificate.');
    else {
      if (cov === null || cov < 30000) x.ev(x.add('critical', 'ins', 'Insurance cover below €30,000', 'Cover: ' + (cov === null ? 'not shown' : U.money(cov, 'EUR')) + '.', 'Buy a policy with at least €30,000 medical cover.'), ins.file, { amount: ins.coverageRaw }, 'Insurance cover');
      else x.ok('ins', 'Cover ≥ €30,000');
      if (ia !== null && ib !== null) {
        x.tl('Travel insurance', ia, ib, 'insurance', ia <= x.entry && ib >= x.exit ? 'ok' : 'bad');
        x.mx('Entry date', 'Insurance start', U.fmt(ia), ia <= x.entry ? 'ok' : 'bad');
        x.mx('Exit date', 'Insurance end', U.fmt(ib), ib >= x.exit ? 'ok' : 'bad');
        if (ia > x.entry || ib < x.exit) {
          x.ev(x.ev(x.add('critical', 'ins', 'Insurance does not cover the whole stay', 'Policy ' + U.fmt(ia) + ' – ' + U.fmt(ib) + ', trip ' + U.fmt(x.entry) + ' – ' + U.fmt(x.exit) + '.', 'Extend the policy to cover every day of the trip.'), ins.file, { date: ins.start }, 'Insurance from'), ins.file, { date: ins.end }, 'Insurance until');
        } else x.ok('ins', 'Insurance covers every day of the stay');
        if (entries !== 'single' && ib - x.exit < 15) x.add('info', 'ins', 'Consider extra insurance days', 'Many consulates in Cairo prefer +15 days on multiple-entry requests.', '');
      } else x.add('critical', 'ins', 'Insurance cover dates not found', '', 'Upload a certificate that shows the cover period.');
      if (ins.territory && ins.territory !== 'schengen' && ins.territory !== 'worldwide') x.add('critical', 'ins', 'Insurance territory does not include all Schengen states', '', 'The policy must be valid in all Schengen states.');
      if (ins.repatriation === false || ins.repatriation === 'no') x.add('critical', 'ins', 'Insurance does not include repatriation', 'Repatriation for medical reasons/death is mandatory.', 'Choose a policy that covers repatriation.');
    }
    // funds
    const rule = R.schengenFunds[cons];
    const override = U.num((x.c.settings || {}).dailyFundsEUR);
    const acc = x.t.accommodationType === 'host' ? 'host' : (x.c.stays || []).length ? 'hotel' : 'none';
    let required;
    let basis;
    if (override) {
      required = override * x.days;
      basis = '€' + override + '/day × ' + x.days + ' days (custom)';
    } else if (rule) {
      required = rule.calc(x.days, acc);
      basis = R.countryName(cons) + ': ' + rule.note + ', ' + x.days + ' days';
    } else {
      required = R.schengenFundsDefault * x.days;
      basis = '€' + R.schengenFundsDefault + '/day default';
    }
    requireFunds(x, Math.round(required), 'EUR', basis);
    // minor
    if (x.age !== null && x.age < 18 && !(x.c.minor || {}).bothParentsTravel) {
      x.add('info', 'prog', 'Minor applicant', 'Parental consent signed by both parents (notarized, legalized) and the birth certificate are required.', '');
    }
    const fp = U.day((x.c.history || {}).fingerprintsDate);
    if (fp !== null && x.T - fp < 59 * 30) x.add('info', 'prog', 'Fingerprints may be reused', 'Fingerprints taken ' + U.fmt(fp) + ' (within 59 months) can be copied from the VIS — the visa centre may still collect them.', '');
  }

  function usCommon(x) {
    const us = x.c.us || {};
    const ap = x.ap;
    const resid = ap.residenceCountry || 'EG';
    const iCountry = us.interviewCountry;
    if (x.isNIV && iCountry && iCountry !== ap.nationality && iCountry !== resid) {
      x.add('major', 'prog', 'Interview outside country of nationality/residence',
        'Interview in ' + R.countryName(iCountry) + '. Since September 2025 nonimmigrant visa applicants must generally interview in their country of nationality or residence.',
        'Book the interview at the US Embassy in Cairo (or your country of legal residence).');
    }
    const iv = U.day(us.interviewDate);
    const ds = U.day(us.formDate);
    if (iv !== null) {
      x.tl('Interview', iv, iv, 'interview');
      if (x.entry !== null && iv > x.entry) x.add('critical', 'dates', 'Interview is after the planned travel date', 'Interview ' + U.fmt(iv) + ', travel ' + U.fmt(x.entry) + '.', 'Move the travel date after the interview + processing time.');
      if (iv < x.T) x.add('minor', 'dates', 'Interview date is before the review date', U.fmt(iv), 'Check the appointment date.');
      if (ds !== null && ds > iv) x.add('critical', 'dates', (x.P === 'us_iv' ? 'DS-260' : 'DS-160') + ' submitted after the interview date', '', 'The form must be submitted before the interview.');
    } else x.add('minor', 'dates', 'Interview date not found', '', 'Upload the appointment confirmation.');
    const conf = U.normId(us.confirmation);
    if (x.isNIV) {
      if (!conf) x.add('major', 'prog', 'DS-160 confirmation number not found', '', 'Upload the DS-160 confirmation page.');
      else if (!/^AA[0-9A-Z]{8}$/.test(conf)) x.add('minor', 'prog', 'DS-160 confirmation number looks unusual', conf + ' — normally 10 characters starting with "AA".', 'Re-check the confirmation page.');
    }
    if (us.socialMedia === 'no') {
      x.add('major', 'prog', 'Social media identifiers not listed on the form', 'DS-160/DS-260 require every platform handle used in the last 5 years; omissions can be treated as misrepresentation.', 'Update the form with all handles.');
    }
    // passport validity
    const exp = U.day(x.pp.expiryDate);
    if (exp !== null && x.entry !== null) {
      if (x.P === 'us_iv') {
        const base = iv !== null ? iv : x.entry;
        const need = U.addMonths(base, 6) + 60;
        x.tl('Passport validity', U.day(x.pp.issueDate) || x.T, exp, 'passport', exp >= need ? 'ok' : 'bad');
        if (exp < need) x.add('major', 'id', 'Passport may be too short for the immigrant visa', 'Expires ' + U.fmt(exp) + '; should be valid 60 days beyond the (up to 6-month) visa validity — about ' + U.fmt(need) + '.', 'Renew the passport before the interview.');
        else x.ok('id', 'Passport validity sufficient for an immigrant visa');
      } else {
        const end = x.P === 'us_f1' ? U.day(((us.f1 || {}).programEnd)) || x.exit : x.exit;
        const need = U.addMonths(end, 6);
        x.tl('Passport validity', U.day(x.pp.issueDate) || x.T, exp, 'passport', exp >= need ? 'ok' : exp >= end ? 'warn' : 'bad');
        if (exp < end) x.ev(x.add('critical', 'id', 'Passport expires before the end of the stay', 'Expires ' + U.fmt(exp) + ', stay ends ' + U.fmt(end) + '.', 'Renew the passport.'), x.ppFile, { date: x.pp.expiryDate }, 'Passport expiry');
        else if (exp < need) x.add('major', 'id', 'Passport not valid 6 months beyond the stay', 'Expires ' + U.fmt(exp) + '; standard requirement until ' + U.fmt(need) + ' (Six-Month Club exemptions exist — renewing is safer).', 'Renew the passport.');
        else x.ok('id', 'Passport valid ≥ 6 months beyond the stay');
      }
    }
    // previous US visits: overstay / pattern
    const visits = ((x.c.history || {}).usVisits || []).map((v) => ({ a: U.day(v.entry), b: U.day(v.exit), auth: U.day(v.authorizedUntil) })).filter((v) => v.a !== null && v.b !== null);
    visits.forEach((v) => {
      if (v.auth !== null && v.b > v.auth) {
        const over = v.b - v.auth;
        x.add('critical', 'hist', 'Previous US overstay of ' + U.plural(over, 'day'),
          'Stayed until ' + U.fmt(v.b) + ', authorized until ' + U.fmt(v.auth) + '. Any overstay voids the visa (INA 222(g))' + (over > 365 ? '; > 1 year unlawful presence triggers the 10-year bar.' : over > 180 ? '; > 180 days triggers the 3-year bar.' : '.'),
          'Get legal advice before applying; disclose it truthfully on the form.');
      }
    });
    const lastYear = visits.reduce((s, v) => s + Math.max(0, Math.min(v.b, x.T) - Math.max(v.a, x.T - 365) + 1), 0);
    if (lastYear > 180 && x.isNIV) x.add('major', 'hist', 'Spent ' + lastYear + ' days in the US in the last 12 months', 'Long or frequent visits suggest the applicant lives in the US, which conflicts with visitor status.', 'Explain the pattern and show strong ties at home.');
  }

  function usB(x) {
    const us = x.c.us || {};
    if (!x.validTrip) return;
    if (x.days > 180) x.add('major', 'prog', 'Planned stay longer than 6 months', U.plural(x.days, 'day') + '. B-2 admission is normally up to 6 months; long stays raise 214(b) doubts.', 'Shorten the stay.');
    else x.ok('prog', 'Length of stay within B1/B2 norms');
    if (!us.usAddress) x.add('minor', 'prog', 'US address / point of contact not found', 'The DS-160 asks where you will stay in the US.', 'Make sure the DS-160 lists the hotel or host address.');
    const budget = U.num((x.c.settings || {}).usDailyBudget) || (x.t.accommodationType === 'host' ? 100 : 200);
    const cost = U.num(us.tripCost);
    const required = cost || budget * x.days;
    requireFunds(x, Math.round(required), 'USD', cost ? 'declared trip cost' : '$' + budget + '/day × ' + x.days + ' days');
  }

  function usF1(x) {
    const f = (x.c.us || {}).f1 || {};
    const ps = U.day(f.programStart);
    const pe = U.day(f.programEnd);
    const iv = U.day((x.c.us || {}).interviewDate);
    if (ps === null) x.add('critical', 'prog', 'I-20 not found or unreadable', '', 'Upload the signed I-20.');
    else {
      x.tl('I-20 program', ps, pe !== null ? pe : ps, 'program');
      if (x.entry !== null && x.entry < ps - 30) x.add('critical', 'prog', 'Entry more than 30 days before the program start', 'Entry ' + U.fmt(x.entry) + ', program starts ' + U.fmt(ps) + '. Initial F-1 students may enter at most 30 days early.', 'Move the travel date to ' + U.fmt(ps - 30) + ' or later.');
      else if (x.entry !== null && x.entry > ps) x.add('major', 'prog', 'Arriving after the program start date', 'Entry ' + U.fmt(x.entry) + ', start ' + U.fmt(ps) + '.', 'Get a deferred/updated I-20 or written late-arrival approval from the DSO.');
      else if (x.entry !== null) x.ok('prog', 'Entry within the 30-day window before program start');
      if (iv !== null && ps - iv > 365) x.add('major', 'prog', 'Interview more than 365 days before program start', 'F-1 visas can be issued at most 365 days before the program start.', 'Reschedule the interview.');
      if (pe !== null && pe <= ps) x.add('critical', 'prog', 'I-20 program end is not after the start', '', 'Re-check the I-20 dates.');
    }
    const sevis = U.normId(f.sevisId);
    if (!sevis) x.add('major', 'prog', 'SEVIS ID not found', '', 'Upload the I-20 (the SEVIS ID is at the top: N followed by 10 digits).');
    else if (!/^N\d{10}$/.test(sevis)) x.add('major', 'prog', 'SEVIS ID format looks wrong', sevis + ' — should be N + 10 digits.', 'Copy it again from the I-20.');
    if (f.i901Paid !== true) x.add('critical', 'prog', 'SEVIS I-901 fee not paid', '', 'Pay the I-901 fee at fmjfee.com and print the receipt.');
    else {
      const pd = U.day(f.i901Date);
      if (pd !== null && iv !== null && iv - pd < 3) x.add('minor', 'prog', 'I-901 paid less than 3 business days before the interview', '', 'Bring the printed receipt; payments may take days to appear.');
    }
    if (f.ds160School && f.school) {
      const r = U.compareNames(f.school, f.ds160School);
      if (r.status === 'mismatch' || r.status === 'variant') x.add('major', 'prog', 'School on DS-160 differs from the I-20', '"' + f.ds160School + '" vs I-20 "' + f.school + '".', 'Update the DS-160.');
    }
    if (f.i20Name) nameCheck(x, 'I-20', f.i20Name);
    if (U.num(f.i20Cost) === null) x.add('major', 'fin', 'I-20 first-year cost not found', '', 'Upload the I-20 page with the estimated expenses.');
    requireFunds(x, U.num(f.i20Cost), 'USD', 'I-20 estimated first-year expenses');
    if (!f.publicProfiles) x.add('info', 'prog', 'Social media visibility', 'Since 2025, F/M/J applicants are asked to set social media profiles to public for vetting.', 'Set profiles to public before the interview.');
  }

  function usIV(x) {
    const iv = (x.c.us || {}).iv || {};
    const cat = iv.category || '';
    if (!cat) {
      x.add('critical', 'prog', 'Immigrant visa category not found', '', 'Upload the NVC welcome letter or the I-797 approval notice.');
      return;
    }
    const needUSC = /^(IR1|CR1|IR2|CR2|IR5|F1|F3|F4)$/.test(cat);
    if (iv.petitionerStatus) {
      if (needUSC && iv.petitionerStatus !== 'USC') x.add('critical', 'prog', cat + ' requires a US-citizen petitioner', 'Petitioner status: ' + iv.petitionerStatus + '.', 'Check the category on the I-797 approval notice.');
      if (cat === 'F2A' && iv.petitionerStatus !== 'LPR') x.add('critical', 'prog', 'F2A is for spouses/children of permanent residents', 'Petitioner status: ' + iv.petitionerStatus + '.', 'If the petitioner naturalized, the case converts to IR1/CR1 — notify NVC.');
    }
    if (iv.petitionerName) x.mx('Full name', 'Petitioner', U.normName(iv.petitionerName), 'ref');
    const md = U.day(iv.marriageDate);
    if (/^(IR1|CR1|F2A)$/.test(cat)) {
      if (md === null) x.add('critical', 'prog', 'Marriage date not found', '', 'Upload the marriage certificate.');
      else {
        if (md > x.T) x.add('critical', 'prog', 'Marriage date is in the future', '', 'Correct it.');
        const ref = x.entry !== null ? x.entry : x.T;
        const yrs = U.years(md, ref);
        if (cat === 'CR1' && yrs >= 2) x.add('minor', 'prog', 'Marriage will be 2+ years old at entry — IR1 instead of CR1', 'Married ' + U.fmt(md) + '.', 'The consulate issues IR1 when the second anniversary passes before issuance; no action unless NVC data is wrong.');
        if (cat === 'IR1' && yrs < 2) x.add('major', 'prog', 'Marriage under 2 years at entry — category should be CR1', 'Married ' + U.fmt(md) + '; 2-year anniversary ' + U.fmt(U.addYears(md, 2)) + '.', 'Expect a conditional (CR1) green card; check the NVC category.');
        const pm = U.day(iv.priorMarriageEnd);
        if (iv.priorMarriage && pm !== null && pm > md) x.add('critical', 'prog', 'Prior marriage ended after the current marriage', 'Prior marriage ended ' + U.fmt(pm) + ', current marriage ' + U.fmt(md) + ' — the current marriage may be invalid.', 'Get legal advice; provide the termination documents.');
      }
    }
    if (/^(IR2|CR2)$/.test(cat) && x.age !== null && x.age >= 21) x.add('major', 'prog', 'Child category but applicant is 21+', 'Age at travel: ' + x.age + '. Check CSPA age calculation.', 'Confirm eligibility with NVC.');
    // medical
    const med = U.day(iv.medicalDate);
    const ivDay = U.day((x.c.us || {}).interviewDate);
    if (med === null) x.add('critical', 'prog', 'Medical exam date missing', 'The panel-physician exam must be done before the interview.', 'Book the medical with the embassy-approved panel physician.');
    else {
      if (ivDay !== null && med > ivDay) x.add('major', 'prog', 'Medical exam after the interview date', U.fmt(med), 'Complete the medical before the interview.');
      if (x.entry !== null && x.entry > U.addMonths(med, 6)) x.add('major', 'prog', 'Medical will have expired by travel', 'Exam ' + U.fmt(med) + ' is generally valid 6 months (until ' + U.fmt(U.addMonths(med, 6)) + ').', 'Plan to enter the US before then.');
      x.tl('Medical validity', med, U.addMonths(med, 6), 'medical', x.entry === null || x.entry <= U.addMonths(med, 6) ? 'ok' : 'bad');
    }
    // police certificates (reciprocity rules)
    const resid = (iv.residences || []).filter((r) => r.country && U.day(r.from) !== null);
    const certs = iv.policeCerts || [];
    if (x.dob !== null) {
      const age16 = U.addYears(x.dob, 16);
      if (!resid.length) {
        x.add('major', 'prog', 'Residence history not found', 'Needed to determine which police certificates are required.', 'Upload the DS-260 confirmation (it lists previous addresses).');
      }
      const byCountry = {};
      resid.forEach((r) => {
        const a = Math.max(U.day(r.from), age16);
        const b = U.day(r.to) !== null ? U.day(r.to) : x.T;
        if (b > a) byCountry[r.country] = (byCountry[r.country] || 0) + (b - a);
      });
      const current = x.ap.residenceCountry || 'EG';
      Object.keys(byCountry).forEach((cc) => {
        if (cc === 'US') return;
        const months = byCountry[cc] / 30.44;
        const limit = cc === x.ap.nationality || cc === current ? 6 : 12;
        if (months > limit) {
          const cert = certs.find((p) => p && p.country === cc);
          if (!cert) x.add('critical', 'prog', 'Police certificate missing: ' + R.countryName(cc), 'Lived there ~' + Math.round(months) + ' months after age 16 (threshold ' + limit + ' months).', cc === 'EG' ? 'Obtain the Criminal Record certificate from the Egyptian Ministry of Interior, issued for the US Embassy.' : 'Obtain it per the State Department reciprocity schedule.');
          else {
            const d = U.day(cert.issued);
            if (d !== null && x.T - d > 365) x.add('major', 'prog', 'Police certificate from ' + R.countryName(cc) + ' is older than a year', 'Issued ' + U.fmt(d) + '.', 'Get a new one if you still live there.');
            else x.ok('prog', 'Police certificate present for ' + R.countryName(cc));
          }
        }
      });
    }
    // I-864
    const i = iv.i864 || {};
    const hh = U.num(i.householdSize);
    const inc = U.num(i.income);
    if (hh === null || inc === null) {
      x.add('critical', 'fin', 'Affidavit of support data missing', 'Household size and the sponsor\'s income from the latest tax year are required.', 'Upload the signed I-864 and the latest tax transcript.');
    } else {
      const s = x.c.settings || {};
      const tbl = R.poverty[i.state] || R.poverty.contiguous;
      const base = U.num(s.povertyBase) || tbl.base;
      const add = U.num(s.povertyAdd) || tbl.add;
      const pct = i.military ? 1 : 1.25;
      const threshold = Math.round(pct * (base + add * (hh - 1)));
      x.metrics.fundsRequired = threshold;
      x.metrics.fundsCur = 'USD';
      x.metrics.fundsBasis = Math.round(pct * 100) + '% of HHS ' + (U.num(s.povertyBase) ? 'custom' : R.poverty.year) + ' poverty guideline, household of ' + hh;
      x.metrics.fundsAvailable = inc;
      if (inc >= threshold) x.ok('fin', 'Sponsor income ' + U.money(inc, 'USD') + ' meets the I-864 minimum ' + U.money(threshold, 'USD'));
      else {
        const short = threshold - inc;
        const mult = /^(IR1|CR1|IR2|CR2)$/.test(cat) ? 3 : 5;
        const assets = U.num(i.assets) || 0;
        const jInc = U.num(i.jointIncome);
        const jHH = U.num(i.jointHousehold);
        if (assets >= short * mult) x.add('info', 'fin', 'Income below minimum, covered by assets', 'Shortfall ' + U.money(short, 'USD') + ' × ' + mult + ' = ' + U.money(short * mult, 'USD') + ' ≤ assets ' + U.money(assets, 'USD') + '.', 'Attach proof of ownership and value of the assets.');
        else if (i.jointSponsor && jInc !== null) {
          const jt = Math.round(pct * (base + add * ((jHH || 1) - 1)));
          if (jInc >= jt) x.add('info', 'fin', 'Joint sponsor meets the requirement', 'Joint sponsor income ' + U.money(jInc, 'USD') + ' vs ' + U.money(jt, 'USD') + ' for household ' + (jHH || 1) + '.', 'Include the joint sponsor\'s I-864, tax transcripts and status proof.');
          else x.add('critical', 'fin', 'Joint sponsor income too low', U.money(jInc, 'USD') + ' vs ' + U.money(jt, 'USD') + ' required for household ' + (jHH || 1) + '.', 'Find another joint sponsor or add assets.');
        } else {
          x.add('critical', 'fin', 'Affidavit of support below the poverty-guideline minimum',
            'Income ' + U.money(inc, 'USD') + ' vs ' + U.money(threshold, 'USD') + ' (' + x.metrics.fundsBasis + '). Assets ' + U.money(assets, 'USD') + ' < ' + mult + '× shortfall (' + U.money(short * mult, 'USD') + ').',
            'Add a joint sponsor, household member income (I-864A) or qualifying assets.');
        }
      }
      const ty = U.num(i.taxYear);
      const curYear = new Date(x.T * 86400000).getUTCFullYear();
      if (ty !== null && ty < curYear - 2) x.add('major', 'fin', 'Tax return is not the most recent', 'Tax year ' + ty + '.', 'Provide the most recent federal tax return/transcript.');
    }
    if (iv.arrests) x.add('info', 'prog', 'Arrest history declared', 'Court records for every arrest are required regardless of outcome.', '');
  }

  /* ============================== run ============================== */
  E.run = function (c) {
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    const x = makeCtx(c);
    const docList = V.docs.required(x.c);
    coreData(x);
    passportChecks(x);
    x.mx('Entry date', 'Application form', U.fmt(x.entry), 'ref');
    if (x.P !== 'us_iv') x.mx('Exit date', 'Application form', U.fmt(x.exit), 'ref');
    if (x.validTrip) x.tl(x.P === 'us_iv' ? 'Intended travel' : 'Trip (declared)', x.entry, x.exit, 'trip');
    dateSourceChecks(x);
    flightChecks(x);
    stayChecks(x);
    employmentChecks(x);
    financeChecks(x);
    historyChecks(x);
    if (x.P === 'schengen') schengen(x);
    else {
      usCommon(x);
      if (x.P === 'us_b1b2') usB(x);
      if (x.P === 'us_f1') usF1(x);
      if (x.P === 'us_iv') usIV(x);
    }
    idChecks(x);
    documentChecks(x, docList);
    tiesScore(x);
    egyptChecks(x);
    (x.c.buildNotes || []).forEach((n) => {
      if (!n || !n.sev) return;
      const f = x.add(n.sev, n.cat || 'data', n.title, n.detail, n.fix);
      (n.ev || []).forEach((e) => x.ev(f, e.file, e.q, e.label));
    });
    const scans = (x.c.scans || []).filter((s) => s && s.fileName).map((s) => E.scanText(x, s));

    // de-duplicate identical findings
    const seen = new Set();
    const findings = x.findings.filter((f) => {
      const k = f.sev + '|' + f.title + '|' + f.detail;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const order = { critical: 0, major: 1, minor: 2, info: 3 };
    findings.sort((a, b) => order[a.sev] - order[b.sev]);
    const counts = { critical: 0, major: 0, minor: 0, info: 0 };
    findings.forEach((f) => counts[f.sev]++);
    const penalty = findings.reduce((s, f) => s + SEV_W[f.sev], 0);
    const score = Math.max(0, 100 - penalty);
    let verdict;
    if (counts.critical) verdict = { level: 'bad', label: 'Not ready to submit', text: U.plural(counts.critical, 'critical issue') + ' would likely cause refusal or rejection at the counter.' };
    else if (counts.major) verdict = { level: 'warn', label: 'Needs attention', text: U.plural(counts.major, 'significant issue') + ' to fix or explain before submission.' };
    else verdict = { level: 'good', label: 'Ready to submit', text: 'No blocking or significant issues found.' + (counts.minor ? ' ' + U.plural(counts.minor, 'minor point') + ' to polish.' : '') };

    // timeline range
    let tl = x.timeline;
    let range = null;
    if (tl.length) {
      const anchorA = x.validTrip ? x.entry - 20 : Math.min.apply(null, tl.map((r) => r.a));
      const anchorB = x.validTrip ? x.exit + 20 : Math.max.apply(null, tl.map((r) => r.b));
      const lo = Math.min(anchorA, Math.min.apply(null, tl.filter((r) => ['passport', 'permit', 'bank', 'medical', 'leave'].indexOf(r.kind) === -1).map((r) => r.a).concat([anchorA])));
      const hi = Math.max(anchorB, Math.max.apply(null, tl.filter((r) => ['passport', 'permit', 'bank', 'medical', 'leave'].indexOf(r.kind) === -1).map((r) => r.b).concat([anchorB])));
      range = { a: lo, b: hi };
    }
    const matrix = Object.keys(x.matrix).map((k) => ({ fact: k, values: x.matrix[k] }));
    const ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
    return {
      program: x.P,
      programLabel: R.programs[x.P],
      reviewedOn: U.iso(x.T),
      verdict, score, counts, findings, passes: x.passes,
      matrix, timeline: { range, rows: tl },
      metrics: Object.assign({ tripDays: x.days, age: x.age }, x.metrics),
      docs: docList,
      organize: V.docs.organize(x.c, docList),
      scans,
      ms: Math.round(ms * 10) / 10,
    };
  };
})(typeof globalThis !== 'undefined' ? (globalThis.VFR = globalThis.VFR || {}) : (window.VFR = window.VFR || {}));
