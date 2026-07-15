const sensitiveUrlPattern = /https?:\/\/[^\s)\]}]+/gi;

export const redactSensitiveText = (value) => String(value || "")
  .replace(sensitiveUrlPattern, "[redacted-url]")
  .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
  .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, "[redacted-key]")
  .replace(/(\/api\/homepage-(?:previews|shares)\/)[A-Za-z0-9_-]{20,}/g, "$1[redacted]")
  .replace(/(\/(?:preview|s)\/)[A-Za-z0-9_-]{20,}/g, "$1[redacted]");

export function sanitizeSentryEvent(event) {
  if (event.request) {
    event.request.url = redactSensitiveText(event.request.url);
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    delete event.request.headers;
  }
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }
  event.message = event.message ? redactSensitiveText(event.message) : event.message;
  for (const value of event.exception?.values || []) {
    value.value = redactSensitiveText(value.value);
  }
  for (const breadcrumb of event.breadcrumbs || []) {
    breadcrumb.message = breadcrumb.message
      ? redactSensitiveText(breadcrumb.message)
      : breadcrumb.message;
    delete breadcrumb.data;
  }
  delete event.extra;
  return event;
}
