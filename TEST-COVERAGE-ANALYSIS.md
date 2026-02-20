# Test Coverage Analysis — TriFinity (fin-first)

**Date:** 2026-02-20
**Branch:** `claude/analyze-test-coverage-62GyX`

---

## Executive Summary

The codebase has **no traditional testing framework** (no Jest, Vitest, Cypress, or Playwright). Instead, it uses a custom pattern of **157 API verification endpoints** (`/api/verify-*`) and **202 test pages** (`/test-*`, `/verify-*`) that run assertions in-browser or via HTTP requests.

While this approach covers feature-level verification broadly, it leaves significant gaps: **zero unit tests** for pure business logic, **zero component tests**, **no automated test runner**, and **no coverage metrics**. The only automated quality gate is `next build` via a Husky pre-push hook, which catches TypeScript errors but not logic bugs.

---

## Current Testing Infrastructure

| Aspect | Status |
|---|---|
| Test framework (Jest/Vitest) | Not installed |
| Component testing (React Testing Library) | Not installed |
| E2E testing (Cypress/Playwright) | Not installed |
| Test runner (`npm test`) | Not defined |
| Coverage tooling (Istanbul/c8) | Not installed |
| CI/CD test pipeline | None |
| Pre-push hook | `next build` only (type checking) |

### What Exists

- **157 verification API endpoints** (`app/api/verify-*/route.ts`) — each runs assertions and returns JSON `{ allPassing, results[] }`
- **202 test page directories** (`app/test-*`, `app/verify-*`) — interactive browser-based verification
- **1 test data file** (`lib/test-personas.ts`) — persona definitions for seeding

### Strengths of Current Approach

1. High feature coverage breadth — most features have a verification endpoint
2. Tests run against real Supabase data, catching integration issues
3. Well-documented test specifications with feature references
4. Dutch language output matches production UX

### Weaknesses

1. **Not automated** — no `npm test`, no CI integration, must be triggered manually
2. **No isolation** — tests hit real database, can't run in parallel or in CI
3. **No regression detection** — nothing stops a passing test from breaking silently
4. **No coverage metrics** — impossible to measure what percentage of code is tested
5. **Build bloat** — 202 test pages and 157 test API routes are bundled into production

---

## Coverage Gap Analysis

### CRITICAL: Pure Business Logic (0% unit test coverage)

These `lib/` files contain complex, deterministic logic that is **ideal for unit testing** — pure functions with no database dependencies:

| File | What It Does | Why It Needs Tests |
|---|---|---|
| `lib/format.ts` | Currency formatting, freedom-time calculations (`calculateFreedomTime`, `formatWithFreedom`) | Core philosophy of the app; edge cases with NaN, negatives, zero expenses, large values |
| `lib/budget-forecast.ts` | Weighted moving average predictions, confidence scoring | Statistical calculations prone to rounding errors; confidence thresholds need boundary tests |
| `lib/net-worth-projection.ts` | 5-year compound growth model, FIRE target detection | Financial projections; off-by-one in month counting, edge cases with negative savings |
| `lib/recurring-detection.ts` | Transaction pattern detection (frequency, category, counterparty normalization) | Complex algorithm with many code paths; regex patterns for Dutch counterparties |
| `lib/spending-patterns.ts` | Spending trend analysis and anomaly detection | Statistical functions that should be verified with known datasets |
| `lib/budget-alerts.ts` | Budget overspend alert generation | Threshold logic with multiple alert levels |
| `lib/budget-rollover.ts` | Month-to-month budget carryover calculations | Accounting logic where rounding errors compound |
| `lib/freedom-milestones.ts` | Milestone calculation and progression | Boundary conditions at milestone thresholds |
| `lib/benchmark-comparison.ts` | NIBUD benchmark comparisons | Percentage calculations, category mapping accuracy |
| `lib/compute-feature-access.ts` | Sovereignty level computation, feature gating | Access control logic — bugs here affect the entire UX |
| `lib/box3-data.ts` | Dutch Box 3 tax calculations | Tax calculations must be exact; regulatory compliance |

