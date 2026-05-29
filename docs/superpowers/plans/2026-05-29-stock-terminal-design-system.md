# Stock Terminal Design System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the extension into a high-density trading terminal with shared design tokens, reusable UI primitives, and consistent popup/options/overlay layouts optimized for rapid scan reading.

**Architecture:** First establish a shared token and theme bridge so all surfaces speak the same visual language. Then extract the repeated UI patterns into small reusable components, and finally recompose the popup, options page, and floating overlay around the same layout rules without changing business logic or data flow.

**Tech Stack:** React 18, TypeScript, Vite, Chrome Extension APIs, Lucide React, existing CSS modules/stylesheets, existing Chrome storage/theme/display config.

---

## File Structure Map

| File | Responsibility |
|---|---|
| `src/shared/design-tokens.ts` | Single source for primitive and semantic token values, theme mappings, and helper utilities |
| `src/shared/theme.ts` | Theme mode normalization and token application entry point |
| `src/shared/display.ts` | Display preferences that affect color scheme, density, and privacy rendering |
| `src/popup/index.css` | Popup shell, table density, modal shells, and page-level layout |
| `src/options/index.css` | Settings-page shell, section spacing, and control styling |
| `src/floating-overlay/styles.ts` | Shadow DOM overlay styles mapped to the shared token system |
| `src/popup/components/ui/*` | Small reusable primitives such as buttons, badges, panels, inputs, and modal chrome |
| `src/popup/components/SideNav.tsx` | Left rail navigation and market summary surface |
| `src/popup/components/StockTable.tsx` | Dense stock sweep table |
| `src/popup/components/FundTable.tsx` | Dense fund sweep table |
| `src/popup/components/ConfirmModal.tsx` | Shared confirmation shell and actions |
| `src/popup/views/*` | Detail and analysis surfaces that inherit the same token language |
| `src/options/App.tsx` | Settings grouping and control-console presentation |
| `src/floating-overlay/App.tsx` | Compact overlay layout and stock card presentation |

---

## Chunk 1: Shared Tokens and Theme Bridge

**Files:**
- Create: `src/shared/design-tokens.ts`
- Modify: `src/shared/theme.ts`
- Modify: `src/popup/index.css`
- Modify: `src/options/index.css`
- Modify: `src/floating-overlay/styles.ts`

- [ ] **Step 1: Define the primitive, semantic, and component token maps**

Create a typed token module that exposes the core palette, spacing, radius, shadow, and typography values used across all surfaces. Keep the exports small and explicit so popup, options, and overlay can consume the same names without duplicating magic values.

- [ ] **Step 2: Add a helper for applying theme variables to a host element**

Implement a utility that can write the shared semantic tokens to `document.documentElement` and to the overlay shadow host. The helper should accept the existing `ThemeMode` and `ColorScheme` concepts, so current theme persistence stays intact.

- [ ] **Step 3: Refactor theme normalization to stay compatible with the new token model**

Update `src/shared/theme.ts` so it continues to normalize the stored theme mode, but now also acts as the single place that describes how dark/light/white map to semantic token sets.

- [ ] **Step 4: Replace hardcoded popup and options surface colors with semantic variables**

Update the root CSS in `src/popup/index.css` and `src/options/index.css` so the page shells read from semantic variables instead of scattering raw color values. Keep the existing layout behavior intact while changing only the visual source of truth.

- [ ] **Step 5: Rewire the floating overlay stylesheet to the same token language**

Change `src/floating-overlay/styles.ts` so the `:host` variables match the shared token names and the overlay card colors, borders, and text levels line up with popup and options.

- [ ] **Step 6: Run a full typecheck and bundle build**

Run: `npm run build`

Expected: the project compiles successfully and the new token bridge does not break any entrypoint imports.

---

## Chunk 2: Shared UI Primitives

**Files:**
- Create: `src/popup/components/ui/Button.tsx`
- Create: `src/popup/components/ui/Badge.tsx`
- Create: `src/popup/components/ui/Panel.tsx`
- Create: `src/popup/components/ui/ModalShell.tsx`
- Create: `src/popup/components/ui/Input.tsx`
- Create: `src/popup/components/ui/index.ts`
- Modify: `src/popup/components/ConfirmModal.tsx`
- Modify: `src/popup/components/FloatingRefreshBtn.tsx`
- Modify: `src/popup/components/TagBadge.tsx`
- Modify: `src/popup/tags/TagEditor.tsx`

- [ ] **Step 1: Write the reusable button and badge primitives**

Add small, typed primitives for primary, secondary, danger, and icon-button states, plus badge variants for neutral, positive, negative, and warning semantics. Keep the props minimal so these components are easy to use inside dense tables and modal headers.

- [ ] **Step 2: Add a shared panel and modal shell**

Create a reusable surface wrapper that handles padding, border, blur, and shadow consistently across popup views, then layer a modal shell on top for confirmations and detail overlays.

- [ ] **Step 3: Add a shared input primitive for compact controls**

Introduce one input component for numeric fields and compact text fields so settings, inline editing, and tag editing all share the same focus ring, spacing, and disabled treatment.

- [ ] **Step 4: Swap the existing confirmation and refresh controls to the new primitives**

Update `ConfirmModal`, `FloatingRefreshBtn`, and the tag-related controls to consume the new primitives rather than each defining its own button and surface styling.

- [ ] **Step 5: Run lint on the new primitive layer**

Run: `npm run lint`

