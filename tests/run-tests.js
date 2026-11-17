/* Node test suite for the Visa File Review engine.  Run:  node tests/run-tests.js */
'use strict';
const path = require('path');
['ref-data', 'util', 'docs', 'engine', 'builder', 'samples'].forEach((f) => require(path.join(__dirname, '..', 'js', f + '.js')));
const V = globalThis.VFR;
const U = V.util;

let pass = 0;
let fail = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    failures.push(name + '\n    ' + e.message);
  }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'expected equal') + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
}
function ok(v, msg) {
  if (!v) throw new Error(msg || 'expected truthy');
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const run = (c) => V.engine.run(c);
const has = (rep, sev, re) => rep.findings.some((f) => f.sev === sev && re.test(f.title));
const titles = (rep) => rep.findings.map((f) => f.sev + ': ' + f.title).join('\n      ');
const sample = (k) => V.samples[k].data();

/* ---------------- utilities ---------------- */
test('MRZ check digits (ICAO 9303 specimen)', () => {
  eq(U.mrzCheck('L898902C3'), '6');
  eq(U.mrzCheck('740812'), '2');
  eq(U.mrzCheck('120415'), '9');
});
test('MRZ parse ICAO specimen', () => {
  const m = U.parseMRZ('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', 'L898902C36UTO7408122F1204159ZE184226B<<<<<10', U.day('2010-01-01'));
  ok(m.ok, m.errors.join(';'));
  eq(m.fields.surname, 'ERIKSSON');
  eq(m.fields.givenNames, 'ANNA MARIA');
  eq(m.fields.number, 'L898902C3');
  eq(U.iso(m.fields.dob), '1974-08-12');
  eq(U.iso(m.fields.expiry), '2012-04-15');
});
test('MRZ build → parse round trip', () => {
  const [l1, l2] = U.buildMRZ({ issuer: 'EG', surname: 'HASSAN', givenNames: 'AHMED MOHAMED', number: 'A12345678', nationality: 'EG', dob: '1988-04-12', sex: 'M', expiry: '2030-01-31' });
  eq(l1.length, 44);
  eq(l2.length, 44);
  const m = U.parseMRZ(l1, l2, U.day('2026-11-17'));
  ok(m.ok, m.errors.join(';'));
  eq(m.fields.nationality, 'EG');
  eq(U.iso(m.fields.dob), '1988-04-12');
  eq(U.iso(m.fields.expiry), '2030-01-31');
});
test('MRZ detects a corrupted digit', () => {
  const [l1, l2] = U.buildMRZ({ issuer: 'EG', surname: 'A', givenNames: 'B', number: 'A12345678', nationality: 'EG', dob: '1990-01-01', sex: 'F', expiry: '2030-01-01' });
  const bad = l2.slice(0, 2) + (l2[2] === '9' ? '8' : '9') + l2.slice(3);
  ok(!U.parseMRZ(l1, bad).ok);
});
test('MRZ wrong length reported', () => ok(U.parseMRZ('P<EGY', 'X').errors.length === 1));
test('Name comparison', () => {
  eq(U.compareNames('Ahmed Mohamed Hassan', 'AHMED MOHAMED HASSAN').status, 'match');
  eq(U.compareNames('Ahmed Mohamed Hassan', 'Hassan Ahmed Mohamed').status, 'order');
  eq(U.compareNames('Ahmed Mohamed Hassan', 'Ahmed Hassan').status, 'partial');
  eq(U.compareNames('Ahmed Mohamed Hassan', 'Ahmed Mohammed Hassan').status, 'variant');
  eq(U.compareNames('Mona Mahmoud Ali', 'Muna Mahmoud Aly').status, 'variant');
  eq(U.compareNames('Ahmed Mohamed Hassan', 'Sara Adel Ibrahim').status, 'mismatch');
  eq(U.compareNames('Élodie Dupont', 'ELODIE DUPONT').status, 'match');
});
test('Date helpers', () => {
  eq(U.iso(U.addMonths(U.day('2026-01-31'), 1)), '2026-02-28');
  eq(U.iso(U.addMonths(U.day('2024-02-29'), 12)), '2025-02-28');
  eq(U.years(U.day('2008-12-21'), U.day('2026-12-20')), 17);
  eq(U.years(U.day('2008-12-20'), U.day('2026-12-20')), 18);
  eq(U.day('2026-02-30'), null);
});
test('Date extraction from document text', () => {
  const d = U.extractDates('Departure 20 DEC 2026, return 03/01/2027. Issued 2026-11-10. Valid March 5, 2027. 20DEC26');
  ok(d.has(U.day('2026-12-20')), '20 DEC 2026');
  ok(d.has(U.day('2027-01-03')), 'dd/mm/yyyy');
  ok(d.has(U.day('2026-11-10')), 'iso');
  ok(d.has(U.day('2027-03-05')), 'Month d, yyyy');
});

/* ---------------- sample files ---------------- */
Object.keys(V.samples).forEach((k) => {
  test('Sample "' + V.samples[k].title + '" meets expectations', () => {
    const s = V.samples[k];
    const rep = run(s.data());
    const e = s.expect;
    ['critical', 'major', 'minor'].forEach((sev) => {
      if (e[sev] !== undefined && rep.counts[sev] !== e[sev]) throw new Error(sev + ' = ' + rep.counts[sev] + ' (want ' + e[sev] + ')\n      ' + titles(rep));
    });
    if (e.minCritical !== undefined && rep.counts.critical < e.minCritical) throw new Error('only ' + rep.counts.critical + ' critical\n      ' + titles(rep));
  });
});

test('Problem file: each planted defect is detected', () => {
  const rep = run(sample('schengen_problems'));
  const want = [
    ['critical', /Wrong consulate/], ['critical', /Inbound flight date/], ['critical', /exceed the approved leave/], ['critical', /Refusals exist/],
    ['critical', /below €30,000/], ['critical', /does not cover the whole stay/], ['critical', /MRZ/], ['critical', /Passport not valid 3 months/],
    ['major', /large unexplained deposit/], ['major', /stale/], ['major', /Name spelling differs/], ['major', /old passport number/],
    ['major', /nights? without accommodation/], ['major', /Employment letter is old/], ['major', /Photo/i], ['critical', /Missing: Host/],
    ['info', /Birth certificate: legalization/], ['major', /needs a translation/], ['major', /Recent refusal/],
  ];
  const missing = want.filter(([s, re]) => !has(rep, s, re));
  if (missing.length) throw new Error('not detected: ' + missing.map((m) => m[0] + ' ' + m[1]).join(', ') + '\n      ' + titles(rep));
});

/* ---------------- Schengen rules ---------------- */
test('Schengen: 90/180 rule with previous stays', () => {
  const c = sample('schengen_clean');
  c.history.schengenStays = [{ entry: '2026-08-01', exit: '2026-10-25', visaValidUntil: '2026-12-31' }];
  const rep = run(c);
  ok(has(rep, 'critical', /90\/180/), titles(rep));
});
test('Schengen: stay over 90 days', () => {
  const c = sample('schengen_clean');
  c.trip.exitDate = '2027-04-01';
  ok(has(run(c), 'critical', /exceeds 90 days/));
});
test('Schengen: applying more than 6 months ahead', () => {
  const c = sample('schengen_clean');
  c.meta.submissionDate = '2026-05-01';
  ok(has(run(c), 'critical', /too early/));
});
test('Schengen: less than 15 days before travel', () => {
  const c = sample('schengen_clean');
  c.meta.submissionDate = '2026-12-10';
  ok(has(run(c), 'major', /less than 15 days/));
});
test('Schengen: main destination tie → first entry', () => {
  const c = sample('schengen_clean');
  c.trip.destinations = [{ country: 'FR', from: '2026-12-20', to: '2026-12-27' }, { country: 'IT', from: '2026-12-27', to: '2027-01-03' }];
  const rep = run(c);
  eq(rep.metrics.mainDestination, 'FR');
  ok(!has(rep, 'critical', /Wrong consulate/));
});
test('Schengen: single entry with exit mid-trip', () => {
  const c = sample('schengen_clean');
  c.trip.entries = 'single';
  c.flights[1] = { date: '2026-12-28', from: 'FR', to: 'GB', flightNo: 'BA1' };
  c.flights.splice(2, 0, { date: '2026-12-30', from: 'GB', to: 'IT', flightNo: 'BA2' });
  ok(has(run(c), 'critical', /single entry/));
});
test('Schengen: insufficient funds (France, hotel)', () => {
  const c = sample('schengen_clean');
  c.finances.statements[0].closing = 30000; // ≈ €545 < €975
  c.finances.statements[0].opening = 30000;
  ok(has(run(c), 'critical', /Insufficient funds/));
});
test('Schengen: missing exchange rate', () => {
  const c = sample('schengen_clean');
  c.finances.rateEUR = '';
  ok(has(run(c), 'major', /Exchange rate missing/));
});
test('Schengen: Italy funds table', () => {
  const f = V.ref.schengenFunds.IT.calc;
  eq(f(3), 269.6);
  eq(Math.round(f(15)), Math.round(51.64 + 36.67 * 15));
});
test('Schengen: Egyptian civil doc needs MFA + embassy legalization', () => {
  const c = sample('schengen_clean');
  c.ties.spouseHome = false;
  c.trip.fundedBy = 'sponsor';
  c.finances.sponsor = { name: 'Laila Hassan', relationship: 'spouse' };
  c.documents.marriage_certificate = { present: true, form: 'original', language: 'en', legal: 'chain', chain: { issuer: true, mfa: true } };
  const rep = run(c);
  const f = rep.findings.find((x) => /legalization chain incomplete/.test(x.title));
  ok(f && /embassy/.test(f.detail), titles(rep));
  c.documents.marriage_certificate.chain.embassy = true;
  ok(!has(run(c), 'major', /legalization chain incomplete/));
});
test('Schengen: weekend gap in leave is only minor (Egypt Fri/Sat weekend)', () => {
  const c = sample('schengen_clean');
  // 2027-01-01 is a Friday, 2027-01-02 a Saturday
  c.trip.exitDate = '2027-01-02';
  c.trip.destinations[1].to = '2027-01-02';
  c.flights[2].date = '2027-01-02';
  c.stays[1].checkOut = '2027-01-02';
  c.employment.leaveTo = '2026-12-31';
  c.employment.returnDate = '2027-01-03';
  const rep = run(c);
  ok(has(rep, 'minor', /weekend/), titles(rep));
  ok(!has(rep, 'critical', /exceed the approved leave/));
});
test('Schengen: accommodation gap detected', () => {
  const c = sample('schengen_clean');
  c.stays[1].checkIn = '2026-12-30';
  const rep = run(c);
  ok(has(rep, 'major', /2 nights without accommodation/), titles(rep));
});
test('Schengen: return flight date mismatch', () => {
  const c = sample('schengen_clean');
  c.flights[2].date = '2027-01-04';
  ok(has(run(c), 'critical', /Return flight date/));
});
test('Schengen: wrong passport number on a document', () => {
  const c = sample('schengen_clean');
  c.documents.insurance.passportNo = 'A99999999';
  ok(has(run(c), 'critical', /Passport number on Travel medical insurance/));
});
test('Schengen: account in a stranger\'s name', () => {
  const c = sample('schengen_clean');
  c.finances.statements[0].holder = 'Karim Fathy';
  ok(has(run(c), 'critical', /someone else/));
});

/* ---------------- USA rules ---------------- */
test('US B1/B2: interview outside nationality/residence', () => {
  const c = sample('us_b1b2_clean');
  c.us.interviewCountry = 'AE';
  ok(has(run(c), 'major', /Interview outside/));
});
test('US B1/B2: previous overstay (10-year bar)', () => {
  const c = sample('us_b1b2_clean');
  c.history.usVisits = [{ entry: '2022-01-01', exit: '2023-08-01', authorizedUntil: '2022-06-30' }];
  const rep = run(c);
  const f = rep.findings.find((x) => /overstay/.test(x.title));
  ok(f && f.sev === 'critical' && /10-year/.test(f.detail), titles(rep));
});
test('US B1/B2: passport < 6 months beyond stay', () => {
  const c = sample('us_b1b2_clean');
  c.passport.expiryDate = '2027-06-01';
  delete c.passport.mrz1;
  delete c.passport.mrz2;
  ok(has(run(c), 'major', /6 months beyond/));
});
test('US B1/B2: hidden refusal = misrepresentation', () => {
  const c = sample('us_b1b2_clean');
  c.history.refusals = [{ country: 'US', date: '2025-01-10', reason: '214(b)' }];
  const rep = run(c);
  const f = rep.findings.find((x) => /Refusals exist/.test(x.title));
  ok(f && /212\(a\)\(6\)\(C\)/.test(f.detail));
});
test('US F-1: entry more than 30 days before program', () => {
  const c = sample('us_f1');
  c.trip.entryDate = '2027-07-01';
  ok(has(run(c), 'critical', /30 days before/));
});
test('US F-1: I-901 unpaid & funds short', () => {
  const c = sample('us_f1');
  c.us.f1.i901Paid = false;
  c.us.f1.i20Cost = 150000;
  const rep = run(c);
  ok(has(rep, 'critical', /I-901/));
  ok(has(rep, 'critical', /Insufficient funds/));
});
test('US F-1: bad SEVIS id format', () => {
  const c = sample('us_f1');
  c.us.f1.sevisId = '12345';
  ok(has(run(c), 'major', /SEVIS ID format/));
});
test('US IV: I-864 below 125% of poverty guideline', () => {
  const c = sample('us_iv_cr1');
  c.us.iv.i864.income = 20000;
  ok(has(run(c), 'critical', /below the poverty-guideline/));
  c.us.iv.i864.assets = 30000; // shortfall 6,437.5 × 3 = 19,312
  ok(has(run(c), 'info', /covered by assets/));
});
test('US IV: police certificate required for country lived in > 12 months', () => {
  const c = sample('us_iv_cr1');
  c.us.iv.residences = [{ country: 'EG', from: '1996-03-03', to: '2020-01-01' }, { country: 'SA', from: '2020-01-01', to: '2022-06-01' }, { country: 'EG', from: '2022-06-01', to: '' }];
  const rep = run(c);
  ok(has(rep, 'critical', /Police certificate missing: Saudi Arabia/), titles(rep));
});
test('US IV: civil document only a photocopy', () => {
  const c = sample('us_iv_cr1');
  c.documents.birth_certificate.form = 'copy';
  ok(has(run(c), 'critical', /only a plain copy/));
});
test('US IV: Arabic document without translation', () => {
  const c = sample('us_iv_cr1');
  c.documents.marriage_certificate.translation = 'none';
  ok(has(run(c), 'critical', /needs a translation/));
});
test('US IV: IR1 chosen but married < 2 years', () => {
  const c = sample('us_iv_cr1');
  c.us.iv.category = 'IR1';
  ok(has(run(c), 'major', /should be CR1/));
});
test('US IV: F2A with US-citizen petitioner', () => {
  const c = sample('us_iv_cr1');
  c.us.iv.category = 'F2A';
  ok(has(run(c), 'critical', /F2A is for/));
});
test('US IV: prior marriage ended after current marriage', () => {
  const c = sample('us_iv_cr1');
  c.us.iv.priorMarriage = true;
  c.us.iv.priorMarriageEnd = '2025-09-01';
  c.documents.divorce_docs = { present: true, form: 'original' };
  ok(has(run(c), 'critical', /Prior marriage ended after/));
});

/* ---------------- document scan ---------------- */
test('Scan: matching flight document passes', () => {
  const c = sample('schengen_clean');
  c.scans = [{ fileName: 'ticket.pdf', docType: 'flight', text: 'E-TICKET\nPassenger: HASSAN/AHMED MOHAMED MR\nPassport No: A12345678\nMS799 CAI-CDG 20DEC 2026\nMS792 FCO-CAI 03 JAN 2027' }];
  const rep = run(c);
  eq(rep.scans[0].checks.filter((x) => x.st === 'bad').length, 0, JSON.stringify(rep.scans[0].checks));
  ok(!rep.findings.some((f) => f.cat === 'Document scan'), titles(rep));
});
test('Scan: wrong passport number and wrong dates are flagged', () => {
  const c = sample('schengen_clean');
  c.scans = [{ fileName: 'insurance.pdf', docType: 'insurance', text: 'Travel insurance certificate\nInsured: AHMED MOHAMMED HASSAN\nPassport number: A87654321\nFrom 21/12/2026 to 02/01/2027' }];
  const rep = run(c);
  ok(has(rep, 'critical', /different passport number/), titles(rep));
  ok(has(rep, 'major', /cover start date/), titles(rep));
  ok(has(rep, 'major', /spelled differently/), titles(rep));
});
test('Scan: passport copy MRZ verified', () => {
  const c = sample('schengen_clean');
  c.scans = [{ fileName: 'passport.pdf', docType: 'passport', text: 'ARAB REPUBLIC OF EGYPT\n' + c.passport.mrz1 + '\n' + c.passport.mrz2 + '\n12 APR 1988 31 JAN 2030' }];
  const rep = run(c);
  const mrz = rep.scans[0].checks.find((x) => x.what === 'MRZ');
  ok(mrz && mrz.st === 'ok', JSON.stringify(rep.scans[0].checks));
});

/* ---------------- upload pipeline: extractions → builder → engine ---------------- */
function ext(over) {
  const d = V.builder.blank();
  const merge = (a, b) => {
    Object.keys(b).forEach((k) => (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] ? merge(a[k], b[k]) : (a[k] = b[k])));
    return a;
  };
  return merge(d, over);
}
function schengenUpload() {
  const [m1, m2] = U.buildMRZ({ issuer: 'EG', surname: 'HASSAN', givenNames: 'AHMED MOHAMED', number: 'A12345678', nationality: 'EG', dob: '1988-04-12', sex: 'M', expiry: '2030-01-31' });
  const me = { mainPersonName: 'AHMED MOHAMED HASSAN', mainPersonRole: 'applicant', language: 'en', signedOrStamped: 'yes' };
  const doc = (fileName, extra) => ({ fileName, data: ext(Object.assign({}, me, extra)) });
  return [
    doc('passport.pdf', { docType: 'passport', passport: { surname: 'HASSAN', givenNames: 'AHMED MOHAMED', number: 'A12345678', nationality: 'EG', sex: 'M', dateOfBirth: '1988-04-12', issueDate: '2023-02-01', expiryDate: '2030-01-31', issuingCountry: 'EG', mrzLine1: m1, mrzLine2: m2, blankPagesVisible: 10 } }),
    doc('application.pdf', { docType: 'application_form', passportNumberShown: 'A12345678', dateOfBirthShown: '1988-04-12', documentDate: '2026-11-15',
      application: { visaProgram: 'schengen', memberStateApplied: 'FR', purpose: 'tourism', entryDate: '2026-12-20', exitDate: '2027-01-03', entriesRequested: 'multiple', previousRefusalsDeclared: 'no', fundedBy: 'self', residenceCountry: 'EG', maritalStatus: 'married',
        destinations: [{ country: 'FR', city: 'Paris', from: '2026-12-20', to: '2026-12-28' }, { country: 'IT', city: 'Rome', from: '2026-12-28', to: '2027-01-03' }] } }),
    doc('ticket.pdf', { docType: 'flight', passportNumberShown: 'A12345678', flights: [
      { departureDate: '2026-12-20', arrivalDate: '2026-12-20', fromAirport: 'CAI', toAirport: 'CDG', fromCountry: 'EG', toCountry: 'FR', flightNumber: 'MS799', passengerName: 'HASSAN/AHMED MOHAMED MR' },
      { departureDate: '2026-12-28', arrivalDate: '2026-12-28', fromAirport: 'CDG', toAirport: 'FCO', fromCountry: 'FR', toCountry: 'IT', flightNumber: 'AF1404', passengerName: 'HASSAN/AHMED MOHAMED MR' },
      { departureDate: '2027-01-03', arrivalDate: '2027-01-03', fromAirport: 'FCO', toAirport: 'CAI', fromCountry: 'IT', toCountry: 'EG', flightNumber: 'MS792', passengerName: 'HASSAN/AHMED MOHAMED MR' }] }),
    doc('hotels.pdf', { docType: 'accommodation', stays: [
      { propertyName: 'Hotel Lumiere', city: 'Paris', country: 'FR', checkIn: '2026-12-20', checkOut: '2026-12-28', guestName: 'Ahmed Mohamed Hassan' },
      { propertyName: 'Hotel Roma Centro', city: 'Rome', country: 'IT', checkIn: '2026-12-28', checkOut: '2027-01-03', guestName: 'Ahmed Mohamed Hassan' }] }),
    doc('insurance.pdf', { docType: 'insurance', passportNumberShown: 'A12345678', insurance: { insuredName: 'AHMED MOHAMED HASSAN', provider: 'AXA', coverageAmount: 50000, coverageCurrency: 'EUR', start: '2026-12-20', end: '2027-01-18', territory: 'schengen', repatriation: 'yes' } }),
    doc('bank.pdf', { docType: 'bank_statement', documentDate: '2026-11-15', bank: { bankName: 'CIB', accountHolder: 'AHMED MOHAMED HASSAN', currency: 'EGP', periodFrom: '2026-05-15', periodTo: '2026-11-14', openingBalance: 600000, closingBalance: 780000, averageMonthlyCredits: 45000, largestDeposit: 45000, largestDepositDate: '2026-11-01', largestDepositDescription: 'Salary transfer' } }),
    doc('hr.pdf', { docType: 'employment_letter', documentDate: '2026-11-10', employment: { status: 'employed', employer: 'Nile Tech', position: 'Engineer', employeeName: 'AHMED MOHAMED HASSAN', startDate: '2019-03-01', monthlySalary: 45000, salaryCurrency: 'EGP', leaveFrom: '2026-12-20', leaveTo: '2027-01-04', returnToWorkDate: '2027-01-05' } }),
    doc('cover.pdf', { docType: 'cover_letter', ties: { ownsProperty: 'yes', spouseStaysHome: 'yes', childrenStayHome: 'yes' } }),
    doc('itinerary.pdf', { docType: 'itinerary' }),
    doc('visas.pdf', { docType: 'prev_visas', previousVisas: [{ country: 'FR', type: 'C', validFrom: '2024-06-25', validTo: '2024-07-20' }], travelStamps: [{ country: 'FR', entry: '2024-07-01', exit: '2024-07-10' }] }),
    { fileName: 'photo.jpg', data: ext({ docType: 'photo', documentDate: '2026-11-01' }) },
    doc('fee.pdf', { docType: 'fee_receipt' }),
    doc('payslips.pdf', { docType: 'payslips' }),
    doc('social-insurance.pdf', { docType: 'insurance_print', language: 'ar' }),
    doc('social-insurance-EN.pdf', { docType: 'insurance_print', isTranslation: true, translationOf: 'insurance_print' }),
    doc('flat-contract.pdf', { docType: 'property_docs' }),
  ];
}
const FX = { EUR: 1, EGP: 55, USD: 1.1 };
const buildRun = (files, o) => run(V.builder.build(files, Object.assign({ submissionDate: '2026-11-17', fx: FX }, o || {})));

