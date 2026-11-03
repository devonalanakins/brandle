# BRANDLE single-deployer cutover — execution sequence

**Status: planned only.** This procedure is not evidence that the transfer happened. Do not run production steps while any required gate is unverified.

## Grounded identifiers (recheck immediately before execution)

| Item | Value |
| --- | --- |
| Standalone source | `devonalanakins/brandle`, `main` |
| Current configured deployment owner | `devonalanakins/anevum-web/.github/workflows/deploy-brandle.yml` |
| Proposed legacy retirement | [ANEVUM Web draft PR #799](https://github.com/devonalanakins/anevum-web/pull/799), **DO NOT MERGE YET** |
| Inactive standalone template | `.github/staged-releases/brandle-production.yml` |
| Administrative blockers | [Brandle issue #7](https://github.com/devonalanakins/brandle/issues/7) |
| Production Worker | `brandle-glimmer-grove` |
| Live URL | https://brandle-glimmer-grove.devonakins.workers.dev/ |
| Last observed Worker version | `1c48deb3-6c35-4b9b-9d84-a37d2596ca70` (not necessarily current) |

## Gate A — required before ANY deployment ownership change

- [ ] Confirm `devonalanakins/brandle/main` is protected, requires GitHub Actions `verify`, disallows force pushes/deletion and enforces pull-request changes. Check protections actually apply to maintainers.
- [ ] Confirm GitHub environment `brandle-production` restricts deployment to `main`; verify actual approval/wait policies rather than relying on the environment name.
- [ ] Verify Brandle-only Cloudflare token privileges without disclosing its value. Keep the API token and account ID in protected environment secrets, not source or repository-wide secrets.
- [ ] Independently confirm latest live Cloudflare version, bindings, routes and current asset SHA-256s against the reviewed source commit. Do not assume the Oct 30 historical snapshot is still deployed.
- [ ] Verify a known-good rollback version **and rehearse** restoration/return to intended release under separate, explicit production-change authorization. Confirm local game progress and offline/PWA behavior survive.
- [ ] Inspect all production writers to the same Worker; verify there are no third-party workflows, manual integrations or pending release jobs that could race a cutover.
- [ ] Preserve original monorepo source, branch history, historical release versions, and all currently working services.
- [ ] Capture exact approved standalone `main` SHA, live Worker version and a release owner/change record.

**STOP** if any item above is unknown or incomplete. The current single deployer remains in control.

## Gate B — reviewed retirement of the old deployer

1. Recheck [draft PR #799](https://github.com/devonalanakins/anevum-web/pull/799) against latest monorepo `main`, with fresh exact-head `ANEVUM Verify` and `verify-only` checks. Confirm its diff removes the Wrangler deploy command and Cloudflare secret references but preserves verification, source files and history.
2. Check no legacy release jobs are running or queued. Prevent concurrent manual dispatch during the change window.
3. Merge the verified PR as its own auditable step.
4. Read back `devonalanakins/anevum-web/main:.github/workflows/deploy-brandle.yml`. Confirm no step can deploy and no Cloudflare secrets are read. Review workflow run status on the merged commit.
5. Keep the existing Worker running at the known-good release. **Merging a workflow change does not by itself replace or delete that Worker.**
6. If the legacy workflow remains able to deploy, stop. Do not activate the standalone deployer.

## Gate C — standalone workflow activation

1. Prepare a separate PR to move the staged release template into `.github/workflows/brandle-production.yml`. Update `release-guard.test.mjs` deliberately to require exactly the permitted verification workflow and the now-activated, manual-only release workflow. Do not weaken the credential/worker identity boundaries.
2. Review the change and exact-head CI while repo variables `BRANDLE_RELEASE_OWNER` and `BRANDLE_LEGACY_DEPLOY_DISABLED` remain unset. Validate environment protection and least-privilege secret scope before merge.
3. Merge only after old deployer retirement has been confirmed on `anevum-web/main`.
4. Recheck GitHub's list of active workflow files and Cloudflare deployment history; ensure the new workflow has not automatically deployed.
5. Set both required repository variables only after verifying the old deployer has been retired. These variables are an intentional software gate, **not proof** of actual retirement.

## Gate D — first standalone release and acceptance

1. Manually dispatch the standalone workflow from `main` using the reviewed 40-character SHA. Validate it is reachable from `main`.
2. Require passing application tests, built-Worker tests, worker-name guard, and protected environment checks before deployment.
3. Verify the Cloudflare deployment ID/version and read-only HTTP checks for `/`, `/app.mjs`, `/logic.mjs`, `/sw.js`, icons and manifest.
4. Manually test daily and endless games, six-guess behavior, duplicate-letter scoring, persistence, accessibility, keyboard, service worker/offline installation, and mobile layout. Use a fresh browser profile and avoid exposing someone else's saves.
5. Confirm no ANEVUM apex or other Worker routes, secrets, bindings or deployments changed.
6. Mark cutover complete only when the standalone owner, deployment version, live acceptance and verified rollback path are all recorded.

## Failure and rollback

- Before Gate B merge: do not change production; keep legacy owner.
- After Gate B but before Gate C: the existing deployed Worker continues to serve users. Do **not** try to activate two deployers at once; fix the standalone release safeguards or restore the previous monorepo workflow through a reviewed revert.
- After a failed standalone deployment: use the separately verified Cloudflare rollback method to return to the recorded known-good version. Do not use unverified version IDs or assume an old version is automatically deployable.
- Preserve incident evidence and stop follow-on changes until live game behavior and single-writer status are verified.

**Evidence as of October 30, 2026:** PR #799 passed both head checks but is intentionally draft/unmerged. Brandle main branch was unprotected, with no rulesets verified. Actual environment protections, token scope and rollback rehearsal remain unverified.
