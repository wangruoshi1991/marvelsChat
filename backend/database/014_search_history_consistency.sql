WITH ranked_queries AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, LOWER(query_text)
      ORDER BY created_at DESC, id DESC
    ) AS position
  FROM search_history
)
DELETE FROM search_history history
USING ranked_queries ranked
WHERE history.id = ranked.id
  AND ranked.position > 1;

WITH ranked_history AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY created_at DESC, id DESC
    ) AS position
  FROM search_history
)
DELETE FROM search_history history
USING ranked_history ranked
WHERE history.id = ranked.id
  AND ranked.position > 12;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_search_history_user_query_ci
  ON search_history (user_id, LOWER(query_text));
