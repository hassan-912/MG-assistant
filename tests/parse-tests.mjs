// Tests for the free local document reader (synthetic documents in the formats seen in Egyptian visa files).
import { parseDocument, classify, datesIn, findMrz } from '../lib/parse.mjs';
import { docxText } from '../lib/docx.mjs';
import zlib from 'node:zlib';

const V = globalThis.VFR;
const U = V.util;
let pass = 0;
let fail = 0;
const fails = [];
const test = (name, fn) => {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    fails.push(name + '\n    ' + e.message);
  }
};
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));
};
const ok = (v, m) => {
  if (!v) throw new Error(m || 'expected true');
};
const read = (text, extra) => Object.assign({ text, mrzText: '', annots: [], ocrPages: 0, confidence: 100 }, extra || {});

test('dates: day-first numeric, ISO with slashes, written months', () => {
  const d = datesIn('From 2022/05/29 To 2029/05/28 · 16/08/1976 · Saturday 9 January 2027 · From Saturday, January 9, 2027 · 10-11-2026').map((x) => U.iso(x.day));
  eq(d, ['2022-05-29', '2029-05-28', '1976-08-16', '2027-01-09', '2027-01-09', '2026-11-10']);
});

test('MRZ: OCR noise (spaces, K instead of <) is repaired and validated', () => {
  const [l1, l2] = U.buildMRZ({ issuer: 'EG', surname: 'OKILY', givenNames: 'SARA MOUSTAFA', number: 'A12345678', nationality: 'EG', dob: '1980-02-03', sex: 'F', expiry: '2031-01-01' });
  const noisy = l2.slice(0, 20) + ' ' + l2.slice(20, 33) + 'K' + l2.slice(34);
  const m = findMrz(l1.slice(0, 40), noisy);
  ok(m && m.m.ok, m && m.m.errors.join(';'));
  eq(m.m.fields.number, 'A12345678');
});

test('classify: typical documents', () => {
  eq(classify('EGYPTAIR - confirmation.pdf', 'EGYPTAIR reservation number: XD5HM6\nItinerary\nCairo Intl ( CAI )\nEgyptair (MS 797)', false), 'flight');
  eq(classify('booking.pdf', 'Your stay at VIENNA\nHotel Mercure\nReservation confirmed\nCHECK-IN FROM 15:00', false), 'accommodation');
  eq(classify('x.pdf', 'Travel insurance Policy Schedule\nThe Insured Name : A B\nCover Limit : 30,000 Euro', false), 'insurance');
  eq(classify('Travel Itinerary.docx', 'Travel Itinerary – Vienna\n9 January 2027 – Arrival\n10 January 2027 – City\n11 January 2027 – Palace\nhotel check-in', false), 'itinerary');
  eq(classify('scan.pdf', 'whatever', true), 'passport');
  eq(classify('client.pdf', 'MG visa consultancy\nClient Information\nConsultant Name : X', false), 'internal');
});

test('flight booking: legs, flight numbers, passenger; on hold is accepted', () => {
  const t = 'BOOKING ON HOLD EGP 42,086.00\n1 Adult EGP 42,086.00\nhttps://onlinebooking.example/x\nReservation name: Hassan\nDate of issue: 08 Nov 2026\n Itinerary\n Cairo - Vienna\nSaturday 9 January 2027\n11:50 Cairo\nCairo Intl ( CAI )\n14:30 Vienna\nSchwechat Intl ( VIE )\nA I R L I N E Egyptair (MS 797)\n Vienna - Cairo\nSaturday 16 January 2027\n15:30 Vienna\nSchwechat Intl ( VIE )\n19:55 Cairo\nCairo Intl ( CAI )\nA I R L I N E Egyptair (MS 798)\n 1 Traveller ( 1 Adult )\nADULT\nSara Hassan CONTACT INFORMATION\n';
  const d = parseDocument('EGYPTAIR.pdf', read(t));
  eq(d.docType, 'flight');
  eq(d.flights.map((f) => [f.departureDate, f.fromCountry, f.toCountry, f.flightNumber]), [['2027-01-09', 'EG', 'AT', 'MS 797'], ['2027-01-16', 'AT', 'EG', 'MS 798']]);
  eq(d.flights[0].passengerName, 'Sara Hassan');
  eq(d.issues.length, 0, 'a booking on hold is fine — no issue expected');
});

