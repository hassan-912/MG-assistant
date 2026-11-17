import * as Sentry from '@sentry/browser';
import { sanitizeEvent, sanitizeSpan } from './monitoring-privacy.mjs';

const V = (globalThis.VFR = globalThis.VFR || {});
V.monitoring = { capture() {} };
// Monitoring is optional: a blocked SDK or reporting failure must never stop review.
try {
  const config = { origin: location.origin, release: __MONITORING_RELEASE__, environment: __MONITORING_ENVIRONMENT__ };
  Sentry.init({
    dsn: 'https://520c4c3902edf9a8c60d4f7a8dcc4ea9@o4512299351605248.ingest.de.sentry.io/4512447878922320',
    release: config.release,
    environment: config.environment,
    defaultIntegrations: false,
    integrations: [
      Sentry.globalHandlersIntegration(), Sentry.browserApiErrorsIntegration(),
      Sentry.eventFiltersIntegration(), Sentry.dedupeIntegration(),
      Sentry.browserTracingIntegration({
        instrumentNavigation: false, instrumentBfcacheRestore: false,
        traceFetch: false, traceXHR: false, enableHTTPTimings: false,
        enableLongTask: false, enableLongAnimationFrame: false,
        webVitals: { ignore: ['inp', 'lcp', 'cls'] },
        beforeStartSpan: (options) => ({ ...options, name: 'MG Assistant page load', attributes: {} }),
      }),
    ],
    dataCollection: {
      userInfo: false, cookies: false, httpHeaders: false, httpBodies: [],
      urlQueryParams: false, stackFrameVariables: false, frameContextLines: 0,
      genAI: { inputs: false, outputs: false }, mcp: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false }, databaseQueryData: false, queues: false,
    },
    maxBreadcrumbs: 0,
    beforeSendLog: () => null,
    beforeSendMetric: () => null,
    tracesSampleRate: config.environment === 'production' ? 0.1 : 1,
    tracePropagationTargets: [],
    beforeSend: (event, hint) => {
      // Attachments are never permitted, even if a later caller adds them.
      if (hint) hint.attachments = [];
      return sanitizeEvent(event, config);
    },
    beforeSendSpan: (span) => sanitizeSpan(span, config),
  });
  V.monitoring.capture = (error, operation) => {
    try { Sentry.captureException(error, { tags: { operation } }); } catch { /* keep review available */ }
  };
} catch { /* keep review available */ }