**Estimated effort:** These are the highest-value, lowest-effort tests to add. Most functions are pure (input → output) and can be tested without mocking.

### HIGH: Parsers (0% unit test coverage)

| File | What It Does | Why It Needs Tests |
|---|---|---|
| `lib/parsers/csv.ts` | CSV parsing for ING, Rabobank, ABN AMRO bank formats | Handles Dutch number formats (`1.234,56`), quoted fields, sign columns, multiple date formats |
| `lib/parsers/mt940.ts` | MT940/SWIFT bank statement parsing | Binary-like format; edge cases with multi-line descriptions |
| `lib/parsers/ofx.ts` | OFX/QFX financial data parsing | XML-based format with nested structures |
| `lib/parsers/categorize.ts` | Auto-categorization of transactions | Pattern matching accuracy directly affects budget tracking |
| `lib/parsers/shared.ts` | Hash computation, shared types | Hash collisions would cause duplicate import issues |

**Estimated effort:** Parsers are pure functions that transform strings into structured data. Test fixtures can be created from real bank export samples (anonymized).

### HIGH: React Components (0% unit test coverage)

94 components in `components/app/` have no tests. Priority targets:

| Component | Why |
|---|---|
| `freedom-time-label.tsx` | Core philosophical display — must render correctly for all edge cases |
| `feature-gate.tsx` | Access control rendering — incorrect gating breaks the UX |
| `budget-form.tsx` | Complex form with validation, state management |
| `transaction-form.tsx` | Data entry with Dutch number parsing |
| `holding-transaction-log.tsx` | Financial data display accuracy |
| `budget-donut.tsx` / `budget-sankey.tsx` | Data visualization correctness |
| `streak-indicator.tsx` / `badge-grid.tsx` | Gamification rendering |
| `session-monitor.tsx` | Auth state management |
| `collapsible-section.tsx` | State persistence logic |

### MEDIUM: API Route Handlers (partial coverage)

246 production API routes exist. Only ~9 have dedicated test endpoints. Priority targets:

| Route Category | Count | Coverage |
|---|---|---|
| Budget CRUD (`/api/budgets/*`) | ~8 | Partial via verify endpoints |
| Asset/Holdings CRUD (`/api/assets/*`, `/api/holdings/*`) | ~12 | Partial via verify endpoints |
| Transaction operations (`/api/transactions/*`) | ~6 | Minimal |
| Auth flows (`/api/auth/*`) | ~5 | Minimal (only session expiry) |
| Household operations (`/api/household/*`) | ~8 | Partial |
| AI/Chat (`/api/ai/*`) | ~4 | Minimal |
| GoCardless banking (`/api/gocardless/*`) | ~6 | None |
| Badge/Streak (`/api/badges/*`, `/api/streaks/*`) | ~6 | Partial |

### MEDIUM: React Hooks (0% unit test coverage)

| Hook | What It Does |
|---|---|
| `hooks/use-badge-evaluation.ts` | Triggers badge evaluation logic |
| `hooks/use-auto-snapshot.ts` | Auto-saves financial snapshots |
| `hooks/use-unnotified-badges.ts` | Tracks badge notification state |
| `hooks/use-feature-access.ts` | Computes feature access level |

### LOW: AI Integration

| File | What It Does |
|---|---|
| `lib/ai/dna/*.ts` | AI personality modules (kern, wil, horizon) |
| `lib/ai/context/*.ts` | Context builders for AI prompts |
| `lib/ai/tools/*.ts` | AI tool definitions |
| `lib/ai/config.ts` | AI model configuration |

AI integration testing is inherently harder (non-deterministic), but the context builders and tool definitions contain deterministic logic that can be unit tested.

---

## Recommended Improvements (Prioritized)

### Phase 1: Foundation — Install a Test Framework

**Recommendation: Vitest**

