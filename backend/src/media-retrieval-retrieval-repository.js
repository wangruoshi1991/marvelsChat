import { mapSegment, toInteger, vectorLiteral } from "./media-retrieval-repository-shared.js";

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
        segment.frame_timestamp_ms,
        segment.descriptor,
        segment.embedding,
        asset.caption,
        asset.tags,
        asset.metadata,
        segment.created_at AS source_created_at
      FROM media_retrieval_segments AS segment
      JOIN station_media_assets AS asset ON asset.id = segment.media_asset_id AND asset.user_id = segment.user_id
      WHERE segment.user_id = ?
        AND segment.state = 'ready'
        AND asset.status = 'uploaded'
        AND asset.deleted_at IS NULL
    )`,
  params: [userId],
});

export function createMediaRetrievalRetrievalRepository({ query } = {}) {
  if (typeof query !== "function") {
    throw new TypeError("Media retrieval retrieval repository requires a query function.");
  }

  const searchMediaRetrievalSegments = async ({
    userId,
    vector = null,
    lexicalTerms = [],
    identityTerms = [],
    kind = null,
    albumId = null,
    limit = 10,
  }) => {
    const normalizedVector = vectorLiteral(vector);
    const terms = normalizedTerms(lexicalTerms, 6);
    const source = sourceRowsCte(userId);
    const clauses = ["s.user_id = ?"];
    const params = [userId];
    if (kind) {
      clauses.push("s.kind = ?");
      params.push(kind);
    }
    if (albumId) {
      clauses.push("s.album_id = ?");
      params.push(albumId);
    }
    if (terms.length) {
      const lexicalClauses = terms.map(() => "(s.caption ILIKE ? OR s.tags::text ILIKE ? OR s.descriptor::text ILIKE ? OR s.metadata::text ILIKE ?)");
      clauses.push(`(${lexicalClauses.join(" AND ")})`);
      for (const term of terms) {
        const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
        params.push(pattern, pattern, pattern, pattern);
      }
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

  return { searchMediaRetrievalSegments };
}