Expected: no new lint warnings or broken imports are introduced by the shared primitive layer.

---

## Chunk 3: Popup Shell and Sweep Experience

**Files:**
- Modify: `src/popup/App.tsx`
- Modify: `src/popup/components/SideNav.tsx`
- Modify: `src/popup/components/StockTable.tsx`
- Modify: `src/popup/components/FundTable.tsx`
- Modify: `src/popup/components/IntradayChart.tsx`
- Modify: `src/popup/components/AccountDashboard.tsx`
- Modify: `src/popup/components/NotificationPanel.tsx`
- Modify: `src/popup/index.css`
- Create: `src/popup/components/MarketStatsStrip.tsx`

- [ ] **Step 1: Refactor the popup into a clearer shell hierarchy**

Restructure `App.tsx` so the market summary, side navigation, and main content area read as one terminal layout instead of a collection of adjacent blocks. Keep the current tab and detail logic intact.

- [ ] **Step 2: Extract the market summary into its own component**

Move the market statistics strip out of `SideNav` into a dedicated component so the left rail stays focused on navigation and the summary can be styled as a top-level scan surface.

- [ ] **Step 3: Tighten the side rail hierarchy**

Update `SideNav` so the active tab, unread badge, settings, and theme toggle all use the same visual rhythm and spacing. Make the rail feel like a terminal control column, not a generic menu.

- [ ] **Step 4: Rework stock and fund tables for scan speed**

Tune the table cells, row heights, secondary text, badges, and dual-value cells so the name, signal, and key PnL numbers are the first things the eye catches. Keep inline editing and drag-and-drop behavior unchanged.

- [ ] **Step 5: Normalize chart and dashboard surfaces**

Bring `IntradayChart`, `AccountDashboard`, and `NotificationPanel` onto the same card, border, and typographic scale so they read as part of the same terminal system.

- [ ] **Step 6: Run a popup-focused smoke test**

Run: `npm run dev`

Expected: the popup loads, the left rail remains usable, table rows retain sorting/editing/drag behavior, and the top summary reads cleanly at a glance.

---

## Chunk 4: Options, Floating Overlay, and Detail Surfaces

**Files:**
- Modify: `src/options/App.tsx`
- Modify: `src/options/index.css`
- Modify: `src/floating-overlay/App.tsx`
- Modify: `src/floating-overlay/components/FloatingWidget.tsx`
- Modify: `src/floating-overlay/components/StockCard.tsx`
- Modify: `src/floating-overlay/components/StockDetail.tsx`
- Modify: `src/floating-overlay/styles.ts`
- Modify: `src/popup/views/StockDetailView.tsx`
- Modify: `src/popup/views/FundDetailView.tsx`
- Modify: `src/popup/views/IndexDetailModal.tsx`
- Modify: `src/popup/views/AssessmentCenter.tsx`

- [ ] **Step 1: Reframe the settings page as a control console**

Reorganize `Options/App.tsx` into clean sections for appearance, refresh, alerts, privacy, backup, and advanced settings, and apply the same density and surface language as the popup shell.

- [ ] **Step 2: Compress the floating overlay into a true quick-glance surface**

Update the overlay card, header, and stock rows so the floating widget stays compact, readable, and low-distraction while still reflecting the shared theme tokens.

- [ ] **Step 3: Align detail views with the shared modal shell**

Refactor the stock, fund, index, and assessment detail views so they reuse the same header spacing, content rhythm, and action area conventions instead of each view inventing its own chrome.

- [ ] **Step 4: Recheck theme and privacy variants**

Make sure dark/light/white themes and hidden-value states still render correctly in the settings page, overlay, and detail views after the layout refresh.

- [ ] **Step 5: Run a full build and final manual pass**

Run: `npm run build`

Expected: the extension bundles successfully and all modified surfaces remain visually consistent under each theme mode.

---

## Chunk 5: Final Cleanup and Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-05-29-stock-terminal-design-system.md` if implementation drift requires a spec clarification
- Create or update: any small follow-up files that were introduced during implementation

- [ ] **Step 1: Remove duplicate styling patterns**

Sweep for any leftover hardcoded colors, one-off shadows, or duplicate spacing rules that survived the component refactor, and fold them back into the token or primitive layer.

- [ ] **Step 2: Add a short implementation note to the repo docs**

Document the new token file, the shared primitive layer, and the preferred order for future UI changes so new work follows the system instead of bypassing it.

- [ ] **Step 3: Re-run lint and build after cleanup**

Run: `npm run lint && npm run build`

Expected: both commands succeed with no regressions introduced by the cleanup pass.

- [ ] **Step 4: Commit the implementation in a small, focused batch**

Commit after each chunk or at least after the token layer, the popup refactor, and the final cleanup so regressions are easier to isolate.

---

## Acceptance Criteria

- Popup, options, floating overlay, and detail views all use the same token vocabulary
- The popup reads as a trading terminal with clear scan hierarchy
- The tables remain dense but easier to parse
- Dark, light, and white themes continue to work
- No business logic or storage schema changes are required for the visual refresh
- `npm run lint` and `npm run build` both pass after the refactor

## Execution Notes

- Keep the first change set focused on tokens and theme bridging only
- Avoid large concurrent visual rewrites in files that already have complex behavior
- Prefer small component extractions over large CSS rewrites when a repeated pattern appears in two or more places
- Preserve the existing storage, fetch, and state flow unless the design system change truly requires a boundary shift
