import crypto from "node:crypto";

export const AGENT_IDENTITY_FIELDS = Object.freeze([
  "key",
  "displayName",
  "description",
  "mark",
  "shape",
  "colors",
  "published",
  "source",
  "updatedAt",
]);
export const AGENT_IDENTITY_REQUIRED_FIELDS = AGENT_IDENTITY_FIELDS;
export const AGENT_IDENTITY_SHAPES = Object.freeze(["circle", "squircle", "rounded"]);
export const AGENT_RELEASE_CATALOG_STATUSES = Object.freeze(["draft", "review", "published", "unpublished", "archived"]);
export const PRODUCT_VERSION_STATUSES = Object.freeze(["draft", "review", "published", "paused", "retired"]);
export const ENTITLEMENT_STATUSES = Object.freeze(["enabled", "disabled", "unavailable", "reconsent_required"]);

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const AGENT_KEY = /^[a-z][a-z0-9-]{0,79}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function isCompleteAgentIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).some((key) => !AGENT_IDENTITY_FIELDS.includes(key))) return false;
  if (!AGENT_KEY.test(value.key || "") || typeof value.displayName !== "string" || !value.displayName.trim() || value.displayName.length > 120) return false;
  if (typeof value.description !== "string" || value.description.length > 2000) return false;
  if (typeof value.mark !== "string" || !value.mark.trim() || value.mark.length > 40) return false;
  if (!AGENT_IDENTITY_SHAPES.includes(value.shape)) return false;
  if (!value.colors || typeof value.colors !== "object" || Array.isArray(value.colors)) return false;
  if (["background", "foreground", "accent"].some((key) => !HEX_COLOR.test(value.colors[key] || ""))) return false;
  if (typeof value.published !== "boolean" || typeof value.source !== "string" || !value.source.trim() || value.source.length > 40) return false;
  return typeof value.updatedAt === "string" && ISO_DATE.test(value.updatedAt) && !Number.isNaN(Date.parse(value.updatedAt));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalizeContract(value) {
  return canonical(value);
}

export function computeAgentContractHash(contract) {
  return crypto.createHash("sha256").update(canonicalizeContract(contract), "utf8").digest("hex");
}

export const hashAgentContract = computeAgentContractHash;
export const stableContractJson = canonicalizeContract;
export const isAgentKey = (value) => AGENT_KEY.test(String(value || ""));
export const isSemanticVersion = (value) => VERSION.test(String(value || ""));
export const isHexColor = (value) => HEX_COLOR.test(String(value || ""));
