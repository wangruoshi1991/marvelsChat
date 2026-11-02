-- Product presentation belongs to the reviewed version contract. A new draft
-- must never mutate the presentation or hash of an older published version.
ALTER TABLE product_versions ADD COLUMN IF NOT EXISTS display_name VARCHAR(120);
ALTER TABLE product_versions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE product_versions ADD COLUMN IF NOT EXISTS identity_snapshot JSONB;

UPDATE product_versions v SET display_name = p.display_name,
  description = p.description, identity_snapshot = p.identity_snapshot
FROM products p WHERE p.id = v.product_id
  AND (v.display_name IS NULL OR v.description IS NULL OR v.identity_snapshot IS NULL);

ALTER TABLE product_versions ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE product_versions ALTER COLUMN description SET NOT NULL;
ALTER TABLE product_versions ALTER COLUMN identity_snapshot SET NOT NULL;
ALTER TABLE product_versions DROP CONSTRAINT IF EXISTS chk_product_version_identity;
ALTER TABLE product_versions ADD CONSTRAINT chk_product_version_identity
  CHECK (jsonb_typeof(identity_snapshot) = 'object');
