# Session Templates Consolidation — Implementation Plan

Status: Draft for review
Owner: Ryan
Last updated: 2026-05-05

## Goal

Consolidate `training_templates` into `session_templates` so there's one unified meeting-template system, with a `type` field distinguishing kinds of sessions and SKU/plan assignment available to all of them.

---

## Current state vs. target state

### Training Templates today
- Table: `training_templates` (id, org_id, name, **triggers[]**, duration_minutes, description)
- **Has** SKU/addon assignment via `triggers` array
- `items` table has `training_template_id` column linking session items back to their source template
- `apply-plan-template` and `generate-plan` API routes filter training templates by SKU/addon triggers and auto-build training-stage sessions
- `SettingsView` exposes a CRUD panel for these
- When a training template's name changes, linked session items (`session_name`) are synced

### Session Templates today
- Table: `session_templates` (id, org_id, name, description, duration_minutes, **agenda[]**, **tasks[]**)
- **No** triggers, **no** SKU/addon assignment
- Items have **no** `session_template_id` column — template contents are copied inline at plan creation; the link is lost
- Only used by being explicitly selected in the plan-template editor (`session_template_id` on `PlanTemplateItem` only — the structure JSON, not the items table)
- No checklist / resources / internal notes columns today (the spec asks for these)

### Gap to close
1. Add `type` to session templates
2. Add `triggers` (SKU/addon assignment) to session templates
3. Add `checklist`, `resources`, `internal_notes` columns
4. Add `session_template_id` to the `items` table for persisted linkage
5. Migrate all training templates → session templates with `type='training'`
6. Update plan generation to filter session templates by `type='training'` + triggers (replacing the dedicated training-template path)
7. Remove the Training Templates UI; the Session Templates UI gains type filtering + the new fields

---

## Schema changes

Create one Supabase migration with these steps, executed in this order:

1. **`ALTER TABLE session_templates`**
   - `ADD COLUMN type text NOT NULL DEFAULT 'sync_qa'` — values: `sync_qa | kickoff | discovery | training`. Use a CHECK constraint or enum.
   - `ADD COLUMN triggers text[] NOT NULL DEFAULT '{}'` — SKU/addon strings, mirrors training_templates.triggers
   - `ADD COLUMN checklist jsonb NOT NULL DEFAULT '[]'` — array of `{ id, text, done }` (or similar shape — confirm with current Item.checklist shape if one exists)
   - `ADD COLUMN resources jsonb NOT NULL DEFAULT '[]'` — array of `{ label, url }`
   - `ADD COLUMN internal_notes text`

2. **`ALTER TABLE items`**
   - `ADD COLUMN session_template_id uuid REFERENCES session_templates(id) ON DELETE SET NULL`

3. **Data migration — copy training_templates → session_templates**
   ```sql
   INSERT INTO session_templates
     (id, org_id, name, description, duration_minutes, type, triggers, agenda, tasks, checklist, resources, internal_notes)
   SELECT
     id, org_id, name, description, duration_minutes,
     'training' AS type,
     COALESCE(triggers, '{}'),
     '{}'::text[]   AS agenda,
     '[]'::jsonb    AS tasks,
     '[]'::jsonb    AS checklist,
     '[]'::jsonb    AS resources,
     NULL           AS internal_notes
   FROM training_templates;
   ```
   - **Reuse the same UUIDs** so existing `items.training_template_id` references still resolve when we copy them over in step 4.

4. **Backfill items.session_template_id from items.training_template_id**
   ```sql
   UPDATE items SET session_template_id = training_template_id
   WHERE training_template_id IS NOT NULL;
   ```

5. **Defer drop of `training_templates` and `items.training_template_id`** — keep them for one release as a safety net, then drop in a follow-up migration once we've verified nothing's reading from them.

---

## Type changes (`src/types/`)

### `src/types/index.ts`
- `SessionTemplate` interface: add `type`, `triggers`, `checklist`, `resources`, `internal_notes` fields. Define `SessionType = 'sync_qa' | 'kickoff' | 'discovery' | 'training'`.
- `Item` interface (line 89): add `session_template_id?: string | null`. Keep `training_template_id` for now (deprecated, will be removed after the safety period).
- `PlanTemplateItem` (line 240–241): keep `session_template_id`; deprecate `training_template_id`.
- Either delete or `@deprecated`-comment the `TrainingTemplate` interface.

### `src/types/database.ts`
- Remove `training_templates` row type (or leave during the deferred-drop period and mark deprecated).
- Update `session_templates` row type with the new columns.

---

## API route changes

### `src/app/api/apply-plan-template/route.ts`
- Stop fetching `training_templates`. Fetch only `session_templates`.
- In `buildMilestonesJSON`, replace the trigger-matching block on training templates with: filter `sessionTemplates` where `type === 'training'` AND triggers match.
- The session-item generation block already creates one item per template — no change needed there beyond writing `session_template_id` (instead of `training_template_id`) on the new item.

