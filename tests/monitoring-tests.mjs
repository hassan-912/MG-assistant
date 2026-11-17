import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeEvent, sanitizeSpan } from '../lib/monitoring-privacy.mjs';

const config = { origin: 'https://mg-assistant-mauve.vercel.app', release: 'mg-assistant@test', environment: 'test' };
const secret = 'PRIVATE-PASSPORT-12345';

test('error reports omit document data while retaining application source locations', () => {
  const event = {
    event_id: 'a'.repeat(32), timestamp: 1700000000, message: secret,
    user: { email: secret }, request: { url: config.origin + '/?name=' + secret, data: secret },
    breadcrumbs: [{ message: secret }], extra: { document: secret }, contexts: { document: secret },
    tags: { operation: 'document_read', filename: secret },
    exception: { values: [{ type: 'TypeError', value: secret, mechanism: { handled: true, data: { secret } },
      stacktrace: { frames: [
        { filename: config.origin + '/js/app.js?file=' + secret, lineno: 100, colno: 5, function: secret, vars: { secret }, context_line: secret },
        { filename: 'blob:' + config.origin + '/' + secret, lineno: 2 },
        { filename: 'https://external.example/' + secret + '.js', lineno: 1 },
      ] } }] },
  };
  const safe = sanitizeEvent(event, config);
  assert.ok(!JSON.stringify(safe).includes(secret));
  assert.equal(safe.exception.values[0].type, 'TypeError');
  assert.equal(safe.exception.values[0].stacktrace.frames.length, 1);
  assert.equal(safe.exception.values[0].stacktrace.frames[0].filename, config.origin + '/js/app.js');
  assert.equal(safe.exception.values[0].stacktrace.frames[0].lineno, 100);
  assert.equal(safe.release, 'mg-assistant@test');
  assert.equal(safe.tags.operation, 'document_read');
  assert.equal(event.exception.values[0].value, secret, 'does not mutate the original exception');
});

test('custom exception types, operations and message-only events cannot leak content', () => {
  const safe = sanitizeEvent({ tags: { operation: secret }, exception: { values: [{ type: secret, value: secret }] } }, config);
  assert.ok(!JSON.stringify(safe).includes(secret));
  assert.equal(safe.exception.values[0].type, 'Error');
  assert.equal(sanitizeEvent({ message: secret }, config), null);
});

test('performance spans retain timing and trace IDs but omit names, attributes and links', () => {
  const safe = sanitizeSpan({
    trace_id: 'b'.repeat(32), span_id: 'c'.repeat(16), parent_span_id: 'd'.repeat(16),
    name: secret, start_timestamp: 10, end_timestamp: 11, is_segment: true, status: 'ok',
    attributes: { 'sentry.op': 'pageload', 'url.full': secret, 'user.email': secret },
    links: [{ attributes: { document: secret } }], extra: secret,
  }, config);
  assert.ok(!JSON.stringify(safe).includes(secret));
  assert.equal(safe.trace_id, 'b'.repeat(32));
  assert.equal(safe.end_timestamp - safe.start_timestamp, 1);
  assert.equal(safe.attributes['sentry.op'], 'pageload');
});
