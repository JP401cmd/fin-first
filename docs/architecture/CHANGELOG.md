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

## 2026-06-19

- **Componenten (aantal)** toegevoegd: +1

## 2026-06-19

- **Componenten (aantal)** verwijderd: -1

## 2026-06-19

- **Componenten (aantal)** toegevoegd: +3

## 2026-06-22

- **API-routes** toegevoegd: /api/display-mode
- **Componenten (aantal)** toegevoegd: +15

## 2026-06-23

- **Componenten (aantal)** toegevoegd: +6

## 2026-06-24

- **API-routes** toegevoegd: /api/horizon-engine/ledger
- **Componenten (aantal)** toegevoegd: +3

## 2026-06-24

- Geen wijzigingen.

## 2026-06-24

- Geen wijzigingen.

## 2026-06-24

- Geen wijzigingen.

## 2026-06-25

- Geen wijzigingen.

## 2026-07-02

- Geen wijzigingen.

## 2026-07-03

- **Schermen** toegevoegd: /beheer/horizon-kernel, /beheer/widget-galerij
- **API-routes** toegevoegd: /api/horizon-kernel, /api/horizon-kernel/tabel, /api/horizon-kernel/verificatie
- **API-routes** verwijderd: /api/apply-roadmap-migration, /api/horizon-engine/ledger
- **Componenten (aantal)** toegevoegd: +4

## 2026-07-03

- **Schermen** toegevoegd: /beheer/fiscale-kerngetallen
- **Componenten (aantal)** toegevoegd: +4

## 2026-07-04

- Geen wijzigingen.

## 2026-07-04