### `src/app/api/generate-plan/route.ts`
- Rename request-body field `trainingTemplates` → `sessionTemplates`. Filter by `type === 'training'` + triggers internally.
- Update the local TypeScript type for the request body.
- Anywhere this endpoint is called from the client, update the call site (search for `trainingTemplates:` in fetch bodies).

### `src/app/api/demo/setup/route.ts`
- No change needed for milestone naming — "Training" as a *milestone name* is a separate concept from training *templates*.
- If the demo seeds training_templates, switch it to seed session_templates with `type='training'`.

---

## UI changes

### `src/components/AppShell.tsx`
- Remove `trainingTemplates` state, props, and Supabase fetch (lines 29–31, 76, 137–138, 141–142).
- Pass only `sessionTemplates` down to AccountView, SettingsView, DashboardView (lines 380–422).

### `src/app/page.tsx`
- Drop the `training_templates` query (line 41). Pass only sessionTemplates to AppShell (line 77 → 79).

### `src/components/views/SettingsView.tsx`
- **Delete the existing TrainingTemplates panel** (lines 28–302).
- **Expand `SessionTemplatesPanel`** (lines 347–642):
  - Add a **Type** dropdown to the create/edit form (`Sync / Q&A`, `Kickoff`, `Discovery`, `Training`).
  - Add a **Triggers** checkbox grid for SKUs + addons (port from the deleted training panel).
  - Add a **Checklist** editor (mirror the existing agenda editor pattern: numbered list, add/remove rows).
  - Add a **Resources** editor (`label + url` rows).
  - Add an **Internal notes** textarea.
  - Add a **type filter** at the top of the library list: All / Sync · Q&A / Kickoff / Discovery / Training.
  - When type changes from `training`, the panel keeps the same form — no special UI mode.
- **`PlanStructureEditor`** (around lines 707–1042):
  - Replace the separate "training_template_ids" handling with a single "session_template_ids" picker that's filtered by the milestone's relevant type. The "Training" milestone shows session templates where `type='training'`; other milestones show all types or none, depending on existing UX.
  - The session-template dropdown that already exists for non-training items (line 1027–1042) becomes the only mechanism — no separate training picker.

### `src/components/views/DashboardView.tsx`
- `CreateAccountModal` and `buildMilestonesJSON`: remove the `trainingTemplates` parameter; the function now reads `sessionTemplates` and filters by `type === 'training'` for the Training milestone build.
- Update prop signatures throughout (lines 94–96, 99, 166, 357–358, 363, 409, 627–635, 916–918).

### `src/components/views/AccountView.tsx`
- Drop `trainingTemplates` prop (lines 47–48, 55).

---

## Untracked / legacy files

These root-level files (`data.js`, `plan-generator.js`, `view-secondary.jsx`, `view-ttl.jsx`, etc.) reference training templates but appear to be legacy or untracked (per `git status`). **Recommendation:** leave them as-is for now and confirm with you whether they should be deleted as part of this work or in a separate cleanup pass. They're not part of the live Next.js build.

---

## Migration & rollout sequence

1. Ship the schema migration (additive only — adds columns, copies data, **does not drop** training_templates yet).
2. Ship the code changes that read from session_templates exclusively.
3. Verify in production for one release cycle.
4. Ship a follow-up migration that drops `training_templates` and `items.training_template_id`.

This keeps a rollback path through the period between (1) and (4).

---

## Answers to the spec's open questions

1. **Editable session type after creation?**
   Recommend: **editable, with a warning** if the template is referenced by any in-flight plan (i.e., any `items.session_template_id` row exists for it). Locking entirely is too restrictive — most fields apply across types, and people will miscategorize during migration. A confirmation modal is enough friction.

2. **Default type for migrated session templates?**
   Recommend: default to `sync_qa` AND set a `needs_review` flag (a small additional boolean column, or just surface "Type was auto-assigned — confirm" inline in the UI on first edit). Don't prompt eagerly; surface it where the user is already editing.

3. **Filter the library by type?**
   Yes — straightforward UX win. Pill row at the top of the Session Templates panel: `All / Sync · Q&A / Kickoff / Discovery / Training`. Persist last-used filter in `localStorage`.

4. **Multiple types per template?**
   Recommend: **no, 1:1**. Multiple types creates conceptual ambiguity (what does a "Kickoff + Discovery" template actually mean for plan auto-assignment?). If users want similar content for multiple types, the existing **Clone** action handles it.

---

## Open implementation questions for Ryan

- **Checklist shape** — does an `Item.checklist` shape exist anywhere to mirror, or should this plan define one? (The current Session Template doesn't have a checklist; the spec is the first to introduce it.)
- **Resources shape** — `{ label, url }` proposed. Anything else needed (file uploads, descriptions)?
- **Are the root-level `view-*.jsx` and `data.js` files dead code?** They're untracked in git; should they be deleted in a separate cleanup commit before this refactor?
- **Single Supabase migration or multiple?** Recommend one migration for the additive changes, a second for the eventual drop. Confirm rollout strategy.