test('hotel booking: dates, nights, guest, country', () => {
  const t = 'Your stay at VIENNA\nHotel Mercure Wien City\nReservation confirmed and guaranteed\nDetails of your booking Hollandstrasse 3, 1020, VIENNA, Austria\n7 nights | 1 adult\nReservation made by: SARA HASSAN\nFrom Saturday, January 9, 2027\nCHECK-IN FROM 15:00\nTo Saturday, January 16, 2027\nCHECK-OUT BY 12:00\nNo cancellation charge applies up to 1 day prior to arrival.';
  const d = parseDocument('accor-booking.pdf', read(t));
  eq(d.stays[0], { propertyName: 'Hotel Mercure Wien City', city: 'Vienna', country: 'AT', checkIn: '2027-01-09', checkOut: '2027-01-16', guestName: 'SARA HASSAN' });
  eq(d.issues.length, 0, JSON.stringify(d.issues));
});

test('insurance: holder, passport, period, cover, territory, repatriation', () => {
  const t = 'Travel insurance Policy Schedule\nThe Insured Name : SARA HASSAN\nInsured Passport No. : A12345678\nInsurance Period : from 2026/12/01 To 2027/02/28\nTerritorial limit : Worldwide Excluding Egypt\nCover Limit : 30,000 Euro\nRepatriation of mortal remains.\nIssued : 2026/11/01';
  const d = parseDocument('policy.pdf', read(t));
  const I = d.insurance;
  eq([I.insuredName, d.passportNumberShown, I.start, I.end, I.coverageAmount, I.coverageCurrency, I.territory, I.repatriation], ['SARA HASSAN', 'A12345678', '2026-12-01', '2027-02-28', 30000, 'EUR', 'worldwide', 'yes']);
});

test('HR letter: freelance + cash income are flagged', () => {
  const t = 'ACME\nPharmaceuticals\nDate: 15/09/2026\nTO WHOM IT MAY CONCERN\nThis letter is to confirm that Ms. Sara Hassan has been providing freelance consultancy services to Acme Company in the capacity of Consultancy Role.\nHer consultancy fees are paid by the company in cash.';
  const d = parseDocument('HR.jpeg', read(t, { ocrPages: 1, confidence: 90 }));
  eq([d.docType, d.employment.status, d.mainPersonName, d.documentDate, d.employment.employer], ['employment_letter', 'self_employed', 'Sara Hassan', '2026-09-15', 'Acme Company']);
  ok(d.issues.some((i) => /cash/.test(i.text)) && d.issues.some((i) => /freelance/.test(i.text)));
});

test('HR letter: employed with leave dates and salary', () => {
  const t = 'Nile Tech Company\nDate: 10/11/2026\nTo whom it may concern\nThis is to certify that Mr. Ahmed Hassan has been working with us since 01/03/2019 as a Senior Engineer, with a monthly salary of EGP 45,000.\nHe has been granted annual leave from 20/12/2026 to 04/01/2027.';
  const d = parseDocument('hr.pdf', read(t));
  const E = d.employment;
  eq([E.status, E.startDate, E.monthlySalary, E.salaryCurrency, E.leaveFrom, E.leaveTo], ['employed', '2019-03-01', 45000, 'EGP', '2026-12-20', '2027-01-04']);
});

test('cover letter: dates, destination, name, passport, ties', () => {
  const t = 'Dear Visa Officer,\nMy name is Sara Hassan Ali, an Egyptian citizen holding Egyptian passport number A12345678. I am a mother of three children and maintain my responsibilities in Egypt.\nI intend to visit Austria from 3 January 2027 to 16 January 2027 for tourism.';
  const d = parseDocument('Motivation Letter.docx', read(t));
  eq([d.docType, d.mainPersonName, d.passportNumberShown, d.application.entryDate, d.application.exitDate, d.application.memberStateApplied, d.application.purpose, d.ties.childrenStayHome],
    ['cover_letter', 'Sara Hassan Ali', 'A12345678', '2027-01-03', '2027-01-16', 'AT', 'tourism', 'yes']);
});

