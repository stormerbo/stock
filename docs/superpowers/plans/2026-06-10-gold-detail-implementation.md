# Gold Detail Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add expandable gold instruments, clickable gold detail pages, and gold intraday/K-line charts with domestic/international grouping.

**Architecture:** Keep the existing extension flow: shared modules define gold instruments and fetch/normalize list and chart data, the popup consumes cached list data from storage, and detail views fetch chart data on demand. Reuse the current popup detail-page pattern from stocks so navigation, refresh, and scroll restoration stay consistent while gold-specific data remains isolated.

**Tech Stack:** TypeScript, React 18, Chrome Extension APIs, existing chart components, Tencent/Eastmoney quote endpoints, Node built-in test runner.

---

## File Map

**Create**
- `src/shared/gold-config.ts` — fixed gold instrument registry, grouping, chart capability metadata
- `src/popup/views/GoldDetailView.tsx` — gold detail page with intraday and day/week/month K-line tabs
- `tests/gold-config.test.ts` — registry ordering/grouping/capability tests
- `tests/gold-chart-fetch.test.ts` — intraday and K-line parsing tests

**Modify**
- `src/shared/fetch.ts` — move gold list fetching onto registry; add `fetchGoldIntraday`, `fetchGoldKline`, detail data types, parsing helpers
- `src/popup/types.ts` — add gold detail target types and re-exports if needed
- `src/popup/views/GoldPage.tsx` — make rows clickable and drive detail navigation
- `src/popup/App.tsx` — add gold detail state, list/detail switching, scroll restoration, manual refresh integration
- `src/popup/components/KlineChart.tsx` — generalize prop types if needed so gold detail can reuse the chart safely
- `src/shared/refresh-config.ts` — only if expanded instruments require no-op config naming cleanup

## Chunk 1: Gold Registry + Tests

### Task 1: Add failing tests for the expandable gold registry

**Files:**
- Create: `tests/gold-config.test.ts`
- Create: `src/shared/gold-config.ts`

- [ ] **Step 1: Write the failing test**

Add tests that assert:
- instruments remain ordered within `domestic` and `international`
- first-wave instruments include the current 4 plus the expanded-gold additions
- each instrument declares unit, secid, and chart capability metadata

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/gold-config.test.ts`
Expected: FAIL because the shared registry module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/gold-config.ts` with:
- `GoldMarket`
- `GoldInstrumentConfig`
- `GOLD_INSTRUMENTS`
- small helpers like `getGoldInstrumentByCode` and grouped filtering

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/gold-config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/gold-config.test.ts src/shared/gold-config.ts
git commit -m "feat: add expandable gold instrument registry"
```

## Chunk 2: Chart Fetching + TDD

### Task 2: Add failing tests for gold intraday and K-line parsing

**Files:**
- Create: `tests/gold-chart-fetch.test.ts`
- Modify: `src/shared/fetch.ts`

- [ ] **Step 1: Write the failing test**

Add tests that assert:
- intraday payloads normalize into `{ time, price }[]` with a valid baseline
- K-line payloads normalize into OHLC rows for `day`, `week`, and `month`
- unsupported or malformed rows are skipped instead of crashing

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/gold-chart-fetch.test.ts`
Expected: FAIL because the gold chart parsing/fetch helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

In `src/shared/fetch.ts`:
- reuse `GoldQuote` list logic through `src/shared/gold-config.ts`
- add `GoldKlinePeriod`
- add `GoldDetailKlinePoint`
- add `fetchGoldIntraday(code)`
- add `fetchGoldKline(code, period)`
- keep provider routing behind helper functions so the popup only sees normalized data

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/gold-chart-fetch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/gold-chart-fetch.test.ts src/shared/fetch.ts src/shared/gold-config.ts
git commit -m "feat: add gold chart fetching helpers"
```

## Chunk 3: Gold Detail View

### Task 3: Add a failing integration path for gold detail navigation

**Files:**
- Modify: `src/popup/types.ts`
- Modify: `src/popup/views/GoldPage.tsx`
- Create: `src/popup/views/GoldDetailView.tsx`
- Modify: `src/popup/App.tsx`

- [ ] **Step 1: Wire types and click targets**

Add:
- `GoldDetailTarget`
- `onOpenDetail` prop on `GoldPage`
- row click behavior that opens detail

- [ ] **Step 2: Build the detail view**

Create `GoldDetailView` with:
- back button
- refresh button
- quote header
- tabs for `minute`, `day`, `week`, `month`
- intraday chart for `minute`
- K-line chart reuse for `day/week/month`

- [ ] **Step 3: Integrate popup state**

In `src/popup/App.tsx`:
- add `goldDetailTarget`
- switch the gold page between list and detail modes
- preserve and restore scroll position
- clear other detail targets when entering gold detail

- [ ] **Step 4: Run build verification**

Run: `npm run build`
Expected: PASS with gold detail route wired.

- [ ] **Step 5: Commit**

```bash
git add src/popup/types.ts src/popup/views/GoldPage.tsx src/popup/views/GoldDetailView.tsx src/popup/App.tsx
git commit -m "feat: add gold detail view"
```

## Chunk 4: Expanded Gold Instruments

### Task 4: Move list fetching onto the fixed expanded instrument set

**Files:**
- Modify: `src/shared/gold-config.ts`
- Modify: `src/shared/fetch.ts`
- Modify: `src/popup/views/GoldPage.tsx`

- [ ] **Step 1: Add the expanded gold instruments**

Include the first-wave expanded gold set while staying gold-only, grouped by `domestic` and `international`.

- [ ] **Step 2: Ensure list + detail share the same registry**

Refactor gold list rendering to derive sections and labels from the shared registry, not hard-coded names inside the view.

- [ ] **Step 3: Re-run focused tests**

Run:
- `node --test tests/gold-config.test.ts tests/gold-fetch.test.ts tests/gold-chart-fetch.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/shared/gold-config.ts src/shared/fetch.ts src/popup/views/GoldPage.tsx tests/gold-config.test.ts tests/gold-fetch.test.ts tests/gold-chart-fetch.test.ts
git commit -m "feat: expand built-in gold instruments"
```

## Chunk 5: Final Verification

### Task 5: Verify the end-to-end gold detail experience

**Files:**
- Review all gold-related files above

- [ ] **Step 1: Run targeted tests**

Run:
- `node --test tests/gold-config.test.ts tests/gold-fetch.test.ts tests/gold-refresh-config.test.ts tests/gold-chart-fetch.test.ts`

Expected: PASS

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Inspect git status**

Run: `git status --short`
Expected: only intended gold-detail related changes remain.

- [ ] **Step 4: Summarize any residual risk**

Call out any instruments whose list quote works but chart support had to degrade.
