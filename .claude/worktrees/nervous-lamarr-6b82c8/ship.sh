#!/bin/bash
# Usage: ./ship.sh "optional commit message"
msg="${1:-update}"
git add -A
git commit -m "$msg" || { echo "Nothing to commit."; exit 0; }
git push
echo "✓ Pushed — Vercel will deploy automatically."
