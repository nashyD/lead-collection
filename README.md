# State Farm renters lead funnel

Static landing funnel for Anthony Gallant (renters / homeowners / auto / life),
served on Vercel with a few serverless functions under `api/`. The four public
pages are `index.html` (renters), `homeowners.html`, `auto.html`, and
`life.html`. `dashboard.html` is the internal lead view.

## Precompiled CSS: rebuild after any class edit

The public pages do not use the Tailwind CDN. They load a single precompiled
stylesheet, `tw.css`, which is committed to the repo. Its sources live in
`tools/`:

- `tools/tw-input.css` — `@tailwind` layers, the self-hosted Inter `@font-face`
  rules, and custom rules (e.g. `.text-balance`).
- `tools/tailwind.config.js` — palette, font, content globs, and the safelist.
- `tools/build-css.sh` — the build. Pins `tailwindcss@3.4.19` exactly so the
  minified output is byte-for-byte reproducible.

**If you add, remove, or rename a Tailwind class in `index.html`,
`homeowners.html`, `auto.html`, or `life.html`, you must regenerate `tw.css`:**

```bash
bash tools/build-css.sh
```

Then commit the regenerated `tw.css` alongside the HTML change. Skipping this is
silent: the page references a class that the stale stylesheet does not define,
so the element ships unstyled on live paid traffic.

### Drift guard

Two things keep `tw.css` honest:

1. The exact version pin in `tools/build-css.sh` makes the build deterministic.
2. The `css-drift` GitHub Actions workflow (`.github/workflows/css-drift.yml`)
   reruns the build on every PR and push to `main` that touches the pages,
   `tools/`, or `tw.css`, then fails if `git diff --exit-code tw.css` is dirty.
   A class edit committed without a rebuild turns the check red before it can
   reach production.

If CI flags drift, run `bash tools/build-css.sh` locally and commit the result.

## Fonts

Inter is self-hosted in `fonts/` (two woff2 subsets, latin + latin-ext) to drop
the render-blocking Google Fonts request. The files are stable-named, so they
rarely change. Refresh instructions are noted in `tools/build-css.sh`.

## Caching

`vercel.json` sets `Cache-Control` for the stable-named assets:

- `/tw.css` — `max-age=300, must-revalidate`. Short, because the filename has no
  content hash; a rebuild needs to reach browsers within minutes.
- `/fonts/*.woff2` — `max-age=31536000, immutable`. The fonts effectively never
  change; if they ever do, rename the file.

## Deploy

Vercel serves the repo root as a static site plus the `api/` functions.
`.vercelignore` keeps build inputs (`tools/`), dev seed scripts (`scripts/`),
CI config, docs, and the DB schema out of the deployment, since none of them are
served to visitors.