test('Pipeline: clean uploaded Schengen file → ready', () => {
  const rep = buildRun(schengenUpload());
  eq(rep.program, 'schengen');
  if (rep.counts.critical || rep.counts.major || rep.counts.minor) throw new Error(JSON.stringify(rep.counts) + '\n      ' + titles(rep));
  eq(rep.metrics.mainDestination, 'FR');
  ok(Math.abs(rep.metrics.fundsAvailable - 780000 / 55) < 1, 'funds converted with live rate');
});
test('Pipeline: program auto-detection', () => {
  eq(V.builder.detectProgram([{ data: ext({ docType: 'i20' }) }]), 'us_f1');
  eq(V.builder.detectProgram([{ data: ext({ docType: 'ds160' }) }]), 'us_b1b2');
  eq(V.builder.detectProgram([{ data: ext({ docType: 'i864' }) }]), 'us_iv');
  eq(V.builder.detectProgram([{ data: ext({ docType: 'flight' }) }]), 'schengen');
});
test('Pipeline: trip dates and consulate derived when no application form', () => {
  const files = schengenUpload().filter((f) => f.fileName !== 'application.pdf');
  const c = V.builder.build(files, { submissionDate: '2026-11-17', fx: FX });
  eq([c.trip.entryDate, c.trip.exitDate], ['2026-12-20', '2027-01-03']);
  eq(c.meta.consulateOf, 'FR');
  eq(c.trip.destinations.map((d) => d.country), ['FR', 'IT']);
});
test('Pipeline: planted problems in uploaded documents are caught', () => {
  const files = schengenUpload();
  const get = (n) => files.find((f) => f.fileName === n).data;
  get('hotels.pdf').stays[1].guestName = 'Ahmed Mohammed Hasan';
  get('hr.pdf').signedOrStamped = 'no';
  get('hr.pdf').employment.leaveTo = '2026-12-30';
  get('insurance.pdf').passportNumberShown = 'A99999999';
  get('bank.pdf').issues = [{ severity: 'critical', text: 'Balance figures appear altered' }];
  get('application.pdf').application.memberStateApplied = 'IT';
  const rep = buildRun(files);
  ok(has(rep, 'major', /Name spelling differs/), titles(rep));
  ok(has(rep, 'major', /not signed \/ stamped/), titles(rep));
  ok(has(rep, 'critical', /exceed the approved leave/), titles(rep));
  ok(has(rep, 'critical', /Passport number on insurance.pdf/), titles(rep));
  ok(has(rep, 'critical', /appear altered/), titles(rep));
  ok(has(rep, 'critical', /Wrong consulate/), titles(rep));
});
test('Pipeline: statement in USD converted to EGP', () => {
  const files = schengenUpload();
  files.push({ fileName: 'usd.pdf', data: ext({ docType: 'bank_statement', mainPersonName: 'AHMED MOHAMED HASSAN', mainPersonRole: 'applicant', signedOrStamped: 'yes', documentDate: '2026-11-15',
    bank: { bankName: 'HSBC', accountHolder: 'AHMED MOHAMED HASSAN', currency: 'USD', periodFrom: '2026-05-15', periodTo: '2026-11-14', openingBalance: 9000, closingBalance: 10000, averageMonthlyCredits: 0, largestDeposit: 0 } }) });
  const c = V.builder.build(files, { submissionDate: '2026-11-17', fx: FX });
  eq(c.finances.statements.find((s) => /HSBC/.test(s.bank)).closing, 500000); // 10,000 USD × 50 EGP
});
test('Pipeline: missing passport upload is critical', () => {
  ok(has(buildRun(schengenUpload().filter((f) => f.fileName !== 'passport.pdf')), 'critical', /No passport bio page/));
});
test('Pipeline: empty and junk extractions never throw', () => {
  V.builder.build([], {});
  run(V.builder.build([{ fileName: 'x', data: V.builder.blank() }], {}));
  run(V.builder.build([{ fileName: 'x', data: ext({ docType: 'passport', passport: { number: 'garbage', mrzLine1: 'xx' } }) }, { fileName: 'y', data: ext({ docType: 'bank_statement', bank: { currency: 'XYZ', closingBalance: 5 } }) }], {}));
});

