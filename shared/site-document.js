export class SiteDocumentValidationError extends Error {
  constructor(code, path, message) {
    super(message);
    this.name = "SiteDocumentValidationError";
    this.code = code;
    this.path = path;
  }
}

const fail = (path, message, code = "SITE_DOCUMENT_INVALID") => {
  throw new SiteDocumentValidationError(code, path, message);
};
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const contentKeys = ["language", "theme", "title", "summary", "sections"];
const sectionKeys = ["type", "title", "subtitle", "body", "assetIds", "diaryEntryIds", "actions"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value, keys, path) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, "Expected an object.");
  if (Object.keys(value).some(key => !keys.includes(key))) fail(path, "Unknown field.");
  if (keys.some(key => !own(value, key))) fail(path, "Missing required field.");
}
function text(value, max, path, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim()) ||
    [...value].some(character => {
      const code = character.charCodeAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    }) || /<\/?[a-z][^>]*>/i.test(value)) {
    fail(path, "Expected bounded plain text.");
  }
}
function uuid(value, path) {
  if (typeof value !== "string" || !uuidPattern.test(value)) fail(path, "Expected a UUID.");
}
function ids(value, max, path) {
  if (!Array.isArray(value) || value.length > max) fail(path, "Invalid reference list.");
  value.forEach((id, index) => uuid(id, `${path}[${index}]`));
  if (new Set(value.map(id => id.toLowerCase())).size !== value.length) fail(path, "Duplicate reference.");
}
function content(value, persistent) {
  if (!["zh", "en"].includes(value.language)) fail("$.language", "Unsupported language.");
  if (!["clean", "warm", "gallery", "portfolio"].includes(value.theme)) fail("$.theme", "Unsupported theme.");
  text(value.title, 80, "$.title", true);
  text(value.summary, 240, "$.summary");
  if (!Array.isArray(value.sections) || value.sections.length < 1 || value.sections.length > 8) {
    fail("$.sections", "Expected one to eight sections.");
  }
  const sectionIds = new Set();
  value.sections.forEach((section, index) => {
    const path = `$.sections[${index}]`;
    record(section, persistent ? ["id", ...sectionKeys] : sectionKeys, path);
    if (persistent) {
      uuid(section.id, `${path}.id`);
      if (sectionIds.has(section.id.toLowerCase()) || section.id.toLowerCase() === value.documentId.toLowerCase()) {
        fail(`${path}.id`, "Duplicate node identity.");
      }
      sectionIds.add(section.id.toLowerCase());
    }
    if (!["hero", "about", "gallery", "diary", "contact"].includes(section.type)) fail(`${path}.type`, "Unsupported section.");
    text(section.title, 80, `${path}.title`, true);
    text(section.subtitle, 180, `${path}.subtitle`);
    text(section.body, 900, `${path}.body`);
    ids(section.assetIds, 12, `${path}.assetIds`);
    ids(section.diaryEntryIds, 8, `${path}.diaryEntryIds`);
    if (!Array.isArray(section.actions) || section.actions.length > 3) fail(`${path}.actions`, "Invalid action list.");
    const actionTargets = new Set();
    section.actions.forEach((action, actionIndex) => {
      const actionPath = `${path}.actions[${actionIndex}]`;
      if (action?.kind === "interaction-intent") {
        record(action, ["kind", "intent", "label", "target"], actionPath);
        if (!["open-link", "compose-message", "follow-user"].includes(action.intent)) {
          fail(`${actionPath}.intent`, "Unsupported interaction intent.");
        }
        text(action.label, 40, `${actionPath}.label`, true);
        record(action.target, ["kind", "text"], `${actionPath}.target`);
        if (action.target.kind !== "unresolved") fail(`${actionPath}.target.kind`, "Only unresolved interaction targets are supported.");
        text(action.target.text, 2048, `${actionPath}.target.text`);
        // An intent is authored content, not an executable destination. Keep
        // its text and ordered repetitions unchanged until a service resolves it.
        return;
      }
      record(action, ["kind", "label", "targetId"], actionPath);
      if (!["view-media", "view-diary"].includes(action.kind)) fail(`${actionPath}.kind`, "Unsupported action.");
      text(action.label, 40, `${actionPath}.label`, true);
      uuid(action.targetId, `${actionPath}.targetId`);
      const references = action.kind === "view-media" ? section.assetIds : section.diaryEntryIds;
      if (!references.includes(action.targetId)) fail(`${actionPath}.targetId`, "Action target is outside this section's references.");
      const target = `${action.kind}:${action.targetId.toLowerCase()}`;
      if (actionTargets.has(target)) fail(actionPath, "Duplicate action.");
      actionTargets.add(target);
    });
  });
}

export function assertSiteDocumentContent(value) {
  record(value, contentKeys, "$");
  content(value, false);
}

export function assertSiteDocument(value) {
  if (value && typeof value === "object" &&
    (own(value, "version") || (own(value, "schemaVersion") && value.schemaVersion !== 2))) {
    fail("$.schemaVersion", "This site document version is unsupported.", "SITE_DOCUMENT_UNSUPPORTED");
  }
  record(value, ["schemaVersion", "documentId", "revision", "visibility", ...contentKeys], "$");
  if (value.schemaVersion !== 2) fail("$.schemaVersion", "Expected schema version 2.");
  uuid(value.documentId, "$.documentId");
  if (value.revision !== 1) fail("$.revision", "Only immutable document revision 1 is supported.");
  if (value.visibility !== "private") fail("$.visibility", "Only private documents are supported.");
  content(value, true);
}

// Callers validate the appropriate content/document contract first.
export function collectSiteDocumentReferences(document) {
  return {
    assetIds: [...new Set(document.sections.flatMap(section => section.assetIds))],
    diaryEntryIds: [...new Set(document.sections.flatMap(section => section.diaryEntryIds))],
  };
}
