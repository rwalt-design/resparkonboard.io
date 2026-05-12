# resparkonboard.io — Claude Instructions

## Git workflow
- Always work directly on `main`. Never create feature branches or PRs.
- After every task: `git add -A`, commit with a clear message, and `git push origin main`.
- Vercel auto-deploys on push to main — no extra deploy step needed.
- Keep commit messages short and descriptive (not "update" — say what actually changed).

## Commit style
- No co-authored-by trailers.
- One commit per task unless changes are clearly unrelated.
