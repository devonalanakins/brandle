# Brandle deployment ownership handover — staged, inactive

**Status: NOT ACTIVATED.** The candidate file `.github/staged-releases/brandle-production.yml` is outside GitHub Actions' executable `.github/workflows/` directory. It is a review template, not a deployment workflow. The live game remains owned by `devonalanakins/anevum-web/.github/workflows/deploy-brandle.yml`.

## Existing evidence

- Current Cloudflare Worker: `brandle-glimmer-grove` at `https://brandle-glimmer-grove.devonakins.workers.dev/`.
- Live deployed asset bytes matched all twelve assets in standalone `main` and in the original monorepo in small job 003.
- Last observed Cloudflare version: `1c48deb3-6c35-4b9b-9d84-a37d2596ca70` (deployment `86970d97-7975-45e5-a000-0fba9a7379f6`). These are checkpoints, **not** evidence of a rehearsed rollback.
- Standalone source CI on commit `391f10866438dd4f3541f217094860297bbec0a6` passed in [run 41117000501](https://github.com/devonalanakins/brandle/actions/runs/41117000501).
- The original monorepo deploy workflow still accepts selected pushes to `main` and manual dispatch. Never activate this new release mechanism alongside it.

## Pre-cutover gates — all must be verified

1. Confirm the actual Worker deployment has not changed since the source parity audit. Recheck current Cloudflare version and twelve asset digests immediately before cutover.
2. Create a Cloudflare API token limited to the necessary Worker deployment permissions and account. Do not commit or disclose token contents. Verify it does not permit changes to other applications.
3. Configure standalone GitHub environment `brandle-production` with an appropriate approval gate and main-only deployment branch restriction. Store `BRANDLE_CLOUDFLARE_API_TOKEN` and `BRANDLE_CLOUDFLARE_ACCOUNT_ID` as protected environment secrets. Confirm GitHub administrator access and environment protection; file review alone cannot prove this.
4. Document and **rehearse** rollback to the known Cloudflare Worker version without changing ANEVUM apex routing. Verify the game still loads and plays afterward, preserving local browser progress.
5. Disable both push and manual production deployment from `anevum-web/.github/workflows/deploy-brandle.yml`, while retaining read-only verification and history. Confirm the retirement commit is on the default branch and no other writer targets the same Worker.
6. In a separate reviewed PR, move the staged template to `.github/workflows/brandle-production.yml`. Only then set repo variables `BRANDLE_RELEASE_OWNER=standalone` and `BRANDLE_LEGACY_DEPLOY_DISABLED=true`; values are **not** set by this document.
7. Review the exact standalone main SHA; manually dispatch with that SHA. Check build/test outcome, Cloudflare deployment identifier, live HTTP routes, game scoring, offline/PWA behavior, and mobile layout. Roll back if anything differs.

## Important limitations of the staged template

- It is manual-only, with no push or PR deployment trigger.
- It gates on repo/ref, two independently configured owner flags, a protected environment, and an exact SHA reachable from `main`; the flags are not evidence of actual legacy retirement.
- `wrangler.toml` is checked against the expected Worker name, entrypoint and `workers_dev` setting, but this is not a comprehensive Cloudflare permission audit.
- The post-release smoke only requests HTTP assets; it is not equivalent to a real browser gameplay test.
- A GitHub environment name alone does **not** enforce reviewers or prevent all deployments. Confirm protection rules in GitHub settings.
- This template has not been activated, deployed, or rollback-tested. Keep it inert until the above gates are satisfied.
