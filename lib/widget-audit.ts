// ── Widget Audit: KPI Classification & Action Verification ───────────────────
//
// This file codifies the audit of all KPI-widgets across dashboard/core/will/horizon.
// Each widget is classified as either:
//
//   - 'observation' — Pure metric display (netto vermogen, fase-bar, trends).
//     These are legitimate without a mandatory action but MAY link to a detail page.
//
//   - 'insight' — Actionable information that MUST have a clickable action
//     (href or onClick) linking to the relevant page for the user to take action.
//
// Rule enforcement:
//   - Insight widgets WITHOUT a link in WIDGET_HREFS fail the audit.
//   - Observation widgets need no action link (but having one is fine).
//   - No widget may be unclassified (neither observation nor insight).
//
// ── Why observation widgets are legitimate ──────────────────────────────────
//
// Observation widgets (14 total) serve a critical UX purpose: they provide
// context and overview without demanding user action. Examples:
//
//   - Netto Vermogen: shows the total net worth as the primary financial
//     metric. Its value IS the insight — no button needed.
//   - Jouw Pad (fase-bar): shows sovereignty level progress. The bar itself
//     communicates trajectory — forcing a CTA would be noise.
//   - Trend widgets: show historical lines. The shape IS the information.
//   - Vermogensgrafiek: the net-worth-projection-chart on /core is a pure
//     SVG observation with no interactive elements at all.
//
// These widgets optionally accept `href?: string` for "see more" navigation
// but function correctly without it. The WidgetShell renders them as plain
// <div> elements (not clickable) when no href/onClick is provided.
//
// DO NOT add forced action buttons to observation widgets. If a user needs
// to act, they navigate via insight widgets or module navigation.

import { WIDGET_CATALOG, WIDGET_HREFS } from './widget-catalog'

export type WidgetClassification = 'observation' | 'insight' | 'needs_review'

/**
 * Classification map: widget id → observation | insight.
 *
 * Observation = pure metric/progress indicator; legitimate without action.
 * Insight = shows data the user can/should act on; MUST have an href or onClick.
 */
export const WIDGET_CLASSIFICATION: Record<string, WidgetClassification> = {
  // ── Observations (pure metrics, phase/progress indicators) ───
  netto_vermogen:           'observation',   // Total net worth — pure KPI
  vrijheidsvoortgang:       'observation',   // % progress to FIRE goal
  jouw_pad:                 'observation',   // Sovereignty level / phase bar
  pensioen_aow:             'observation',   // AOW countdown timer
  vrijheidsmijlpalen:       'observation',   // Milestone progress markers
  maandoverzicht:           'observation',   // Monthly aggregation summary
  weekoverzicht:            'observation',   // Weekly expense summary
  trend_inkomen:            'observation',   // Income trend line
  trend_uitgaven:           'observation',   // Expense trend line
  trend_sparen:             'observation',   // Savings trend line
  trend_schulden:           'observation',   // Debt reduction trend
  huishouden_vergelijking:  'observation',   // Partner freedom-time comparison
  huishouden_activiteit:    'observation',   // Shared transaction feed
  beleggingsrendement:      'observation',   // Portfolio return performance

  // ── Insights (actionable — must link to relevant page) ──────
  cash_flow:                'insight',       // → /core/cash (view transactions, adjust)
  budgetten:                'insight',       // → /core/budgets (manage budgets)
  uitgaven_heatmap:         'insight',       // → /overzicht/cashflow/budget (drill into spending)
  assets:                   'insight',       // → /core/assets (manage allocations)
  schulden:                 'insight',       // → /core/debts (manage payoff)
  holdings:                 'insight',       // → /core/assets (manage investments)
  voorstellen:              'insight',       // → /will#voorstellen (accept/reject)
  acties:                   'insight',       // → /will#acties (complete actions)
  doelen:                   'insight',       // → /will#doelen (update goals)
  fire_prognose:            'insight',       // → /horizon (adjust scenario)
  monte_carlo:              'insight',       // → /horizon?modal=simulations
  levensgebeurtenissen:     'insight',       // → /horizon?modal=life_events
  spaarquote:               'insight',       // → /core (improve rate)
  vaste_lasten:             'insight',       // → /core/cash (review subscriptions)
  gezondheids_score:        'insight',       // onClick → kassabon drill-down
  belasting_box3:           'insight',       // → /core/debts (tax optimization)
  nibud_benchmark:          'insight',       // → /core (compare/improve)
  vrijheidsscenarios:       'insight',       // → /horizon?modal=scenarios
  sim_vermogenspad:         'insight',       // → /horizon?modal=simulations
  box3_drag:                'insight',       // → /core/debts (tax strategy)
  backtesting_score:        'insight',       // → /horizon?modal=backtesting
  surplus_gap:              'insight',       // → /horizon#vermogensstromen
  inflatie_impact:          'insight',       // → /identity/instellingen (adjust assumption)
  swr_monitor:              'insight',       // → /identity/instellingen (adjust SWR params)
  meldingen:                'insight',       // → /berichten (view/dismiss)
  ai_inzicht:               'insight',       // → /berichten (follow suggestions)
  volgende_stap:            'insight',       // → /will (take the step)
  agenda:                   'insight',       // → /core/cash (plan for events)
  noodfonds:                'insight',       // → /core (build emergency fund)
  beslissingspatronen:      'insight',       // → /will (improve patterns)
  vrijheidsdagen_maand:     'insight',       // → /will (maintain momentum)
  wilskracht:               'insight',       // → /will (improve score)
  berichten:                'insight',       // → /nieuws (read articles)
  rebalancing:              'insight',       // → /core/assets (rebalance portfolio)
  fee_analyzer:             'insight',       // onClick → fee detail modal
  hypotheek_vs_beleggen:    'insight',       // → /core/debts (decide strategy)
}

