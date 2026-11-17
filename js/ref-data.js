/* Visa File Review Engine — reference data.
 * Figures change over time: every value here can be overridden in the app's
 * "Reference values" section, and the report says which reference was used. */
(function (V) {
  'use strict';
  const R = (V.ref = {});

  // alpha2 | alpha3 (as used in passport MRZ) | name
  const RAW =
    'AF|AFG|Afghanistan;AL|ALB|Albania;DZ|DZA|Algeria;AD|AND|Andorra;AO|AGO|Angola;AG|ATG|Antigua and Barbuda;' +
    'AR|ARG|Argentina;AM|ARM|Armenia;AU|AUS|Australia;AT|AUT|Austria;AZ|AZE|Azerbaijan;BS|BHS|Bahamas;BH|BHR|Bahrain;' +
    'BD|BGD|Bangladesh;BB|BRB|Barbados;BY|BLR|Belarus;BE|BEL|Belgium;BZ|BLZ|Belize;BJ|BEN|Benin;BT|BTN|Bhutan;' +
    'BO|BOL|Bolivia;BA|BIH|Bosnia and Herzegovina;BW|BWA|Botswana;BR|BRA|Brazil;BN|BRN|Brunei;BG|BGR|Bulgaria;' +
    'BF|BFA|Burkina Faso;BI|BDI|Burundi;CV|CPV|Cabo Verde;KH|KHM|Cambodia;CM|CMR|Cameroon;CA|CAN|Canada;' +
    'CF|CAF|Central African Republic;TD|TCD|Chad;CL|CHL|Chile;CN|CHN|China;CO|COL|Colombia;KM|COM|Comoros;' +
    'CG|COG|Congo;CD|COD|Congo (DRC);CR|CRI|Costa Rica;CI|CIV|Cote d\'Ivoire;HR|HRV|Croatia;CU|CUB|Cuba;CY|CYP|Cyprus;' +
    'CZ|CZE|Czechia;DK|DNK|Denmark;DJ|DJI|Djibouti;DM|DMA|Dominica;DO|DOM|Dominican Republic;EC|ECU|Ecuador;' +
    'EG|EGY|Egypt;SV|SLV|El Salvador;GQ|GNQ|Equatorial Guinea;ER|ERI|Eritrea;EE|EST|Estonia;SZ|SWZ|Eswatini;' +
    'ET|ETH|Ethiopia;FJ|FJI|Fiji;FI|FIN|Finland;FR|FRA|France;GA|GAB|Gabon;GM|GMB|Gambia;GE|GEO|Georgia;' +
    'DE|DEU|Germany;GH|GHA|Ghana;GR|GRC|Greece;GD|GRD|Grenada;GT|GTM|Guatemala;GN|GIN|Guinea;GW|GNB|Guinea-Bissau;' +
    'GY|GUY|Guyana;HT|HTI|Haiti;HN|HND|Honduras;HK|HKG|Hong Kong;HU|HUN|Hungary;IS|ISL|Iceland;IN|IND|India;' +
    'ID|IDN|Indonesia;IR|IRN|Iran;IQ|IRQ|Iraq;IE|IRL|Ireland;IL|ISR|Israel;IT|ITA|Italy;JM|JAM|Jamaica;JP|JPN|Japan;' +
    'JO|JOR|Jordan;KZ|KAZ|Kazakhstan;KE|KEN|Kenya;KI|KIR|Kiribati;XK|RKS|Kosovo;KW|KWT|Kuwait;KG|KGZ|Kyrgyzstan;' +
    'LA|LAO|Laos;LV|LVA|Latvia;LB|LBN|Lebanon;LS|LSO|Lesotho;LR|LBR|Liberia;LY|LBY|Libya;LI|LIE|Liechtenstein;' +
    'LT|LTU|Lithuania;LU|LUX|Luxembourg;MO|MAC|Macao;MG|MDG|Madagascar;MW|MWI|Malawi;MY|MYS|Malaysia;MV|MDV|Maldives;' +
    'ML|MLI|Mali;MT|MLT|Malta;MH|MHL|Marshall Islands;MR|MRT|Mauritania;MU|MUS|Mauritius;MX|MEX|Mexico;' +
    'FM|FSM|Micronesia;MD|MDA|Moldova;MC|MCO|Monaco;MN|MNG|Mongolia;ME|MNE|Montenegro;MA|MAR|Morocco;' +
    'MZ|MOZ|Mozambique;MM|MMR|Myanmar;NA|NAM|Namibia;NR|NRU|Nauru;NP|NPL|Nepal;NL|NLD|Netherlands;NZ|NZL|New Zealand;' +
    'NI|NIC|Nicaragua;NE|NER|Niger;NG|NGA|Nigeria;KP|PRK|North Korea;MK|MKD|North Macedonia;NO|NOR|Norway;OM|OMN|Oman;' +
    'PK|PAK|Pakistan;PW|PLW|Palau;PS|PSE|Palestine;PA|PAN|Panama;PG|PNG|Papua New Guinea;PY|PRY|Paraguay;PE|PER|Peru;' +
    'PH|PHL|Philippines;PL|POL|Poland;PT|PRT|Portugal;QA|QAT|Qatar;RO|ROU|Romania;RU|RUS|Russia;RW|RWA|Rwanda;' +
    'KN|KNA|Saint Kitts and Nevis;LC|LCA|Saint Lucia;VC|VCT|Saint Vincent and the Grenadines;WS|WSM|Samoa;' +
    'SM|SMR|San Marino;ST|STP|Sao Tome and Principe;SA|SAU|Saudi Arabia;SN|SEN|Senegal;RS|SRB|Serbia;SC|SYC|Seychelles;' +
    'SL|SLE|Sierra Leone;SG|SGP|Singapore;SK|SVK|Slovakia;SI|SVN|Slovenia;SB|SLB|Solomon Islands;SO|SOM|Somalia;' +
    'ZA|ZAF|South Africa;KR|KOR|South Korea;SS|SSD|South Sudan;ES|ESP|Spain;LK|LKA|Sri Lanka;SD|SDN|Sudan;' +
    'SR|SUR|Suriname;SE|SWE|Sweden;CH|CHE|Switzerland;SY|SYR|Syria;TW|TWN|Taiwan;TJ|TJK|Tajikistan;TZ|TZA|Tanzania;' +
    'TH|THA|Thailand;TL|TLS|Timor-Leste;TG|TGO|Togo;TO|TON|Tonga;TT|TTO|Trinidad and Tobago;TN|TUN|Tunisia;' +
    'TR|TUR|Turkiye;TM|TKM|Turkmenistan;TV|TUV|Tuvalu;UG|UGA|Uganda;UA|UKR|Ukraine;AE|ARE|United Arab Emirates;' +
    'GB|GBR|United Kingdom;US|USA|United States;UY|URY|Uruguay;UZ|UZB|Uzbekistan;VU|VUT|Vanuatu;VA|VAT|Vatican City;' +
    'VE|VEN|Venezuela;VN|VNM|Vietnam;YE|YEM|Yemen;ZM|ZMB|Zambia;ZW|ZWE|Zimbabwe';

  R.countries = RAW.split(';').map((s) => {
    const [a2, a3, name] = s.split('|');
    return { a2, a3, name };
  });
  R.byA2 = {};
  R.byA3 = {};
  R.countries.forEach((c) => {
    R.byA2[c.a2] = c;
    R.byA3[c.a3] = c;
  });
  // MRZ quirks: Germany uses "D", UK variants, stateless/refugee codes.
  R.mrzAlias = { D: 'DE', GBD: 'GB', GBN: 'GB', GBO: 'GB', GBP: 'GB', GBS: 'GB', UNO: null, XXA: null, XXB: null, XXC: null };
  R.countryName = (a2) => (a2 && R.byA2[a2] ? R.byA2[a2].name : a2 || '—');

  R.schengen = ['AT', 'BE', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IT', 'LV', 'LI', 'LT',
    'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH'];
  R.isSchengen = (a2) => R.schengen.indexOf(a2) !== -1;
  R.eu = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
    'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];

  // Hague Apostille Convention parties (verify at hcch.net — overridable per document).
  R.apostille = ['AD', 'AL', 'AG', 'AR', 'AM', 'AU', 'AT', 'AZ', 'BS', 'BH', 'BB', 'BY', 'BE', 'BZ', 'BO', 'BA', 'BW',
    'BR', 'BN', 'BG', 'BI', 'CV', 'CA', 'CL', 'CN', 'CO', 'CR', 'HR', 'CY', 'CZ', 'DK', 'DM', 'DO', 'EC', 'SV', 'EE',
    'SZ', 'FJ', 'FI', 'FR', 'GE', 'DE', 'GR', 'GD', 'GT', 'GY', 'HN', 'HK', 'HU', 'IS', 'IN', 'ID', 'IE', 'IL', 'IT',
    'JP', 'KZ', 'KR', 'XK', 'KG', 'LV', 'LS', 'LR', 'LI', 'LT', 'LU', 'MO', 'MW', 'MT', 'MH', 'MU', 'MX', 'MD', 'MC',
    'MN', 'ME', 'MA', 'NA', 'NL', 'NZ', 'NI', 'MK', 'NO', 'OM', 'PK', 'PW', 'PA', 'PY', 'PE', 'PH', 'PL', 'PT', 'RO',
    'RU', 'RW', 'WS', 'SM', 'ST', 'SA', 'RS', 'SC', 'SG', 'SK', 'SI', 'ZA', 'ES', 'KN', 'LC', 'VC', 'SR', 'SE', 'CH',
    'TJ', 'TO', 'TT', 'TN', 'TR', 'UA', 'GB', 'US', 'UY', 'UZ', 'VU', 'VE'];
  R.isApostille = (a2) => R.apostille.indexOf(a2) !== -1;

  // Official / commonly accepted document languages per Schengen state (English accepted by most consulates).
  R.languages = {
    AT: ['de'], BE: ['fr', 'nl', 'de'], BG: ['bg'], HR: ['hr'], CZ: ['cs'], DK: ['da'], EE: ['et'], FI: ['fi', 'sv'],
    FR: ['fr'], DE: ['de'], GR: ['el'], HU: ['hu'], IS: ['is'], IT: ['it'], LV: ['lv'], LI: ['de'], LT: ['lt'],
    LU: ['fr', 'de', 'lb'], MT: ['mt'], NL: ['nl'], NO: ['no'], PL: ['pl'], PT: ['pt'], RO: ['ro'], SK: ['sk'],
    SI: ['sl'], ES: ['es'], SE: ['sv'], CH: ['de', 'fr', 'it'], US: ['en'],
  };
  R.languageList = [
    ['en', 'English'], ['ar', 'Arabic'], ['fr', 'French'], ['de', 'German'], ['es', 'Spanish'], ['it', 'Italian'],
    ['pt', 'Portuguese'], ['nl', 'Dutch'], ['ru', 'Russian'], ['tr', 'Turkish'], ['zh', 'Chinese'], ['hi', 'Hindi'],
    ['ur', 'Urdu'], ['fa', 'Persian'], ['el', 'Greek'], ['pl', 'Polish'], ['ro', 'Romanian'], ['uk', 'Ukrainian'],
    ['bg', 'Bulgarian'], ['hr', 'Croatian'], ['cs', 'Czech'], ['da', 'Danish'], ['et', 'Estonian'], ['fi', 'Finnish'],
    ['sv', 'Swedish'], ['hu', 'Hungarian'], ['is', 'Icelandic'], ['lv', 'Latvian'], ['lt', 'Lithuanian'],
    ['mt', 'Maltese'], ['no', 'Norwegian'], ['sk', 'Slovak'], ['sl', 'Slovenian'], ['lb', 'Luxembourgish'],
    ['other', 'Other'],
  ];

  /* Schengen means-of-subsistence reference amounts (EUR). Approximate national figures —
   * `calc(days, accommodationType)` returns the total required. Override in the app if your consulate differs. */
  const perDay = (rate, min) => (d) => Math.max(rate * d, min || 0);
  R.schengenFunds = {
    AT: { calc: perDay(30), note: 'about €30 per day' },
    BE: { calc: (d, acc) => (acc === 'host' ? 45 : 95) * d, note: '€95/day (hotel) or €45/day (staying with host)' },
    BG: { calc: perDay(51), note: 'BGN 100 (~€51) per day' },
    HR: { calc: perDay(70), note: 'about €70 per day' },
    CZ: { calc: perDay(52), note: 'about CZK 1,300 (~€52) per day' },
    DK: { calc: perDay(47), note: 'DKK 350 (~€47) per day' },
    EE: { calc: perDay(60), note: 'no fixed published figure — €60/day used' },
    FI: { calc: perDay(50), note: '€50 per day' },
    FR: { calc: (d, acc) => (acc === 'host' ? 32.5 : acc === 'hotel' ? 65 : 120) * d, note: '€120/day, €65/day with hotel booked, €32.50/day with host' },
    DE: { calc: perDay(45), note: '€45 per day' },
    GR: { calc: perDay(50), note: '€50 per day' },
    HU: { calc: perDay(60), note: 'no fixed published figure — €60/day used' },
    IS: { calc: perDay(53), note: 'ISK 8,000 (~€53) per day' },
    IT: {
      calc: (d) => (d <= 5 ? 269.6 : d <= 10 ? 44.93 * d : d <= 20 ? 51.64 + 36.67 * d : 206.58 + 27.89 * d),
      note: 'Italian Interior Ministry table (1 person)',
    },
    LV: { calc: perDay(60), note: 'no fixed published figure — €60/day used' },
    LI: { calc: perDay(105), note: 'CHF 100 (~€105) per day' },
    LT: { calc: perDay(40), note: '€40 per day' },
    LU: { calc: perDay(60), note: 'no fixed published figure — €60/day used' },
    MT: { calc: perDay(48), note: '€48 per day' },
    NL: { calc: perDay(55), note: '€55 per day' },
    NO: { calc: perDay(45), note: 'NOK 500 (~€45) per day' },
    PL: { calc: (d) => (d <= 4 ? 130 : 70 * d), note: 'PLN 300 (~€70) per day, PLN 600 minimum' },
    PT: { calc: (d) => 75 + 40 * d, note: '€75 per entry + €40 per day' },
    RO: { calc: perDay(50), note: 'about €50 per day' },
    SK: { calc: perDay(56), note: 'about €56 per day' },
    SI: { calc: perDay(70), note: '€70 per day' },
    ES: { calc: perDay(118.4, 1065.6), note: '10% of Spanish minimum wage per day (2025: €118.40), min €1,065.60' },
    SE: { calc: perDay(40), note: 'SEK 450 (~€40) per day' },
    CH: { calc: perDay(105), note: 'CHF 100 (~€105) per day' },
  };
  R.schengenFundsDefault = 60;

  // HHS poverty guidelines (2025) used for Form I-864 at 125%. Update yearly.
  R.poverty = {
    year: 2025,
    contiguous: { base: 15650, add: 5500 },
    AK: { base: 19550, add: 6880 },
    HI: { base: 17990, add: 6330 },
  };

  // Airports (IATA → country) used to read flight bookings.
  const AIR = {
    EG: 'CAI HRG SSH HBE LXR ASW RMF SPX ABS HMB', AT: 'VIE SZG INN GRZ LNZ KLU', FR: 'CDG ORY NCE LYS MRS TLS BOD NTE BVA', DE: 'FRA MUC BER TXL DUS HAM CGN STR HAJ NUE LEJ',
    NL: 'AMS RTM EIN', BE: 'BRU CRL', CH: 'ZRH GVA BSL', IT: 'FCO CIA MXP LIN BGY VCE NAP BLQ PSA FLR CTA PMO TRN', ES: 'MAD BCN AGP PMI VLC SVQ ALC IBZ TFS LPA',
    PT: 'LIS OPO FAO FNC', GR: 'ATH SKG HER JTR JMK RHO CFU', DK: 'CPH BLL', SE: 'ARN GOT', NO: 'OSL BGO', FI: 'HEL', IS: 'KEF', CZ: 'PRG', HU: 'BUD', PL: 'WAW KRK GDN WRO',
    RO: 'OTP CLJ', BG: 'SOF VAR', HR: 'ZAG SPU DBV', SI: 'LJU', SK: 'BTS', LV: 'RIX', EE: 'TLL', LT: 'VNO', LU: 'LUX', MT: 'MLA',
    GB: 'LHR LGW MAN STN LTN EDI BHX', IE: 'DUB', TR: 'IST SAW AYT ESB ADB DLM BJV', CY: 'LCA PFO', AL: 'TIA', RS: 'BEG', SA: 'JED RUH DMM MED', AE: 'DXB AUH SHJ DWC',
    QA: 'DOH', KW: 'KWI', BH: 'BAH', OM: 'MCT', JO: 'AMM AQJ', LB: 'BEY', TN: 'TUN', MA: 'CMN RAK', DZ: 'ALG',
    US: 'JFK EWR LGA IAD DCA BOS ORD LAX SFO SEA MIA MCO ATL DFW IAH DEN LAS PHX PHL DTW MSP CLT SAN', CA: 'YYZ YUL YVR',
    TH: 'BKK HKT', MY: 'KUL', ID: 'CGK DPS', SG: 'SIN', IN: 'DEL BOM', LK: 'CMB', MV: 'MLE', CN: 'PEK PVG', HK: 'HKG', JP: 'NRT HND', KR: 'ICN', ET: 'ADD', KE: 'NBO', ZA: 'JNB CPT',
  };
  R.airports = {};
  Object.keys(AIR).forEach((c) => AIR[c].split(' ').forEach((code) => (R.airports[code] = c)));
  // Cities (lower case) → country, for bookings, itineraries and movement certificates.
  const CITY = {
    EG: 'cairo|alexandria|giza|hurghada|sharm el sheikh|sharm el-sheikh|luxor|aswan|el gouna|marsa alam', AT: 'vienna|wien|salzburg|innsbruck|graz|linz|hallstatt',
    FR: 'paris|nice|lyon|marseille|toulouse|bordeaux|strasbourg', DE: 'berlin|munich|münchen|frankfurt|hamburg|cologne|köln|düsseldorf|dusseldorf|stuttgart',
    NL: 'amsterdam|rotterdam|the hague', BE: 'brussels|bruxelles|antwerp|bruges', CH: 'zurich|zürich|geneva|genève|basel|lucerne|interlaken|bern',
    IT: 'rome|roma|milan|milano|venice|venezia|florence|firenze|naples|napoli|pisa|bologna', ES: 'madrid|barcelona|seville|sevilla|malaga|málaga|valencia|granada|ibiza',
    PT: 'lisbon|lisboa|porto', GR: 'athens|santorini|mykonos|thessaloniki|crete', DK: 'copenhagen', SE: 'stockholm', NO: 'oslo', FI: 'helsinki', IS: 'reykjavik',
    CZ: 'prague|praha', HU: 'budapest', PL: 'warsaw|krakow|kraków', RO: 'bucharest', BG: 'sofia', HR: 'zagreb|dubrovnik|split', SI: 'ljubljana', SK: 'bratislava',
    LV: 'riga', EE: 'tallinn', LT: 'vilnius', LU: 'luxembourg', MT: 'valletta|malta',
    TR: 'istanbul|antalya|ankara|izmir|bodrum|trabzon', GB: 'london|manchester|edinburgh', IE: 'dublin', AL: 'tirana|albania', RS: 'belgrade', CY: 'larnaca|limassol|paphos',
    QA: 'doha|qatar', KW: 'kuwait', SA: 'riyadh|jeddah|jiddah|mecca|makkah|medina|madinah|dammam', AE: 'dubai|abu dhabi|sharjah', OM: 'muscat|oman', BH: 'manama|bahrain',
    JO: 'amman|aqaba', LB: 'beirut', TN: 'tunis', MA: 'casablanca|marrakech', TH: 'bangkok|phuket', MY: 'kuala lumpur|malaysia', ID: 'jakarta|bali|indonesia',
    LK: 'colombo|sri lanka', MV: 'male|maldives', SG: 'singapore', IN: 'delhi|mumbai|india', US: 'new york|washington|los angeles|chicago|miami|orlando|houston|san francisco|boston|las vegas',
    CA: 'toronto|montreal|vancouver', CN: 'beijing|shanghai', JP: 'tokyo', KR: 'seoul',
  };
  R.cities = {};
  Object.keys(CITY).forEach((c) => CITY[c].split('|').forEach((n) => (R.cities[n] = c)));

  R.programs = {
    schengen: 'Schengen short-stay visa (type C)',
    us_b1b2: 'USA visitor visa (B1/B2)',
    us_f1: 'USA student visa (F-1)',
    us_iv: 'USA immigrant visa (family: IR/CR/F2A)',
  };
})(typeof globalThis !== 'undefined' ? (globalThis.VFR = globalThis.VFR || {}) : (window.VFR = window.VFR || {}));
