#!/usr/bin/env bash
#
# Regenerate the precompiled Tailwind stylesheet (/tw.css) for the three landing
# pages after changing any classes in index/homeowners/auto.html. Run from
# anywhere; needs network (npx fetches tailwindcss v3 on first run).
#
#   bash tools/build-css.sh
#
# To refresh the self-hosted Inter woff2 (/fonts), re-run the font fetch noted in
# the PR; it rarely changes.
set -euo pipefail
cd "$(dirname "$0")/.."
npx --yes tailwindcss@3.4.19 -c tools/tailwind.config.js -i tools/tw-input.css -o tw.css --minify
echo "wrote $(pwd)/tw.css"