// ── Review decision tracking ─────────────────────────────────────────────────
//
// When a widget is classified as 'needs_review', it enters the review pipeline.
// The WIDGET_REVIEW_LOG records decisions made during review:
//
//   - 'pending'  — Flagged for review, no decision yet.
//   - 'keep'     — Reviewed and kept — rationale documents why it stays.
//   - 'remove'   — Reviewed and approved for removal — will be removed in next cleanup.
//   - 'modify'   — Reviewed and needs redesign before it earns its place.
//
// A needs_review widget with decision 'pending' is an audit violation.
// A needs_review widget with decision 'keep'/'remove'/'modify' passes the audit.

export type ReviewDecision = 'pending' | 'keep' | 'remove' | 'modify'

export interface WidgetReviewEntry {
  decision: ReviewDecision
  rationale: string
  reviewedAt: string | null  // ISO date string, null if pending
}

/**
 * Review log for widgets flagged as 'needs_review'.
 * Each entry documents the team's decision and reasoning.
 *
 * Usage: when classifying a widget as 'needs_review', add an entry here.
 * The beheer/widget-audit admin page renders this log for transparency.
 */
export const WIDGET_REVIEW_LOG: Record<string, WidgetReviewEntry> = {
  // ── Currently no widgets are flagged for review ──
  // All 50 widgets have been audited and classified as either
  // 'observation' (14 — pure metrics/progress) or 'insight' (36 — actionable).
  //
  // To flag a widget for review, change its WIDGET_CLASSIFICATION entry
  // to 'needs_review' and add an entry here with decision: 'pending'.
  //
  // Example:
  // some_widget: {
  //   decision: 'pending',
  //   rationale: 'Unclear if this widget drives user action or shows a valuable metric.',
  //   reviewedAt: null,
  // },
}

/**
 * Returns the review entry for a widget, or null if not in review.
 */
export function getWidgetReviewEntry(widgetId: string): WidgetReviewEntry | null {
  return WIDGET_REVIEW_LOG[widgetId] ?? null
}

/**
 * Guard: a widget may only be removed from the catalog if it has been
 * reviewed and explicitly marked 'remove'. Prevents accidental deletion
 * of widgets that haven't gone through the review process.
 */
export function canRemoveWidget(widgetId: string): boolean {
  const entry = WIDGET_REVIEW_LOG[widgetId]
  return entry?.decision === 'remove'
}

/**
 * Returns all widgets currently flagged for review, grouped by decision.
 */
