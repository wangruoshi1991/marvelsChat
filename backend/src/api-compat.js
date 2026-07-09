const legacyApiPrefixes = Object.freeze([
  "/agents",
  "/app",
  "/auth",
  "/events",
  "/health",
  "/location",
  "/map",
  "/me",
  "/notifications",
  "/profiles",
  "/scan",
  "/search",
  "/social",
  "/station",
  "/stations",
  "/threads",
]);

const matchesPrefix = (pathname, prefix) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function shouldRewriteLegacyApiPath(pathname = "") {
  if (!pathname || pathname === "/api" || pathname.startsWith("/api/")) return false;
  return legacyApiPrefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

export function rewriteLegacyApiUrl(pathname = "", requestUrl = "") {
  if (!shouldRewriteLegacyApiPath(pathname)) return requestUrl || pathname;
  return `/api${requestUrl || pathname}`;
}

export function createLegacyApiCompatibilityMiddleware() {
  return (req, _res, next) => {
    req.url = rewriteLegacyApiUrl(req.path, req.url);
    next();
  };
}
