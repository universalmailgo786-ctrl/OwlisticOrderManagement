# Supabase Bandwidth Optimization Report

**Project:** Owlistic Order Management  
**Branch:** `optimize/supabase-egress-reduction`  
**Date:** 2026-10-17  
**Supabase project:** `bgejcfjgolnascjkgdly`  
**Status:** Draft PR ready for review. **Not merged. Not deployed to production.**

---

## Executive summary

Order sync and chat were reworked to stop repeatedly downloading full order JSON and full chat rows. Live sync now uses a slim digest (~25s), fetches only changed orders by id, and full-reconciles about every five minutes. Chat relies on Realtime with a slow reconcile poll (and a faster fallback if Realtime drops).

**Calibrated projection** (see limitations below):

| Metric | Before (observed / calibrated) | After (projected) |
|--------|--------------------------------|-------------------|
| Monthly Supabase egress | **12.95 GB** (dashboard) | **~1.55 GB** |
| Reduction | — | **~88%** |
| Free plan egress (5 GB) | Over | Under (with headroom) |

These after figures are **modeled projections**, not confirmed dashboard savings. Confirm in Supabase → Usage after an approved deploy.

---

## Exact files modified

| File | Change |
|------|--------|
| `api/_lib/sheet-logic.js` | `listOrdersByIds`, SQL account filters, explicit columns, shared `mapOrderRow` |
| `js/sheet-sync.js` | `fetchOrdersByIds` with **batched** requests (80/ids), in-flight dedupe |
| `js/records.js` | 25s digest sync, fingerprint skip, targeted fetch, partial-batch fallback, hidden-tab pause |
| `js/storage.js` | Export `isFreshUnsyncedOrder` for prune safety |
| `js/chat-config.js` | `pollMs: 60000`, `pollMsRealtimeDown: 20000` |
| `js/chat-nav.js` | Realtime-aware polling, immediate refresh on channel error |
| `js/chat-page.js` | **Per-channel** Realtime health; poll on partial disconnect |
| `js/chat-client.js` | Explicit column selects; `onStatus(status, { channel })` |
| `api/chat/delete-message.js` | Narrow selects |
| `api/chat/mark-read.js` | Narrow thread select |
| `package.json` | `test`, `test:egress`, `test:sync`, `measure:egress` |
| `scripts/test-egress-optimization.js` | **Added** — static/logic checks |
| `scripts/test-sync-scenarios.js` | **Added** — multi-employee, Realtime, Drive checks |
| `scripts/measure-egress-model.js` | **Added** — calibrated egress model |
| `SUPABASE_OPTIMIZATION_REPORT.md` | **Added** — this report |

Google Drive paths and Apps Script upload/delete behavior were **not** changed.

---

## Optimizations by task

### TASK 1 — Order synchronization

**Problems fixed**

- Digest every ~8s and full `listOrders` every ~32s transferred large JSONB payloads continuously.
- Overlapping refreshes and duplicate focus listeners could amplify traffic.
- Inactive tabs kept polling.

**Implemented**

1. Initial / recovery / periodic full load via `listOrders` (unchanged capability).
2. Steady-state: `listOrderDigest` every **25s** (ids, timestamps, board/overall status only).
3. Changed or new ids loaded via **`listOrdersByIds`** (server cap **80** per request; client **batches** unlimited change sets in sequential chunks of 80 — no silent 40-id truncation).
4. Full reconcile every **12** digest ticks (~**5 minutes**).
5. Digest fingerprint skips by-id work when nothing changed.
6. Deleted orders pruned carefully; `pendingSave` / fresh local orders preserved.
7. No polling while `document.hidden`; digest refresh on tab focus/visibility.
8. In-flight dedupe for list, digest, and by-ids requests.
9. Digest/list/by-ids failure (or sparse partial return) falls back to full refresh.

### TASK 2 — Database queries

**Implemented**

- `listOrders` / `getOrder`: explicit columns (`order_id`, `tab_name`, `account_name`, `payload`, timestamps) instead of `SELECT *`.
- `listOrderDigest`: slim projection (no full payload).
- `listOrdersByIds`: `WHERE order_id = ANY($1)` plus server-side `forcedAccount` filter for restricted roles.
- Authorization still uses server `forcedAccount` / role checks — client `tabs` alone cannot widen access for restricted users.

