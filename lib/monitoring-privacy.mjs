// Only allow fixed application metadata. Parser errors can contain document text.
const operations = new Set(['document_read', 'review', 'unhandled']);
const errorTypes = new Set(['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'URIError', 'EvalError']);
const scripts = new Set(['ref-data', 'util', 'docs', 'engine', 'builder', 'parse', 'locate', 'reader', 'snippet', 'lightbox', 'app', 'monitoring.bundle']);
const hex = (value, length) => typeof value === 'string' && new RegExp('^[a-f0-9]{' + length + '}$').test(value) ? value : undefined;
const time = (value) => Number.isFinite(value) ? value : undefined;

function safeFrame(frame, origin) {
  try {
    const url = new URL(frame.filename, origin);
    const match = /^\/js\/([a-z.-]+)\.js$/.exec(url.pathname);
    if (url.origin !== origin || !match || !scripts.has(match[1])) return null;
    return {
      filename: origin + url.pathname,
      lineno: Number.isInteger(frame.lineno) && frame.lineno > 0 ? frame.lineno : undefined,
      colno: Number.isInteger(frame.colno) && frame.colno > 0 ? frame.colno : undefined,
      in_app: true,
    };
  } catch { return null; }
}

export function sanitizeEvent(event, config) {
  if (!event.exception?.values?.length) return null;
  const operation = operations.has(event.tags?.operation) ? event.tags.operation : 'unhandled';
  return {
    event_id: hex(event.event_id, 32), timestamp: time(event.timestamp),
    platform: 'javascript', level: 'error', release: config.release, environment: config.environment,
    request: { url: config.origin + '/' },
    tags: { operation },
    exception: { values: event.exception.values.slice(-3).map((exception) => ({
      type: errorTypes.has(exception.type) ? exception.type : 'Error',
      value: 'MG Assistant ' + operation + ' failure (details withheld for document privacy)',
      mechanism: { type: 'generic', handled: exception.mechanism?.handled === true },
      stacktrace: { frames: (exception.stacktrace?.frames || []).map((frame) => safeFrame(frame, config.origin)).filter(Boolean).slice(-30) },
    })) },
  };
}

export function sanitizeSpan(span, config) {
  return {
    trace_id: hex(span.trace_id, 32), span_id: hex(span.span_id, 16), parent_span_id: hex(span.parent_span_id, 16),
    name: span.is_segment ? 'MG Assistant page load' : 'Browser timing',
    start_timestamp: time(span.start_timestamp), end_timestamp: time(span.end_timestamp),
    status: span.status === 'error' ? 'error' : 'ok', is_segment: span.is_segment === true,
    attributes: {
      'sentry.op': span.is_segment ? 'pageload' : 'browser',
      'sentry.release': config.release, 'sentry.environment': config.environment,
    },
  };
}
