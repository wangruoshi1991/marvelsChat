import { mapSegment, toInteger, vectorLiteral } from "./media-retrieval-repository-shared.js";
import { MEDIA_RETRIEVAL_CONSENT_VERSION } from "./media-retrieval-constants.js";
import { assertEmbeddingProvenance } from "./media-retrieval-provenance.js";

const normalizedTerms = (terms, maximum) =>
  Array.from(new Set(terms || []))
    .map((term) => String(term || "").trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, maximum);

const sourceRowsCte = (userId) => ({
  sql: `WITH source_rows AS (
      SELECT
        segment.user_id,
        segment.media_asset_id,
        asset.kind,
        asset.album_id,
        asset.content_revision_at,
        segment.frame_timestamp_ms,
        segment.descriptor,
        segment.embedding,
        segment.embedding_provenance,
        asset.caption,
        asset.tags,
        asset.metadata,
        segment.created_at AS source_created_at
      FROM media_retrieval_segments AS segment
      JOIN station_media_assets AS asset ON asset.id = segment.media_asset_id AND asset.user_id = segment.user_id
      JOIN media_retrieval_profiles AS profile ON profile.user_id = segment.user_id
      WHERE segment.user_id = ?
        AND segment.state = 'ready'
        AND profile.index_state = 'enabled'
        AND profile.consent_version = ?
        AND asset.status = 'uploaded'
        AND asset.deleted_at IS NULL
        AND segment.created_at >= asset.content_revision_at
    )`,
  params: [userId, MEDIA_RETRIEVAL_CONSENT_VERSION],
});

export function createMediaRetrievalRetrievalRepository({ query } = {}) {
  if (typeof query !== "function") {
    throw new TypeError("Media retrieval retrieval repository requires a query function.");
  }

  const searchMediaRetrievalSegments = async ({
    userId,
    vector = null,
    embeddingProvenance = null,
    lexicalTerms,
    identityTerms = [],
    kind = null,
    albumId = null,
    limit = 10,
  }) => {
    const normalizedVector = vectorLiteral(vector);
    if (lexicalTerms !== undefined) throw new TypeError("Local lexical retrieval is not supported.");
    const source = sourceRowsCte(userId);
    const clauses = ["s.user_id = ?"];
    const params = [userId];
    if (normalizedVector) {
      const provenance = assertEmbeddingProvenance(embeddingProvenance);
      clauses.push("s.embedding_provenance = ?::jsonb");
      params.push(JSON.stringify(provenance));
    }
    if (kind) {
      clauses.push("s.kind = ?");
      params.push(kind);
    }
    if (albumId) {
      clauses.push("s.album_id = ?");
      params.push(albumId);
    }
    const exactIdentityTerms = normalizedTerms(identityTerms, 12);
    for (const term of exactIdentityTerms) {
      clauses.push(`(
        lower(COALESCE(s.caption, '')) = lower(?)
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(s.tags, '[]'::jsonb)) AS tag(value)
          WHERE lower(tag.value) = lower(?)
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(s.descriptor -> 'ocrText', '[]'::jsonb)) AS ocr(value)
          WHERE lower(ocr.value) = lower(?)
        )
      )`);
      params.push(term, term, term);
    }
    const orderBy = normalizedVector
      ? "s.embedding <=> ?::vector ASC, s.source_created_at DESC"
      : "s.source_created_at DESC";
    const queryParams = normalizedVector
      ? [...source.params, normalizedVector, normalizedVector, ...params, normalizedVector, Math.min(160, Math.max(1, toInteger(limit, 10)))]
      : [...source.params, null, null, ...params, Math.min(160, Math.max(1, toInteger(limit, 10)))];
    const rows = await query(
      `${source.sql}
      SELECT
        s.media_asset_id,
        s.frame_timestamp_ms,
        s.descriptor,
        s.kind,
        s.content_revision_at,
        s.caption,
        s.tags,
        s.metadata,
        CASE WHEN s.embedding IS NULL OR ?::vector IS NULL THEN NULL ELSE 1 - (s.embedding <=> ?::vector) END AS score,
        '[]'::jsonb AS match_reasons
      FROM source_rows AS s
      WHERE ${clauses.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT ?`,
      queryParams,
    );
    return rows.map(mapSegment);
  };

  const getMediaRetrievalVisualSources = async ({ userId, mediaAssetIds, indexEpoch }) => {
    if (!Array.isArray(mediaAssetIds) || !mediaAssetIds.length || mediaAssetIds.length > 20 ||
      new Set(mediaAssetIds).size !== mediaAssetIds.length ||
      mediaAssetIds.some(id => typeof id !== "string" || !/^[a-f0-9-]{36}$/iu.test(id)) ||
      !Number.isSafeInteger(indexEpoch) || indexEpoch < 1) throw new TypeError("Invalid retrieval visual sources.");
    const rows = await query(`SELECT a.id, a.user_id, a.kind, a.storage_key, a.mime_type, a.byte_size, a.status, a.content_revision_at
      FROM station_media_assets AS a
      JOIN media_retrieval_profiles AS p ON p.user_id = a.user_id
      WHERE a.user_id = ? AND a.id IN (${mediaAssetIds.map(() => "?").join(",")})
        AND a.status = 'uploaded' AND a.deleted_at IS NULL
        AND p.index_state = 'enabled' AND p.consent_version = ? AND p.index_epoch = ?`,
    [userId, ...mediaAssetIds, MEDIA_RETRIEVAL_CONSENT_VERSION, indexEpoch]);
    return rows.map(row => ({
      id: row.id, userId: row.user_id, kind: row.kind, storageKey: row.storage_key, mimeType: row.mime_type,
      byteSize: toInteger(row.byte_size), status: row.status,
      contentRevisionAt: new Date(row.content_revision_at).toISOString(),
    }));
  };

  return { searchMediaRetrievalSegments, getMediaRetrievalVisualSources };
}
