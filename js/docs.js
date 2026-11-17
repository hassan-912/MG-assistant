/* Visa File Review Engine — document requirements per program and the rules that decide them. */
(function (V) {
  'use strict';
  const U = V.util;
  const D = (V.docs = {});

  // id → [label, class, short file-name stem]
  D.catalog = {
    application_form: ['Signed visa application form', 'form', 'ApplicationForm'],
    ds160: ['DS-160 confirmation page', 'form', 'DS160'],
    ds260: ['DS-260 confirmation page', 'form', 'DS260'],
    appointment: ['Appointment / interview confirmation', 'form', 'Appointment'],
    fee_receipt: ['Visa fee payment receipt', 'form', 'FeeReceipt'],
    cover_letter: ['Cover letter (purpose, itinerary, funding, return)', 'form', 'CoverLetter'],
    photo: ['Photo meeting specifications (taken ≤ 6 months ago)', 'identity', 'Photo'],
    passport: ['Passport (original) + copy of bio page', 'identity', 'Passport'],
    prev_visas: ['Copies of previous visas / stamps', 'identity', 'PreviousVisas'],
    residence_permit: ['Residence permit in country of application', 'identity', 'ResidencePermit'],
    flight: ['Round-trip flight reservation', 'travel', 'FlightReservation'],
    accommodation: ['Accommodation proof (hotel bookings / rental)', 'travel', 'Accommodation'],
    itinerary: ['Day-by-day itinerary', 'travel', 'Itinerary'],
    insurance: ['Travel medical insurance certificate', 'travel', 'TravelInsurance'],
    bank_statement: ['Personal bank statements (stamped)', 'financial', 'BankStatements'],
    payslips: ['Last 3 payslips', 'financial', 'Payslips'],
    tax_return: ['Income tax return / tax card', 'financial', 'TaxReturn'],
    sponsor_letter: ['Sponsorship letter', 'financial', 'SponsorLetter'],
    sponsor_bank: ["Sponsor's bank statements", 'financial', 'SponsorBankStatements'],
    sponsor_id: ["Sponsor's ID / passport copy", 'financial', 'SponsorID'],
    property_docs: ['Property ownership documents', 'ties', 'PropertyDocs'],
    employment_letter: ['Employment letter with approved leave dates', 'employment', 'EmploymentLetter'],
    business_reg: ['Commercial register + tax card', 'employment', 'CommercialRegister'],
    insurance_print: ['Social insurance statement (insurance print)', 'employment', 'SocialInsurancePrint'],
    enrollment: ['Enrollment certificate + school leave letter', 'employment', 'Enrollment'],
    pension: ['Pension statement', 'employment', 'Pension'],
    invitation_letter: ['Invitation letter from host', 'invitation', 'InvitationLetter'],
    host_id: ["Host's passport / residence permit", 'invitation', 'HostID'],
    business_invitation: ['Business invitation from receiving company', 'invitation', 'BusinessInvitation'],
    event_registration: ['Conference / event registration', 'invitation', 'EventRegistration'],
    medical_letter: ['Doctor letter, treatment plan and cost estimate', 'invitation', 'MedicalLetter'],
    birth_certificate: ['Birth certificate', 'civil', 'BirthCertificate'],
    marriage_certificate: ['Marriage certificate', 'civil', 'MarriageCertificate'],
    divorce_docs: ['Divorce decree / death certificate (prior marriages)', 'civil', 'PriorMarriageTermination'],
    parental_consent: ['Notarized parental consent (minor)', 'civil', 'ParentalConsent'],
    police_certificates: ['Police certificates (all required countries)', 'civil', 'PoliceCertificates'],
    court_records: ['Court / prison records', 'civil', 'CourtRecords'],
    i20: ['Form I-20 (signed)', 'program', 'I20'],
    i901_receipt: ['SEVIS I-901 fee receipt', 'program', 'I901Receipt'],
    admission_letter: ['University admission letter', 'program', 'AdmissionLetter'],
    transcripts: ['Academic transcripts and diplomas', 'program', 'Transcripts'],
    test_scores: ['Standardized test scores (IELTS/TOEFL/SAT/GRE…)', 'program', 'TestScores'],
    scholarship: ['Scholarship / funding award letter', 'financial', 'Scholarship'],
    medical_exam: ['Medical exam by panel physician (DS-3025 vaccinations)', 'program', 'MedicalExam'],
    i864: ['Form I-864 Affidavit of Support (signed)', 'financial', 'I864'],
    tax_transcripts: ["Petitioner's IRS tax transcripts / W-2s", 'financial', 'TaxTranscripts'],
    petitioner_status: ["Petitioner's proof of US status", 'program', 'PetitionerStatus'],
    relationship_evidence: ['Evidence of bona fide relationship', 'program', 'RelationshipEvidence'],
    family_registry: ['Family registration document (civil status)', 'civil', 'FamilyRegistry'],
    movement_certificate: ['Travel movement certificate (entries / exits)', 'ties', 'MovementCertificate'],
  };
  // documents normally handed over at the appointment rather than scanned into the file
  D.atCounter = { photo: true, fee_receipt: true };
  D.classOrder = ['form', 'identity', 'program', 'travel', 'financial', 'employment', 'ties', 'invitation', 'civil'];
  D.classLabel = {
    form: 'Forms & receipts', identity: 'Identity', program: 'Program documents', travel: 'Travel', financial: 'Financial',
    employment: 'Occupation', ties: 'Ties', invitation: 'Purpose / invitation', civil: 'Civil documents',
  };
  // documents whose contents carry an issue date that must be recent (days)
  D.maxAge = { photo: 183, sponsor_bank: 31, enrollment: 92, pension: 92,
    business_invitation: 92, invitation_letter: 92, police_certificates: 365, sponsor_letter: 92 };

  function ctxFacts(c) {
    const T = U.day(c.meta && c.meta.submissionDate) || U.day(U.todayIso());
    const entry = U.day(c.trip && c.trip.entryDate);
    const dob = U.day(c.applicant && c.applicant.dob);
    const age = dob !== null ? U.years(dob, entry !== null ? entry : T) : null;
    const emp = (c.employment && c.employment.status) || '';
    const purpose = (c.trip && c.trip.purpose) || '';
    const funded = (c.trip && c.trip.fundedBy) || 'self';
    const ap = c.applicant || {};
    const hist = c.history || {};
    return {
      T, age, minor: age !== null && age < 18, emp, purpose, funded,
      foreignResident: ap.residenceCountry && ap.nationality && ap.residenceCountry !== ap.nationality,
      hasHistory: !!((hist.schengenStays && hist.schengenStays.length) || (hist.usVisits && hist.usVisits.length) || (hist.priorVisas && hist.priorVisas.length)),
      hostStay: c.trip && (c.trip.accommodationType === 'host'),
      property: c.ties && c.ties.property,
      bothParents: c.minor && c.minor.bothParentsTravel,
      hasHR: !!(c.documents && c.documents.employment_letter && c.documents.employment_letter.present),
    };
  }

  /** @returns [{id,label,cls,level:'required'|'recommended',why}] */
  D.required = function (c) {
    const f = ctxFacts(c);
    const P = c.program;
    const L = [];
    const req = (id, why) => L.push({ id, level: 'required', why: why || '' });
    const rec = (id, why) => L.push({ id, level: 'recommended', why: why || '' });
    const occupation = () => {
      if (f.emp === 'employed') {
        (P === 'schengen' ? req : rec)('employment_letter', 'Applicant is employed — letter must state position, salary, start date and approved leave.');
        rec('payslips', 'Shows salary actually paid matches the employment letter.');
        if (!c.applicant || !c.applicant.residenceCountry || c.applicant.residenceCountry === 'EG') {
          rec('insurance_print', 'Egyptian consulates use the social insurance record to verify employer, hiring date and salary.');
        }
      } else if (f.emp === 'self_employed' && f.hasHR) {
        // an HR / company letter covers the occupation — no commercial register or tax card needed
      } else if (f.emp === 'self_employed') {
        (P === 'schengen' ? req : rec)('business_reg', 'Applicant is self-employed.');
        rec('tax_return', 'Self-employed income is assessed from tax filings.');
      } else if (f.emp === 'student') {
        (P === 'schengen' ? req : rec)('enrollment', 'Applicant is a student — proof of enrollment and permission to travel.');
      } else if (f.emp === 'retired') {
        (P === 'schengen' ? req : rec)('pension', 'Applicant is retired — proof of regular pension income.');
      }
    };
    const sponsor = (level) => {
      if (f.funded === 'sponsor') {
        level('sponsor_letter', 'Trip is funded by a sponsor.');
        level('sponsor_bank', 'Sponsor must prove they can cover the costs.');
        level('sponsor_id', 'Identifies the sponsor and their relationship.');
        if (c.finances && c.finances.sponsor && /spouse|husband|wife/i.test(c.finances.sponsor.relationship || '')) {
          level('marriage_certificate', 'Sponsor is the spouse — relationship must be proven.');
        }
      }
    };

    if (P === 'schengen') {
      req('application_form');
      req('passport', 'Valid ≥ 3 months after leaving Schengen, issued < 10 years ago, ≥ 2 blank pages.');
      if (f.hasHistory) rec('prev_visas', 'Positive travel history strengthens the file.');
      if (f.foreignResident) req('residence_permit', 'Applying outside the country of nationality — legal residence must be shown.');
      req('insurance', 'Minimum €30,000 cover, all Schengen states, whole stay.');
      req('flight');
      if (f.hostStay) rec('accommodation', 'Staying with host — the invitation covers accommodation.');
      else req('accommodation', 'Every night of the stay must be covered.');
      const dests = (c.trip && c.trip.destinations) || [];
      if (dests.length > 1) req('itinerary', 'Several destinations — consulate checks main destination and route.');
      else rec('itinerary');
      rec('cover_letter');
      req('bank_statement', 'Last 3–6 months, issued within the last month.');
      occupation();
      sponsor(req);
      if (f.purpose === 'family' || f.hostStay) {
        req('invitation_letter', 'Visiting family/friends or staying with a host.');
        req('host_id', "Host's legal status in the Schengen state.");
      }
      if (f.purpose === 'business') req('business_invitation');
      if (f.purpose === 'conference') req('event_registration');
      if (f.purpose === 'medical') req('medical_letter');
      if (f.property) rec('property_docs', 'Declared property — supports return intention.');
      if (f.minor) {
        req('birth_certificate', 'Applicant is a minor.');
        if (!f.bothParents) req('parental_consent', 'Minor not travelling with both parents.');
      }
    } else if (P === 'us_b1b2' || P === 'us_f1') {
      req('ds160');
      req('appointment');

      req('passport', 'Valid ≥ 6 months beyond the intended stay.');
      if (f.hasHistory) rec('prev_visas');
      if (P === 'us_b1b2') {
        rec('bank_statement', 'Shows ability to pay for the trip.');
        occupation();
        sponsor(rec);
        if (f.purpose === 'business') req('business_invitation', 'B-1: letter from the US company describing the business activity.');
        if (f.purpose === 'conference') req('event_registration');
        if (f.purpose === 'family') rec('invitation_letter');
        if (f.purpose === 'medical') req('medical_letter', 'B-2 medical: diagnosis, treatment plan, cost estimate and payment proof.');
        if (f.property) rec('property_docs');
        rec('itinerary');
        if (f.minor) {
          rec('birth_certificate', 'Minor — proves parentage.');
          if (!f.bothParents) rec('parental_consent');
        }
      } else {
        req('i20', 'Signed by the student and the DSO.');
        req('i901_receipt', 'SEVIS fee must be paid before the interview.');
        rec('admission_letter');
        req('transcripts', 'Academic preparation for the program.');
        rec('test_scores');
        req('bank_statement', 'Funds for at least the first year shown on the I-20.');
        if (f.funded === 'scholarship') req('scholarship');
        sponsor(req);
        if (f.property) rec('property_docs');
      }
    } else if (P === 'us_iv') {
      const iv = (c.us && c.us.iv) || {};
      const spousal = /^(IR1|CR1|F2A)$/.test(iv.category || '');
      req('ds260');
      req('appointment');
      req('passport', 'Valid at least 60 days beyond the immigrant visa expiration.');

      req('birth_certificate', 'Original (or certified copy per reciprocity schedule).');
      if (spousal) req('marriage_certificate', 'Original civil marriage certificate.');
      if (iv.priorMarriage) req('divorce_docs', 'Each prior marriage of the applicant must be legally terminated.');
      req('police_certificates', 'From each country required by the reciprocity schedule.');
      req('medical_exam');
      req('i864');
      req('tax_transcripts', 'Most recent tax year (IRS transcript or 1040 + W-2s).');
      req('petitioner_status');
      if (spousal) rec('relationship_evidence', 'Photos, communication, joint documents.');
      if (iv.arrests) req('court_records', 'Any arrest/conviction anywhere requires court records.');
      if (iv.i864 && iv.i864.jointSponsor) req('sponsor_id', "Joint sponsor's proof of US status.");
    }
    // de-duplicate, keep strongest level
    const map = {};
    L.forEach((d) => {
      if (!map[d.id] || (d.level === 'required' && map[d.id].level !== 'required')) map[d.id] = d;
    });
    return Object.keys(map).map((id) => {
      const cat = D.catalog[id];
      return Object.assign({ label: cat[0], cls: cat[1], stem: cat[2] }, map[id]);
    }).sort((a, b) => D.classOrder.indexOf(a.cls) - D.classOrder.indexOf(b.cls));
  };

  /** Recommended physical stack and digital file names. */
  D.organize = function (c, list) {
    const sur = U.normName(c.applicant && c.applicant.surname).replace(/ /g, '-') || 'SURNAME';
    const pp = U.normId(c.passport && c.passport.number) || 'PASSPORTNO';
    const docs = c.documents || {};
    const out = [];
    let n = 0;
    list.forEach((d) => {
      const st = docs[d.id] || {};
      n++;
      out.push({
        n,
        id: d.id,
        label: d.label,
        group: D.classLabel[d.cls],
        present: !!st.present,
        file: String(n).padStart(2, '0') + '_' + d.stem + '_' + sur + '_' + pp + '.pdf',
      });
    });
    return out;
  };
})(typeof globalThis !== 'undefined' ? (globalThis.VFR = globalThis.VFR || {}) : (window.VFR = window.VFR || {}));
