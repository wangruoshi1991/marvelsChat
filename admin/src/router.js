export const ROUTES = ["overview", "accounts", "agents", "products", "tasks", "monitoring", "audit", "system"];

export function routePath(name) { return `/admin/${name}`; }

export function routeFromLocation(location = globalThis.location) {
  const match = location?.pathname?.match(/\/admin\/?([^/]*)/);
  const candidate = match?.[1] || "overview";
  return ROUTES.includes(candidate) ? candidate : "overview";
}

export function createRouter({ onRoute, location = globalThis.location, history = globalThis.history } = {}) {
  let current = routeFromLocation(location);
  const navigate = (next, { replace = false } = {}) => {
    const name = ROUTES.includes(next) ? next : "overview";
    current = name;
    const url = routePath(name);
    const method = replace && history?.replaceState ? history.replaceState : history?.pushState;
    if (method) method.call(history, {}, "", url);
    onRoute?.(name);
    return name;
  };
  globalThis.addEventListener?.("popstate", () => { current = routeFromLocation(location); onRoute?.(current); });
  return { get current() { return current; }, navigate };
}
