WITH ranked AS (
  SELECT
    id,
    display_name,
    row_number() OVER (PARTITION BY lower(display_name) ORDER BY created_at ASC, id ASC) AS duplicate_rank
  FROM users
)
UPDATE users u
SET display_name = left(r.display_name, 31) || '_' || substr(replace(u.id, '-', ''), 1, 8)
FROM ranked r
WHERE u.id = r.id
  AND r.duplicate_rank > 1;

UPDATE user_profiles p
SET nickname = u.display_name,
    avatar_text = left(u.display_name, 1)
FROM users u
WHERE p.user_id = u.id
  AND p.nickname IS DISTINCT FROM u.display_name;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_display_name_lower ON users (lower(display_name));
