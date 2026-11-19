# Developer 2 integration check

Checked on 19 November 2026 in `codex/integrate-dev2`.

- Main baseline: `fd3c3b2` (Developer 3 console and database/indexer fixes).
- Incoming branch: `origin/bitka` at `eaadc73` (Developer 2 trade and chat flows).
- Developer 3 was pushed to `bitkub` and fast-forwarded into `main` before this integration. This branch keeps the combined changes separate for review.

## Merge decisions

The only textual conflict was `.env.example`. The resolved template retains the Developer 3 configuration and adds Developer 2's optional server-only `ESCROW_ADDRESS` override. Actual credentials and local test artifacts remain ignored.

Two database integration problems were fixed and covered by regression tests:

1. Preserve the non-null, positive `positive_wei` domain. The existing Developer 3 migration backfills order amounts from offers before converting the column, so Developer 2's historical domain relaxation is unnecessary. The new integration migration also repairs environments that already applied that relaxation.
2. The offer guard now considers only canonical (`on_chain`) orders. An orphaned order retained for audit history must not prevent a new offer after a chain reorganization.

Local pending migrations were applied with `supabase migration up --local --include-all`, preserving existing data. These include listing management, conversation permissions/realtime, signed offers, the integration guard repair, and chat image storage. No database reset was used. Other environments should apply their pending migrations before running the merged application; do not replay previously applied migrations manually.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 20 tests passed across 8 files, including populated database upgrades, null/zero amount rejection, replacement funding after reorg, evidence, offers, listing images, and account order behavior.
- `npm run contracts:test`: 13 tests passed.
- Production Next.js 16.4.6 Webpack build: passed in an ignored isolated app directory, leaving the existing development server running.
- Playwright against that production build in Microsoft Edge: all 6 tests passed. These cover the mobile storefront/account, search and keyboard filters, sample listing and Sell navigation, game spotlight, additional games, and theme persistence without the React script warning.
- Local Supabase security advisors: no issues reported.
- `npm run db:check`: passed the configured database/view/storage checks.
- Running app API checks: `GET /api/v1/listings` returned 200 with an empty local listing set; unauthenticated `POST /api/v1/conversations` and `GET /api/v1/me` returned 401 with `UNAUTHENTICATED`.

## Remaining acceptance work

These checks do not replace a signed-in buyer/seller/staff test using MetaMask and Sepolia transactions. The evidence signer and automatic escalation sender keys remain unconfigured; the scheduler and audit recovery work in `dev3-checklist.md` remain outstanding. No claim is made that all Developer 3 acceptance work is complete. This integration has not been promoted to `main`.
