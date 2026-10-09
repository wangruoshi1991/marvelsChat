DO $$
DECLARE
  existing_constraint RECORD;
BEGIN
  FOR existing_constraint IN
    SELECT c.conname
    FROM pg_constraint AS c
    WHERE c.conrelid = 'media_retrieval_operator_controls'::regclass
      AND c.contype = 'c'
      AND c.conkey && ARRAY(
        SELECT attribute.attnum
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = 'media_retrieval_operator_controls'::regclass
          AND attribute.attname IN (
            'user_daily_request_limit',
            'user_monthly_budget_fen',
            'global_daily_budget_fen',
            'caption_reserve_fen',
            'embedding_reserve_fen'
          )
      )::SMALLINT[]
  LOOP
    EXECUTE format(
      'ALTER TABLE media_retrieval_operator_controls DROP CONSTRAINT %I',
      existing_constraint.conname
    );
  END LOOP;
END $$;

ALTER TABLE media_retrieval_operator_controls
  ALTER COLUMN user_daily_request_limit TYPE BIGINT,
  ALTER COLUMN user_daily_request_limit DROP NOT NULL,
  ALTER COLUMN user_monthly_budget_fen TYPE BIGINT,
  ALTER COLUMN user_monthly_budget_fen DROP NOT NULL,
  ALTER COLUMN global_daily_budget_fen TYPE BIGINT,
  ALTER COLUMN global_daily_budget_fen DROP NOT NULL,
  ALTER COLUMN caption_reserve_fen TYPE BIGINT,
  ALTER COLUMN embedding_reserve_fen TYPE BIGINT,
  ADD CONSTRAINT chk_media_retrieval_user_daily_limit_nonnegative
    CHECK (user_daily_request_limit IS NULL OR user_daily_request_limit >= 0),
  ADD CONSTRAINT chk_media_retrieval_user_monthly_budget_nonnegative
    CHECK (user_monthly_budget_fen IS NULL OR user_monthly_budget_fen >= 0),
  ADD CONSTRAINT chk_media_retrieval_global_daily_budget_nonnegative
    CHECK (global_daily_budget_fen IS NULL OR global_daily_budget_fen >= 0),
  ADD CONSTRAINT chk_media_retrieval_caption_reserve_nonnegative
    CHECK (caption_reserve_fen >= 0),
  ADD CONSTRAINT chk_media_retrieval_embedding_reserve_nonnegative
    CHECK (embedding_reserve_fen >= 0);

ALTER TABLE media_retrieval_cost_ledger
  ALTER COLUMN amount_fen TYPE BIGINT;

ALTER TABLE media_retrieval_cost_daily_rollups
  ALTER COLUMN reserved_fen TYPE BIGINT,
  ALTER COLUMN estimated_fen TYPE BIGINT,
  ALTER COLUMN unknown_fen TYPE BIGINT;

UPDATE media_retrieval_operator_controls
SET user_daily_request_limit = NULL,
    user_monthly_budget_fen = NULL,
    global_daily_budget_fen = NULL
WHERE id = TRUE;
