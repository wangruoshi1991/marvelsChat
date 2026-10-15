import crypto from "node:crypto";
import { assertSiteDocument, collectSiteDocumentReferences, SiteDocumentValidationError } from "../../shared/site-document.js";
import { withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { mapStationDiaryEntry, mapStationMediaAsset } from "./repository-mappers.js";

const canonical = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const hashSiteDocumentValue = value => crypto.createHash("sha256").update(canonical(value)).digest("hex");

export function validateStoredSiteDocument(document, draftId) {
  try {
    assertSiteDocument(document);
  } catch (error) {
    if (!(error instanceof SiteDocumentValidationError)) throw error;
    throw new HttpError(409, error.code === "SITE_DOCUMENT_UNSUPPORTED"
      ? "This site document version is unsupported. Create a new draft."
      : "The saved site document is invalid.", { code: error.code, path: error.path });
  }
  if (document.documentId !== draftId) {
    throw new HttpError(409, "The document identity does not match its draft.", { code: "SITE_DOCUMENT_INVALID" });
  }
  return document;
}

export async function readSiteDocumentResources(connection, userId, document) {
  assertSiteDocument(document);
  const references = collectSiteDocumentReferences(document);
  const resources = { mediaAssets: [], diaryEntries: [] };
  const versions = { assets: [], diaries: [] };
  for (const [key, ids, table, versionColumn, predicate, mapper, versionKey] of [
    ["mediaAssets", references.assetIds, "station_media_assets", "content_revision_at", " AND status = 'uploaded'", mapStationMediaAsset, "assets"],
    ["diaryEntries", references.diaryEntryIds, "station_diary_entries", "updated_at", "", mapStationDiaryEntry, "diaries"],
  ]) {
    if (!ids.length) continue;
    // Read every referenced row, irrespective of bootstrap/list pagination.
    // Locks keep this view and its approval digest in the same database snapshot.
    const rows = await connection.query(`SELECT *, ${versionColumn}::text AS document_version,
      updated_at::text AS document_modified FROM ${table} WHERE user_id = ?
      AND id = ANY(?::text[]) AND deleted_at IS NULL${predicate} ORDER BY id FOR SHARE`, [userId, ids]);
    const present = new Set(rows.map(row => row.id));
    if (ids.some(id => !present.has(id))) {
      throw new HttpError(409, "A site document reference is missing, deleted, unavailable or belongs to another account.", {
        code: "SITE_TASK_REFERENCES_UNAVAILABLE",
      });
    }
    resources[key] = rows.map(mapper);
    versions[versionKey] = rows.map(row => ({ id: row.id, version: row.document_version, modified: row.document_modified }));
  }
  return { ...resources, resourcesHash: hashSiteDocumentValue(versions) };
}

export async function getStationSiteDocumentForUser({ userId, draftId, transaction = withTransaction, authorizeWorkspaceDraft = null }) {
  return transaction(async connection => {
    const [identity] = await connection.query(`SELECT id, workspace_node_id FROM station_site_drafts
      WHERE id = ? AND user_id = ? AND source = 'model'`, [draftId, userId]);
    if (!identity) throw new HttpError(404, "Site draft not found.");
    let row;
    if (identity.workspace_node_id) {
      const authorize = authorizeWorkspaceDraft ?? (await import("./agent-workspace-service.js")).authorizeWorkspaceSiteDraftRead;
      row = await authorize({ connection, userId, draftId, workspaceNodeId: identity.workspace_node_id });
    } else {
      [row] = await connection.query(`SELECT * FROM station_site_drafts
        WHERE id = ? AND user_id = ? AND source = 'model' FOR SHARE`, [draftId, userId]);
      if (!row) throw new HttpError(404, "Site draft not found.");
      if (row.workspace_node_id) throw new HttpError(409, "The page draft ownership changed.", { code: "WORKSPACE_SITE_BINDING_INVALID" });
    }
    if (row.deleted_at) throw new HttpError(409, "The site draft was deleted.", { code: "SITE_DOCUMENT_UNAVAILABLE" });
    const document = validateStoredSiteDocument(row.draft, row.id);
    const resources = await readSiteDocumentResources(connection, userId, document);
    return { document, documentHash: hashSiteDocumentValue(document), ...resources };
  });
}