**Not changed (intentionally)**

- Mutation paths still read a single full order row to merge payloads (low frequency vs polling).
- Order file bytes remain on Google Drive, not Supabase Storage.

### TASK 3 — Chat and notifications

**Implemented**

- Healthy poll **60s**; Realtime-down poll **20s** (`chat-config`, `chat-nav`).
- Chat page: when **required** Realtime channels are `SUBSCRIBED`, reconcile about every **180s**; when any required channel is down, every **20s**.
- **Per-channel health** (inbox vs thread): one `SUBSCRIBED` channel cannot mask another that failed (`CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED`).
- On channel error: immediate inbox/message reconcile + nav unread refresh + resubscribe retry.
- Explicit message/thread/attachment column lists in `chat-client` and chat APIs.
- Hidden-tab skip; Realtime remains primary for delivery and unread updates.

**Preserved**

- Unread badges, mark-read, delete, attachments, inbox, history pagination, notifications.

### TASK 4 — Google Drive

Verified in `scripts/test-sync-scenarios.js`: `DRIVE_ACTIONS` (`uploadFile`, `deleteDriveFile`, etc.), Drive URL proxy, and `sheet-sync` helpers (`uploadFile`, `uploadOrderFiles`, `filesNeedingDrive`, `waitForDriveLinks`) remain present. Order paths do not use Supabase Storage buckets.

### TASK 5 — Logging

Application JS/API paths already avoid chatty `console.log` in production handlers. Supabase **Log Ingestion** (~2.71 GB previously) scales with query volume; cutting poll/full-list traffic is the main reduction lever. No security/error reporting was removed from API error responses.

### TASK 6 — Features preserved

No intentional feature removals. Critical paths covered by static checks and existing chat tests. Manual multi-employee QA recommended before production (see checklist).

---

## Before / after measurements

### Method

1. **Observed before:** ~12.95 GB/month Supabase egress (diagnostic baseline).
2. **Modeled after:** `node scripts/measure-egress-model.js` — same usage assumptions, calibrated so “before” equals 12.95 GB, then apply optimized intervals/payloads.
3. **Limitation:** Exact per-service Supabase egress (PostgREST vs Realtime vs Storage vs Auth) is not available from this repo without dashboard access. Estimates are **not** confirmed savings.

### Request rates (modeled, 3 active Records browsers)

| | Before | After |
|--|--------|-------|
| Digests / hour | ~1350 | ~432 |
| Full-order downloads / hour | ~338 | ~36 |
| Targeted by-id fetches / hour | — | ~95 (when dirty) |
| Chat poll requests / hour | ~600 | ~64 |
| Approx. DB-ish reads / hour | ~2288 | ~627 |

### Bytes (calibrated)

| | Before | After |
|--|--------|-------|
| Hourly (modeled) | ~56.7 MB | ~6.8 MB |
| Monthly | **12.95 GB** | **~1.55 GB** |
| Reduction | — | **~88%** |

### Distinguishing bandwidth sources

| Source | In this optimization? | Notes |
|--------|----------------------|-------|
| Supabase Postgres/API egress | Yes | Primary target |
| Supabase Realtime frames | Partial | Still used; less REST polling |
| Supabase Storage | Minimal | Chat attachments only; order files on Drive |
| Supabase Log Ingestion | Indirect | Fewer queries → less log volume |
| Vercel bandwidth | No | HTML/JS/API hosting separate |
| Google Drive | No | Unchanged |

Ideal target **2–3 GB/month** is within the calibrated projection (~1.55 GB). Treat **2–3 GB** as the planning band until dashboard confirmation.

---

## Test results (actual, local)

Ran `npm test` on 2026-10-17 after the follow-up fixes. **All suites passed.**

