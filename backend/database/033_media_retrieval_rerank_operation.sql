ALTER TABLE media_retrieval_cost_ledger
  DROP CONSTRAINT IF EXISTS chk_media_retrieval_cost_ledger_operation;

ALTER TABLE media_retrieval_cost_ledger
  ADD CONSTRAINT chk_media_retrieval_cost_ledger_operation
  CHECK (operation IN ('query-parse', 'query-embedding', 'query-rerank', 'image-description', 'image-embedding'));