/* ---------------- rules requested by the agency ---------------- */
test('Visa fee receipt and photo are not required documents', () => {
  ['schengen', 'us_b1b2', 'us_f1', 'us_iv'].forEach((p) => {
    const ids = V.docs.required({ program: p }).map((d) => d.id);
    ok(ids.indexOf('fee_receipt') === -1 && ids.indexOf('photo') === -1, p + ': ' + ids.join(','));
  });
});
test('Self-employed with an HR / company letter: no commercial register or tax card asked', () => {
  const c = { program: 'schengen', employment: { status: 'self_employed' }, documents: { employment_letter: { present: true } } };
  const ids = V.docs.required(c).map((d) => d.id);
  ok(ids.indexOf('business_reg') === -1 && ids.indexOf('tax_return') === -1, ids.join(','));
  const ids2 = V.docs.required({ program: 'schengen', employment: { status: 'self_employed' }, documents: {} }).map((d) => d.id);
  ok(ids2.indexOf('business_reg') !== -1, 'without an HR letter the commercial register is still required');
});
test('Cover letter / itinerary may use the full name or another spelling', () => {
  const files = schengenUpload();
  const cover = files.find((f) => f.fileName === 'cover.pdf').data;
  cover.mainPersonName = 'Ahmad Mohammed Hasan';
  const rep = buildRun(files);
  ok(!rep.findings.some((f) => /cover\.pdf/.test(f.title)), titles(rep));
  files.find((f) => f.fileName === 'hr.pdf').data.mainPersonName = 'Ahmad Mohammed Hasan';
  ok(has(buildRun(files), 'major', /Name spelling differs on hr\.pdf/), 'official letters are still checked');
});
test('Findings carry pictures (file + value) for the wrong fields', () => {
  const files = schengenUpload();
  files.find((f) => f.fileName === 'application.pdf').data.application.entryDate = '2026-12-18';
  files.find((f) => f.fileName === 'hr.pdf').data.mainPersonName = 'Ahmad Mohammed Hasan';
  const rep = buildRun(files);
  const dates = rep.findings.find((f) => /Travel dates are not the same/.test(f.title));
  ok(dates && dates.ev.some((e) => e.file === 'application.pdf' && e.q.date === '2026-12-18') && dates.ev.some((e) => e.file === 'ticket.pdf'), JSON.stringify(dates && dates.ev));
  const name = rep.findings.find((f) => /Name spelling differs on hr\.pdf/.test(f.title));
  ok(name && name.ev.some((e) => e.file === 'hr.pdf' && e.q.text === 'Ahmad Mohammed Hasan') && name.ev.some((e) => e.file === 'passport.pdf'), JSON.stringify(name && name.ev));
});

