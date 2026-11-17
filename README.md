# Visa File Review

Drop a client's visa file in and get an automatic review of **completeness, logic and consistency across every
document**. You don't type anything in and you don't need an API key: documents are read **free, on this computer**.
Built for **Egyptian applicants** for Schengen short-stay visas, and for US B1/B2, F-1 and family immigrant visas.

## Start

1. Install Node.js (version 20 or later) from nodejs.org if it isn't already installed.
2. Double-click **`start.bat`**. The first run installs the components, then the app opens at `http://localhost:5178`.
   Keep the black window open while you work.
3. Drag **all** of the client's files onto the page. PDF, scans, phone photos (JPG/PNG) and Word (.docx) all work.

A typical 15-document file is read in about 20 seconds.

## How documents are read

- **PDFs with text** (airline and hotel bookings, insurance, typed letters) are read directly. This is instant and exact.
- **Scans and photos** (passport, visas, stamped letters, translations) are read with OCR (Tesseract).
- **The passport MRZ** is read in three passes and repaired using its check digits. If a name letter is misread
  (for example O read as C), it is corrected from the typed application form. Real spelling differences
  (for example SHIMAA vs SHAIMAA) are still reported.
- **Schengen application forms filled in with a PDF editor** are read field by field: name, passport, dates, main destination and so on.
- **Word files** are read directly.

Nothing is uploaded anywhere. The only download is a one-time OCR language file (English), which is already saved in `.ocr-cache`.

## What it checks

- **Travel dates on every document:** application form, cover letter, itinerary, flights and hotels must all agree.
- **Identity:**
  - passport MRZ check digits
  - name spelling on every document ("SHIMAA OKILY" on a booking is fine, "Shaimaa Okaily" is flagged)
  - passport number and date of birth on each document
- **Bookings:**
  - flights match the declared entry and exit dates
  - cancelled bookings (bookings on hold are fine)
  - every night covered by a hotel, and the number of nights matches the dates
- **Schengen:**
  - the 90/180-day rule
  - applying 6 months to 15 days before travel
  - passport valid 3 months after the trip and issued under 10 years ago
  - the correct consulate for the main destination
  - insurance of at least €30,000 for every day of the trip, including repatriation
  - minimum funds
- **USA:**
  - interview location
  - passport valid 6 months beyond the stay
  - DS-160/DS-260 timing
  - overstays
  - F-1 and I-20 rules
  - I-864 income
  - police certificates
  - medical exam validity
- **Money and work:**
  - missing or old bank statements
  - unexplained large deposits
  - the HR-letter salary against the bank statement
  - leave covering the trip, using Egypt's Friday–Saturday weekend
  - **freelance work or income paid in cash**
- **The file itself:**
  - missing documents
  - unsigned letters
  - translations
  - legalization (Egyptian Ministry of Foreign Affairs → embassy)
  - an **internal agency sheet left in the file**
  - an appointment date that has already passed
  - the recommended order to stack the file and names for the uploaded files

The report has four tabs:
- **Findings**, grouped into four levels:
  - **Must fix before submitting**
  - **Should fix**
  - **Worth checking**
  - **For your information**

  Each finding has a picture of the exact field in the document, with the wrong value boxed in red. For example, the arrival date on the application form appears next to the date on the flight booking. Click a picture to open it full size.
- **Consistency**: each fact compared across every document
- **Checklist & order**
- **Extracted case**: what was read from each document

The upload list shows the document type the app detected. If it is wrong, choose another type and the review updates instantly.

### Agency rules applied

- The **visa fee receipt** and **photo** aren't required in the uploaded file.
- When there's an **HR or company letter**, no tax card or commercial register is asked for.
- The **motivation or cover letter and the itinerary** may use the client's full name or a different spelling. Official documents (HR letter, bank, insurance and so on) must still match the passport.
- Flight and hotel reservations **on hold** are accepted.

## Tests

```bash
npm test
```

## Files

```
start.bat            launcher
server.mjs           local server (serves the app, reads documents, fetches exchange rates)
lib/reader.mjs       PDF text + OCR (with a parallel OCR worker pool)
lib/parse.mjs        turns a document's text into fields (flights, hotels, insurance, forms, letters…)
lib/docx.mjs         Word reader
lib/snippet.mjs      field pictures for the findings (finds the value on the page and boxes it)
js/builder.js        combines all documents into one case
js/engine.js         every check
js/docs.js           required documents per visa type
js/ref-data.js       countries, airports, cities, Schengen states, Apostille list, funds rules
tests/               74 tests
tools/               developer tools (read a folder and print the review from the command line)
```
