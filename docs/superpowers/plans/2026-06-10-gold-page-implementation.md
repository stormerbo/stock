# Gold Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated gold quotes page with 4 gold instruments, background refresh, popup navigation, and options-based refresh frequency control.

**Architecture:** Reuse the project's existing quote pipeline: shared fetch utilities normalize raw upstream data into typed quote objects, the background worker refreshes and caches them in `chrome.storage.local`, and popup/options consume the cached data plus shared refresh config. Keep gold quotes isolated from stock/fund/index state so future detail pages and alerts can layer on without entangling existing flows.

**Tech Stack:** TypeScript, React 18, Chrome Extension APIs, existing Eastmoney/Tencent-style fetch helpers, Node built-in test runner.

---

## File Map

**Create**
- `src/popup/views/GoldPage.tsx` — dedicated gold page UI with domestic/international sections
- `tests/gold-fetch.test.ts` — quote parsing and normalization tests
- `tests/gold-refresh-config.test.ts` — refresh config compatibility tests

**Modify**
- `src/shared/fetch.ts` — `GoldQuote` types, upstream fetch helpers, export `fetchGoldQuotes`
- `src/background/index.ts` — gold alarm, refresh config support, background refresh/cache writes
- `src/popup/types.ts` — add `gold` tab type
- `src/popup/components/SideNav.tsx` — add gold nav entry
- `src/popup/App.tsx` — load cached gold quotes, render `GoldPage`
- `src/options/App.tsx` — add fixed gold refresh options and config normalization

## Chunk 1: Shared Data + Tests

### Task 1: Add failing tests for gold quote normalization

**Files:**
- Create: `tests/gold-fetch.test.ts`
- Modify: `src/shared/fetch.ts`

- [ ] **Step 1: Write the failing test**

Add tests that assert:
- Eastmoney rows normalize into `GoldQuote`
- invalid numeric fields become `Number.NaN`
- domestic and international quotes preserve label, market, unit, and timestamp

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/gold-fetch.test.ts`
Expected: FAIL because `fetchGoldQuotes` helpers or exported parsers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

In `src/shared/fetch.ts`:
- add `GoldQuote` type
- add secid-based fetch/parse helpers for instruments supported by Eastmoney
- add minimal HTML/script parsing helpers if needed for domestic gold quotes
- add `fetchGoldQuotes()`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/gold-fetch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/gold-fetch.test.ts src/shared/fetch.ts
git commit -m "feat: add shared gold quote fetching"
```

### Task 2: Add failing tests for refresh config compatibility

**Files:**
- Create: `tests/gold-refresh-config.test.ts`
- Modify: `src/background/index.ts`
- Modify: `src/options/App.tsx`

- [ ] **Step 1: Write the failing test**

Add tests that assert:
- missing `goldRefreshSeconds` falls back to default `60`
- unsupported values normalize to one of `30 | 60 | 300`
- existing refresh config fields remain intact

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/gold-refresh-config.test.ts`
Expected: FAIL because shared normalization helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add small normalization helpers near refresh config definitions so both background and options resolve:
- old configs without `goldRefreshSeconds`
- invalid values

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/gold-refresh-config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/gold-refresh-config.test.ts src/background/index.ts src/options/App.tsx
git commit -m "feat: normalize gold refresh config"
```

## Chunk 2: Background Refresh

### Task 3: Wire gold refresh into the background worker

**Files:**
- Modify: `src/background/index.ts`
- Modify: `src/shared/fetch.ts`

- [ ] **Step 1: Extend refresh config usage**

Add `goldRefreshSeconds` to `RefreshConfig`, `DEFAULT_REFRESH`, and alarm setup/clear/dispatch flow.

- [ ] **Step 2: Add the gold refresh function**

Implement `refreshGolds()` that:
- calls `fetchGoldQuotes()`
- writes `goldQuotes` and `goldUpdatedAt` into `chrome.storage.local`
- preserves prior cache on failure

- [ ] **Step 3: Trigger initial load and alarm handling**

Update startup/alarm flows so gold refresh starts alongside stocks/funds/indexes.

- [ ] **Step 4: Run focused tests**

Run:
- `node --test tests/gold-fetch.test.ts tests/gold-refresh-config.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/background/index.ts src/shared/fetch.ts tests/gold-fetch.test.ts tests/gold-refresh-config.test.ts
git commit -m "feat: refresh gold quotes in background"
```

## Chunk 3: Popup UI

### Task 4: Add popup tab and gold page view

**Files:**
- Create: `src/popup/views/GoldPage.tsx`
- Modify: `src/popup/types.ts`
- Modify: `src/popup/components/SideNav.tsx`
- Modify: `src/popup/App.tsx`

- [ ] **Step 1: Add tab and nav wiring**

Update `PageTab` and `SideNav` so `gold` appears between funds and trades.

- [ ] **Step 2: Add cached gold state in popup**

In `src/popup/App.tsx`, load `goldQuotes` from `chrome.storage.local`, subscribe to storage changes, and keep state isolated from stock/fund detail state.

- [ ] **Step 3: Build `GoldPage`**

Render:
- domestic section: `国内现货金`, `上海金`
- international section: `国际现货金`, `COMEX 黄金`

Each card shows:
- label
- price
- change
- change percent
- unit
- updated time

- [ ] **Step 4: Run build-focused verification**

Run: `npm run build`
Expected: build succeeds with new page wiring.

- [ ] **Step 5: Commit**

```bash
git add src/popup/types.ts src/popup/components/SideNav.tsx src/popup/App.tsx src/popup/views/GoldPage.tsx
git commit -m "feat: add popup gold quotes page"
```

## Chunk 4: Options UI

### Task 5: Add fixed gold refresh frequency control

**Files:**
- Modify: `src/options/App.tsx`

- [ ] **Step 1: Add fixed options UI**

Add a new config row under refresh strategy for gold refresh with fixed options:
- `30 秒`
- `60 秒`
- `5 分钟`

- [ ] **Step 2: Persist normalized value**

Ensure save/load paths preserve legacy configs and always persist a valid `goldRefreshSeconds`.

- [ ] **Step 3: Run focused verification**

Run:
- `node --test tests/gold-refresh-config.test.ts`
- `npm run build`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/options/App.tsx tests/gold-refresh-config.test.ts
git commit -m "feat: add gold refresh setting"
```

## Chunk 5: Final Verification

### Task 6: End-to-end verification and cleanup

**Files:**
- Review all modified files above

- [ ] **Step 1: Run targeted tests**

Run:
- `node --test tests/gold-fetch.test.ts tests/gold-refresh-config.test.ts`

Expected: all PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: exit 0

- [ ] **Step 3: Run full build**

Run: `npm run build`
Expected: exit 0

- [ ] **Step 4: Inspect git diff**

Run: `git status --short`
Expected: only intended gold-page related changes remain unstaged or staged depending on workflow.