/* ---------------- robustness & speed ---------------- */
test('Engine survives empty / partial input', () => {
  ['schengen', 'us_b1b2', 'us_f1', 'us_iv'].forEach((p) => {
    const r = run({ program: p });
    ok(r.counts.critical > 0);
    run({ program: p, applicant: {}, trip: { destinations: [{}] }, flights: [{}], stays: [{}], finances: { statements: [{}] }, documents: { passport: {} }, scans: [{ fileName: 'x' }] });
  });
  run(undefined);
});
test('Fuzz: random field deletion never throws', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  Object.keys(V.samples).forEach((k) => {
    for (let i = 0; i < 60; i++) {
      const c = sample(k);
      const walk = (o) => Object.keys(o).forEach((key) => {
        if (rnd() < 0.15) delete o[key];
        else if (o[key] && typeof o[key] === 'object') walk(o[key]);
        else if (rnd() < 0.05) o[key] = rnd() < 0.5 ? '' : 'garbage';
      });
      walk(c);
      run(c);
    }
  });
});
test('Speed: average review < 10 ms', () => {
  const keys = Object.keys(V.samples);
  const t = Date.now();
  const N = 300;
  for (let i = 0; i < N; i++) run(sample(keys[i % keys.length]));
  const avg = (Date.now() - t) / N;
  ok(avg < 10, 'avg ' + avg.toFixed(2) + ' ms');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) {
  console.log('\nFailures:\n  ' + failures.join('\n  '));
  process.exit(1);
}