export function getWidgetsInReview(): {
  pending: string[]
  keep: string[]
  remove: string[]
  modify: string[]
} {
  const result = { pending: [] as string[], keep: [] as string[], remove: [] as string[], modify: [] as string[] }
  for (const [widgetId, entry] of Object.entries(WIDGET_REVIEW_LOG)) {
    result[entry.decision].push(widgetId)
  }
  return result
}

/**
 * Returns the classification of a widget.
 * Throws if widget is not classified (should never happen with WIDGET_CATALOG).
 */
export function getWidgetClassification(widgetId: string): WidgetClassification {
  const classification = WIDGET_CLASSIFICATION[widgetId]
  if (!classification) {
    throw new Error(
      `[widget-audit] Widget "${widgetId}" is not classified. ` +
      `Add it to WIDGET_CLASSIFICATION as 'observation' or 'insight'.`
    )
  }
  return classification
}

/**
 * Returns true if the widget is an insight (actionable) widget.
 */
export function isInsightWidget(widgetId: string): boolean {
  return WIDGET_CLASSIFICATION[widgetId] === 'insight'
}

/**
 * Returns true if the widget is an observation (pure metric) widget.
 */
export function isObservationWidget(widgetId: string): boolean {
  return WIDGET_CLASSIFICATION[widgetId] === 'observation'
}

// ── Audit verification ──────────────────────────────────────────────────────

export interface AuditViolation {
  widgetId: string
  issue: 'unclassified' | 'insight_missing_href' | 'needs_review_pending'
}

/**
 * Runs the full widget audit and returns violations.
 * Returns empty array if all constraints pass.
 *
 * Checks:
 * 1. Every catalog widget has a classification
 * 2. Every insight widget has an href in WIDGET_HREFS
 * 3. Every needs_review widget has a non-pending decision in WIDGET_REVIEW_LOG
 * 4. No observation widget is forced to have an action (informational - always passes)
 */
export function runWidgetAudit(): AuditViolation[] {
  const violations: AuditViolation[] = []

  for (const widget of WIDGET_CATALOG) {
    // Check 1: classified?
    if (!WIDGET_CLASSIFICATION[widget.id]) {
      violations.push({ widgetId: widget.id, issue: 'unclassified' })
      continue
    }

    // Check 2: insight must have href
    if (WIDGET_CLASSIFICATION[widget.id] === 'insight') {
      const href = WIDGET_HREFS[widget.id]
      if (!href) {
        violations.push({ widgetId: widget.id, issue: 'insight_missing_href' })
      }
    }

    // Check 3: needs_review must have a resolved decision (not 'pending')
    if (WIDGET_CLASSIFICATION[widget.id] === 'needs_review') {
      const review = WIDGET_REVIEW_LOG[widget.id]
      if (!review || review.decision === 'pending') {
        violations.push({ widgetId: widget.id, issue: 'needs_review_pending' })
      }
    }
  }

  return violations
}

/**
 * Returns audit summary statistics.
 */
export function getAuditSummary() {
  const observations = Object.values(WIDGET_CLASSIFICATION).filter(c => c === 'observation').length
  const insights = Object.values(WIDGET_CLASSIFICATION).filter(c => c === 'insight').length
  const needsReview = Object.values(WIDGET_CLASSIFICATION).filter(c => c === 'needs_review').length
  const catalogSize = WIDGET_CATALOG.length
  const classifiedCount = Object.keys(WIDGET_CLASSIFICATION).length
  const unclassified = WIDGET_CATALOG.filter(w => !WIDGET_CLASSIFICATION[w.id]).length
  const violations = runWidgetAudit()

  return {
    catalogSize,
    classifiedCount,
    observations,
    insights,
    needsReview,
    unclassified,
    violations,
    passing: violations.length === 0,
  }
}

/**
 * Throws if any audit violations exist. Use in tests or build-time checks.
 */
export function assertWidgetAuditPasses(): void {
  const violations = runWidgetAudit()
  if (violations.length > 0) {
    const details = violations
      .map(v => `  - ${v.widgetId}: ${v.issue}`)
      .join('\n')
    throw new Error(
      `Widget audit failed with ${violations.length} violation(s):\n${details}`
    )
  }
}
