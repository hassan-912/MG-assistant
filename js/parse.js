/* Local document understanding (browser + Node): text of one document → extraction fields. Rule-based, no AI, no API key. */
(function (V) {
  'use strict';
  const U = V.util;
  const R = V.ref;
  // Local document understanding: turns the text of one document into the extraction shape used by the builder.
  // Rule-based (no AI, no API key). Tuned on Egyptian visa files: EgyptAir/airline bookings, Accor/Booking.com,
  // AMAN/Egyptian pool insurance, Schengen application forms (typed or PDF-editor filled), VFS/TLS appointments,
  // HR letters, bank statements, movement certificates, pension statements, family registry, sale contracts …


  /* ============================== helpers ============================== */
  const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12, JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
    JANUAR: 1, FEBRUAR: 2, MÄRZ: 3, MAERZ: 3, MAI: 5, JUNI: 6, JULI: 7, OKTOBER: 10, DEZEMBER: 12, JANVIER: 1, FÉVRIER: 2, FEVRIER: 2, MARS: 3, AVRIL: 4, JUIN: 6, JUILLET: 7, AOÛT: 8, AOUT: 8, SEPTEMBRE: 9, OCTOBRE: 10, NOVEMBRE: 11, DÉCEMBRE: 12, DECEMBRE: 12 };
  const y4 = (y) => (y < 100 ? 2000 + y - (y > 60 ? 100 : 0) : y);
  /** Ordered list of {day, index, raw} for every date found in a string. Numeric dates are read day-first (Egypt/EU). */
  function datesIn(str) {
    const S = String(str || '');
    const T = S.toUpperCase();
    const out = [];
    const add = (y, m, d, idx, raw) => {
      const n = U.ymd(y4(y), m, d);
      if (n !== null && y4(y) > 1900 && y4(y) < 2100) out.push({ day: n, index: idx, raw });
    };
    let m;
    const reIso = /\b(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b/g;
    while ((m = reIso.exec(T))) add(+m[1], +m[2], +m[3], m.index, m[0]);
    const reNum = /(?<![\d/.-])(\d{1,2})\s*([-/.])\s*(\d{1,2})\s*\2\s*(\d{4}|\d{2})(?![\d/.-])/g;
    while ((m = reNum.exec(T))) {
      const a = +m[1];
      const b = +m[3];
      if (b <= 12) add(+m[4], b, a, m.index, m[0]);
      else if (a <= 12) add(+m[4], a, b, m.index, m[0]);
    }
    const reDMY = /\b(\d{1,2})(?:ST|ND|RD|TH|\.)?[\s\-]*(?:OF\s+)?([A-ZÄÖÜÉÛ]{3,9})\.?[\s\-,]*(\d{4}|\d{2})\b/g;
    while ((m = reDMY.exec(T))) if (MONTHS[m[2]]) add(+m[3], MONTHS[m[2]], +m[1], m.index, m[0]);
    const reMDY = /\b([A-ZÄÖÜÉÛ]{3,9})\.?\s+(\d{1,2})(?:ST|ND|RD|TH)?,?\s+(\d{4})\b/g;
    while ((m = reMDY.exec(T))) if (MONTHS[m[1]]) add(+m[3], MONTHS[m[1]], +m[2], m.index, m[0]);
    out.sort((p, q) => p.index - q.index);
    return out.filter((d, i) => i === 0 || d.index !== out[i - 1].index);
  }
  const iso = (n) => (n === null || n === undefined ? '' : U.iso(n));
  const firstDate = (s) => {
    const d = datesIn(s);
    return d.length ? iso(d[0].day) : '';
  };
  /** First date that follows a label (same line or the next two lines). */
  function dateAfter(text, labelRe) {
    const re = new RegExp(labelRe.source, labelRe.flags.replace('g', '') + 'g');
    let m;
    while ((m = re.exec(text))) {
      const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 160);
      const d = datesIn(tail.split('\n').slice(0, 3).join('\n'));
      if (d.length) return iso(d[0].day);
    }
    return '';
  }
  /** Value printed after a label on the same line (or the next line when the line ends at the label). */
  function valueAfter(text, labelRe, valid) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = labelRe.exec(lines[i]);
      if (!m) continue;
      let v = lines[i].slice(m.index + m[0].length).replace(/^[\s:.\-–]+/, '').trim();
      if (!v && lines[i + 1]) v = lines[i + 1].trim();
      if (v && (!valid || valid(v))) return v;
    }
    return '';
  }
  const cleanName = (s) => String(s || '').replace(/\b(MR|MRS|MS|MISS|MSTR|DR|ENG)\b\.?/gi, ' ').replace(/[^A-Za-z\s'/-]/g, ' ').replace(/\s+/g, ' ').trim();
  const looksLikeName = (s) => {
    const t = cleanName(s);
    return t.length >= 3 && t.split(' ').length <= 7 && /^[A-Za-z][A-Za-z\s'/-]+$/.test(t) && !/\b(CONTACT|INFORMATION|DETAILS|BOOKING|HOTEL|ROOM|NUMBER|DATE|PASSPORT|INSURANCE|POLICY|ADDRESS)\b/i.test(t);
  };
  function countryIn(str) {
    const s = ' ' + String(str || '').toLowerCase() + ' ';
    const byName = R.countries.filter((c) => c.a2 !== 'EG').find((c) => new RegExp('[^a-z]' + c.name.toLowerCase().replace(/[()]/g, '') + '[^a-z]').test(s));
    if (byName) return byName.a2;
    const city = Object.keys(R.cities).find((k) => R.cities[k] !== 'EG' && new RegExp('[^a-zäöüé]' + k + '[^a-zäöüé]').test(s));
    return city ? R.cities[city] : '';
  }
  function placeToCountry(str) {
    const s = String(str || '').toLowerCase().trim();
    const iata = /\b([A-Z]{3})\b/.exec(String(str || ''));
    if (iata && R.airports[iata[1]]) return R.airports[iata[1]];
    for (const k of Object.keys(R.cities)) if (new RegExp('(^|[^a-z])' + k + '($|[^a-z])').test(s)) return R.cities[k];
    const c = R.countries.find((x) => s.indexOf(x.name.toLowerCase()) !== -1);
    if (c) return c.a2;
    if (/egypt/.test(s)) return 'EG';
    return '';
  }
  const NATIONALITY = { egyptian: 'EG', austrian: 'AT', german: 'DE', french: 'FR', italian: 'IT', spanish: 'ES', american: 'US', british: 'GB', saudi: 'SA', sudanese: 'SD', syrian: 'SY', jordanian: 'JO', lebanese: 'LB' };
  const toCountry = (s) => {
    const t = String(s || '').trim().toLowerCase().replace(/[^a-z ]/g, '').trim();
    if (!t) return '';
    if (NATIONALITY[t]) return NATIONALITY[t];
    const c = R.countries.find((x) => x.name.toLowerCase() === t) || R.countries.find((x) => t.indexOf(x.name.toLowerCase()) === 0);
    return c ? c.a2 : placeToCountry(t);
  };
  const amountsIn = (s) => {
    const out = [];
    const re = /(?<![\d.,])(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d,])/g;
    let m;
    while ((m = re.exec(s))) out.push({ v: parseFloat(m[1].replace(/,/g, '')), index: m.index, raw: m[1] });
    return out;
  };
  const currencyIn = (s) => {
    const t = String(s || '').toUpperCase();
    if (/\bEGP\b|L\.?E\.?\b|EGYPTIAN POUND/.test(t)) return 'EGP';
    if (/\bUSD\b|US\s?\$|\bDOLLAR/.test(t)) return 'USD';
    if (/\bEUR\b|€|\bEURO/.test(t)) return 'EUR';
    if (/\bGBP\b|£/.test(t)) return 'GBP';
    if (/\bSAR\b|SAUDI RIYAL/.test(t)) return 'SAR';
    if (/\bAED\b|DIRHAM/.test(t)) return 'AED';
    return '';
  };
  const PASSPORT_RE = /\b([A-Z]\d{8})\b/;

  /* ============================== MRZ repair ============================== */
  const DIGIT_FIX = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6', T: '7' };
  function fixDigits(s) {
    return s.replace(/[OQDILZSBGT]/g, (c) => DIGIT_FIX[c]);
  }
  function findMrz(...texts) {
    const lines = [];
    texts.join('\n').split(/\r?\n/).forEach((l) => {
      const c = l.toUpperCase().replace(/[«‹]/g, '<').replace(/\s+/g, '');
      if (c.length >= 30 && /<{2,}/.test(c)) lines.push(c.replace(/[^A-Z0-9<]/g, ''));
    });
    let best = null;
    const l1s = lines.filter((l) => l.indexOf('P<') !== -1).map((l) => (l.slice(l.indexOf('P<')).replace(/[^A-Z<]/g, '') + '<'.repeat(44)).slice(0, 44));
    const voted = l1s.length > 1 ? l1s[0].split('').map((_, k) => {
      const cnt = {};
      l1s.forEach((l) => (cnt[l[k]] = (cnt[l[k]] || 0) + 1));
      return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    }).join('') : null;
    for (let i = 0; i < lines.length; i++) {
      const p = lines[i].indexOf('P<');
      if (p === -1) continue;
      let l1 = lines[i].slice(p).replace(/[^A-Z<]/g, '');
      l1 = voted && l1s.length > 2 ? voted : (l1 + '<'.repeat(44)).slice(0, 44);
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        const cand = repairLine2(lines[j]);
        if (!cand) continue;
        const m = U.parseMRZ(l1, cand);
        const score = m ? 10 - m.errors.length : 0;
        if (!best || score > best.score) best = { l1, l2: cand, m, score };
        if (m && m.ok) return best;
      }
    }
    return best;
  }
  function repairLine2(raw) {
    let s = raw.replace(/[^A-Z0-9<]/g, '');
    const m = /[A-Z0-9<]{9}[0-9OQDILZSBGT<][A-Z<]{3}[0-9OQDILZSBGT]{6}/.exec(s);
    if (!m) return null;
    s = s.slice(m.index);
    // OCR often reads "<" as K, C, L or E inside filler runs
    s = s.replace(/<[KCLE](?=<)/g, '<<').replace(/<[KCLE](?=<)/g, '<<');
    if (s.length > 44) {
      const head = s.slice(0, 28);
      let tail = s.slice(28);
      while (head.length + tail.length > 44 && /<{2,}/.test(tail)) tail = tail.replace(/<</, '<');
      s = (head + tail).slice(0, 44);
    }
    if (s.length < 44) s = s.slice(0, 28) + '<'.repeat(44 - s.length) + s.slice(28);
    const fixPos = (str, a, b) => str.slice(0, a) + fixDigits(str.slice(a, b)) + str.slice(b);
    s = fixPos(s, 9, 10);
    s = fixPos(s, 13, 20);
    s = fixPos(s, 21, 28);
    s = fixPos(s, 42, 44).replace(/^(.{42})1/, '$1<');
    const v = U.parseMRZ('P<' + 'X'.repeat(42), s);
    if (v && v.errors.length) {
      // try a corrected composite digit / personal-number check if only those fail
      for (const ch of ['<', '0']) {
        const alt = s.slice(0, 42) + ch + s.slice(43);
        const va = U.parseMRZ('P<' + 'X'.repeat(42), alt);
        if (va && va.errors.length < v.errors.length) s = alt;
      }
    }
    return s;
  }

  /* ============================== classification ============================== */
  const RULES = [
    ['internal', /visa consultancy|client information|consultant name|id odoo/i, 6],
    ['passport', /P<[A-Z<]{3}[A-Z]|PASSPORT\s+NO|TYPE\s+P\b|ARAB REPUBLIC OF EGYPT.*PASSPORT/i, 5],
    ['application_form', /application for schengen visa|antrag auf erteilung eines schengen|harmoni[sz]ed application form|demande de visa schengen|domanda di visto schengen/i, 9],
    ['ds160', /DS-?160|consular electronic application center/i, 9],
    ['ds260', /DS-?260|immigrant visa and alien registration/i, 9],
    ['i20', /form i-?20|certificate of eligibility for nonimmigrant student/i, 9],
    ['i901_receipt', /i-?901|sevis fee/i, 7],
    ['i864', /i-?864|affidavit of support/i, 8],
    ['appointment', /appointment (confirmation|letter|details)|appointment date|vfs\.?\s?global|tlscontact|bls international/i, 6],
    ['refusal_letter', /refusal of (a )?visa|visa (application )?(has been )?refused|refus de visa|ablehnung/i, 8],
    ['flight', /e-?ticket|reservation number|booking reference|\bPNR\b|flight (confirmed|number)|airline|itinerary receipt|egyptair|boarding/i, 4],
    ['accommodation', /check-?in|check-?out|hotel|booking\.com|airbnb|reservation confirmed|nights?\s*\|/i, 3],
    ['insurance', /travel insurance|insurance (policy|certificate|period)|policy schedule|insured name|the insured|cover limit/i, 5],
    ['bank_statement', /statement of account|account statement|bank statement|opening balance|closing balance|balance brought forward|\bIBAN\b|available balance/i, 5],
    ['payslips', /pay\s?slip|salary slip/i, 6],
    ['insurance_print', /social insurance (record|print|statement)|insured period|subscription (period|wage)/i, 5],
    ['pension', /pension statement|pension holder|pension of the beneficiaries|pensioner/i, 7],
    ['employment_letter', /to whom it may concern|hr letter|employment (letter|certificate)|is employed|has been working|has been employed|consultancy engagement/i, 4],
    ['business_reg', /commercial regist(er|ry|ration)|tax card|tax registration/i, 6],
    ['cover_letter', /dear (visa )?officer|motivation letter|cover letter|to:? the embassy|consul(ate)? general/i, 4],
    ['itinerary', /travel itinerary|day-by-day|itinerary/i, 7],
    ['invitation_letter', /letter of invitation|invitation letter|hereby invite|i invite/i, 6],
    ['property_docs', /sale contract|purchase contract|title deed|residential apartment|land registry|property ownership/i, 6],
    ['family_registry', /family registration document|family registry|civil status authority/i, 7],
    ['movement_certificate', /movement certificate|movements of|number of movements/i, 8],
    ['marriage_certificate', /marriage (certificate|contract)/i, 5],
    ['divorce_docs', /divorce (certificate|decree)/i, 6],
    ['birth_certificate', /birth certificate|certificate of birth/i, 6],
    ['police_certificates', /criminal record|police (certificate|clearance)|good conduct/i, 7],
    ['enrollment', /enrol(l)?ment certificate|certificate of enrol|is a (registered|regular) student/i, 6],
    ['fee_receipt', /visa fee|payment receipt|receipt.*visa/i, 3],
    ['prev_visas', /\bvisa\b.*(valid|type|entries|duration)|evisa|e-visa|visit visa|tourist visa|schengen visa/i, 2],
    ['host_id', /residence permit|aufenthaltstitel|titre de s[ée]jour/i, 3],
    ['medical_exam', /panel physician|DS-3025|medical examination/i, 6],
  ];
  const NAME_HINTS = [['passport', /pass(e)?port|جواز/i], ['flight', /egyptair|ticket|flight|airline/i], ['accommodation', /hotel|accor|booking|airbnb|marriott|hilton/i], ['insurance', /insurance|aman|axa|allianz|policy/i],
    ['bank_statement', /bank|statement|كشف/i], ['employment_letter', /\bhr\b|employment|work letter/i], ['application_form', /application|antrag/i], ['appointment', /appointment|vfs|tls/i],
    ['cover_letter', /motivation|cover/i], ['itinerary', /itinerary/i], ['prev_visas', /visas|stamps/i], ['property_docs', /contract|property|deed/i], ['pension', /pension/i],
    ['family_registry', /family registr/i], ['movement_certificate', /movement/i], ['photo', /photo|صورة/i]];

  function classify(fileName, text, hasMrz) {
    const score = {};
    const head = text.slice(0, 6000);
    for (const [t, re, w] of RULES) {
      const hits = (head.match(new RegExp(re.source, 'gi')) || []).length;
      if (hits) score[t] = (score[t] || 0) + w + Math.min(hits - 1, 4);
    }
    for (const [t, re] of NAME_HINTS) if (re.test(fileName)) score[t] = (score[t] || 0) + 4;
    if (hasMrz) score.passport = (score.passport || 0) + 12;
    if (score.flight && /\(\s*[A-Z]{3}\s*\)|\b[A-Z]{2}\s?\d{3,4}\b/.test(head)) score.flight += 3;
    if (score.itinerary && score.flight && !/\bday\s*\d/i.test(head)) score.itinerary -= 2;
    if ((head.match(/^\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*[–-]/gm) || []).length >= 3) score.itinerary = (score.itinerary || 0) + 6;
    const best = Object.keys(score).sort((a, b) => score[b] - score[a])[0];
    if (!best) return text.replace(/\s/g, '').length < 40 && /\.(jpe?g|png)$/i.test(fileName) ? 'photo' : 'other';
    return best;
  }

  /* ============================== per-type parsers ============================== */
  function parsePassport(d, text, mrzText) {
    const found = findMrz(mrzText || '', text);
    if (found && found.m && found.m.fields && found.m.fields.number) {
      const f = found.m.fields;
      Object.assign(d.passport, {
        surname: f.surname, givenNames: f.givenNames, number: f.number, nationality: f.nationality || '', sex: f.sex === 'X' ? '' : f.sex,
        dateOfBirth: iso(f.dob), expiryDate: iso(f.expiry), issuingCountry: f.issuer || '', mrzLine1: found.l1, mrzLine2: found.l2,
      });
      d.mainPersonName = (f.givenNames + ' ' + f.surname).trim();
      d.mainPersonRole = 'applicant';
      d.passportNumberShown = f.number;
      d.dateOfBirthShown = iso(f.dob);
      d.issuingCountry = f.issuer || '';
      if (!found.m.ok) d.issues.push({ severity: 'minor', text: 'Passport MRZ could only be read partly (' + found.m.errors.length + ' check-digit error' + (found.m.errors.length > 1 ? 's' : '') + ') — use a sharper scan of the bio page.' });
    } else {
      d.issues.push({ severity: 'major', text: 'The passport machine-readable lines (MRZ) could not be read — scan the bio page flat, in colour, at 300 dpi.' });
    }
    const issue = dateAfter(text, /date of issue|issue date|date de d[ée]livrance/i);
    if (issue) d.passport.issueDate = issue;
    d.documentDate = d.passport.issueDate;
  }

  const APP_SPECS = [
    ['entryDate', /Ankunft|arrival|arriv[ée]e/i, 'date'], ['exitDate', /Abreise|departure|d[ée]part/i, 'date'],
    ['expiry', /G[üu]ltig bis|Valid until|valable jusqu/i, 'date'], ['issue', /Ausstellungsdatum|Date of issue|date de d[ée]livrance/i, 'date'],
    ['dob', /Geburtsdatum|Date of birth|date de naissance/i, 'date'], ['passportNo', /Nummer des Reisedokuments|Number of travel document|num[ée]ro du document/i, 'passport'],
    ['firstEntry', /\b26\s*\.|ersten Einreise|first entry|premi[eè]re entr/i, 'country'], ['mainDest', /Hauptbestimmung|main destination|destination principale/i, 'country'],
    ['givenNames', /Vorname|First name|Pr[ée]nom/i, 'name'], ['surname', /Familienname|Surname|Nom\b/i, 'name'],
    ['nationality', /Staatsangeh[öo]rigkeit|nationality|nationalit[ée]/i, 'country'], ['occupation', /berufliche|occupation|profession/i, 'text'],
    ['employer', /Arbeitgeber|employer|employeur/i, 'text'], ['accommodation', /Unterkunft|accommodation|h[ée]bergement/i, 'text'],
  ];
  function parseApplication(d, text, annots) {
    const a = d.application;
    a.visaProgram = 'schengen';
    const got = {};
    const valid = {
      date: (v) => datesIn(v).length > 0, passport: (v) => /^[A-Z]{1,2}\d{6,8}$/.test(v.replace(/\s/g, '')), country: (v) => !!toCountry(v), name: (v) => looksLikeName(v), text: (v) => v.length > 1,
    };
    for (const an of annots || []) {
      for (const [key, re, kind] of APP_SPECS) {
        if (got[key] || !re.test(an.context) || !valid[kind](an.value)) continue;
        if (key === 'surname' && /bei der Geburt|at birth|Familienname\s*\(?früher/i.test(an.context) && !/1\s*\.\s*Name/.test(an.context)) continue;
        got[key] = an.value;
        break;
      }
    }
    // typed forms (values in the text layer): label → value
    const tv = (key, re, kind) => {
      if (!got[key]) {
        const v = valueAfter(text, re, (x) => valid[kind](x));
        if (v) got[key] = v;
      }
    };
    tv('surname', /Surname\s*\(Family name\)\s*:?/i, 'name');
    tv('givenNames', /First name\(s\)\s*\(Given name\(s\)\)\s*:?/i, 'name');
    tv('dob', /Date of birth[^:]*:/i, 'date');
    tv('passportNo', /Number of travel document\s*:?/i, 'passport');
    tv('entryDate', /Intended date of arrival[^:]*:/i, 'date');
    tv('exitDate', /Intended date of departure[^:]*:/i, 'date');
    tv('mainDest', /Member State of main destination[^:]*:/i, 'country');
    const P = d.passport;
    if (got.surname) P.surname = got.surname.toUpperCase();
    if (got.givenNames) P.givenNames = got.givenNames.toUpperCase();
    d.mainPersonName = [got.givenNames, got.surname].filter(Boolean).join(' ');
    d.mainPersonRole = 'applicant';
    if (got.dob) d.dateOfBirthShown = firstDate(got.dob);
    if (got.passportNo) d.passportNumberShown = got.passportNo.replace(/\s/g, '');
    a.entryDate = got.entryDate ? firstDate(got.entryDate) : '';
    a.exitDate = got.exitDate ? firstDate(got.exitDate) : '';
    a.memberStateApplied = toCountry(got.mainDest || '');
    const first = toCountry(got.firstEntry || '');
    if (a.memberStateApplied && a.entryDate && a.exitDate) {
      a.destinations = [{ country: a.memberStateApplied, city: '', from: a.entryDate, to: a.exitDate }];
    }
    if (first && first !== a.memberStateApplied) d.issues.push({ severity: 'minor', text: 'Member State of first entry (' + R.countryName(first) + ') differs from the main destination — make sure the itinerary explains the route.' });
    a.purpose = /tourism|tourismus|tourisme/i.test(text) && !/business|gesch[äa]ft/i.test(got.occupation || '') ? 'tourism' : 'unknown';
    a.residenceCountry = 'EG';
    if (got.occupation) {
      d.employment.position = got.occupation;
      if (/freelanc|self|own business|consultan/i.test(got.occupation)) d.employment.status = 'self_employed';
    }
    if (got.employer) d.employment.employer = got.employer.split('\n')[0];
    if (got.accommodation) d.stays = [];
    d.passport.issueDate = got.issue ? firstDate(got.issue) : '';
    d.passport.expiryDate = got.expiry ? firstDate(got.expiry) : '';
    d.passport.number = d.passportNumberShown;
    d.passport.dateOfBirth = d.dateOfBirthShown;
    a.fundedBy = /sponsor|bürge|garant/i.test(text.slice(0, 200)) ? 'sponsor' : 'unknown';
  }

  function parseFlight(d, text) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const segs = [];
    let cur = null;
    const close = () => {
      if (cur && cur.from && cur.to) segs.push(cur);
      cur = null;
    };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const dts = datesIn(l).filter((x) => /[A-Z]{3}/i.test(x.raw) || /\d{4}/.test(x.raw));
      const isHeaderDate = dts.length && !/issue|booking date|printed|\d{1,2}:\d{2}\s*(AM|PM)/i.test(l) && !/^\d{1,2}\/\d{1,2}\/\d{2},/.test(l);
      if (isHeaderDate) {
        close();
        cur = { date: iso(dts[0].day), from: '', to: '', fromAirport: '', toAirport: '', flightNo: '' };
      }
      if (!cur) continue;
      const codes = [];
      let m;
      const reCode = /\(\s*([A-Z]{3})\s*\)|\b([A-Z]{3})\b/g;
      while ((m = reCode.exec(l))) {
        const c = m[1] || m[2];
        if (R.airports[c]) codes.push(c);
      }
      codes.forEach((c) => {
        if (!cur.fromAirport) cur.fromAirport = c;
        else if (!cur.toAirport && c !== cur.fromAirport) cur.toAirport = c;
      });
      const fn = /\(\s*([A-Z0-9]{2})\s?(\d{2,4})\s*\)|\bflight\s*(?:no\.?|number)?\s*:?\s*([A-Z0-9]{2})\s?(\d{2,4})\b|\b(MS|TK|LH|OS|AF|KL|LX|EK|QR|SV|EY|GF|WY|RJ|ME|BA|IB|AZ|SN|TP|LO|PC|W6|FR|U2|J9|FZ|G9|XY|NE)\s?(\d{2,4})\b/i.exec(l);
      if (fn && !cur.flightNo) cur.flightNo = ((fn[1] || fn[3] || fn[5]) + ' ' + (fn[2] || fn[4] || fn[6])).toUpperCase();
      cur.from = cur.fromAirport ? R.airports[cur.fromAirport] : cur.from;
      cur.to = cur.toAirport ? R.airports[cur.toAirport] : cur.to;
      if (cur.fromAirport && cur.toAirport && cur.flightNo) close();
    }
    close();
    const seen = new Set();
    const passenger = (() => {
      for (const line of text.split('\n')) {
        if (/http|www\./i.test(line)) continue;
        const slash = /\b([A-Z]{2,})\/([A-Z][A-Z ]+?)(?:\s+(?:MR|MRS|MS|MISS|MSTR|CHD))?(?=\s|$)/.exec(line);
        if (slash) return slash[0];
      }
      const reA = /\b(?:ADULT|PASSENGER|TRAVELLER|TRAVELER)S?\b[^\n]*\n([^\n]+)/gi;
      let am;
      while ((am = reA.exec(text))) {
        reA.lastIndex = am.index + am[0].indexOf('\n') + 1; // the captured line may itself be the next keyword line
        const cand = am[1].replace(/contact information/i, '').trim();
        if (/^[A-Za-z][A-Za-z .'-]{2,60}$/.test(cand) && !/charge|tax|fee|price|total|fare|adult|child|infant|ticket|class|economy|business/i.test(cand) && looksLikeName(cand)) return cleanName(cand);
      }
      const rn = /reservation name\s*:\s*([A-Za-z][A-Za-z .'-]{1,40})/i.exec(text);
      if (rn) return cleanName(rn[1]);
      const lab = valueAfter(text, /passenger(?:\s+name)?\s*:|name of passenger\s*:|traveller\s*:/i, looksLikeName);
      return lab ? cleanName(lab) : '';
    })();
    d.flights = segs.filter((s) => {
      const k = s.date + s.fromAirport + s.toAirport;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).map((s) => ({ departureDate: s.date, arrivalDate: s.date, fromAirport: s.fromAirport, toAirport: s.toAirport, fromCountry: s.from, toCountry: s.to, flightNumber: s.flightNo, passengerName: passenger }));
    d.mainPersonName = passenger.replace('/', ' ');
    d.mainPersonRole = 'applicant';
    d.documentDate = dateAfter(text, /date of issue|issued on|booking date|issue date/i);
    if (/\b(cancell?ed)\b/i.test(text) && !/will be cancell?ed|may be cancell?ed|cancellation (policy|charge)|free cancell?ation/i.test(text)) d.issues.push({ severity: 'critical', text: 'The flight booking appears to be cancelled.' });
    if (!d.flights.length) d.issues.push({ severity: 'major', text: 'No flight segments could be read from this booking — check it is the full itinerary/e-ticket.' });
  }

  function parseStay(d, text) {
    const ci = dateAfter(text, /check-?in(?: date)?|arrival(?: date)?|\bfrom\b|anreise|arriv[ée]e/i);
    let co = '';
    const coRe = /check-?out(?: date)?|departure(?: date)?|\bto\b|\buntil\b|abreise|d[ée]part/gi;
    let m;
    while ((m = coRe.exec(text))) {
      const dd = datesIn(text.slice(m.index, m.index + 120).split('\n').slice(0, 3).join('\n'));
      const cand = dd.find((x) => !ci || x.day > U.day(ci));
      if (cand) {
        co = iso(cand.day);
        break;
      }
    }
    if (!ci || !co) {
      const all = datesIn(text).map((x) => x.day).filter((x, i, a) => a.indexOf(x) === i);
      const fut = all.filter((x) => x > U.day('2000-01-01'));
      if (!ci && fut.length) d.issues.push({ severity: 'minor', text: 'Check-in date not labelled — taken from the first date in the booking.' });
      if (fut.length >= 2) {
        const a = Math.min.apply(null, fut);
        const b = Math.max.apply(null, fut.filter((x) => x - a < 120));
        return parseStayFinish(d, text, ci || iso(a), co || iso(b));
      }
    }
    return parseStayFinish(d, text, ci, co);
  }
  function parseStayFinish(d, text, ci, co) {
    const nm = /(\d{1,3})\s*nights?/i.exec(text);
    if (nm && ci && co && U.day(co) - U.day(ci) !== +nm[1]) d.issues.push({ severity: 'major', text: 'Booking says ' + nm[1] + ' nights but the dates give ' + (U.day(co) - U.day(ci)) + '.' });
    const name = (/(?:^|\n)\s*((?:Hotel|Hôtel|Hostel|Apartment|Residence)[^\n]{2,50}|[^\n]{2,50}\s(?:Hotel|Hôtel|Inn|Suites|Resort))\s*(?:\n|$)/i.exec(text) || [])[1] || '';
    const guest = valueAfter(text, /reservation made by|guest name|name of guest|lead guest|booked by|booker|guest\s*:|contact\s*:/i, looksLikeName);
    const country = countryIn(text);
    const cityM = /your stay at\s+([A-Za-zÄÖÜäöüé .'-]+)/i.exec(text);
    const city = cityM ? cityM[1].trim() : (Object.keys(R.cities).find((k) => new RegExp('\\b' + k + '\\b', 'i').test(text)) || '');
    d.stays = ci && co ? [{ propertyName: name.trim(), city: city.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()), country: country || R.cities[city.toLowerCase()] || '', checkIn: ci, checkOut: co, guestName: cleanName(guest) }] : [];
    d.mainPersonName = cleanName(guest);
    d.mainPersonRole = 'applicant';
    if (!d.stays.length) d.issues.push({ severity: 'major', text: 'Check-in / check-out dates could not be read from this booking.' });
    if (/\bcancell?ed\b/i.test(text) && !/cancell?ation (charge|policy|fee)|free cancell?ation|no cancell?ation|cancel(l)?ed free|until .* cancel/i.test(text)) d.issues.push({ severity: 'critical', text: 'The hotel booking appears to be cancelled.' });

  }

  function parseInsurance(d, text) {
    const I = d.insurance;
    I.insuredName = cleanName(valueAfter(text, /(?:the\s+)?insured(?:'s)? name\s*:|name of (?:the )?insured\s*:|insured person\s*:|policy ?holder\s*:|insured\s*:/i, looksLikeName));
    const pn = /passport\s*(?:no\.?|number|#)?\s*:?\s*([A-Z]\d{8})/i.exec(text);
    if (pn) d.passportNumberShown = pn[1];
    const period = /(?:period|validity|valid|cover(?:age)?)[^\n]{0,40}?from\s*:?\s*([^\n]{6,30}?)\s+(?:to|till|until)\s*:?\s*([^\n]{6,30})/i.exec(text);
    if (period) {
      I.start = firstDate(period[1]);
      I.end = firstDate(period[2]);
    }
    if (!I.start) I.start = dateAfter(text, /effective date|start date|valid from|commencement/i);
    if (!I.end) I.end = dateAfter(text, /expiry date|end date|valid (?:until|till|to)|termination/i);
    let best = null;
    const re = /(?:(€|EUR|EURO|USD|\$)\s*)?(\d{1,3}(?:[,.\s]\d{3})+|\d{4,7})\s*(€|EUR|EURO|EUROS|USD|\$|US DOLLARS)?/gi;
    let m;
    while ((m = re.exec(text))) {
      const cur = (m[1] || m[3] || '').toUpperCase();
      if (!cur) continue;
      const v = parseFloat(m[2].replace(/[,.\s]/g, ''));
      if (v >= 5000 && v <= 5000000 && (!best || v > best.v)) best = { v, cur: /USD|\$|DOLLAR/.test(cur) ? 'USD' : 'EUR' };
    }
    if (best) {
      I.coverageAmount = best.v;
      I.coverageCurrency = best.cur;
    }
    I.territory = /schengen/i.test(text) ? 'schengen' : /worldwide|world wide|all countries|europe/i.test(text) ? (/excluding[^\n]{0,60}(usa|america|canada)/i.test(text) && !/europe/i.test(text) ? 'worldwide' : 'worldwide') : 'unknown';
    if (/excluding[^\n]{0,80}(schengen|europe|austria|germany|france|italy|spain)/i.test(text)) I.territory = 'partial';
    I.repatriation = /repatriation/i.test(text) ? 'yes' : 'unknown';
    I.provider = (/(AMAN|AXA|Allianz|GIG|MetLife|Misr Insurance|Egyptian Pool|Euro Assist|Bupa|Tokio Marine|Orient)/i.exec(text) || [])[1] || '';
    d.mainPersonName = I.insuredName;
    d.mainPersonRole = 'applicant';
    d.documentDate = dateAfter(text, /\bissued\s*(?:on)?\s*:|date of issue|issue date/i);
    if (I.start && I.end && U.day(I.end) - U.day(I.start) > 400) d.issues.push({ severity: 'minor', text: 'Multi-year insurance policy (' + U.fmt(U.day(I.start)) + ' → ' + U.fmt(U.day(I.end)) + ') — some consulates prefer a certificate for this specific trip', q: { date: I.end } });
  }

  function parseBank(d, text) {
    const B = d.bank;
    B.currency = currencyIn(text) || 'EGP';
    B.accountHolder = cleanName(valueAfter(text, /account (?:holder|name)\s*:|customer name\s*:|name\s*:|client\s*:/i, looksLikeName));
    B.bankName = (/(National Bank of Egypt|Banque Misr|CIB|Commercial International Bank|QNB|HSBC|Banque du Caire|Bank of Alexandria|AAIB|Arab African|Faisal|ADIB|Emirates NBD|Credit Agricole|Attijariwafa|NBK|Abu Dhabi Islamic|Alex Bank|Housing and Development Bank|Suez Canal Bank)/i.exec(text) || [])[1] || '';
    const per = /(?:period|from)\s*:?\s*([^\n]{6,25}?)\s*(?:to|-|until|till)\s*:?\s*([^\n]{6,25})/i.exec(text);
    if (per) {
      B.periodFrom = firstDate(per[1]);
      B.periodTo = firstDate(per[2]);
    }
    const num = (label) => {
      const re = new RegExp('(?:' + label + ')[^\\n\\d-]{0,30}(-?[\\d,]+(?:\\.\\d{1,2})?)', 'i');
      const m = re.exec(text);
      return m ? parseFloat(m[1].replace(/,/g, '')) : null;
    };
    B.openingBalance = num('opening balance|balance brought forward|previous balance|start(?:ing)? balance');
    B.closingBalance = num('closing balance|ending balance|balance carried forward|available balance|current balance|ledger balance');
    // transactions: date … amount … running balance  → credits from balance increases
    let prev = B.openingBalance;
    const credits = [];
    const dts = [];
    text.split('\n').forEach((l) => {
      const dd = datesIn(l);
      if (!dd.length) return;
      const am = amountsIn(l.slice(dd[0].index + dd[0].raw.length)).filter((a) => /[.,]/.test(a.raw) || a.v >= 10);
      if (am.length < 2) return;
      const bal = am[am.length - 1].v;
      dts.push(dd[0].day);
      if (prev !== null && bal > prev + 0.5) credits.push({ v: Math.round((bal - prev) * 100) / 100, day: dd[0].day, desc: l.slice(0, 80) });
      prev = bal;
    });
    if (dts.length) {
      if (!B.periodFrom) B.periodFrom = iso(Math.min.apply(null, dts));
      if (!B.periodTo) B.periodTo = iso(Math.max.apply(null, dts));
      if (B.closingBalance === null) B.closingBalance = prev;
    }
    if (credits.length) {
      const big = credits.reduce((a, b) => (b.v > a.v ? b : a));
      B.largestDeposit = big.v;
      B.largestDepositDate = iso(big.day);
      B.largestDepositDescription = /salary|payroll|pension|transfer/i.exec(big.desc) ? big.desc : '';
      const months = B.periodFrom && B.periodTo ? Math.max(1, (U.day(B.periodTo) - U.day(B.periodFrom)) / 30.4) : 1;
      B.averageMonthlyCredits = Math.round(credits.reduce((s, c) => s + c.v, 0) / months);
    }
    d.mainPersonName = B.accountHolder;
    d.mainPersonRole = 'applicant';
    d.documentDate = dateAfter(text, /print(?:ed|ing)? date|issue date|date of issue|statement date|date\s*:/i) || B.periodTo;
    if (B.closingBalance === null) d.issues.push({ severity: 'major', text: 'Closing balance could not be read — make sure the statement shows the final balance clearly.' });
  }

  function parseEmployment(d, text) {
    const E = d.employment;
    d.documentDate = dateAfter(text, /\bdate\s*:|dated\s/i) || (datesIn(text.split('\n').slice(0, 12).join('\n'))[0] ? iso(datesIn(text.split('\n').slice(0, 12).join('\n'))[0].day) : '');
    const nm = /\b(?:Mr|Mrs|Ms|Miss|Dr|Eng)\.?\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,5})/.exec(text) || /certify that\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,5})/.exec(text);
    E.employeeName = nm ? cleanName(nm[1]) : '';
    d.mainPersonName = E.employeeName;
    d.mainPersonRole = 'applicant';
    const co = /\b([A-Z][A-Za-z&]+(?:[ \t]+[A-Z][A-Za-z&]+){0,3}[ \t]+(?:Company|Pharmaceuticals|Pharma|Bank|Group|Corporation|Co\.|Ltd|S\.?A\.?E|LLC|Hospital|University|Holding|Industries))\b/.exec(text);
    E.employer = (co ? co[1] : (text.split('\n').find((l) => l.trim().length > 3) || '')).replace(/\s+/g, ' ').trim();
    const pos = /(?:position of|capacity of|works as|working as|job title\s*:?|as an?)\s+([A-Za-z][A-Za-z /&-]{2,40}?)(?=[.,\n]|\s+(?:at|in|since|with|from|for)\b)/i.exec(text);
    E.position = pos ? pos[1].trim() : '';
    E.startDate = dateAfter(text, /\bsince\b|joined[^.\n]{0,30}\bon\b|employed (?:from|since)|hired on|start(?:ing)? date|date of (?:joining|hiring)/i);
    const sal = /(?:salary|income|remuneration|wage|fees?)[^.\n]{0,50}?(?:(EGP|LE|L\.E\.?|USD|\$|EUR|€)\s*([\d,]{3,}(?:\.\d+)?)|([\d,]{3,}(?:\.\d+)?)\s*(EGP|LE|L\.E\.?|USD|\$|EUR|€|Egyptian Pounds?))/i.exec(text);
    if (sal) {
      E.monthlySalary = parseFloat((sal[2] || sal[3]).replace(/,/g, ''));
      E.salaryCurrency = currencyIn(sal[1] || sal[4]) || 'EGP';
    }
    const lv = /(?:leave|vacation|holiday|absence)[^.]{0,120}?from\s+([^\n]{6,30}?)\s+(?:to|till|until|through)\s+([^\n.]{6,30})/i.exec(text);
    if (lv) {
      E.leaveFrom = firstDate(lv[1]);
      E.leaveTo = firstDate(lv[2]);
    }
    E.returnToWorkDate = dateAfter(text, /resume (?:his|her) (?:work|duties)|return(?:ing)? to work/i);
    const freelance = /freelanc|independent (?:consultant|contractor)|consultancy basis|not employed by/i.test(text);
    E.status = freelance ? 'self_employed' : 'employed';
    if (freelance) d.issues.push({ severity: 'major', text: 'The HR letter describes freelance work, not employment — back it with the consultancy contract, invoices and bank credits showing the income', q: { text: (/freelance\s+consultancy/i.exec(text) || /freelanc\w*/i.exec(text) || ['freelance'])[0] } });
    const cash = /in cash|cash payment/i.exec(text);
    if (cash && /paid[^.]{0,60}in cash|cash payment/i.test(text)) d.issues.push({ severity: 'major', text: 'Income is paid in cash — there is no bank trail for the consulate to verify it', q: { text: cash[0] } });
    const nsi = /not registered (?:under|in|with)[^.]{0,40}social insurance/i.exec(text);
    if (nsi) d.issues.push({ severity: 'minor', text: 'Not registered in social insurance with this company — no insurance print can support the letter', q: { text: 'social insurance' } });
    if (!lv && !freelance) d.issues.push({ severity: 'major', text: 'The HR letter does not state approved leave dates for the trip.' });
    d.signedOrStamped = /stamp|signature|signed/i.test(text) ? 'yes' : 'unknown';
  }

  function parseCoverLetter(d, text) {
    const nm = /my name is\s+([A-Za-z][A-Za-z .'-]{3,80}?)(?:,|\.|\s+and\b|\s+an?\b)/i.exec(text);
    d.mainPersonName = nm ? cleanName(nm[1]) : '';
    d.mainPersonRole = 'applicant';
    const pn = /passport (?:no\.?|number)\s*:?\s*([A-Z]\d{8})/i.exec(text);
    if (pn) d.passportNumberShown = pn[1];
    const rng = /(?:from|between)\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+(?:\s+\d{4})?|[^\s]+\d{4})\s+(?:to|until|till|and)\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4}|[^\s]+\d{4})/i.exec(text);
    if (rng) {
      let a = datesIn(rng[1]);
      const b = datesIn(rng[2]);
      if (!a.length && b.length) a = datesIn(rng[1] + ' ' + U.iso(b[0].day).slice(0, 4));
      if (a.length && b.length) {
        d.application.entryDate = iso(a[0].day);
        d.application.exitDate = iso(b[0].day);
      }
    }
    const dest = /visit\s+([A-Z][a-z]+)/.exec(text);
    if (dest && toCountry(dest[1])) d.application.memberStateApplied = toCountry(dest[1]);
    d.application.purpose = /touris|leisure|holiday|sightseeing/i.test(text) ? 'tourism' : /business|meeting|conference/i.test(text) ? 'business' : /visit(?:ing)? (?:my )?(?:family|sister|brother|son|daughter|relatives|friend)/i.test(text) ? 'family' : 'unknown';
    d.ties.childrenStayHome = /children|daughters?|sons?\b/i.test(text) && /responsib|in egypt|remain|stay/i.test(text) ? 'yes' : 'unknown';
    d.ties.spouseStaysHome = /\bmy (?:husband|wife)\b/i.test(text) && !/divorc|widow/i.test(text) ? 'yes' : 'unknown';
    d.ties.ownsProperty = /\b(?:own|owner of|property|apartment|flat|villa|land)\b/i.test(text) ? 'yes' : 'unknown';
    d.application.fundedBy = /sponsor|my (?:husband|father|son|brother) will (?:cover|pay)/i.test(text) ? 'sponsor' : /cover my (?:travel|own)|own (?:expenses|funds)|my financial means/i.test(text) ? 'self' : 'unknown';
  }

  function parseItinerary(d, text) {
    const dd = datesIn(text).map((x) => x.day);
    if (dd.length >= 2) {
      d.application.entryDate = iso(Math.min.apply(null, dd));
      d.application.exitDate = iso(Math.max.apply(null, dd));
    }
    const c = countryIn(text);
    if (c && R.isSchengen(c) && d.application.entryDate) {
      d.application.destinations = [{ country: c, city: (/itinerary\s*[–-]\s*([A-Za-z]+)/i.exec(text) || [])[1] || '', from: d.application.entryDate, to: d.application.exitDate }];
      d.application.memberStateApplied = c;
    }
    d.mainPersonRole = 'applicant';
  }

  function parseAppointment(d, text) {
    const ad = dateAfter(text, /appointment date|date of appointment|appointment on|rendez-vous|termin/i) || firstDate(text);
    d.appointment.date = ad;
    d.appointment.country = /cairo|giza|alexandria|egypt/i.test(text) ? 'EG' : '';
    d.appointment.city = (/(Cairo|Alexandria|Giza|Hurghada)/i.exec(text) || [])[1] || '';
    const fc = /([A-Z][a-z]+)\s+visa application cent(?:er|re)|embassy of\s+([A-Z][a-z]+)|consulate of\s+([A-Z][a-z]+)/.exec(text);
    d.appointment.forCountry = fc ? toCountry(fc[1] || fc[2] || fc[3]) : countryIn(text);
    const nm = /\b([A-Z]{3,}(?:\s+[A-Z]{3,}){1,4})\s+(?:[A-Z]{1,2}[x\dX*]{4,}|\d{1,2}:\d{2})/.exec(text);
    d.mainPersonName = nm ? cleanName(nm[1]) : '';
    d.mainPersonRole = 'applicant';
    const cat = /visa category\s*[:\n]?\s*([A-Z]+)/i.exec(text);
    if (cat && /touris/i.test(cat[1])) d.application.purpose = 'tourism';
  }

  function parseMovements(d, text) {
    const nm = /(?:movements of|Name\s*:)[\s.…]*(?:Mr\.|Ms\.|Mrs\.)?\s*\/?\s*([A-Z][A-Z ]{5,80}?)\s*(?:,|\.\.\.|…|Date)/.exec(text);
    d.mainPersonName = nm ? cleanName(nm[1]) : '';
    d.mainPersonRole = 'applicant';
    d.dateOfBirthShown = dateAfter(text, /date of birth/i);
    d.documentDate = dateAfter(text, /issued on|date of issue|printing date/i);
    const re = /(\d{1,2}\/\d{1,2}\/\d{4})\s+Egypt\s*\/\s*([A-Za-z ()]+?)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+Egypt\s*\/\s*([A-Za-z ()]+?)(?=\s+\d{1,2}\/|\n|$)/g;
    let m;
    while ((m = re.exec(text))) {
      const dest = placeToCountry(m[2]) || placeToCountry(m[4]);
      d.travelStamps.push({ country: dest, entry: firstDate(m[1]), exit: firstDate(m[3]) });
    }
    const pps = (text.match(/\b[A-Z]\d{8}\b/g) || []).filter((x, i, a) => a.indexOf(x) === i);
    if (pps.length) d.passportNumberShown = pps[0];
  }

  function parseVisas(d, text) {
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      const c = R.countries.find((x) => x.a2 !== 'EG' && new RegExp('^\\s*' + x.name + '\\s*$', 'i').test(l.trim()));
      const sch = /schengen/i.test(l) ? 'SCHENGEN' : null;
      if (!c && !sch) return;
      const win = lines.slice(i, i + 6).join('\n');
      const dd = datesIn(win);
      if (dd.length >= 1) d.previousVisas.push({ country: c ? c.a2 : '', type: (/(tourism|business|visit|transit|work)/i.exec(win) || [])[1] || '', validFrom: iso(dd[0].day), validTo: dd[1] ? iso(dd[1].day) : '' });
    });
    d.mainPersonRole = 'applicant';
  }

  function parseProperty(d, text) {
    const buyer = /(?:second party|buyer|purchaser|owner)\s*(?:\([^)]*\))?\s*:\s*([A-Z][A-Za-z ]{5,80}?)\s*,/i.exec(text);
    d.mainPersonName = buyer ? cleanName(buyer[1]) : '';
    d.mainPersonRole = 'applicant';
    d.documentDate = firstDate(text.slice(0, 400));
    d.ties.ownsProperty = 'yes';
  }

  function parsePension(d, text) {
    const payee = /payee name\s*:\s*([A-Z][A-Z ]{5,80}?)\s+(?:payee|national|\n)/i.exec(text);
    d.mainPersonName = payee ? cleanName(payee[1]) : '';
    d.mainPersonRole = 'applicant';
    d.documentDate = dateAfter(text, /issued on|print date|date of issue/i);
    const net = /total\s+([\d,]+\.\d{2})/i.exec(text);
    if (net) {
      d.employment.monthlySalary = parseFloat(net[1].replace(/,/g, ''));
      d.employment.salaryCurrency = 'EGP';
    }
  }

  function parseFamilyRegistry(d, text) {
    d.documentDate = dateAfter(text, /date\s*:\s*|issued on/i);
    d.mainPersonRole = 'other';
    const kids = /number of children\s*:\s*(\d+)/i.exec(text);
    if (kids && +kids[1] > 0) d.ties.childrenStayHome = 'yes';
  }

  function parseInternal(d, text) {
    d.issues.push({ severity: 'minor', text: 'Internal agency document — remove it from the file sent to the embassy', q: { text: 'Client Information' } });
    const ref = /previous refusals?\s*:\s*([A-Za-z ,]+?)\s*(?:reason|\n)/i.exec(text);
    if (ref && ref[1].trim()) d.issues.push({ severity: 'minor', text: 'Agency notes mention a previous refusal (' + ref[1].trim() + ') — declare it wherever a form asks, and address it in the cover letter', q: { text: 'Previous Refusals' } });
  }

  function parseGeneric(d, text) {
    d.documentDate = d.documentDate || dateAfter(text, /\bdate\s*:|issued on|date of issue|print(?:ing)? date/i);
    if (!d.passportNumberShown) {
      const pn = /passport\s*(?:no\.?|number|#)?\s*:?\s*([A-Z]\d{8})\b/i.exec(text);
      if (pn) d.passportNumberShown = pn[1];
    }
    if (!d.dateOfBirthShown && d.mainPersonRole === 'applicant') d.dateOfBirthShown = dateAfter(text, /date of birth|birth date|\bDOB\b/i);
  }

  /* ============================== entry point ============================== */
  function parseDocument(fileName, read) {
    const text = String(read.text || '');
    const d = V.builder.blank();
    const mrzProbe = findMrz(read.mrzText || '', text);
    const hasMrz = !!(mrzProbe && mrzProbe.m && mrzProbe.m.fields && mrzProbe.m.fields.number);
    let type = classify(fileName, text, hasMrz);
    d.language = /[؀-ۿ]/.test(text) && (text.match(/[؀-ۿ]/g) || []).length > text.length * 0.3 ? 'ar' : 'en';
    d.isTranslation = /\[(?:handwritten )?signature\]|\[qr code\]|\/\/\s*stamp of|certified translation|translated by|sworn translat/i.test(text);
    d.signedOrStamped = /\[(?:handwritten )?signature\]|stamp of|seal of|\bsigned\b/i.test(text) ? 'yes' : 'unknown';
    d.isPhotocopy = false;
    switch (type) {
      case 'passport': parsePassport(d, text, read.mrzText); break;
      case 'application_form': parseApplication(d, text, read.annots); break;
      case 'flight': parseFlight(d, text); break;
      case 'accommodation': parseStay(d, text); break;
      case 'insurance': parseInsurance(d, text); break;
      case 'bank_statement': case 'sponsor_bank': parseBank(d, text); break;
      case 'employment_letter': parseEmployment(d, text); break;
      case 'cover_letter': parseCoverLetter(d, text); break;
      case 'itinerary': parseItinerary(d, text); break;
      case 'appointment': parseAppointment(d, text); break;
      case 'movement_certificate': parseMovements(d, text); break;
      case 'prev_visas': parseVisas(d, text); break;
      case 'property_docs': parseProperty(d, text); break;
      case 'pension': parsePension(d, text); break;
      case 'family_registry': parseFamilyRegistry(d, text); break;
      case 'internal': parseInternal(d, text); type = 'other'; break;
      default: break;
    }
    parseGeneric(d, text);
    d.docType = type;
    if (type === 'photo' || type === 'other') d.mainPersonRole = 'unknown';
    if (read.ocrPages && read.confidence < 45 && text.replace(/\s/g, '').length < 300 && !(type === 'passport' && d.passport.number)) d.issues.push({ severity: 'minor', text: 'Poor scan quality — little text could be read. Re-scan at 300 dpi.' });
    const words = text.replace(/\s+/g, ' ').trim();
    d.summary = (read.ocrPages ? 'Read with OCR (' + read.ocrPages + ' page' + (read.ocrPages > 1 ? 's' : '') + ', ' + Math.round(read.confidence) + '% confidence). ' : 'Read from the PDF text. ') + words.slice(0, 160) + (words.length > 160 ? '…' : '');
    return d;
  }

  V.parse = { parseDocument, classify, datesIn, findMrz };
})(typeof globalThis !== 'undefined' ? (globalThis.VFR = globalThis.VFR || {}) : (window.VFR = window.VFR || {}));
