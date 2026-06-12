# Stock Chart Failover Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic failover for stock intraday and K-line chart data so Eastmoney is the primary source and Tencent is the fallback when the primary source fails or is rate-limited.

**Architecture:** Introduce a shared stock-chart source layer plus a failover coordinator that normalizes Eastmoney and Tencent chart responses into one output shape. Route popup stock detail, technical analysis, and K-line cache through the same failover entrypoints so fallback behavior is consistent across the extension.

**Tech Stack:** TypeScript, React 18, Chrome Extension APIs, existing Eastmoney/Tencent HTTP endpoints, Node built-in test runner.

---

## File Map

**Create**
- `src/shared/stock-chart-sources.ts` — Eastmoney/Tencent intraday and K-line fetchers plus parsing helpers
- `src/shared/stock-chart-failover.ts` — source selection, fallback sequencing, short-lived circuit breaker
- `tests/stock-chart-failover.test.ts` — failover sequencing and circuit-breaker tests
- `tests/stock-chart-sources.test.ts` — Eastmoney/Tencent parsing normalization tests

**Modify**
- `src/popup/stockDetail.ts` — use shared failover entrypoints instead of direct Tencent-first logic
- `src/shared/technical-analysis.ts` — route `fetchDayFqKline` through failover day-K entrypoint
- `src/shared/kline-cache.ts` — inherit failover behavior through the updated day-K entrypoint

## Chunk 1: Shared Parsing + Tests

### Task 1: Add failing tests for chart-source parsing

**Files:**
- Create: `tests/stock-chart-sources.test.ts`
- Create: `src/shared/stock-chart-sources.ts`

- [ ] **Step 1: Write the failing test**

Add tests that assert:
- Eastmoney intraday rows normalize into unified minute-chart points
- Eastmoney day/week/month K-line rows normalize into unified OHLC rows
- Tencent fallback parsers still normalize correctly
- malformed rows are skipped instead of crashing

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/stock-chart-sources.test.ts`
Expected: FAIL because the new source module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/stock-chart-sources.ts` with:
- shared types for normalized intraday and K-line outputs
- parse helpers for Eastmoney and Tencent payloads
- source-specific fetchers for intraday and K-line

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/stock-chart-sources.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/stock-chart-sources.test.ts src/shared/stock-chart-sources.ts
git commit -m "feat: add stock chart source adapters"
```

## Chunk 2: Failover Coordinator

### Task 2: Add failing tests for fallback sequencing and circuit breaking

**Files:**
- Create: `tests/stock-chart-failover.test.ts`
- Create: `src/shared/stock-chart-failover.ts`

- [ ] **Step 1: Write the failing test**

Add tests that assert:
- primary success returns immediately without calling fallback
- primary failure falls back to Tencent
- empty primary data falls back to Tencent
- repeated primary failure opens a short-lived circuit breaker
- both sources failing surfaces an error

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/stock-chart-failover.test.ts`
Expected: FAIL because the failover coordinator does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/stock-chart-failover.ts` with:
- `fetchStockIntradayWithFallback`
- `fetchStockKlineWithFallback`
- a tiny in-memory source health tracker
- primary order fixed to Eastmoney then Tencent

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/stock-chart-failover.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/stock-chart-failover.test.ts src/shared/stock-chart-failover.ts
git commit -m "feat: add stock chart failover coordinator"
```

## Chunk 3: Popup + Analysis Integration

### Task 3: Route stock detail through failover entrypoints

**Files:**
- Modify: `src/popup/stockDetail.ts`

- [ ] **Step 1: Replace direct intraday fetch path**

Wire stock detail minute and five-day/minute-related chart loading to the shared failover intraday entrypoint where appropriate.

- [ ] **Step 2: Replace direct day/week/month K-line path**

Route stock detail K-line periods through the shared failover K-line entrypoint while preserving existing quote metadata assembly.

- [ ] **Step 3: Run build-focused verification**

Run: `npm run build`
Expected: PASS with stock detail still compiling.

- [ ] **Step 4: Commit**

```bash
git add src/popup/stockDetail.ts src/shared/stock-chart-sources.ts src/shared/stock-chart-failover.ts
git commit -m "feat: use failover in stock detail charts"
```

### Task 4: Route technical analysis and cache through failover day-K

**Files:**
- Modify: `src/shared/technical-analysis.ts`
- Modify: `src/shared/kline-cache.ts`

- [ ] **Step 1: Replace direct Tencent day-K fetch**

Update `fetchDayFqKline(...)` to call the shared failover day-K entrypoint.

- [ ] **Step 2: Verify cache inherits the new path**

Ensure `getKlineMap(...)` continues to use `fetchDayFqKline(...)` without additional duplication.

- [ ] **Step 3: Run focused regression checks**

Run:
- `node --test tests/stock-chart-sources.test.ts tests/stock-chart-failover.test.ts`
- `npm run build`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/shared/technical-analysis.ts src/shared/kline-cache.ts tests/stock-chart-sources.test.ts tests/stock-chart-failover.test.ts
git commit -m "feat: apply chart failover to analysis and cache"
```

## Chunk 4: Final Verification

### Task 5: Verify the failover feature end to end

**Files:**
- Review all files above

- [ ] **Step 1: Run targeted tests**

Run:
- `node --test tests/stock-chart-sources.test.ts tests/stock-chart-failover.test.ts`

Expected: PASS

- [ ] **Step 2: Run broader regression tests**

Run:
- `node --test tests/gold-config.test.ts tests/gold-fetch.test.ts tests/gold-refresh-config.test.ts tests/gold-chart-fetch.test.ts`

Expected: PASS

- [ ] **Step 3: Run full build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Inspect worktree**

Run: `git status --short`
Expected: only intended stock-chart failover and existing in-flight feature changes remain.
