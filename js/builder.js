/* Builds a case file automatically from per-document extractions.
 * VFR.builder.build(files, opts) → case object for VFR.engine.run().
 *   files: [{ fileName, typeOverride?, data: <extraction> }]
 *   opts:  { program: 'auto'|..., consulateOf: ''|'FR'…, submissionDate, fx: { EUR:1, USD:…, EGP:… } (units per 1 EUR) } */
(function (V) {
  'use strict';
  const U = V.util;
  const R = V.ref;
  const B = (V.builder = {});

  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const date = (v) => (U.day(str(v)) !== null ? U.iso(U.day(str(v))) : '');
  const cc = (v) => {
    const s = str(v).toUpperCase();
    if (R.byA2[s]) return s;
    if (R.byA3[s]) return R.byA3[s].a2;
    const byName = R.countries.find((c) => c.name.toUpperCase() === s);
    return byName ? byName.a2 : s.length === 2 ? s : '';
  };
  const yn = (v) => (v === 'yes' ? true : v === 'no' ? false : null);
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const first = (arr, f) => {
    for (const x of arr) {
      const v = f(x);
      if (v !== '' && v !== null && v !== undefined) return v;
    }
    return '';
  };

  /** Convert an amount between currencies using EUR-based rates. */
  B.convert = function (amount, from, to, fx) {
    if (amount === null || amount === undefined) return null;
    from = (from || '').toUpperCase();
    to = (to || '').toUpperCase();
    if (!from || from === to) return amount;
    if (!fx || !fx[from] || !fx[to]) return null;
    return (amount * fx[to]) / fx[from];
  };

  /** An empty extraction (same shape the server returns). */
  B.blank = function () {
    const e = '';
    return {
      docType: 'other', summary: '', language: '', isTranslation: false, translationOf: '', isPhotocopy: false, mainPersonName: '', mainPersonRole: 'unknown',
      passportNumberShown: '', dateOfBirthShown: '', documentDate: '', validUntil: '', issuingCountry: '', signedOrStamped: 'unknown',
      legalization: { issuerCertified: false, foreignMinistryStamp: false, embassyStamp: false, apostille: false },
      passport: { surname: e, givenNames: e, number: e, nationality: e, sex: e, dateOfBirth: e, issueDate: e, expiryDate: e, issuingCountry: e, mrzLine1: e, mrzLine2: e, blankPagesVisible: null },
      flights: [], stays: [],
      insurance: { insuredName: e, provider: e, coverageAmount: null, coverageCurrency: e, start: e, end: e, territory: 'unknown', repatriation: 'unknown' },
      bank: { bankName: e, accountHolder: e, currency: e, periodFrom: e, periodTo: e, openingBalance: null, closingBalance: null, averageMonthlyCredits: null, largestDeposit: null, largestDepositDate: e, largestDepositDescription: e },
      employment: { status: 'unknown', employer: e, position: e, employeeName: e, startDate: e, monthlySalary: null, salaryCurrency: e, leaveFrom: e, leaveTo: e, returnToWorkDate: e },
      application: { visaProgram: 'unknown', memberStateApplied: e, purpose: 'unknown', entryDate: e, exitDate: e, entriesRequested: 'unknown', destinations: [], previousRefusalsDeclared: 'unknown', fundedBy: 'unknown', residenceCountry: e, maritalStatus: e, socialMediaListed: 'unknown', usAddress: e, confirmationNumber: e, submittedOn: e, school: e, countriesLivedIn: [] },
      appointment: { date: e, country: e, city: e, forCountry: e }, host: { name: e, address: e, status: e, relationship: e }, sponsor: { name: e, relationship: e },
      student: { sevisId: e, school: e, studentName: e, programStart: e, programEnd: e, firstYearCostUSD: null, sevisFeePaidOn: e },
      immigrant: { category: e, petitionerName: e, petitionerStatus: 'unknown', marriageDate: e, priorMarriageEndDate: e, medicalExamDate: e, sponsorIncomeUSD: null, householdSize: null, taxYear: null },
      previousVisas: [], travelStamps: [], refusal: { country: e, date: e, reason: e }, ties: { ownsProperty: 'unknown', spouseStaysHome: 'unknown', childrenStayHome: 'unknown' }, issues: [],
    };
  };

  B.typeOf = (f) => (f.typeOverride || (f.data && f.data.docType) || 'other');

  B.detectProgram = function (files) {
    const types = files.map(B.typeOf);
    const declared = first(files, (f) => (f.data && f.data.application && f.data.application.visaProgram !== 'unknown' && ['application_form', 'ds160', 'ds260', 'cover_letter'].indexOf(B.typeOf(f)) !== -1 ? f.data.application.visaProgram : ''));
    if (declared) return declared;
    if (types.some((t) => ['i20', 'i901_receipt'].indexOf(t) !== -1)) return 'us_f1';
    if (types.some((t) => ['ds260', 'i864', 'medical_exam', 'petitioner_status', 'tax_transcripts'].indexOf(t) !== -1)) return 'us_iv';
    if (types.indexOf('ds160') !== -1) return 'us_b1b2';
    return 'schengen';
  };

  B.build = function (files, opts) {
    opts = opts || {};
    files = (files || []).filter((f) => f && f.data);
    const notes = [];
    const note = (sev, title, detail, fix) => notes.push({ sev, cat: 'data', title, detail: detail || '', fix: fix || '' });
    const of = (...types) => files.filter((f) => types.indexOf(B.typeOf(f)) !== -1);
    const P = opts.program && opts.program !== 'auto' ? opts.program : B.detectProgram(files);
    const region = P === 'schengen' ? (a) => R.isSchengen(a) : (a) => a === 'US';
    const appDocs = of('application_form', 'ds160', 'ds260').concat(of('cover_letter', 'itinerary'));
    const app = (k) => first(appDocs, (f) => {
      const v = f.data.application && f.data.application[k];
      return v === 'unknown' ? '' : v;
    });
    const fx = opts.fx || null;

    /* ---- passport / applicant ---- */
    const ppDocs = of('passport').filter((f) => f.data.passport && (f.data.passport.number || f.data.passport.mrzLine2));
    const pp = ppDocs.length ? Object.assign({}, ppDocs[0].data.passport) : {};
    const numbers = [...new Set(ppDocs.map((f) => U.normId(f.data.passport.number)).filter(Boolean))];
    if (numbers.length > 1) {
      note('major', 'Several different passports uploaded', 'Numbers: ' + numbers.join(', ') + '. The first (' + numbers[0] + ') is treated as the current passport; the others as previous passports.', 'Review one applicant at a time and keep only the current passport bio page plus copies of old visas.');
    }
    if (!ppDocs.length) note('critical', 'No passport bio page found among the uploads', 'Identity data and every cross-check depend on it.', 'Upload a clear scan of the passport bio page (with both MRZ lines).');
    // OCR look-alike letters in the MRZ name (no check digit protects names): correct them from typed documents
    const LOOK = ['OCQDU0G', 'IL1T', 'S5', 'B8E', 'MNH', 'KX', 'VYW', 'A4'];
    const confusable = (a, b) => a.length === b.length && a !== b && a.split('').every((ch, i) => ch === b[i] || LOOK.some((g) => g.indexOf(ch) !== -1 && g.indexOf(b[i]) !== -1));
    const typed = [];
    files.filter((f) => ['application_form', 'movement_certificate', 'ds160', 'ds260', 'property_docs'].indexOf(B.typeOf(f)) !== -1 && f.data.mainPersonRole === 'applicant')
      .forEach((f) => U.tokens(f.data.mainPersonName).forEach((t) => typed.push(t)));
    const fixTok = (s) => U.tokens(s).map((t) => {
      if (typed.indexOf(t) !== -1) return t;
      const alt = typed.find((u) => confusable(t, u));
      if (alt) {
        note('info', 'Passport name corrected for an OCR misread: ' + t + ' → ' + alt, 'Taken from the typed application documents; letters like O/C or I/1 look alike in scans.', '');
        if (pp.mrzLine1) pp.mrzLine1 = pp.mrzLine1.replace(new RegExp('(^|<)' + t + '(?=<)'), '$1' + alt);
      }
      return alt || t;
    }).join(' ');
    if (pp.surname) pp.surname = fixTok(pp.surname);
    if (pp.givenNames) pp.givenNames = fixTok(pp.givenNames);
    const residence = cc(app('residenceCountry')) || 'EG';
    const c = {
      program: P,
      meta: { submissionDate: opts.submissionDate || U.todayIso(), applyingIn: '', consulateOf: '' },
      applicant: {
        surname: str(pp.surname), givenNames: str(pp.givenNames), dob: date(pp.dateOfBirth), sex: /^[MF]$/.test(str(pp.sex).toUpperCase()[0] || '') ? str(pp.sex).toUpperCase()[0] : '',
        nationality: cc(pp.nationality) || cc(pp.issuingCountry), residenceCountry: residence, maritalStatus: str(app('maritalStatus')).toLowerCase(),
      },
      passport: {
        number: U.normId(pp.number), issuer: cc(pp.issuingCountry), issueDate: date(pp.issueDate), expiryDate: date(pp.expiryDate),
        blankPages: num(pp.blankPagesVisible), previousNumbers: numbers.slice(1).join(','), mrz1: str(pp.mrzLine1), mrz2: str(pp.mrzLine2),
      },
      trip: { destinations: [] }, flights: [], stays: [], host: {}, insurance: {}, employment: {},
      finances: { statements: [], sponsor: {} }, ties: {}, history: { refusals: [], schengenStays: [], usVisits: [], priorVisas: [] },
      minor: {}, us: { f1: {}, iv: { residences: [], policeCerts: [], i864: {} } },
      documents: {}, docFiles: [], scans: [], settings: {}, buildNotes: notes,
    };
    c.passport.file = ppDocs.length ? ppDocs[0].fileName : '';
    const appFileDoc = of('application_form', 'ds160', 'ds260')[0];
    c.meta.applicationFile = appFileDoc ? appFileDoc.fileName : '';
    const rp = of('residence_permit').filter((f) => f.data.mainPersonRole === 'applicant' || f.data.mainPersonRole === 'unknown');
    if (rp.length) c.applicant.residencePermitExpiry = date(rp[0].data.validUntil);

    /* ---- flights ---- */
    const seenF = new Set();
    of('flight', 'itinerary', 'application_form').forEach((f) => (f.data.flights || []).forEach((l) => {
      const d = date(l.departureDate);
      if (!d) return;
      const k = d + '|' + U.normId(l.flightNumber) + '|' + str(l.fromAirport);
      if (seenF.has(k)) return;
      seenF.add(k);
      const arr = date(l.arrivalDate);
      c.flights.push({ date: d, arrDate: arr && arr !== d ? arr : '', from: cc(l.fromCountry), to: cc(l.toCountry), flightNo: str(l.flightNumber) || str(l.fromAirport) + '-' + str(l.toAirport), passengerName: str(l.passengerName), file: f.fileName });
    }));
    c.flights.sort((a, b) => U.day(a.date) - U.day(b.date));

    /* ---- stays ---- */
    const seenS = new Set();
    of('accommodation', 'itinerary').forEach((f) => (f.data.stays || []).forEach((s) => {
      const a = date(s.checkIn);
      const b = date(s.checkOut);
      if (!a || !b) return;
      const k = a + '|' + b + '|' + U.normName(s.propertyName);
      if (seenS.has(k)) return;
      seenS.add(k);
      c.stays.push({ name: str(s.propertyName), country: cc(s.country), city: str(s.city), checkIn: a, checkOut: b, guestName: str(s.guestName), file: f.fileName });
    }));
    c.stays.sort((a, b) => U.day(a.checkIn) - U.day(b.checkIn));

    /* ---- trip dates ---- */
    const inbound = c.flights.filter((l) => !region(l.from) && region(l.to));
    const outbound = c.flights.filter((l) => region(l.from) && !region(l.to));
    let entry = date(app('entryDate'));
    let exit = date(app('exitDate'));
    if (!entry || (!exit && P !== 'us_iv')) {
      const fEntry = inbound.length ? inbound[0].arrDate || inbound[0].date : '';
      const fExit = outbound.length ? outbound[outbound.length - 1].date : '';
      const sEntry = c.stays.length ? c.stays[0].checkIn : '';
      const sExit = c.stays.length ? c.stays.reduce((m, s) => (s.checkOut > m ? s.checkOut : m), '') : '';
      if (!entry) entry = fEntry || sEntry;
      if (!exit) exit = fExit || sExit;
      if (entry || exit) note('info', 'Trip dates taken from the ' + (fEntry ? 'flight reservation' : 'bookings'), 'No application form with travel dates was uploaded, so the file is checked against ' + (entry || '?') + ' → ' + (exit || '?') + '.', 'Upload the signed application form so the declared dates are checked too.');
    }
    const student = first(of('i20'), (f) => f.data.student && f.data.student.programStart ? f.data.student : null) || {};
    if (P === 'us_f1') {
      if (!exit) exit = date(student.programEnd);
      if (!entry && student.programStart) {
        entry = U.iso(U.day(student.programStart) - 14);
        note('info', 'Travel date assumed 2 weeks before the program start', 'No ticket or DS-160 travel date found.', '');
      }
    }
    const apptDocs = of('appointment');
    const appt = apptDocs.length ? apptDocs[0].data.appointment : {};
    const apptDay = U.day(appt.date);
    if (apptDay !== null && !opts.fixedDate) {
      const today = U.day(c.meta.submissionDate);
      if (apptDay >= today) {
        c.meta.submissionDate = U.iso(apptDay);
        note('info', 'Reviewed as of the appointment date ' + U.fmt(apptDay), 'Document ages and timing rules are checked against the day the file is submitted.', '');
      } else {
        note('major', 'The appointment date (' + U.fmt(apptDay) + ') has already passed', 'The appointment letter in the file is for a date before today.', 'Book a new appointment and upload the new confirmation — or check the date was read correctly.');
        notes[notes.length - 1].ev = [{ file: apptDocs[0].fileName, q: { date: U.iso(apptDay) }, label: 'Appointment date' }];
      }
    }
    if (P === 'us_iv' && !entry) {
      const ad = U.day(appt.date);
      if (ad !== null) {
        entry = U.iso(ad + 30);
        note('info', 'Travel date assumed 30 days after the interview', '', 'Not required for the review; shown for the medical-validity check only.');
      }
    }
    if (P === 'us_b1b2' && !entry && !exit) note('major', 'No travel dates found', 'Neither the DS-160 nor a reservation shows the intended dates.', 'Upload the DS-160 confirmation (it lists the intended arrival date and length of stay).');
    c.trip.entryDate = entry;
    c.trip.exitDate = exit;
    c.dateSources = [];
    appDocs.forEach((f) => {
      const a = f.data.application || {};
      const e1 = date(a.entryDate);
      const e2 = date(a.exitDate);
      if (e1 || e2) c.dateSources.push({ source: f.fileName, file: f.fileName, type: B.typeOf(f), entry: e1, exit: e2 });
    });
    if (inbound.length || outbound.length) c.dateSources.push({ source: 'Flight booking', file: (inbound[0] || outbound[0]).file, type: 'flight', entry: inbound.length ? inbound[0].arrDate || inbound[0].date : '', exit: outbound.length ? outbound[outbound.length - 1].date : '' });
    if (c.stays.length) c.dateSources.push({ source: 'Hotel booking' + (c.stays.length > 1 ? 's' : ''), file: c.stays[0].file, type: 'accommodation', entry: c.stays[0].checkIn, exit: c.stays.reduce((m, s) => (s.checkOut > m ? s.checkOut : m), '') });

    /* ---- purpose, accommodation, funding, entries ---- */
    const types = new Set(files.map(B.typeOf));
    let purpose = app('purpose');
    if (!purpose) purpose = types.has('business_invitation') ? 'business' : types.has('event_registration') ? 'conference' : types.has('medical_letter') ? 'medical' : types.has('invitation_letter') ? 'family' : 'tourism';
    if (P === 'us_f1') purpose = 'study';
    if (P === 'us_iv') purpose = 'immigration';
    c.trip.purpose = purpose;
    c.trip.entries = app('entriesRequested') || 'unknown';
    const hostDoc = of('invitation_letter')[0];
    const hostInfo = first(files, (f) => (f.data.host && f.data.host.name ? f.data.host : null)) || {};
    c.host = { name: str(hostInfo.name), address: str(hostInfo.address), status: str(hostInfo.status), relationship: str(hostInfo.relationship) };
    c.trip.accommodationType = c.stays.length && (hostDoc || c.host.name) ? 'mixed' : c.stays.length ? 'hotel' : hostDoc || c.host.name ? 'host' : 'none';
    let funded = app('fundedBy');
    if (!funded) funded = types.has('sponsor_letter') || types.has('sponsor_bank') ? 'sponsor' : types.has('scholarship') ? 'scholarship' : 'self';
    c.trip.fundedBy = funded;
    const sp = first(files, (f) => (f.data.sponsor && f.data.sponsor.name ? f.data.sponsor : null)) || {};
    c.finances.sponsor = { name: str(sp.name), relationship: str(sp.relationship) };
    if (!c.finances.sponsor.name) {
      const sb = of('sponsor_bank', 'sponsor_letter', 'sponsor_id').find((f) => f.data.mainPersonName);
      if (sb) c.finances.sponsor.name = str(sb.data.mainPersonName);
    }

    /* ---- destinations (Schengen) ---- */
    const ad = (appDocs.find((f) => f.data.application && f.data.application.destinations && f.data.application.destinations.length) || {}).data;
    if (ad) {
      c.trip.destinations = ad.application.destinations.map((d) => ({ country: cc(d.country), city: str(d.city), from: date(d.from), to: date(d.to) })).filter((d) => d.country);
    } else if (c.stays.length) {
      c.stays.forEach((s) => {
        const last = c.trip.destinations[c.trip.destinations.length - 1];
        if (last && last.country === s.country && last.to === s.checkIn) last.to = s.checkOut;
        else c.trip.destinations.push({ country: s.country, city: s.city, from: s.checkIn, to: s.checkOut });
      });
    }

    /* ---- consulate ---- */
    if (P === 'schengen') {
      const declared = opts.consulateOf || cc(app('memberStateApplied')) || cc(appt.forCountry);
      if (declared) c.meta.consulateOf = declared;
      else {
        const nights = {};
        c.trip.destinations.filter((d) => R.isSchengen(d.country)).forEach((d) => (nights[d.country] = (nights[d.country] || 0) + Math.max(0, U.day(d.to) - U.day(d.from))));
        const top = Object.keys(nights).sort((a, b) => nights[b] - nights[a])[0] || (inbound[0] && inbound[0].to) || '';
        c.meta.consulateOf = top;
        if (top) note('info', 'Consulate not stated — assuming ' + R.countryName(top), 'No application form or appointment letter names the Schengen state. The main destination from the bookings is used.', 'Choose "Applying to" at the top if the file goes to a different consulate.');
      }
    }
    c.meta.applyingIn = cc(appt.country) || residence;

    /* ---- insurance ---- */
    const insDoc = of('insurance')[0];
    const ins = insDoc ? insDoc.data.insurance : null;
    if (ins) {
      const curr = str(ins.coverageCurrency).toUpperCase() || 'EUR';
      const cov = num(ins.coverageAmount);
      const covEUR = cov === null ? null : B.convert(cov, curr, 'EUR', fx);
      if (cov !== null && covEUR === null) note('major', 'Insurance cover is in ' + curr + ' — could not convert to EUR', '', 'Check that the cover is at least €30,000.');
      c.insurance = { provider: str(ins.provider), holder: str(ins.insuredName), coverage: covEUR === null ? '' : Math.round(covEUR), coverageRaw: cov === null ? '' : cov, start: date(ins.start), end: date(ins.end), territory: ins.territory === 'unknown' ? '' : ins.territory, repatriation: ins.repatriation === 'unknown' ? '' : ins.repatriation, file: insDoc.fileName };
    }

    /* ---- occupation ---- */
    const empDoc = of('employment_letter')[0];
    const emp = empDoc ? empDoc.data : null;
    let status = '';
    if (emp) {
      const e = emp.employment || {};
      status = e.status && e.status !== 'unknown' ? e.status : 'employed';
      c.employment = {
        status, employer: str(e.employer), position: str(e.position), startDate: date(e.startDate), monthlySalary: num(e.monthlySalary),
        salaryCurrency: str(e.salaryCurrency).toUpperCase(), letterDate: date(emp.documentDate), leaveFrom: date(e.leaveFrom), leaveTo: date(e.leaveTo), returnDate: date(e.returnToWorkDate),
        file: empDoc.fileName,
      };
    } else {
      status = types.has('business_reg') ? 'self_employed' : types.has('enrollment') || types.has('i20') ? 'student' : types.has('pension') ? 'retired' : '';
      if (!status) {
        const declaredStatus = first(files, (f) => (f.data.employment && f.data.employment.status !== 'unknown' ? f.data.employment.status : ''));
        status = declaredStatus || '';
      }
      c.employment = { status };
    }

    /* ---- finances ---- */
    const bankDocs = of('bank_statement', 'sponsor_bank').filter((f) => f.data.bank);
    const curs = bankDocs.map((f) => str(f.data.bank.currency).toUpperCase()).filter(Boolean);
    const primary = curs.length ? curs.sort((a, b) => curs.filter((x) => x === b).length - curs.filter((x) => x === a).length)[0] : 'EGP';
    c.finances.currency = primary;
    if (fx && fx[primary]) {
      c.finances.rateEUR = primary === 'EUR' ? 1 : Math.round(fx[primary] * 10000) / 10000;
      c.finances.rateUSD = fx.USD ? Math.round((fx[primary] / fx.USD) * 10000) / 10000 : '';
    }
    bankDocs.forEach((f) => {
      const b = f.data.bank;
      const cur = str(b.currency).toUpperCase() || primary;
      const conv = (v) => (num(v) === null ? '' : cur === primary ? v : B.convert(v, cur, primary, fx));
      if (cur !== primary && !(fx && fx[cur] && fx[primary])) note('major', f.fileName + ': account in ' + cur + ' could not be converted', '', 'Live exchange rates are needed — check the internet connection.');
      const convOrBlank = (v) => {
        const r = conv(v);
        return r === null ? '' : typeof r === 'number' ? Math.round(r) : r;
      };
      c.finances.statements.push({
        bank: (str(b.bankName) || f.fileName) + (cur !== primary ? ' (' + cur + ' converted)' : ''),
        holder: str(b.accountHolder) || str(f.data.mainPersonName), from: date(b.periodFrom), to: date(b.periodTo), issued: date(f.data.documentDate),
        opening: convOrBlank(b.openingBalance), closing: convOrBlank(b.closingBalance), avgIncome: convOrBlank(b.averageMonthlyCredits),
        largestDeposit: convOrBlank(b.largestDeposit), largestDepositDate: date(b.largestDepositDate),
        depositExplained: /salary|payroll|pension|maturity|certificate|transfer from own|dividend/i.test(str(b.largestDepositDescription)),
        largestDepositRaw: num(b.largestDeposit) === null ? '' : b.largestDeposit, file: f.fileName,
      });
    });

    /* ---- ties ---- */
    const tie = (k) => files.some((f) => f.data.ties && f.data.ties[k] === 'yes');
    c.ties = { property: types.has('property_docs') || tie('ownsProperty'), spouseHome: tie('spouseStaysHome'), childrenHome: tie('childrenStayHome') };

    /* ---- history ---- */
    const refDecl = app('previousRefusalsDeclared');
    c.history.refusalsDeclared = refDecl || '';
    of('refusal_letter').forEach((f) => c.history.refusals.push({ country: cc(f.data.refusal.country) || cc(f.data.issuingCountry), date: date(f.data.refusal.date) || date(f.data.documentDate), reason: str(f.data.refusal.reason) }));
    const seenV = new Set();
    files.forEach((f) => (f.data.previousVisas || []).forEach((v) => {
      const k = cc(v.country) + '|' + date(v.validFrom);
      if (!cc(v.country) || seenV.has(k)) return;
      seenV.add(k);
      c.history.priorVisas.push({ country: cc(v.country), type: str(v.type), from: date(v.validFrom), to: date(v.validTo) });
    }));
    files.forEach((f) => (f.data.travelStamps || []).forEach((s) => {
      const country = cc(s.country);
      const a = date(s.entry);
      const b = date(s.exit);
      if (!a || !b) return;
      if (R.isSchengen(country)) {
        const visa = c.history.priorVisas.filter((v) => R.isSchengen(v.country) && v.from && v.from <= a && v.to >= a)[0];
        c.history.schengenStays.push({ entry: a, exit: b, visaValidUntil: visa ? visa.to : '' });
      } else if (country === 'US') c.history.usVisits.push({ entry: a, exit: b, authorizedUntil: '' });
      else if (country && country !== 'EG') (c.history.otherTrips = c.history.otherTrips || []).push({ country, entry: a, exit: b });
    }));

    /* ---- US specifics ---- */
    const dsDoc = of('ds160', 'ds260')[0];
    c.us.confirmation = dsDoc ? str(dsDoc.data.application.confirmationNumber) : '';
    c.us.formDate = dsDoc ? date(dsDoc.data.application.submittedOn) || date(dsDoc.data.documentDate) : '';
    c.us.interviewDate = date(appt.date);
    c.us.interviewCountry = cc(appt.country);
    c.us.socialMedia = app('socialMediaListed') || '';
    c.us.usAddress = app('usAddress') || (c.stays[0] ? c.stays[0].name + ', ' + c.stays[0].city : '');
    if (P === 'us_f1') {
      const i901 = of('i901_receipt')[0];
      c.us.f1 = {
        sevisId: str(student.sevisId), school: str(student.school), ds160School: dsDoc ? str(dsDoc.data.application.school) : '', i20Name: str(student.studentName),
        programStart: date(student.programStart), programEnd: date(student.programEnd), i20Cost: num(student.firstYearCostUSD),
        i901Paid: !!i901 || !!date(student.sevisFeePaidOn), i901Date: i901 ? date(i901.data.student.sevisFeePaidOn) || date(i901.data.documentDate) : date(student.sevisFeePaidOn),
        publicProfiles: true,
      };
    }
    if (P === 'us_iv') {
      const im = (k) => first(files, (f) => {
        const v = f.data.immigrant && f.data.immigrant[k];
        return v === 'unknown' || v === null ? '' : v;
      });
      const marriage = of('marriage_certificate')[0];
      const med = of('medical_exam')[0];
      c.us.iv = {
        category: str(im('category')).toUpperCase().replace(/[^A-Z0-9]/g, ''), petitionerName: str(im('petitionerName')), petitionerStatus: im('petitionerStatus') || '',
        marriageDate: date(im('marriageDate')) || (marriage ? date(marriage.data.documentDate) : ''),
        priorMarriage: types.has('divorce_docs') || !!date(im('priorMarriageEndDate')), priorMarriageEnd: date(im('priorMarriageEndDate')),
        medicalDate: date(im('medicalExamDate')) || (med ? date(med.data.documentDate) : ''), arrests: types.has('court_records'),
        residences: (first(appDocs, (f) => (f.data.application.countriesLivedIn && f.data.application.countriesLivedIn.length ? f.data.application.countriesLivedIn : null)) || [])
          .map((r) => ({ country: cc(r.country), from: date(r.from), to: date(r.to) })).filter((r) => r.country),
        policeCerts: of('police_certificates').map((f) => ({ country: cc(f.data.issuingCountry) || 'EG', issued: date(f.data.documentDate) })),
        i864: { income: im('sponsorIncomeUSD') === '' ? '' : im('sponsorIncomeUSD'), householdSize: im('householdSize') === '' ? '' : im('householdSize'), taxYear: im('taxYear') === '' ? '' : im('taxYear'), state: 'contiguous' },
      };
      if (!c.us.iv.residences.length && c.applicant.dob) c.us.iv.residences = [{ country: c.applicant.nationality || 'EG', from: c.applicant.dob, to: '' }];
    }

    /* ---- documents & per-file identity data ---- */
    const translationsFor = new Set(files.filter((f) => f.data.isTranslation && f.data.translationOf).map((f) => f.data.translationOf));
    files.forEach((f) => {
      const t = B.typeOf(f);
      const d = f.data;
      if (t !== 'other' && V.docs.catalog[t]) {
        const prev = c.documents[t];
        const issued = date(d.documentDate);
        const entryDoc = {
          present: true, form: d.isPhotocopy ? 'copy' : 'original', issued: prev && prev.issued > issued ? prev.issued : issued, issuer: cc(d.issuingCountry),
          language: d.isTranslation ? 'en' : str(d.language).toLowerCase().slice(0, 2), translation: d.isTranslation || translationsFor.has(t) ? 'certified' : 'none',
          legal: d.legalization.apostille ? 'apostille' : d.legalization.foreignMinistryStamp || d.legalization.embassyStamp ? 'chain' : 'none',
          chain: { issuer: d.legalization.issuerCertified, mfa: d.legalization.foreignMinistryStamp, embassy: d.legalization.embassyStamp },
          signed: d.signedOrStamped === 'unknown' ? '' : d.signedOrStamped, file: f.fileName,
        };
        if (!prev || (prev.form === 'copy' && entryDoc.form !== 'copy')) c.documents[t] = entryDoc;
        else if (entryDoc.translation === 'certified') prev.translation = 'certified';
      }
      c.docFiles.push({
        file: f.fileName, type: t, role: d.mainPersonRole, name: str(d.mainPersonName), passportNo: U.normId(d.passportNumberShown), dob: date(d.dateOfBirthShown),
      });
      (d.issues || []).forEach((i) => {
        const parts = String(i.text).split(' — ');
        const title = parts[0].replace(/\.$/, '');
        const rest = parts.slice(1).join(' — ');
        notes.push({ sev: i.severity, cat: 'Document review', title, detail: 'In ' + f.fileName + ' (' + (V.docs.catalog[t] || ['document'])[0].toLowerCase() + ').', fix: rest, ev: i.q ? [{ file: f.fileName, q: i.q, label: f.fileName }] : [] });
      });
      if (t === 'other' && !(d.issues || []).length) notes.push({ sev: 'info', cat: 'Document review', title: f.fileName + ' was not recognised as a standard visa document', detail: str(d.summary), fix: 'Set its type in the upload list if it is needed.' });
    });
    if (status && !c.employment.status) c.employment.status = status;
    c.employment.freelance = c.employment.status === 'self_employed' && files.some((f) => /freelanc|consultan|independent/i.test(((f.data.employment || {}).position || '') + ' ' + JSON.stringify(f.data.issues || [])));
    return c;
  };
})(typeof globalThis !== 'undefined' ? (globalThis.VFR = globalThis.VFR || {}) : (window.VFR = window.VFR || {}));
