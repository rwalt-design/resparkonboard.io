# resparkonboard.io — Claude Instructions

## Git workflow
- Always work directly on `main`. Never create feature branches or PRs.
- After every task: `git add -A`, commit with a clear message, and `git push origin main`.
- Vercel auto-deploys on push to main — no extra deploy step needed.
- Keep commit messages short and descriptive (not "update" — say what actually changed).

## Commit style
- No co-authored-by trailers.
- One commit per task unless changes are clearly unrelated.

## Changelog — required on every commit
- Before committing, always add an entry to `src/data/changelog.ts`.
- Add a new entry at the TOP if today's date is not already there; otherwise append bullets to today's existing entry.
- Use plain language — no jargon. Write as if explaining to a non-developer.
- Bullets should describe what changed and why it matters to the user, not implementation details.
- Keep bullets short (one sentence each).