- **Schermen** verwijderd: /test-500-error, /test-500-error/render-error, /test-account-deletion-cascade, /test-ai-recommendations, /test-allocation-delete, /test-asset-crud, /test-asset-deletion-networth, /test-asset-freedom-time, /test-asset-valuation-trends, /test-auto-snapshot, /test-auto-snapshots, /test-back-button, /test-bank-import, /test-beheer-redirect, /test-belasting-freedom-time, /test-benchmark-comparison, /test-berichten-footer, /test-bookmark-belasting, /test-box3-optimization, /test-box3-verification, /test-breadcrumb, /test-budget-alerts, /test-budget-category-delete, /test-budget-defaults, /test-budget-forecast, /test-budget-form-state, /test-budget-form-state/interactive, /test-budget-freedom-time, /test-budget-modes, /test-budget-sparklines-212, /test-budget-trend, /test-budget-verify, /test-budget-workflow, /test-buy-transaction, /test-cascade-delete, /test-cash-freedom-time, /test-cashflow-forecast, /test-chat, /test-chat-history, /test-chat-timeout, /test-collapsible-defaults, /test-collapsible-persistence, /test-collapsible-sections, /test-completed-next-step, /test-concurrent-edit, /test-cost-splitting, /test-csv-export, /test-dashboard-card-order, /test-dashboard-kpis, /test-dashboard-preview-metrics, /test-data-isolation, /test-data-reset-full, /test-debt-crud, /test-debt-freedom-time, /test-debt-payoff, /test-debt-payoff-removal, /test-debt-payoff-trajectory, /test-debt-trajectory, /test-deleted-holding, /test-direct-access-assets, /test-direct-budgets, /test-direct-identity, /test-discover-carousel, /test-discover-carousel-201, /test-dismiss-persist, /test-dividend-accumulation, /test-dividend-tracker, /test-double-dismiss, /test-duplicate-holding, /test-duplicate-holdings, /test-duplicate-import, /test-empty-states, /test-enhanced-snapshots, /test-feature-roadmap, /test-feature-visit-persistence, /test-feature-visits, /test-fee-erosion, /test-file-size-limit, /test-fire-age-trend, /test-fire-inputs, /test-fire-scenario-defaults, /test-fire-scenarios, /test-format-with-freedom, /test-freedom-card, /test-freedom-card-safe-data, /test-freedom-days-animation, /test-freedom-days-disambiguation, /test-freedom-days-monthly-trend, /test-freedom-milestones, /test-freedom-subtitles, /test-freedom-time-label-component, /test-freedom-time-label-edge-cases, /test-freedom-time-labels, /test-goal-progress, /test-goal-progress-bar, /test-goal-timeline, /test-goal-workflow, /test-heatmap-formats, /test-holding-cascade-delete, /test-holding-crud, /test-holding-defaults, /test-holding-double-click, /test-holding-edit-preservation, /test-holding-price-update, /test-holding-rapid-delete, /test-holding-submit-btn, /test-holding-transactions, /test-holding-tx-log, /test-holdings, /test-holdings-crud-mgmt, /test-holdings-errors, /test-holdings-heatmap, /test-holdings-list, /test-holdings-sync, /test-horizon-hero, /test-household-db, /test-household-fire, /test-household-invite, /test-household-privacy, /test-household-privacy-filter, /test-household-schema, /test-import-validation, /test-jouw-pad, /test-jouwpad, /test-kern-hero, /test-kern-widgets, /test-kpi-deduplication, /test-loading-states, /test-locked-footer, /test-malformed-holding-id, /test-migration, /test-milestone-markers, /test-multi-tab, /test-negative-validation, /test-network-error-import, /test-new-user-empty-state, /test-news-error, /test-news-hero, /test-next-step-completion-tracking, /test-next-step-dismiss, /test-next-step-engine, /test-next-step-prioritization, /test-next-steps, /test-nw-projection, /test-onboarding-double-submit, /test-onboarding-error-handling, /test-onboarding-inkomen, /test-onboarding-redirect, /test-onboarding-reset, /test-onboarding-saving, /test-onboarding-success, /test-onboarding-transition, /test-onboarding-validation, /test-portfolio-allocation, /test-portfolio-donut, /test-portfolio-projection, /test-price-feed, /test-privacy-default, /test-privacy-levels, /test-rec-workflow, /test-resilience-history, /test-resilience-score, /test-sanitize, /test-sanitize-failsafe, /test-schema, /test-section-anchors, /test-sell-transaction, /test-session-expiry, /test-share-targets, /test-shared-data, /test-smart-next-step, /test-snapshot-comparison, /test-snapshots, /test-sold-out-holding, /test-sparkline, /test-special-chars-url, /test-speech-bubbles, /test-spending-patterns, /test-spending-variance-confidence, /test-transaction-filters, /test-trend-chart, /test-unauthenticated-redirect, /test-user-isolation, /test-user-reset-isolation, /test-valuations, /test-wil-unique-lens, /test-will-dots
- **API-routes** verwijderd: /api/ai/chat-test-timeout, /api/test-500, /api/test-budget-alerts, /api/test-dividend-accumulation, /api/test-holdings-flow, /api/test-pii-output-filter, /api/test-rec-workflow, /api/test-sanitize, /api/test-sanitize-failsafe, /api/test-schema-validation, /api/verify-account-deletion-cascade, /api/verify-ai-recommendations, /api/verify-allocation-delete, /api/verify-asset-deletion-networth, /api/verify-asset-freedom-time, /api/verify-asset-valuation-trends, /api/verify-auto-snapshots, /api/verify-back-button, /api/verify-beheer-admin-redirect, /api/verify-beheer-nieuws, /api/verify-belasting-freedom-time, /api/verify-benchmark-comparison, /api/verify-bookmark-belasting, /api/verify-box3, /api/verify-box3-optimization, /api/verify-budget-category-delete, /api/verify-budget-defaults, /api/verify-budget-forecast, /api/verify-budget-form-state, /api/verify-budget-freedom-time, /api/verify-budget-sparklines-212, /api/verify-budget-spending, /api/verify-budget-trend, /api/verify-cascade-delete, /api/verify-cash-freedom-time, /api/verify-cashflow-forecast, /api/verify-chat-history, /api/verify-collapsible-defaults, /api/verify-collapsible-sections, /api/verify-completed-next-step, /api/verify-concurrent-edit, /api/verify-cost-split-modes, /api/verify-cost-splitting, /api/verify-csv-export, /api/verify-dashboard-kpis, /api/verify-dashboard-preview-metrics, /api/verify-data-isolation, /api/verify-data-reset-full, /api/verify-debt-freedom-time, /api/verify-debt-payoff-removal, /api/verify-debt-payoff-trajectory, /api/verify-debt-trajectory, /api/verify-deleted-holding, /api/verify-direct-access-assets, /api/verify-direct-budgets, /api/verify-direct-identity, /api/verify-discover-carousel, /api/verify-discover-carousel-201, /api/verify-dismissed-next-step, /api/verify-dividend-tracker, /api/verify-dividend-tracker-code, /api/verify-double-dismiss, /api/verify-duplicate-holding, /api/verify-duplicate-holdings, /api/verify-duplicate-import, /api/verify-enhanced-snapshots, /api/verify-feature-visit-persistence, /api/verify-feature-visits-tracking, /api/verify-fire-age-trend, /api/verify-fire-inputs, /api/verify-fire-scenario-defaults, /api/verify-format-with-freedom, /api/verify-freedom-card, /api/verify-freedom-card-safe-data, /api/verify-freedom-days-animation, /api/verify-freedom-days-disambiguation, /api/verify-freedom-days-monthly-trend, /api/verify-freedom-milestones, /api/verify-freedom-subtitles, /api/verify-freedom-time-label-component, /api/verify-freedom-time-label-edge-cases, /api/verify-freedom-time-labels, /api/verify-goal-progress-bar, /api/verify-goal-timeline, /api/verify-holding-cascade-delete, /api/verify-holding-defaults, /api/verify-holding-double-click, /api/verify-holding-edit-preservation, /api/verify-holding-rapid-delete, /api/verify-holding-submit-btn, /api/verify-holding-tx-log, /api/verify-holdings-crud-mgmt, /api/verify-holdings-list, /api/verify-holdings-list-detail, /api/verify-holdings-sync, /api/verify-horizon-hero, /api/verify-household-db, /api/verify-household-fire, /api/verify-household-invite, /api/verify-household-schema, /api/verify-jouw-pad, /api/verify-kern-hero, /api/verify-kern-unique-kpis, /api/verify-kpi-deduplication, /api/verify-locked-footer, /api/verify-malformed-holding-id, /api/verify-milestone-markers, /api/verify-multi-tab, /api/verify-net-worth-milestones, /api/verify-network-error-import, /api/verify-new-user-empty-state, /api/verify-news-error-handling, /api/verify-next-step-completion-tracking, /api/verify-next-step-engine, /api/verify-next-step-prioritization, /api/verify-no-ai-fallback, /api/verify-nw-projection, /api/verify-onboarding, /api/verify-onboarding-double-submit, /api/verify-onboarding-redirect, /api/verify-onboarding-reset, /api/verify-philosophical-labels, /api/verify-portfolio-allocation-viz, /api/verify-portfolio-donut, /api/verify-portfolio-projection, /api/verify-price-feed, /api/verify-privacy-default, /api/verify-privacy-levels, /api/verify-resilience-history, /api/verify-resilience-score, /api/verify-schema, /api/verify-section-ordering, /api/verify-session-expiry, /api/verify-share-targets, /api/verify-shared-data, /api/verify-smart-next-step, /api/verify-snapshot-comparison, /api/verify-sold-out-holding, /api/verify-sparkline, /api/verify-special-chars-url, /api/verify-spending-patterns, /api/verify-spending-variance-confidence, /api/verify-transaction-filters, /api/verify-trend-chart, /api/verify-unauthenticated-redirect, /api/verify-user-reset-isolation, /api/verify-wil-unique-lens