| Suite | Command | Result |
|-------|---------|--------|
| Chat static + JWT + unread contracts | `node scripts/test-chat.js` | **passed** |
| Egress optimization contracts | `node scripts/test-egress-optimization.js` | **passed** |
| Multi-employee sync / Realtime / Drive | `node scripts/test-sync-scenarios.js` | **passed** |
| Egress model | `node scripts/measure-egress-model.js` | **12.95 GB → 1.55 GB (88% modeled)** |

### Scenario coverage in `test-sync-scenarios.js`

1. **Two-employee order sync (simulated):** status change → targeted refetch; new order detected; remote delete pruned; `pendingSave` local order retained.  
2. **>40 / >80 id sync:** 175 ids → 3 batches (80/80/15); client no longer truncates at 40.  
3. **Partial Realtime disconnect:** admin with inbox OK + thread down → unhealthy; both OK → healthy; user thread-only rules verified; nav refreshes on error.  
4. **Chat unread/notification contracts:** `unreadSummary`, `applyIncoming`/`applyRead`, `byThread`/`byUser` API fields retained.  
5. **Google Drive:** upload/delete proxy + client helpers unchanged; no order-file Storage migration.

### Not run against live production

These are offline/static + logic simulations. They do **not** mutate Supabase/Drive production data. Live two-browser QA on staging/preview is still recommended before merge.

### Manual QA still recommended before production

- Login/logout, all roles on a preview deploy  
- Two real browsers editing the same account’s orders  
- Chat send/receive with one tab’s Realtime throttled/blocked  
- Drive upload + download smoke test  

---

## Unresolved risks

1. **Projection uncertainty** — actual egress depends on concurrent users, order payload size, and chat attachment traffic.  
2. **Full reconcile every 5 minutes** — brief lag possible if digest misses an edge case until reconcile.  
3. **Digest prune** — only removes locals missing from a non-empty digest; empty digest for SuperAdmin still forces full reconcile.  
4. **Realtime outages** — fall back to 20s polling; temporary chat traffic spike (mitigated by per-channel health + immediate reconcile).  
5. **Log ingestion** — not directly measured; expect improvement but verify in dashboard.  
6. **Remaining `SELECT *`** on infrequent user/account/mutation paths — low impact vs polling.  
7. **Large simultaneous change bursts** — batched by-id sync can take multiple sequential requests; worst case falls back to full `listOrders`.  
8. **No live multi-browser proof yet** — scenario tests are offline; confirm on preview before production.

---

## Git branch and commits

- **Branch:** `optimize/supabase-egress-reduction`  
- **Base (pre-change):** `b093ee3` — *Keep completed-order cron under the Hobby time limit.*  
- **Optimization commits:** see `git log main..optimize/supabase-egress-reduction`  
- **Remote:** feature branch only (draft PR; **not** merged to `main`).

### Rollback

```bash
git checkout main
# or hard reset the feature branch to pre-change tip:
git checkout optimize/supabase-egress-reduction
git reset --hard b093ee3
```

If already deployed (only after your approval): redeploy the previous Vercel production deployment / prior `main` commit. No data migration was applied; rollback is code-only.

---

## Production deployment checklist

**Do not deploy until explicitly approved.**

1. Review this branch diff end-to-end.  
2. Run `npm test` and `npm run measure:egress`.  
3. Optional staging deploy (preview) with 2+ users for 30+ minutes; watch Network tab for `listOrderDigest` / `listOrdersByIds` vs frequent `listOrders`.  
4. Confirm Drive upload/download still works.  
5. Confirm chat Realtime + unread badges.  
6. Merge to `main` / promote Vercel only after approval.  
7. For 48–72 hours, monitor Supabase **Usage → Egress** and **Log Ingestion**.  
8. If egress does not trend down, capture failing request patterns and open a follow-up (do not widen client-side filters).

---

## Success criteria checklist

| Criterion | Status |
|-----------|--------|
| Features preserved (code-level) | Yes |
| No data delete/migrate/reset | Yes |
| Google Drive unchanged | Yes |
| No paid upgrade required | Yes |
| Employee sync path intact | Yes (digest + by-ids + full reconcile) |
| Substantial egress reduction (projected) | Yes (~88% modeled) |
| Aim 2–3 GB/month | Projected ~1.55 GB (confirm post-deploy) |
| No automatic production deploy | Yes |
