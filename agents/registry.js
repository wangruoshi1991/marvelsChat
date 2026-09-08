import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadAgentDefinitions() {
  const files = (await fs.readdir(__dirname))
    .filter((file) => file.endsWith(".agent.js"))
    .sort();
  const definitions = await Promise.all(
    files.map(async (file) => {
      const module = await import(pathToFileURL(path.join(__dirname, file)).href);
      const agent = module.default;
      if (!agent || typeof agent.key !== "string" || !agent.key.trim()) {
        throw new Error(`Agent file ${file} must export a non-empty key`);
      }
      if (file !== `${agent.key}.agent.js`) {
        throw new Error(`Agent file ${file} must match key ${agent.key}`);
      }
      validateAgentIdentity(agent);
      validateAgentPermissions(agent);
      return agent;
    })
  );
  const keys = new Set();
  for (const agent of definitions) {
    if (keys.has(agent.key)) throw new Error(`Duplicate Agent key: ${agent.key}`);
    keys.add(agent.key);
  }
  return definitions;
}

function validateAgentIdentity(agent) {
  const identity = agent.identity;
  const colors = identity?.colors;
  if (
    identity?.avatarKind !== "agent-mark" ||
    typeof identity.mark !== "string" ||
    !identity.mark.trim() ||
    !["circle", "squircle", "rounded"].includes(identity.shape) ||
    typeof colors?.background !== "string" ||
    typeof colors?.foreground !== "string" ||
    typeof colors?.accent !== "string"
  ) {
    throw new Error(`Agent ${agent.key || "unknown"} must declare a valid identity`);
  }
  return identity;
}

export function validateAgentPermissions(agent) {
  const permissions = agent?.permissions;
  if (
    !Array.isArray(permissions) ||
    !permissions.length ||
    permissions.some(
      (scope) =>
        typeof scope !== "string" ||
        !/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(scope),
    ) ||
    new Set(permissions).size !== permissions.length
  ) {
    throw new Error(`Agent ${agent?.key || "unknown"} must declare unique valid permissions`);
  }
  return permissions;
}

export async function listAgents() {
  const agents = await loadAgentDefinitions();

  return agents.map((agent) => ({
    key: agent.key,
    name: agent.name,
    version: agent.version,
    category: agent.category,
    description: agent.description,
    capabilities: agent.capabilities,
    permissions: agent.permissions,
    identity: agent.identity,
    status: "registered"
  }));
}

export async function getAgent(key) {
  const agents = await loadAgentDefinitions();
  return agents.find((agent) => agent.key === key) || null;
}
