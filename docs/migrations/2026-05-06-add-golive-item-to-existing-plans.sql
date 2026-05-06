-- Add a Go Live item as the first item in every "Launch" stage within a Go-Live
-- milestone, for all accounts that don't already have one.

-- Step 1: Shift existing items in target stages up by 1 to make room at position 0
UPDATE items
SET order_index = order_index + 1
WHERE stage_id IN (
  SELECT s.id
  FROM stages s
  JOIN milestones m ON m.id = s.milestone_id
  WHERE (m.name ILIKE '%go%live%' OR m.name ILIKE '%go-live%')
    AND (s.name ILIKE 'launch' OR s.name ILIKE 'go live' OR s.name ILIKE 'go-live')
    AND s.id NOT IN (SELECT DISTINCT stage_id FROM items WHERE type = 'golive')
);

-- Step 2: Insert the Go Live item at position 0 in each target stage
INSERT INTO items (id, stage_id, type, required, order_index, task_name, task_done)
SELECT
  gen_random_uuid(),
  s.id,
  'golive',
  true,
  0,
  'Go Live',
  false
FROM stages s
JOIN milestones m ON m.id = s.milestone_id
WHERE (m.name ILIKE '%go%live%' OR m.name ILIKE '%go-live%')
  AND (s.name ILIKE 'launch' OR s.name ILIKE 'go live' OR s.name ILIKE 'go-live')
  AND s.id NOT IN (SELECT DISTINCT stage_id FROM items WHERE type = 'golive');
