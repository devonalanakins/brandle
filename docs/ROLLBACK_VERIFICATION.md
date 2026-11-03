# Brandle rollback verification — preparation only

This is an audit procedure, not an executed rollback. No production Worker, deployment setting, user progress, or repository release ownership is changed by this document.

## Verified inputs

- Independent source and CI: `devonalanakins/brandle`. Latest verified game assets matched 12/12 deployed assets in small job 003.
- Worker name: `brandle-glimmer-grove`.
- Original deployed version at the last verified checkpoint: `1c48deb3-6c35-4b9b-9d84-a37d2596ca70`.
- Original deployment ID: `86970d97-7975-45e5-a000-0fba9a7379f6`.
- Existing writer: `devonalanakins/anevum-web/.github/workflows/deploy-brandle.yml`.
- Standalone writer: inactive. An inactive candidate remains under `.github/staged-releases/`.

## Read-only verification before any rollback rehearsal

1. Fetch the latest Cloudflare Worker deployment and confirm its active version identifier. Stop if the active version differs from the release being evaluated.
2. Compare the exact twelve served assets against the expected standalone Git commit. Require HTTP 200, expected content types, no redirects, and matching cryptographic hashes. Never transmit credentials or private saves.
3. Check the live root, word engine module, styles, manifest and service worker through safe GET requests only. Inspect non-destructive game interactions manually on mobile and desktop.
4. Inspect release and rollback versions for availability, compatibility date, bindings and route ownership. Existing versions are candidate rollback targets; their presence alone does not demonstrate successful restoration.
5. Confirm repository `main` protection, protected environment rules, limited token scope, and **one active deployer** before any production change.
6. Record non-sensitive evidence: current commit, deployment/version IDs, expected hashes, test outcomes, and whether rollback remains necessary.

## Controlled rollback rehearsal — separate explicitly approved job

A live version change is not part of this preparation step. When authorized, use the reviewed Cloudflare release mechanism to restore a confirmed known-good Brandle version, check behavior and saved progress in a test profile, then restore the approved target release. Confirm all versions and rollback commands against current Cloudflare documentation immediately before execution.

Stop and request review if identifiers, credentials, bindings, routes, or release ownership differ from the recorded plan. Never modify ANEVUM apex routing or another Worker as part of a Brandle rollback.

**Status:** Procedure prepared. Actual fresh source parity check and rollback rehearsal are not complete.
