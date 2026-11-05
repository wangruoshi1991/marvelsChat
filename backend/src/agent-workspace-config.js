export function createAgentWorkspaceConfig(env = process.env) {
  const integer = (name, defaultValue, min, max) => {
    const value = env[name] === undefined ? defaultValue : Number(env[name]);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
    return value;
  };
  return Object.freeze({
    deadlineSeconds: integer("AGENT_WORKSPACE_DEADLINE_SECONDS", 1200, 30, 86400),
    // Independent nodes are safe to execute concurrently. Keep the bound
    // explicit so the worker can start all currently supported participants
    // without turning queue pressure into unbounded provider calls.
    // The planner can persist up to 20 specialist nodes. Keep the default
    // conservative, but allow an explicitly configured worker pool to run
    // more than four independent nodes in waves when a task needs it.
    maxConcurrent: integer("AGENT_WORKSPACE_MAX_CONCURRENT", 4, 1, 20),
  });
}
