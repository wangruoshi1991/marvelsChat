export const MODULE_PERMISSIONS = {
  overview: "users:read",
  accounts: "users:read",
  agents: "agents:manage",
  products: "products:manage",
  tasks: "tasks:read",
  monitoring: "audit:read",
  audit: "audit:read",
  system: "model:operate",
};

export function hasPermission(user, permission) {
  if (!permission) return false;
  if (user?.role !== "admin") return false;
  const permissions = Array.isArray(user.adminPermissions) ? user.adminPermissions : [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function visibleModules(user, modules = MODULE_PERMISSIONS) {
  return Object.keys(modules).filter((name) => hasPermission(user, modules[name]));
}

export function canMutate(user, permission) {
  return hasPermission(user, permission);
}
