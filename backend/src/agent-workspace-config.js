export function createAgentWorkspaceConfig(env = process.env) {
  const integer = (name, defaultValue, min, max) => {
    const value = env[name] === undefined ? defaultValue : Number(env[name]);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
    return value;
  };
  return Object.freeze({
    deadlineSeconds: integer("AGENT_WORKSPACE_DEADLINE_SECONDS", 1200, 30, 86400),
  });
}