Vitest is the natural choice for a Next.js 16 project — it shares Vite's config, supports TypeScript natively, and has a Jest-compatible API. It's fast and well-supported.

```
npm install -D vitest @vitejs/plugin-react jsdom
```

Add to `package.json`:
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

### Phase 2: Unit Tests for Pure Business Logic

Start with `lib/format.ts` — it's the most critical and easiest to test:

```typescript
// lib/__tests__/format.test.ts
import { calculateFreedomTime, formatWithFreedom, formatCurrency } from '../format'

describe('calculateFreedomTime', () => {
  it('converts EUR amount to freedom days', () => {
    const result = calculateFreedomTime(10000, 100)
    expect(result.totalDays).toBe(100)
    expect(result.years).toBe(0)
    expect(result.months).toBe(3)
  })

  it('handles zero daily expenses', () => {
    const result = calculateFreedomTime(10000, 0)
    expect(result.isInfinite).toBe(true)
  })

  it('handles negative amounts (debt)', () => {
    const result = calculateFreedomTime(-5000, 100)
    expect(result.isDeficit).toBe(true)
    expect(result.totalDays).toBe(50)
  })

  it('handles NaN input gracefully', () => {
    const result = calculateFreedomTime(NaN, 100)
    expect(result.totalDays).toBe(0)
  })
})
```

Then expand to:
1. `lib/budget-forecast.ts` — test `computeBudgetForecast` with known monthly arrays
2. `lib/net-worth-projection.ts` — test `computeNetWorthProjection` with fixed dates
3. `lib/recurring-detection.ts` — test `detectFrequency`, `detectCategory`, `normalizeCounterparty`
4. `lib/parsers/csv.ts` — test with sample CSV strings from each bank format
5. `lib/compute-feature-access.ts` — test sovereignty level computation
6. `lib/box3-data.ts` — test tax calculations against known correct values

### Phase 3: Component Tests

Install React Testing Library:
```
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Priority components:
1. `FreedomTimeLabel` — renders freedom time correctly
2. `FeatureGate` — shows/hides content based on sovereignty level
3. `BudgetForm` — form validation and submission
4. `CollapsibleSection` — toggle state persistence

### Phase 4: Integration Tests for API Routes

Use Vitest with Next.js route testing utilities, or set up a lightweight integration test that calls routes with mocked Supabase clients.

### Phase 5: E2E Tests (Optional)

If regressions become a problem, consider Playwright for critical user flows:
1. Onboarding flow
2. Transaction import (CSV upload)
3. Budget creation and editing
4. FIRE projection calculation

---

## Quick Wins

These changes provide immediate value with minimal effort:

1. **Install Vitest** and define `npm test` — even with zero tests, this unblocks future work
2. **Write 10-15 unit tests for `lib/format.ts`** — covers the most critical function in the app
3. **Write 5-10 tests for `lib/parsers/csv.ts`** — parsers are pure functions, easy to test with fixtures
4. **Write 5-8 tests for `lib/recurring-detection.ts`** — complex algorithm that benefits most from tests
5. **Add coverage reporting** — `vitest run --coverage` to establish a baseline
6. **Move test pages out of production bundle** — 202 test pages in `app/` are deployed to Vercel unnecessarily

---

## Metrics Summary

| Category | Files | Unit Tests | Coverage |
|---|---|---|---|
| Pure business logic (`lib/`) | 79 | 0 | 0% |
| React components (`components/app/`) | 94 | 0 | 0% |
| API routes (`app/api/`) | 246 | 0 (9 test endpoints) | ~0% |
| Pages (`app/**/page.tsx`) | 238 | 0 | 0% |
| Parsers (`lib/parsers/`) | 6 | 0 | 0% |
| Hooks (`lib/hooks/`) | 4 | 0 | 0% |
| **Total** | **667** | **0** | **0%** |

The project has extensive feature-level verification (157 endpoints), but **zero automated, runnable unit tests**.