## 2026-07-04

- Geen wijzigingen.

## 2026-07-05

- **Schermen** toegevoegd: /beheer/uat
- **API-routes** toegevoegd: /api/admin/uat/compare, /api/admin/uat/results, /api/admin/uat/rounds, /api/admin/uat/rounds/[id]
- **Tabellen** toegevoegd: uat_results, uat_rounds
- **Componenten (aantal)** toegevoegd: +7

## 2026-07-06

- **API-routes** toegevoegd: /api/admin/uat/latest
- **Componenten (aantal)** toegevoegd: +2

## 2026-07-07

- **Integraties** verwijderd: OpenRouter
- **Componenten (aantal)** toegevoegd: +3

## 2026-07-10

- **API-routes** toegevoegd: /api/toekomst-scenario
- **Integraties** toegevoegd: OpenRouter
- **Componenten (aantal)** toegevoegd: +8

## 2026-07-11

- **Componenten (aantal)** toegevoegd: +8

## 2026-07-11

- **API-routes** toegevoegd: /api/toekomst-doel
- **Componenten (aantal)** toegevoegd: +7

## 2026-07-11

- Geen wijzigingen.

## 2026-07-12

- **Componenten (aantal)** toegevoegd: +6

## 2026-07-13

- **Schermen** toegevoegd: /overzicht/belasting/optimizer
- **Tabellen** toegevoegd: feedback
- **Componenten (aantal)** toegevoegd: +13

