// Manual end-to-end check. Supply PLAYWRIGHT_MODULE as the installed Playwright index.mjs path.
// Uses only synthetic data in an isolated browser context; no customer files.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5181';
const marker = 'SYNTHETIC-PRIVATE-PASSPORT-918273';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const payloads = [];
  const responses = [];
  await page.route('https://*.ingest.de.sentry.io/**', async (route) => {
    const payload = route.request().postData() || '';
    payloads.push(payload);
    if (payload.includes(marker)) return route.abort();
    await route.continue();
  });
  page.on('response', (response) => {
    if (response.url().includes('.ingest.de.sentry.io/')) responses.push(response.status());
  });
  await page.goto(origin + '/?client=' + marker);
  await page.waitForFunction(() => globalThis.VFR?.engine?.run && globalThis.VFR?.monitoring);
  // Force a genuine error in the running app's review path, using its real startup/init.
  await page.evaluate((text) => {
    VFR.engine.run = function verificationFailure() { throw new Error(text); };
  }, marker);
  await page.locator('#fileInput').setInputFiles({
    name: marker + '.txt', mimeType: 'text/plain',
    buffer: Buffer.from('Travel itinerary\nApplicant: Synthetic Test\nParis, France\n10 January 2027 to 20 January 2027'),
  });
  await page.locator('#report').getByText('Review error:', { exact: true }).waitFor();
  for (let i = 0; i < 30 && !responses.length; i++) await page.waitForTimeout(500);
  assert.ok(payloads.some((body) => body.includes('MG Assistant review failure')), 'real app error was reported');
  assert.ok(payloads.every((body) => !body.includes(marker)), 'no document filename, query or error text in any envelope');
  assert.ok(responses.includes(200), 'Sentry accepted an envelope');
  const eventEnvelope = payloads.find((body) => body.includes('MG Assistant review failure'));
  const event = eventEnvelope.split('\n').map((line) => { try { return JSON.parse(line); } catch { return null; } }).find((item) => item?.exception);
  assert.ok(event.exception.values[0].stacktrace.frames.some((frame) => frame.filename.endsWith('/js/app.js') && frame.lineno > 0));
  console.log(JSON.stringify({ eventId: event.event_id, release: event.release, environment: event.environment, accepted: responses, privacy: 'passed' }));
  await page.close();

  const blocked = await browser.newPage();
  await blocked.route('**/js/monitoring.bundle.js', (route) => route.abort());
  await blocked.goto(origin);
  await blocked.locator('#fileInput').setInputFiles({
    name: 'synthetic-itinerary.txt', mimeType: 'text/plain', buffer: Buffer.from('Travel itinerary\nParis, France\n10 January 2027 to 20 January 2027'),
  });
  await blocked.waitForFunction(() => document.querySelector('#report')?.textContent.includes('Findings'));
  console.log('Document review works when monitoring is blocked');
} finally {
  await browser.close();
}
