-- Add ON DELETE CASCADE to FK chains so deleting a milestone removes its stages,
-- and deleting a stage removes its items.
-- Run in the Supabase SQL editor.

-- stages.milestone_id → milestones.id
ALTER TABLE stages
  DROP CONSTRAINT IF EXISTS stages_milestone_id_fkey,
  ADD CONSTRAINT stages_milestone_id_fkey
    FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE;

-- items.stage_id → stages.id
ALTER TABLE items
  DROP CONSTRAINT IF EXISTS items_stage_id_fkey,
  ADD CONSTRAINT items_stage_id_fkey
    FOREIGN KEY (stage_id) REFERENCES stages(id) ON DELETE CASCADE;
