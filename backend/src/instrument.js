import * as Sentry from "@sentry/node";
import { config } from "./config.js";
import { sanitizeSentryEvent } from "./sentry-privacy.js";

if (config.observability.sentryDsn) {
  Sentry.init({
    dsn: config.observability.sentryDsn,
    environment: config.observability.sentryEnvironment,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: sanitizeSentryEvent,
  });
}

export const sentry = config.observability.sentryDsn ? Sentry : null;
