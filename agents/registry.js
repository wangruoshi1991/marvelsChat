import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export async function listAgents() {
  const files = (await fs.readdir(__dirname)).filter((file) => file.endsWith(".agent.js"));
  const agents = await Promise.all(
    files.map(async (file) => {
      const module = await import(pathToFileURL(path.join(__dirname, file)).href);
      return module.default;
    })
  );

  return agents.map((agent) => ({
    key: agent.key,
    name: agent.name,
    version: agent.version,
    category: agent.category,
    description: agent.description,
    capabilities: agent.capabilities,
    permissions: agent.permissions,
    identity: validateAgentIdentity(agent),
    status: "registered"
  }));
}

export async function getAgent(key) {
  const agents = await listAgents();
  const match = agents.find((agent) => agent.key === key);
  if (!match) return null;

  const file = `${key}.agent.js`;
  try {
    const module = await import(pathToFileURL(path.join(__dirname, file)).href);
    return module.default;
  } catch {
    const files = (await fs.readdir(__dirname)).filter((item) => item.endsWith(".agent.js"));
    for (const candidate of files) {
      const module = await import(pathToFileURL(path.join(__dirname, candidate)).href);
      if (module.default?.key === key) return module.default;
    }
  }

  return null;
}
