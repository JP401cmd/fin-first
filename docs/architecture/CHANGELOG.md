# Architectuurplaat — wijzigingslog

## 2026-06-07

- Eerste snapshot (baseline).

## 2026-06-10

- **Schermen** toegevoegd: /beheer/welkom, /mijn/account
- **API-routes** toegevoegd: /api/admin/welcome-guide, /api/belasting/box1-income, /api/own-accounts/reclassify, /api/welcome-guide
- **Context-builders** toegevoegd: buildSubscriptionsContext
- **Componenten (aantal)** toegevoegd: +8

## 2026-06-10

- **Schermen** toegevoegd: /beheer/architectuur

## 2026-06-10

- **Schermen** verwijderd: /beheer/features, /beheer/meldingen, /beheer/propositie, /beheer/roadmap, /beheer/test-deferred, /beheer/tiers, /beheer/toegang, /beheer/widgets-test, /beheer/will-avatar, /test-feature-gating, /test-feature-spotlight, /test-locked-default, /test-locked-features, /test-phase-modal, /test-phase-transition, /test-sovereignty-gating, /test-spotlight-persistence
- **API-routes** verwijderd: /api/admin/feature-access, /api/verify-deferred-fields, /api/verify-locked-default, /api/verify-phase-transition, /api/verify-spotlight-persistence
- **Componenten (aantal)** verwijderd: -2

## 2026-06-10

- **Schermen** toegevoegd: /beheer/roadmap
- **Schermen** verwijderd: /identity/koppelingen, /identity/profiel, /test-onboarding-intent, /test-onboarding-intro, /test-onboarding-workflow, /test-year-in-review
- **API-routes** verwijderd: /api/verify-dashboard-card-order, /api/verify-feature-gating, /api/verify-feature-roadmap, /api/verify-feature-spotlight, /api/verify-year-in-review

## 2026-06-10

- **Schermen** toegevoegd: /beheer/gebruikers, /functies, /prijzen, /veiligheid
- **Componenten (aantal)** toegevoegd: +1

## 2026-06-10

- **Schermen** toegevoegd: /beheer/jobs
- **API-routes** toegevoegd: /api/admin/users/block, /api/admin/users/role
- **Tabellen** toegevoegd: job_runs
- **Componenten (aantal)** toegevoegd: +1

## 2026-06-11

- **Schermen** toegevoegd: /beheer/audit, /beheer/email, /beheer/errors, /beheer/feedback, /beheer/kpi, /beheer/platform, /mijn/feedback
- **API-routes** toegevoegd: /api/admin/feedback, /api/admin/platform, /api/admin/user-delete, /api/admin/user-diagnose, /api/admin/user-export, /api/ai-credits, /api/feedback, /api/log-error
- **Componenten (aantal)** toegevoegd: +5

## 2026-06-11

- **Schermen** verwijderd: /test-briefing-history, /test-briefing-toggles, /test-discover-card-mobile, /test-insight-cta, /test-next-step-card
- **API-routes** toegevoegd: /api/news/feedback
- **API-routes** verwijderd: /api/briefing/compose, /api/briefing/history, /api/briefing/history/[id]
- **Tabellen** toegevoegd: news_feedback
- **Briefing-kaarten** verwijderd: showAction, showAlert, showBudgetBar, showChecklist, showComparison, showCountdown, showDecisionPatterns, showDiscover, showFreedomDaysTrend, showGoalProgress, showInsight, showLifeEvent, showMetric, showMilestone, showNextStep, showProgressRing, showQuote, showRecurring, showSparkline
- **Componenten (aantal)** verwijderd: -29

## 2026-06-11

- **API-routes** verwijderd: /api/dashboard-type

## 2026-06-11

- **API-routes** toegevoegd: /api/household/budget-model
- **Tabellen** toegevoegd: household_budget_model_proposals
- **Componenten (aantal)** toegevoegd: +3

## 2026-06-11

- **Schermen** toegevoegd: /beheer/ai-verbruik
- **Tabellen** toegevoegd: ai_token_usage

## 2026-06-12

- **Componenten (aantal)** toegevoegd: +4
