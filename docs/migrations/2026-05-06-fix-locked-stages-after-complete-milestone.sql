-- For every milestone where ALL stages are complete, find the first stage of the
-- next milestone (by order_index, same account) that is still locked and activate it.

UPDATE stages
SET status = 'active'
WHERE id IN (
  SELECT DISTINCT ON (next_m.id) first_stage.id
  FROM milestones AS cur_m
  -- cur_m must have all stages complete
  JOIN (
    SELECT milestone_id
    FROM stages
    GROUP BY milestone_id
    HAVING COUNT(*) FILTER (WHERE status <> 'complete') = 0
      AND COUNT(*) > 0
  ) AS all_complete ON all_complete.milestone_id = cur_m.id
  -- find the immediately next milestone for the same account
  JOIN milestones AS next_m
    ON next_m.account_id = cur_m.account_id
   AND next_m.order_index = (
     SELECT MIN(m2.order_index)
     FROM milestones m2
     WHERE m2.account_id = cur_m.account_id
       AND m2.order_index > cur_m.order_index
   )
  -- first stage of that next milestone that is still locked
  JOIN stages AS first_stage
    ON first_stage.milestone_id = next_m.id
   AND first_stage.status = 'locked'
   AND first_stage.order_index = (
     SELECT MIN(s2.order_index)
     FROM stages s2
     WHERE s2.milestone_id = next_m.id
   )
  ORDER BY next_m.id
);