## 2026-07-13

- **Schermen** toegevoegd: /rapportages/totaalplan
- **API-routes** toegevoegd: /api/briefing/email/cron, /api/briefing/email/pref, /api/briefing/email/unsubscribe, /api/report/totaalplan
- **Componenten (aantal)** toegevoegd: +4

## 2026-07-16

- **API-routes** toegevoegd: /api/sync/daily-open
- **Tabellen** toegevoegd: net_worth_history
- **Integraties** verwijderd: OpenRouter
- **Componenten (aantal)** toegevoegd: +6

## 2026-07-16

- **API-routes** toegevoegd: /api/privacy-mode
- **Componenten (aantal)** toegevoegd: +3

## 2026-07-17

- **Tabellen** toegevoegd: _legacy_holding_prices, _legacy_holding_transactions, _legacy_holdings, actions, admin_actions_log, ai_usage, bank_connection_accounts, bank_connections, bank_sync_log, budget_amounts, budget_rollovers, error_logs, goal_contributions, if, in, mail_log, news_editions, nibud_reference_data, recommendation_feedback, recommendations, report_configs, settlement_entries, tier_assignments_log, transaction_splits, user_own_ibans
- **Integraties** toegevoegd: OpenRouter
- **Componenten (aantal)** toegevoegd: +4

## 2026-07-17

- **Tabellen** verwijderd: if, in

## 2026-07-17

- Geen wijzigingen.

## 2026-07-17

- **API-routes** toegevoegd: /api/snapshots/entity-backfill, /api/snapshots/group-history
- **Componenten (aantal)** toegevoegd: +5

## 2026-07-17

- **Schermen** toegevoegd: /beheer/allowlist
- **API-routes** toegevoegd: /api/admin/signup-allowlist
- **Tabellen** toegevoegd: signup_email_allowlist
- **Componenten (aantal)** toegevoegd: +1

## 2026-07-17

- **Componenten (aantal)** toegevoegd: +9

## 2026-07-19

- **Integraties** verwijderd: OpenRouter

## 2026-07-19

- Geen wijzigingen.

## 2026-07-19

- **Schermen** toegevoegd: /beheer/kennisbank, /mijn/lokale-chat
- **API-routes** toegevoegd: /api/admin/local-knowledge, /api/local-knowledge
- **Componenten (aantal)** toegevoegd: +2

## 2026-07-19

- **Componenten (aantal)** toegevoegd: +3