test('Schengen form filled with a PDF editor: values mapped from their labels', () => {
  const annots = [
    { value: 'Hassan', context: '1 . Name (Familienname) / Surname (Family name)' },
    { value: 'Sara Ali', context: '2. Familienname 3. Vorname(n)' },
    { value: '16/08/1980', context: '4. Geburtsdatum Date of birth ( day -' },
    { value: 'Egyptian', context: 'Place of birth: 7. Derzeitige Staatsangehörigkeit nationality:' },
    { value: 'A12345678', context: '13. Nummer des Number of travel document:' },
    { value: '29/05/2022', context: '14. Ausstellungsdatum/ Date of issue:' },
    { value: '28/05/2029', context: '15. Gültig bis / issue: Valid until:' },
    { value: 'Austria', context: '25. Mitgliedstaat der Hauptbestimmung Member State of main destination' },
    { value: 'Austria', context: '26. Mitgliedstaat der ersten Einreise' },
    { value: '28/12/2026', context: 'Datum der geplanten Ankunft des ersten geplanten Aufenthalts im Schengen - Raum /' },
    { value: '04/01/2027', context: 'Datum der geplanten Abreise / Intended date of departure from the Schengen area' },
  ];
  const d = parseDocument('Application.pdf', read('Antrag auf Erteilung eines Schengen - Visums / Application for Schengen Visa\nTourismus / Tourism', { annots }));
  eq([d.docType, d.mainPersonName, d.passportNumberShown, d.dateOfBirthShown, d.application.memberStateApplied, d.application.entryDate, d.application.exitDate, d.passport.expiryDate],
    ['application_form', 'Sara Ali Hassan', 'A12345678', '1980-08-16', 'AT', '2026-12-28', '2027-01-04', '2029-05-28']);
});

test('movement certificate: trips abroad', () => {
  const t = 'Movement Certificate\nmovements of Ms. / SARA ALI HASSAN , Egyptian national\nDate of Birth: ... 16/08/1980 ...\nA12345678 2022 Ordinary Passport\n10/07/2021 Egypt / Istanbul 16/07/2021 Egypt / Tirana (Albania)\n25/01/2024 Egypt / Doha 03/02/2024 Egypt / Doha\n';
  const d = parseDocument('Movement Certificate.pdf', read(t));
  eq(d.docType, 'movement_certificate');
  eq(d.travelStamps, [{ country: 'TR', entry: '2021-07-10', exit: '2021-07-16' }, { country: 'QA', entry: '2024-01-25', exit: '2024-02-03' }]);
});

test('bank statement: balances, period, credits, largest deposit', () => {
  const t = 'National Bank of Egypt\nStatement of Account\nAccount Name: SARA HASSAN\nCurrency: EGP\nOpening Balance 100,000.00\n01/06/2026 Salary transfer 20,000.00 120,000.00\n15/07/2026 Cash deposit 150,000.00 270,000.00\n01/08/2026 Salary transfer 20,000.00 290,000.00\n10/08/2026 ATM withdrawal 5,000.00 285,000.00\nClosing Balance 285,000.00';
  const d = parseDocument('bank.pdf', read(t));
  const B = d.bank;
  eq([d.docType, B.accountHolder, B.currency, B.openingBalance, B.closingBalance, B.largestDeposit, B.largestDepositDate, B.periodFrom, B.periodTo], ['bank_statement', 'SARA HASSAN', 'EGP', 100000, 285000, 150000, '2026-07-15', '2026-06-01', '2026-08-10']);
});

test('internal agency sheet is flagged, not treated as a visa document', () => {
  const d = parseDocument('client.pdf', read('MG International visa consultancy\nClient Information\nConsultant Name : X\nPrevious Refusals : UK Reason:'));
  eq(d.docType, 'other');
  ok(d.issues.some((i) => /internal agency/i.test(i.text)) && d.issues.some((i) => /UK/.test(i.text)));
});

test('docx reader', () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>Day 1 &amp; Vienna</w:t></w:r></w:p></w:body></w:document>';
  const data = zlib.deflateRawSync(Buffer.from(xml));
  const name = Buffer.from('word/document.xml');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const cdStart = 30 + name.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(46 + name.length, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eq(docxText(Buffer.concat([local, name, data, central, name, eocd])), 'Day 1 & Vienna');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) {
  console.log('\nFailures:\n  ' + fails.join('\n  '));
  process.exit(1);
}
