/* Sample case files (Egyptian applicants). Used by the "Load sample" menu and by the test suite. */
(function (V) {
  'use strict';
  const U = V.util;
  const withMRZ = (c) => {
    const m = U.buildMRZ({ issuer: c.passport.issuer, surname: c.applicant.surname, givenNames: c.applicant.givenNames,
      number: c.passport.number, nationality: c.applicant.nationality, dob: c.applicant.dob, sex: c.applicant.sex, expiry: c.passport.expiryDate });
    c.passport.mrz1 = m[0];
    c.passport.mrz2 = m[1];
    return c;
  };
  const P = (extra) => Object.assign({ present: true, form: 'original' }, extra || {});

  V.samples = {
    schengen_clean: {
      title: 'Schengen — clean file (France + Italy, tourism)',
      expect: { critical: 0, major: 0, minor: 0 },
      data: () => withMRZ({
        program: 'schengen',
        meta: { submissionDate: '2026-11-17', applyingIn: 'EG', consulateOf: 'FR', caseRef: 'SCH-001' },
        applicant: { surname: 'HASSAN', givenNames: 'AHMED MOHAMED', dob: '1988-04-12', sex: 'M', nationality: 'EG', residenceCountry: 'EG', maritalStatus: 'married' },
        passport: { number: 'A12345678', issuer: 'EG', issueDate: '2023-02-01', expiryDate: '2030-01-31', blankPages: 10, previousNumbers: 'A09876543' },
        trip: {
          purpose: 'tourism', entryDate: '2026-12-20', exitDate: '2027-01-03', entries: 'multiple', accommodationType: 'hotel', fundedBy: 'self',
          destinations: [
            { country: 'FR', city: 'Paris', from: '2026-12-20', to: '2026-12-28' },
            { country: 'IT', city: 'Rome', from: '2026-12-28', to: '2027-01-03' },
          ],
        },
        flights: [
          { date: '2026-12-20', from: 'EG', to: 'FR', flightNo: 'MS799', passengerName: 'AHMED MOHAMED HASSAN' },
          { date: '2026-12-28', from: 'FR', to: 'IT', flightNo: 'AF1404', passengerName: 'AHMED MOHAMED HASSAN' },
          { date: '2027-01-03', from: 'IT', to: 'EG', flightNo: 'MS792', passengerName: 'AHMED MOHAMED HASSAN' },
        ],
        stays: [
          { name: 'Hotel Lumiere', country: 'FR', city: 'Paris', checkIn: '2026-12-20', checkOut: '2026-12-28', guestName: 'Ahmed Mohamed Hassan' },
          { name: 'Hotel Roma Centro', country: 'IT', city: 'Rome', checkIn: '2026-12-28', checkOut: '2027-01-03', guestName: 'Ahmed Mohamed Hassan' },
        ],
        insurance: { provider: 'AXA Egypt', holder: 'AHMED MOHAMED HASSAN', coverage: 50000, start: '2026-12-20', end: '2027-01-18', territory: 'schengen', repatriation: 'yes' },
        employment: { status: 'employed', employer: 'Nile Tech SAE', position: 'Senior Engineer', startDate: '2019-03-01', monthlySalary: 45000, salaryCurrency: 'EGP',
          letterDate: '2026-11-10', leaveFrom: '2026-12-20', leaveTo: '2027-01-04', returnDate: '2027-01-05' },
        finances: {
          currency: 'EGP', rateEUR: 55, rateUSD: 47.5,
          statements: [{ bank: 'CIB', holder: 'Ahmed Mohamed Hassan', from: '2026-05-15', to: '2026-11-14', issued: '2026-11-15', opening: 600000, closing: 780000, avgIncome: 45000, largestDeposit: 45000, largestDepositDate: '2026-11-01' }],
          sponsor: {},
        },
        ties: { property: true, spouseHome: true, childrenHome: true },
        history: {
          refusalsDeclared: 'no', refusals: [],
          schengenStays: [{ entry: '2024-07-01', exit: '2024-07-10', visaValidUntil: '2024-07-20' }],
          priorVisas: [{ country: 'FR', type: 'C', from: '2024-06-25', to: '2024-07-20' }],
          fingerprintsDate: '2024-05-15',
        },
        documents: {
          application_form: P(), photo: P({ issued: '2026-11-01' }), passport: P(), prev_visas: P(), insurance: P({ name: 'AHMED MOHAMED HASSAN', passportNo: 'A12345678' }),
          flight: P({ name: 'AHMED MOHAMED HASSAN', passportNo: 'A12345678' }), accommodation: P(), itinerary: P(), cover_letter: P(),
          bank_statement: P({ name: 'Ahmed Mohamed Hassan' }), employment_letter: P({ name: 'Ahmed Mohamed Hassan', language: 'en' }), payslips: P(),
          insurance_print: P({ language: 'ar', translation: 'certified' }), property_docs: P({ language: 'ar', translation: 'certified' }), fee_receipt: P(),
        },
        settings: {},
      }),
    },

    schengen_problems: {
      title: 'Schengen — file with typical problems (Germany)',
      expect: { minCritical: 6 },
      data: () => {
        const c = withMRZ({
          program: 'schengen',
          meta: { submissionDate: '2026-11-17', applyingIn: 'EG', consulateOf: 'DE', caseRef: 'SCH-002' },
          applicant: { surname: 'ALI', givenNames: 'MONA MAHMOUD', dob: '1995-09-03', sex: 'F', nationality: 'EG', residenceCountry: 'EG', maritalStatus: 'single' },
          passport: { number: 'A55512345', issuer: 'EG', issueDate: '2020-01-15', expiryDate: '2027-01-14', blankPages: 6, previousNumbers: 'A11122233' },
          trip: {
            purpose: 'family', entryDate: '2026-12-05', exitDate: '2026-12-19', entries: 'single', accommodationType: 'mixed', fundedBy: 'self',
            destinations: [
              { country: 'DE', city: 'Berlin', from: '2026-12-05', to: '2026-12-08' },
              { country: 'FR', city: 'Paris', from: '2026-12-08', to: '2026-12-19' },
            ],
          },
          flights: [
            { date: '2026-12-06', from: 'EG', to: 'DE', flightNo: 'LH583', passengerName: 'MONA ALI' },
            { date: '2026-12-19', from: 'FR', to: 'EG', flightNo: 'MS800', passengerName: 'MONA ALI' },
          ],
          stays: [
            { name: 'Berlin Mitte Hotel', country: 'DE', city: 'Berlin', checkIn: '2026-12-05', checkOut: '2026-12-08', guestName: 'MUNA MAHMOUD ALY' },
            { name: 'Paris Gare Hotel', country: 'FR', city: 'Paris', checkIn: '2026-12-08', checkOut: '2026-12-14', guestName: 'MONA ALI' },
          ],
          host: {},
          insurance: { provider: 'Local Insurer', holder: 'MONA ALI', coverage: 25000, start: '2026-12-05', end: '2026-12-15', territory: 'schengen', repatriation: 'yes' },
          employment: { status: 'employed', employer: 'Delta Pharma', position: 'Pharmacist', startDate: '2026-08-01', monthlySalary: 30000, salaryCurrency: 'EGP',
            letterDate: '2026-07-20', leaveFrom: '2026-12-06', leaveTo: '2026-12-15' },
          finances: {
            currency: 'EGP', rateEUR: 55, rateUSD: 47.5,
            statements: [{ bank: 'NBE', holder: 'Mona Mahmoud Ali', from: '2026-08-01', to: '2026-09-30', issued: '2026-10-01', opening: 20000, closing: 260000, avgIncome: 18000, largestDeposit: 200000, largestDepositDate: '2026-09-25' }],
            sponsor: {},
          },
          ties: {},
          history: { refusalsDeclared: 'no', refusals: [{ country: 'IT', date: '2026-04-10', reason: 'Purpose and conditions of stay not justified' }], schengenStays: [], priorVisas: [] },
          documents: {
            application_form: P(), photo: P({ issued: '2025-12-01' }), passport: P(), insurance: P({ passportNo: 'A11122233' }), flight: P({ passportNo: 'A55512345' }),
            accommodation: P(), bank_statement: P(), employment_letter: P({ language: 'ar' }), fee_receipt: P(),
            invitation_letter: P({ name: 'Mona Ali' }),
            birth_certificate: P({ form: 'copy' }),
          },
          settings: {},
        });
        c.passport.mrz2 = c.passport.mrz2.slice(0, 43) + ((+c.passport.mrz2[43] + 1) % 10); // corrupt composite check digit
        return c;
      },
    },

    us_b1b2_clean: {
      title: 'USA B1/B2 — clean tourism file',
      expect: { critical: 0, major: 0 },
      data: () => withMRZ({
        program: 'us_b1b2',
        meta: { submissionDate: '2026-11-17', applyingIn: 'EG', caseRef: 'USB-001' },
        applicant: { surname: 'IBRAHIM', givenNames: 'SARA ADEL', dob: '1985-02-20', sex: 'F', nationality: 'EG', residenceCountry: 'EG', maritalStatus: 'married' },
        passport: { number: 'A77788899', issuer: 'EG', issueDate: '2024-03-10', expiryDate: '2031-03-09' },
        trip: { purpose: 'tourism', entryDate: '2027-04-01', exitDate: '2027-04-15', accommodationType: 'hotel', fundedBy: 'self' },
        flights: [],
        stays: [{ name: 'Midtown Hotel', country: 'US', city: 'New York', checkIn: '2027-04-01', checkOut: '2027-04-15', guestName: 'Sara Adel Ibrahim' }],
        employment: { status: 'employed', employer: 'Cairo University Hospital', position: 'Consultant', startDate: '2012-09-01', monthlySalary: 60000, salaryCurrency: 'EGP', letterDate: '2026-11-05', leaveFrom: '2027-04-01', leaveTo: '2027-04-16' },
        finances: { currency: 'EGP', rateEUR: 55, rateUSD: 47.5, statements: [{ bank: 'QNB', holder: 'Sara Adel Ibrahim', from: '2026-05-01', to: '2026-11-12', issued: '2026-11-13', opening: 900000, closing: 1100000, avgIncome: 60000, largestDeposit: 60000, largestDepositDate: '2026-11-01' }], sponsor: {} },
        ties: { property: true, spouseHome: true, childrenHome: true },
        history: { refusalsDeclared: 'no', refusals: [], usVisits: [{ entry: '2023-08-01', exit: '2023-08-20', authorizedUntil: '2024-01-31' }], priorVisas: [{ country: 'US', type: 'B1/B2', from: '2023-05-01', to: '2028-04-30' }, { country: 'GB', type: 'Visitor', from: '2022-06-01', to: '2022-12-01' }] },
        us: { confirmation: 'AA00ABC123', formDate: '2026-11-01', interviewDate: '2026-12-15', interviewCountry: 'EG', socialMedia: 'yes', usAddress: 'Midtown Hotel, 5th Ave, New York, NY', tripCost: '' },
        documents: {
          ds160: P({ name: 'SARA ADEL IBRAHIM', passportNo: 'A77788899' }), appointment: P(), fee_receipt: P(), passport: P(), photo: P({ issued: '2026-10-20' }), prev_visas: P(),
          bank_statement: P(), employment_letter: P(), payslips: P(), insurance_print: P(), property_docs: P(), itinerary: P(),
        },
        settings: {},
      }),
    },

    us_f1: {
      title: 'USA F-1 — student file',
      expect: { critical: 0, major: 0 },
      data: () => withMRZ({
        program: 'us_f1',
        meta: { submissionDate: '2026-11-17', applyingIn: 'EG', caseRef: 'USF-001' },
        applicant: { surname: 'SAYED', givenNames: 'OMAR KHALED', dob: '2004-06-30', sex: 'M', nationality: 'EG', residenceCountry: 'EG', maritalStatus: 'single' },
        passport: { number: 'A24681357', issuer: 'EG', issueDate: '2025-01-05', expiryDate: '2032-01-04' },
        trip: { purpose: 'study', entryDate: '2027-08-01', exitDate: '2029-05-31', fundedBy: 'sponsor' },
        employment: { status: 'student' },
        finances: { currency: 'EGP', rateEUR: 55, rateUSD: 47.5,
          statements: [{ bank: 'Banque Misr', holder: 'Khaled Omar Sayed', from: '2026-05-01', to: '2026-11-10', issued: '2026-11-12', opening: 4300000, closing: 4800000, avgIncome: 120000, largestDeposit: 150000, largestDepositDate: '2026-10-01' }],
          sponsor: { name: 'Khaled Omar Sayed', relationship: 'father' } },
        ties: { property: true },
        history: { refusalsDeclared: 'no', refusals: [], priorVisas: [{ country: 'GB', type: 'Visitor', from: '2023-07-01', to: '2023-12-31' }] },
        us: { confirmation: 'AA00XYZ789', formDate: '2026-11-10', interviewDate: '2027-05-10', interviewCountry: 'EG', socialMedia: 'yes',
          f1: { sevisId: 'N0012345678', school: 'Ohio State University', ds160School: 'Ohio State University', i20Name: 'OMAR KHALED SAYED', programStart: '2027-08-24', programEnd: '2029-05-15', i20Cost: 62000, i901Paid: true, i901Date: '2027-04-01', publicProfiles: true } },
        documents: {
          ds160: P(), appointment: P(), fee_receipt: P(), passport: P(), photo: P({ issued: '2026-11-01' }), i20: P({ name: 'OMAR KHALED SAYED' }), i901_receipt: P(),
          admission_letter: P(), transcripts: P({ language: 'en' }), test_scores: P(), bank_statement: P(), sponsor_letter: P(), sponsor_bank: P(), sponsor_id: P(),
          property_docs: P({ language: 'ar', translation: 'certified' }), enrollment: P(), prev_visas: P(),
        },
        settings: {},
      }),
    },

    us_iv_cr1: {
      title: 'USA immigrant visa — CR1 spouse of US citizen',
      expect: { critical: 0, major: 0 },
      data: () => withMRZ({
        program: 'us_iv',
        meta: { submissionDate: '2026-11-17', applyingIn: 'EG', caseRef: 'IV-001' },
        applicant: { surname: 'FAROUK', givenNames: 'NOUR HANY', dob: '1996-03-03', sex: 'F', nationality: 'EG', residenceCountry: 'EG', maritalStatus: 'married' },
        passport: { number: 'A13579246', issuer: 'EG', issueDate: '2024-06-01', expiryDate: '2031-05-31' },
        trip: { purpose: 'immigration', entryDate: '2027-02-01' },
        employment: { status: 'employed', employer: 'Vodafone Egypt', position: 'Analyst', startDate: '2020-01-01' },
        finances: { currency: 'EGP', statements: [], sponsor: {} },
        ties: {},
        history: { refusalsDeclared: 'no', refusals: [] },
        us: {
          confirmation: '', formDate: '2026-08-01', interviewDate: '2027-01-10', interviewCountry: 'EG', socialMedia: 'yes',
          iv: {
            category: 'CR1', petitionerName: 'Youssef Adam', petitionerStatus: 'USC', marriageDate: '2025-06-15', priorMarriage: false,
            medicalDate: '2026-12-20', arrests: false,
            residences: [{ country: 'EG', from: '1996-03-03', to: '' }],
            policeCerts: [{ country: 'EG', issued: '2026-11-01' }],
            i864: { income: 52000, householdSize: 2, state: 'contiguous', taxYear: 2025, assets: 0 },
          },
        },
        documents: {
          ds260: P(), appointment: P(), passport: P(), photo: P({ issued: '2026-11-01' }),
          birth_certificate: P({ language: 'ar', translation: 'certified', dob: '1996-03-03' }),
          marriage_certificate: P({ language: 'ar', translation: 'certified' }),
          police_certificates: P({ language: 'ar', translation: 'certified', issued: '2026-11-01' }),
          medical_exam: P(), i864: P(), tax_transcripts: P(), petitioner_status: P(), relationship_evidence: P(),
        },
        settings: {},
      }),
    },
  };
})(typeof globalThis !== 'undefined' ? (globalThis.VFR = globalThis.VFR || {}) : (window.VFR = window.VFR || {}));
