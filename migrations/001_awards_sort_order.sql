-- Awards had no ordering column, so both athlete routes fell back to
-- ORDER BY date_earned DESC. Nothing ever writes date_earned, so every row sorted on a
-- NULL and the four award slots came back in an arbitrary order after each save.
--
-- sort_order mirrors the existing `tags.sort_order` and is written from the form position.
-- Safe to re-run.

ALTER TABLE awards ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Give existing rows a stable order rather than leaving them all on 0. date_earned first
-- where it happens to be set, then creation order.
WITH ordered AS (
	SELECT id, ROW_NUMBER() OVER (
		PARTITION BY profile_id
		ORDER BY date_earned ASC NULLS LAST, created_at ASC
	) - 1 AS position
	FROM awards
)
UPDATE awards a
SET sort_order = ordered.position
FROM ordered
WHERE a.id = ordered.id AND a.sort_order = 0;

CREATE INDEX IF NOT EXISTS idx_awards_profile_sort ON awards (profile_id, sort_order);
