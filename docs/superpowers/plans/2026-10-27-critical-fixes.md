# Critical audit fixes — implementation plan

**Goal:** Correct all actionable defects in the critical audit without weakening tenant isolation or discarding pending edits.
**Spec:** `docs/auditoria-critica-2026-10-27.md` (user authorized implementation).
**Stack:** Next.js 16.4.3, React 19.2.8, Supabase PostgreSQL/Edge, existing Node tests.

## Constraints
- Preserve user data, existing IDs, account/organization scope and permissions.
- No production schema changes or deployments during local implementation.
- Prefer existing dependencies and transactional SQL for joint writes.
- Turn audit observations into expected-behavior regression tests before changes.
- Test SQL locally when infrastructure is available; record concrete verification gaps.

## Tasks
- [x] 1. Data contracts: participant assignment migration with scoped FK; atomic activity save; SQL summaries and complete snapshot finance reads; schema contract SQL tests. Own: activity manager, home-data, budget page, migrations/tests for these contracts.
- [x] 2. Offline recovery: inspect/export/retry/discard explicit selected operations bound to authenticated account and tenant; reconcile provable duplicate inserts; honest pending messages; no silent queue deletion. Own: offline-fetch, recovery component, connection status, offline tests.
- [x] 3. Durable notifications: transactional announcement delivery record and worker; recover expired reminder claims; correct pending/published feedback; retry tests. Own: reminders/push Edge, announcement manager, delivery migration/tests.
- [x] 4. Interaction integrity: serialize attendance per participant; confirm affected rows for mutations; aggregate shared meal demand with unit checks; accessible login, zoom and touch targets. Own: attendance, participants, inventory, tasks, meals, shared mutation helper, login CSS/layout/tests.
- [x] 5. Maintenance and validation: retire unreachable legacy setup; safely deduplicate CSS declarations; real database contract runner in CI; preserve useful tests; update audit status and deploy instructions.
- [x] 6. Full verification and independent review: unit/integration tests, SQL if possible, TypeScript, npm audit, Next/OpenNext build and actual browser checks. Address review findings before completion.

## Acceptance
Failed multi-write saves preserve originals; latest attendance choice wins; totals remain exact beyond REST caps; queue conflicts have recoverable user actions; interrupted/offline notifications are delivered through durable jobs; zero-row mutations never claim success; shared stock is allocated once; login contrast meets 4.5:1 and zoom remains available.
