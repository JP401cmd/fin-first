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

## 2026-06-12

- **Schermen** verwijderd: /beheer/migration
- **API-routes** verwijderd: /api/apply-household-migration, /api/apply-migration, /api/apply-perspective-migration, /api/run-household-migration

## 2026-06-12

- Geen wijzigingen.

## 2026-06-12

- **Schermen** toegevoegd: /beheer/development

## 2026-06-12

- Geen wijzigingen.

## 2026-06-12

- Geen wijzigingen.

## 2026-06-12

- **Componenten (aantal)** verwijderd: -2

## 2026-06-12

- **Componenten (aantal)** toegevoegd: +1

## 2026-06-12

- **Componenten (aantal)** toegevoegd: +2

## 2026-06-12

- Geen wijzigingen.

## 2026-06-12

- **Schermen** verwijderd: /test-level-up-celebration
- **API-routes** toegevoegd: /api/appearance
- **API-routes** verwijderd: /api/admin/test-phase-transition, /api/verify-level-up-celebration
- **Componenten (aantal)** verwijderd: -2

## 2026-06-12

- Geen wijzigingen.

## 2026-06-12

- **Tabellen** toegevoegd: category_corrections, if
- **Componenten (aantal)** toegevoegd: +2

## 2026-06-12

- **Tabellen** verwijderd: if

## 2026-06-12

- Geen wijzigingen.

## 2026-06-12

- Geen wijzigingen.

## 2026-06-13

- **Schermen** toegevoegd: /beheer/grafiek-werking, /beheer/horizon-tabellen
- **API-routes** toegevoegd: /api/horizon-engine

## 2026-06-13

- **Schermen** toegevoegd: /beheer/horizon-tabellen-mij
- **API-routes** toegevoegd: /api/horizon-engine/ledger

## 2026-06-13

- Geen wijzigingen.

## 2026-06-13

- Geen wijzigingen.

## 2026-06-13

- Geen wijzigingen.

## 2026-06-13

- **Componenten (aantal)** verwijderd: -2

## 2026-06-14

- **Componenten (aantal)** toegevoegd: +4

## 2026-06-14

- **Schermen** verwijderd: /horizon/doorrekening-test, /horizon/doorrekening-test/afbouw, /horizon/doorrekening-test/gebeurtenissen, /horizon/doorrekening-test/opbouw, /horizon/doorrekening-test/overzicht
- **Componenten (aantal)** verwijderd: -5

## 2026-06-14

- **API-routes** toegevoegd: /api/overzicht/cashflow-status
- **API-routes** verwijderd: /api/horizon-engine

## 2026-06-14

- **Schermen** toegevoegd: /beheer/horizon-strategie
- **Schermen** verwijderd: /beheer/horizon-tabellen
- **API-routes** verwijderd: /api/horizon-engine/ledger

## 2026-06-15

- **Schermen** toegevoegd: /rapportages/benchmark
- **API-routes** toegevoegd: /api/report/benchmark

## 2026-06-15

- **Componenten (aantal)** toegevoegd: +1

## 2026-06-15

- **Componenten (aantal)** toegevoegd: +3

## 2026-06-16

- **Componenten (aantal)** toegevoegd: +3

## 2026-06-16

- **Tabellen** toegevoegd: broker_connections

## 2026-06-16

- **API-routes** toegevoegd: /api/integrations/brokers/[id], /api/integrations/brokers/[id]/sync, /api/integrations/brokers/[id]/test, /api/integrations/brokers/trading212/connect, /api/integrations/brokers/trading212/validate
- **Componenten (aantal)** toegevoegd: +2

## 2026-06-16

- Geen wijzigingen.

## 2026-06-16

- **Integraties** toegevoegd: Aandelen-brokers (Trading 212)

## 2026-06-16

- Geen wijzigingen.

## 2026-06-16

- **API-routes** toegevoegd: /api/snapshots/history
- **Componenten (aantal)** toegevoegd: +3

## 2026-06-16

- Geen wijzigingen.

## 2026-06-16

- Geen wijzigingen.

## 2026-06-17

- **Schermen** toegevoegd: /check, /check/activeren, /check/rapport
- **API-routes** toegevoegd: /api/check/activate, /api/check/submit
- **Tabellen** toegevoegd: intake_rate_limit, lead_intakes
- **Componenten (aantal)** toegevoegd: +25

## 2026-06-17

- **Componenten (aantal)** toegevoegd: +4

## 2026-06-17

- **Componenten (aantal)** toegevoegd: +1

## 2026-06-17

- **API-routes** toegevoegd: /api/overzicht/page-status
- **Componenten (aantal)** toegevoegd: +4

## 2026-06-17

- **Componenten (aantal)** toegevoegd: +1

## 2026-06-17

- Geen wijzigingen.

## 2026-06-17

- **API-routes** toegevoegd: /api/admin/integraties/health
- **Tabellen** toegevoegd: contract_events
- **Integratie-clients** toegevoegd: lib/integrations/bitvavo-client.ts, lib/integrations/blockchair-client.ts, lib/integrations/coinbase-client.ts, lib/integrations/coingecko-client.ts, lib/integrations/fmp-client.ts, lib/integrations/health-probe.ts, lib/integrations/kraken-client.ts, lib/integrations/trading212-client.ts, lib/integrations/version-registry.ts, lib/parsers/broker-csv.ts, lib/parsers/categorize.ts, lib/parsers/counterparty-normalize.ts, lib/parsers/csv.ts, lib/parsers/format-contracts.ts, lib/parsers/mt940.ts, lib/parsers/mt940js.d.ts, lib/parsers/ofx.ts, lib/truelayer/client.ts, lib/nibud/api-client.ts, app/api/pension/parse/route.ts

## 2026-06-17

- **Integratie-clients** verwijderd: lib/integrations/health-probe.ts, lib/integrations/version-registry.ts, lib/parsers/categorize.ts, lib/parsers/counterparty-normalize.ts, lib/parsers/format-contracts.ts

## 2026-06-17

- **Integratie-clients** verwijderd: lib/parsers/mt940js.d.ts

## 2026-06-17

- **Schermen** toegevoegd: /beheer/integraties
