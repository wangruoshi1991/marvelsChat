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
      if (Object.hasOwn(agent, "runtimeModes")) throw new Error(`Agent ${agent.key} cannot declare derived runtime modes`);
      if (file !== `${agent.key}.agent.js`) {
        throw new Error(`Agent file ${file} must match key ${agent.key}`);
      }
      validateAgentIdentity(agent);
      validateAgentPermissions(agent);
      validateAgentWorkspaceCapabilities(agent);
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

// Display capabilities do not authorize execution. Only this typed declaration
// can be matched to a backend executor with the same contract and scopes.
export function validateAgentWorkspaceCapabilities(agent, { runtimeModes = null } = {}) {
  if (agent.workspaceCapabilities === undefined) return [];
  if (!Array.isArray(agent.workspaceCapabilities) || !agent.workspaceCapabilities.length ||
    !/^\d+\.\d+\.\d+$/.test(agent.version || "")) {
    throw new Error(`Agent ${agent.key} must declare valid versioned workspace capabilities`);
  }
  const seen = new Set();
  const fields = ["capability", "description", "inputKinds", "dependencyKinds", "outputKind", "requiredScopes"];
  for (const entry of agent.workspaceCapabilities) {
    if (!entry || Object.keys(entry).length !== fields.length || fields.some(key => !Object.hasOwn(entry, key)) ||
      !/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/.test(entry.capability) || seen.has(entry.capability) ||
      typeof entry.description !== "string" || !entry.description.trim() || entry.description.length > 500 ||
      !["media_selection", "site_draft", "text_result", "workspace_decision"].includes(entry.outputKind) ||
      !Array.isArray(entry.inputKinds) || entry.inputKinds.some(kind => !["station-album", "station-photo", "station-diary", "chat-message", "station-file"].includes(kind)) ||
      !Array.isArray(entry.dependencyKinds) || entry.dependencyKinds.some(kind => !["media_selection", "site_draft", "text_result"].includes(kind)) ||
      !Array.isArray(entry.requiredScopes) || !entry.requiredScopes.length ||
      entry.requiredScopes.some(scope => !agent.permissions.includes(scope)) ||
      [entry.inputKinds, entry.dependencyKinds, entry.requiredScopes].some(values => new Set(values).size !== values.length) ||
      (entry.outputKind === "workspace_decision" && typeof agent.coordinate !== "function") ||
      (entry.outputKind === "text_result" && typeof agent.contribute !== "function" && !runtimeModes?.includes("contribute"))) {
      throw new Error(`Agent ${agent.key} has an invalid workspace capability declaration`);
    }
    seen.add(entry.capability);
  }
  return agent.workspaceCapabilities;
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
    workspaceCapabilities: agent.workspaceCapabilities || [],
    runtimeModes: ["plan", "chat", "dispatch", "coordinate", "contribute", "discussWorkspace"].filter(mode => typeof agent[mode] === "function"),
    identity: agent.identity,
    status: "registered"
  }));
}

export async function getAgent(key) {
  const agents = await loadAgentDefinitions();
  return agents.find((agent) => agent.key === key) || null;
}
