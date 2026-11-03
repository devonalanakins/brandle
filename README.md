# BRANDLE — The Glimmer Grove

A personalized five-letter word game made for Brandi. Forest green, teal, burnt orange, luminous visuals and independent daily/endless play. Free and open-source; no account, analytics, payment service or backend.

**Live:** https://brandle-glimmer-grove.devonakins.workers.dev/

## Local development

From this project directory (either `games/brandle` in the original monorepo or the extracted repository root), run `python3 -m http.server 8788` and open http://localhost:8788/. Any static HTTP server with ES module support works. Never open index.html as file://, because browsers restrict local module loading.

```sh
node --test tests.mjs
node build-worker.mjs
node --test worker.test.mjs
# Production deployment is managed separately until repository cutover.
```

The generator packages the static game assets into an independent Cloudflare Worker, so publication is reproducible from this repository. Do not edit generated `dist/worker.mjs`. The original monorepo's production GitHub Actions workflow deploys on changes to the game's runtime files. The extracted repository has a CI-only workflow until production ownership is verified and transferred. Once transferred, a maintainer can run `npx wrangler deploy --config wrangler.toml` with appropriately scoped Cloudflare credentials.

## Design and behavior

- Standard five-letter, six-attempt puzzle with color-accurate duplicate-letter scoring.
- Deterministic daily word based on UTC date (same answer for everyone on that UTC date); separate endless mode with recent-answer avoidance.
- Offline English guess dictionary from the permissively licensed `tabatkins/wordle-list` and independent curated common-answer bank.
- Local-only saved progress, daily and endless statistics, streaks, shareable results, first-run help, accessibility and reduced-motion settings.
- Sound synthesized on interaction. Vibration only where the browser supports `navigator.vibrate`; iOS Safari does not reliably support programmable web vibration.
- PWA manifest and service worker cache the full playable game for offline play after first successful load.

## Build / deployment boundaries

Never deploy or edit the ANEVUM apex Worker or its routing as part of BRANDLE. Deploy exclusively to `brandle-glimmer-grove` and publish on its isolated `workers.dev` subdomain.

## Attribution

See [NOTICE.md](./NOTICE.md) for the license attribution for the bundled guess dictionary. The application's source code is licensed under the included [Apache License 2.0](./LICENSE).

## Deployment reliability

The production Worker must bundle assets using `node build-worker.mjs` before deploying; do not proxy GitHub raw files into browsers, because GitHub's response Content-Security-Policy can block the game's CSS and modules. The deploy workflow tests the word engine before publishing. Mobile smoke test: at 390px viewport, the mark stays compact (around 40px), the board has 30 tiles, the keyboard has 28 keys, and both are visible.

## Standalone repository migration

This repository contains the imported Brandle source and project-specific development lineage. The original history remains available in `devonalanakins/anevum-web`; see [source migration PR #1](https://github.com/devonalanakins/brandle/pull/1). The original game deployment remains authoritative until a tested, rollback-ready cutover. No deployment secrets, game progress or personal data should be committed.
