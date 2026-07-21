# Audit: Variabelen, Datamodel & Berekeningen — TriFinity

> **Datum:** 2 maart 2026
> **Doel:** Volledig overzicht van het datamodel, alle berekeningen, en geïdentificeerde inconsistenties.
> **Scope:** Supabase-tabellen, TypeScript berekeningsbestanden in `lib/`, en variabelgebruik in de app.

---

## Inhoudsopgave

1. [Datamodel](#1-datamodel)
2. [Berekeningenoverzicht](#2-berekeningenoverzicht)
3. [Geïdentificeerde Inconsistenties](#3-geïdentificeerde-inconsistenties)

---

## 1. Datamodel

### Overzicht

De app gebruikt **33+ Supabase-tabellen** verdeeld over 8 domeinen. Oorspronkelijke tabellen zijn aangemaakt via de Supabase UI; uitbreidingen staan in twee migraties:
- `20260215000001_create_new_tables.sql` — gamificatie, holdings, snapshots
- `20260218000001_add_household_support.sql` — huishouden, ownership-kolommen

---

### 1.1 Kern Financieel

#### `profiles`
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | `auth.users(id)` | |
| `full_name` | TEXT | | |
| `date_of_birth` | DATE | | Gebruikt voor leeftijdsberekening |
| `last_known_phase` | TEXT | | `'onboarding' \| 'active' \| 'inactive'` |
| `widget_prefs` | JSONB | | Widget-configuratie |
| `retirement_expense_method` | TEXT | | `'essential_budgets' \| 'custom_amount' \| 'current_income'` |
| `retirement_expense_custom_amount` | NUMERIC | | Alleen bij methode `custom_amount` |
| `fire_end_strategy` | TEXT | | `'deplete' \| 'perpetual' \| 'legacy'` |
| `fire_end_age` | NUMERIC | | Standaard 90 |
| `fire_legacy_amount` | NUMERIC | | Alleen bij strategie `legacy` |
| `expected_return` | NUMERIC | | Jaarlijks rendement (standaard 0.07) |
| `inflation_rate` | NUMERIC | | Inflatiepercentage (standaard 0.02) |
| `household_id` | UUID | `households(id)` | Toegevoegd migratie 20260218 |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

#### `assets`
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | | |
| `user_id` | UUID NOT NULL | `auth.users(id)` | |
| `name` | TEXT NOT NULL | | |
| `asset_type` | TEXT NOT NULL | | `'savings' \| 'investment' \| 'retirement' \| 'eigen_huis' \| 'real_estate' \| 'crypto' \| 'vehicle' \| 'physical' \| 'other'` |
| `current_value` | NUMERIC NOT NULL | | Peildatumwaarde |
| `purchase_value` | NUMERIC | | Aankoopwaarde |
| `purchase_date` | DATE | | |
| `expected_return` | NUMERIC | | Jaarlijks rendement per asset |
| `monthly_contribution` | NUMERIC | | Maandelijkse inleg |
| `institution` | TEXT | | Bank/broker |
| `account_number` | TEXT | | |
| `notes` | TEXT | | |
| `is_active` | BOOLEAN | | Standaard `true` |
| `sort_order` | INT | | |
| `subtype` | TEXT | | Type-specifieke subtype |
| `risk_profile` | TEXT | | `'laag' \| 'middel' \| 'hoog'` |
| `tax_benefit` | BOOLEAN | | Fiscaal voordeel (pensioen) |
| `is_liquid` | BOOLEAN | | Direct opneembaar |
| `lock_end_date` | DATE | | Einddatum vastgezet |
| `ticker_symbol` | TEXT | | Beurs-ticker |
| `rental_income` | NUMERIC | | Huurinkomsten |
| `woz_value` | NUMERIC | | WOZ-waarde eigen woning |
| `retirement_provider_type` | TEXT | | `'bedrijfspensioenfonds' \| 'verzekeraar' \| 'ppi'` |
| `depreciation_rate` | NUMERIC | | Afschrijvingspercentage |
| `address_postcode` | TEXT | | |
| `address_house_number` | TEXT | | |
| `net_worth_inclusion_pct` | NUMERIC | | 0–100, standaard 100 |
| `ownership` | TEXT | | `'personal' \| 'shared'` (migratie 20260218) |
| `household_id` | UUID | `households(id)` | (migratie 20260218) |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

#### `debts`
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | | |
| `user_id` | UUID NOT NULL | `auth.users(id)` | |
| `name` | TEXT NOT NULL | | |
| `debt_type` | TEXT NOT NULL | | `'mortgage' \| 'personal_loan' \| 'student_loan' \| 'car_loan' \| 'credit_card' \| 'revolving_credit' \| 'payment_plan' \| 'other'` |
| `original_amount` | NUMERIC | | Oorspronkelijk bedrag |
| `current_balance` | NUMERIC | | Huidig openstaand saldo |
| `interest_rate` | NUMERIC | | Jaarlijkse rente (%) |
| `minimum_payment` | NUMERIC | | Minimale maandbetaling |
| `monthly_payment` | NUMERIC | | Werkelijke maandbetaling |
| `start_date` | DATE | | |
| `end_date` | DATE | | |
| `creditor` | TEXT | | Naam schuldeiser |
| `notes` | TEXT | | |
| `is_active` | BOOLEAN | | |
| `sort_order` | INT | | |
| `subtype` | TEXT | | Type-specifiek |
| `is_tax_deductible` | BOOLEAN | | Fiscaal aftrekbaar |
| `fixed_rate_end_date` | DATE | | Einde rentevast periode |
| `nhg` | BOOLEAN | | Nationale Hypotheek Garantie |
| `linked_asset_id` | UUID | `assets(id)` | Gekoppeld aan asset (hypotheek → huis) |
| `credit_limit` | NUMERIC | | Kredietlimiet |
| `repayment_type` | TEXT | | `'aflossingsvrij' \| 'annuiteit' \| 'lineair'` |
| `draagkrachtmeting_date` | DATE | | Studielening specifiek |
| `net_worth_inclusion_pct` | NUMERIC | | 0–100, standaard 100 |
| `ownership` | TEXT | | `'personal' \| 'shared'` (migratie 20260218) |
| `household_id` | UUID | `households(id)` | (migratie 20260218) |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

#### `bank_accounts`
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | | |
| `user_id` | UUID NOT NULL | `auth.users(id)` | |
| `name` | TEXT NOT NULL | | |
| `bank_name` | TEXT | | |
| `account_type` | TEXT | | `'checking' \| 'savings'` |
| `iban` | TEXT | | |
| `current_balance` | NUMERIC | | |
| `is_active` | BOOLEAN | | |
| `sort_order` | INT | | |
| `gocardless_id` | TEXT | | Open Banking koppeling |
| `last_synced_at` | TIMESTAMPTZ | | |
| `ownership` | TEXT | | (migratie 20260218) |
| `household_id` | UUID | `households(id)` | (migratie 20260218) |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

#### `transactions`
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | | |
| `user_id` | UUID NOT NULL | `auth.users(id)` | |
| `account_id` | UUID NOT NULL | `bank_accounts(id)` | |
| `date` | DATE NOT NULL | | |
| `amount` | NUMERIC NOT NULL | | Positief = inkomst, negatief = uitgave |
| `description` | TEXT | | |
| `counterparty_name` | TEXT | | |
| `counterparty_iban` | TEXT | | |
| `budget_id` | UUID | `budgets(id)` | Categorie-koppeling |
| `notes` | TEXT | | |
| `import_source` | TEXT | | `'mt940' \| 'csv' \| 'manual'` |
| `gocardless_transaction_id` | TEXT | | |
| `is_hidden` | BOOLEAN | | |
| `sort_order` | INT | | |
| `ownership` | TEXT | | (migratie 20260218) |
| `household_id` | UUID | `households(id)` | (migratie 20260218) |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

#### `budgets`
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | | |
| `user_id` | UUID NOT NULL | `auth.users(id)` | |
| `parent_id` | UUID | `budgets(id)` | Hiërarchie (parent/child) |
| `name` | TEXT NOT NULL | | |
| `slug` | TEXT UNIQUE | | |
| `icon` | TEXT | | Lucide icon naam |
| `description` | TEXT | | |
| `default_limit` | NUMERIC | | Standaard maandlimiet |
| `budget_type` | TEXT | | `'income' \| 'expense' \| 'savings' \| 'debt' \| 'archive'` |
| `interval` | TEXT | | `'monthly' \| 'quarterly' \| 'yearly'` |
| `rollover_type` | TEXT | | `'reset' \| 'carry-over' \| 'invest-sweep'` |
| `limit_type` | TEXT | | `'soft' \| 'hard'` |
| `alert_threshold` | NUMERIC | | Waarschuwingsdrempel (%) |
| `max_single_transaction_amount` | NUMERIC | | |
| `is_essential` | BOOLEAN | | **Cruciaal voor FIRE-berekening** |
| `priority_score` | NUMERIC | | |
| `is_inflation_indexed` | BOOLEAN | | |
| `sort_order` | INT | | |
| `goal_type` | TEXT | | |
| `goal_amount` | NUMERIC | | |
| `goal_date` | DATE | | |
| `goal_frequency` | TEXT | | |
| `ownership` | TEXT | | (migratie 20260218) |
| `household_id` | UUID | `households(id)` | (migratie 20260218) |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

#### `budget_amounts`
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | | |
| `budget_id` | UUID NOT NULL | `budgets(id)` | |
| `effective_from` | DATE NOT NULL | | Ingangsdatum |
| `amount` | NUMERIC NOT NULL | | Limietbedrag |
| `created_at` | TIMESTAMPTZ | | |

#### `net_worth_snapshots`
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | | |
| `user_id` | UUID NOT NULL | `auth.users(id)` | |
| `snapshot_date` | DATE NOT NULL | | |
| `total_assets` | NUMERIC | | |
| `total_debts` | NUMERIC | | |
| `net_worth` | NUMERIC | | |
| `freedom_percentage` | NUMERIC | | (migratie 20260215) |
| `fire_age` | NUMERIC | | (migratie 20260215) |
| `sovereignty_level` | INT | | (migratie 20260215) |
| `savings_rate` | NUMERIC | | (migratie 20260215) |
| `resilience_score` | INT | | (migratie 20260215) |
| `ownership` | TEXT | | (migratie 20260218) |
| `household_id` | UUID | `households(id)` | (migratie 20260218) |
| `created_at` | TIMESTAMPTZ | | |

#### `valuations`
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | | |
| `user_id` | UUID NOT NULL | `auth.users(id)` | |
| `asset_id` | UUID NOT NULL | `assets(id)` | |
| `valuation_date` | DATE | | |
| `value` | NUMERIC | | |
| `notes` | TEXT | | |
| `ownership` | TEXT | | (migratie 20260218) |
| `household_id` | UUID | `households(id)` | (migratie 20260218) |
| `created_at` | TIMESTAMPTZ | | |

---

### 1.2 Terugkerend & Levenscyclus

#### `recurring_transactions`
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | | |
| `user_id` | UUID NOT NULL | `auth.users(id)` | |
| `account_id` | UUID NOT NULL | `bank_accounts(id)` | |
| `budget_id` | UUID | `budgets(id)` | |
| `name` | TEXT NOT NULL | | |
| `amount` | NUMERIC | | |
| `description` | TEXT | | |
| `counterparty_name` | TEXT | | |
| `frequency` | TEXT | | `'weekly' \| 'monthly' \| 'quarterly' \| 'yearly'` |
| `day_of_month` | INT | | |
| `day_of_week` | INT | | |
| `start_date` | DATE | | |
| `end_date` | DATE | | |
| `is_active` | BOOLEAN | | |
| `last_generated` | TIMESTAMPTZ | | |
| `sort_order` | INT | | |
| `ownership` | TEXT | | (migratie 20260218) |
| `household_id` | UUID | `households(id)` | (migratie 20260218) |
| `created_at` | TIMESTAMPTZ | | |

#### `life_events`
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | | |
| `user_id` | UUID NOT NULL | `auth.users(id)` | |
| `name` | TEXT NOT NULL | | |
| `event_type` | TEXT | | `'sabbatical' \| 'children' \| 'aow' \| 'pension'` etc. |
| `target_age` | INT | | Leeftijd waarop event plaatsvindt |
| `target_date` | DATE | | Alternatief voor target_age |
| `one_time_cost` | NUMERIC | | Eenmalige kosten |
| `monthly_cost_change` | NUMERIC | | Maandelijkse kostenwijziging |
| `monthly_income_change` | NUMERIC | | Maandelijkse inkomenswijziging |
| `duration_months` | INT | | Duur in maanden |
| `icon` | TEXT | | Lucide icon naam |
| `is_active` | BOOLEAN | | Meegenomen in simulatie? |
| `is_indexed` | BOOLEAN | | Inflatiegecorrigeerd |
| `sort_order` | INT | | |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

---

### 1.3 Doelen & Acties

#### `goals`
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | | |
| `user_id` | UUID NOT NULL | `auth.users(id)` | |
| `name` | TEXT NOT NULL | | |
| `description` | TEXT | | |
| `goal_type` | TEXT | | `'savings' \| 'debt_payoff' \| 'net_worth' \| 'freedom_days'` |
| `target_value` | NUMERIC | | |
| `current_value` | NUMERIC | | |
| `target_date` | DATE | | |
| `linked_asset_id` | UUID | `assets(id)` | |
| `linked_debt_id` | UUID | `debts(id)` | |
| `budget_id` | UUID | `budgets(id)` | |
| `icon` | TEXT | | |
| `color` | TEXT | | |
| `is_completed` | BOOLEAN | | |
| `completed_at` | TIMESTAMPTZ | | |
| `sort_order` | INT | | |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

#### `goal_contributions`
| Kolom | Type | Relatie |
|-------|------|---------|
| `id` | UUID PK | |
| `goal_id` | UUID NOT NULL | `goals(id)` |
| `user_id` | UUID NOT NULL | `auth.users(id)` |
| `contribution_amount` | NUMERIC | |
| `contribution_date` | DATE | |
| `notes` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

#### `recommendations`
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | | |
| `user_id` | UUID NOT NULL | `auth.users(id)` | |
| `title` | TEXT NOT NULL | | |
| `description` | TEXT | | |
| `recommendation_type` | TEXT | | `'budget_optimization' \| 'asset_reallocation' \| 'debt_acceleration' \| 'income_increase' \| 'savings_boost'` |
| `euro_impact_monthly` | NUMERIC | | |
| `euro_impact_yearly` | NUMERIC | | |
| `freedom_days_per_year` | NUMERIC | | |
| `related_budget_slug` | TEXT | | |
| `related_asset_id` | UUID | `assets(id)` | |
| `related_debt_id` | UUID | `debts(id)` | |
| `current_value` | NUMERIC | | |
| `proposed_value` | NUMERIC | | |
| `status` | TEXT | | `'pending' \| 'accepted' \| 'rejected' \| 'postponed' \| 'expired'` |
| `rejection_reason` | TEXT | | |
| `postponed_until` | DATE | | |
| `postpone_feedback` | TEXT | | |
| `ai_generation_id` | TEXT | | |
| `priority_score` | NUMERIC | | |
| `suggested_actions` | JSONB | | Array van actie-objecten |
| `decided_at` | TIMESTAMPTZ | | |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

#### `actions`
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | | |
| `user_id` | UUID NOT NULL | `auth.users(id)` | |
| `recommendation_id` | UUID | `recommendations(id)` | |
| `source` | TEXT | | `'ai' \| 'manual' \| 'chat'` |
| `title` | TEXT NOT NULL | | |
| `description` | TEXT | | |
| `freedom_days_impact` | NUMERIC | | Vrijheidsdagen-impact |
| `euro_impact_monthly` | NUMERIC | | |
| `status` | TEXT | | `'open' \| 'postponed' \| 'completed' \| 'rejected'` |
| `scheduled_week` | TEXT | | |
| `due_date` | DATE | | |
| `postpone_weeks` | INT | | |
| `postponed_until` | DATE | | |
| `rejection_reason` | TEXT | | |
| `sort_order` | INT | | |
| `priority_score` | NUMERIC | | |
| `completed_at` | TIMESTAMPTZ | | |
| `status_changed_at` | TIMESTAMPTZ | | |
| `metadata` | JSONB | | |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

#### `recommendation_feedback`
| Kolom | Type | Relatie |
|-------|------|---------|
| `id` | UUID PK | |
| `user_id` | UUID NOT NULL | `auth.users(id)` |
| `recommendation_id` | UUID NOT NULL | `recommendations(id)` |
| `feedback_type` | TEXT | `'accepted' \| 'rejected' \| 'postponed' \| 'action_completed' \| 'action_rejected'` |
| `reason` | TEXT | |
| `recommendation_type` | TEXT | |
| `related_budget_slug` | TEXT | |
| `freedom_days_impact` | NUMERIC | |
| `created_at` | TIMESTAMPTZ | |

---

### 1.4 Gamificatie

#### `badges` (migratie 20260215)
| Kolom | Type | Opmerking |
|-------|------|-----------|
| `id` | UUID PK | |
| `slug` | TEXT UNIQUE NOT NULL | |
| `name` | TEXT NOT NULL | |
| `description` | TEXT NOT NULL | |
| `icon` | TEXT | Standaard `'trophy'` |
| `color` | TEXT | Standaard `'amber'` |
| `category` | TEXT NOT NULL | `'onboarding' \| 'consistency' \| 'financial_health' \| 'fire_milestones' \| 'actions' \| 'budget' \| 'exploration' \| 'sovereignty'` |
| `criteria_type` | TEXT NOT NULL | `'threshold' \| 'count' \| 'streak' \| 'milestone' \| 'manual'` |
| `criteria_value` | JSONB | |
| `sort_order` | INT | |
| `created_at` | TIMESTAMPTZ | |

#### `user_badges` (migratie 20260215)
| Kolom | Type | Relatie |
|-------|------|---------|
| `id` | UUID PK | |
| `user_id` | UUID NOT NULL | `auth.users(id)` |
| `badge_id` | UUID NOT NULL | `badges(id)` |
| `earned_at` | TIMESTAMPTZ | |
| `notified` | BOOLEAN | Standaard `false` |
| UNIQUE | `(user_id, badge_id)` | |

#### `user_streaks` (migratie 20260215)
| Kolom | Type | Relatie |
|-------|------|---------|
| `id` | UUID PK | |
| `user_id` | UUID NOT NULL | `auth.users(id)` |
| `streak_type` | TEXT NOT NULL | `'login' \| 'budget_compliance' \| 'action_completion'` |
| `current_count` | INT | |
| `longest_count` | INT | |
| `last_activity_date` | DATE | |
| `started_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

#### `user_feature_visits` (migratie 20260215)
| Kolom | Type | Relatie |
|-------|------|---------|
| `id` | UUID PK | |
| `user_id` | UUID NOT NULL | `auth.users(id)` |
| `feature_slug` | TEXT NOT NULL | |
| `first_visited_at` | TIMESTAMPTZ | |
| `visit_count` | INT | Standaard 1 |
| UNIQUE | `(user_id, feature_slug)` | |

---

### 1.5 Portfolio & Holdings

#### `holdings` (migratie 20260215)
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | | |
| `user_id` | UUID NOT NULL | `auth.users(id)` | |
| `asset_id` | UUID NOT NULL | `assets(id)` | CASCADE DELETE |
| `ticker` | TEXT | | Beurs-ticker |
| `isin` | TEXT | | ISIN code |
| `name` | TEXT NOT NULL | | |
| `units` | NUMERIC | | Aantal eenheden |
| `avg_purchase_price` | NUMERIC | | Gemiddelde aankoopprijs |
| `current_price` | NUMERIC | | Huidige koers |
| `last_price_update` | TIMESTAMPTZ | | |
| `purchase_date` | DATE | | |
| `notes` | TEXT | | |
| `is_active` | BOOLEAN | | |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

#### `holding_transactions` (migratie 20260215)
| Kolom | Type | Relatie |
|-------|------|---------|
| `id` | UUID PK | |
| `holding_id` | UUID NOT NULL | `holdings(id)` CASCADE DELETE |
| `user_id` | UUID NOT NULL | `auth.users(id)` |
| `type` | TEXT NOT NULL | `'buy' \| 'sell' \| 'dividend'` |
| `units` | NUMERIC NOT NULL | |
| `price_per_unit` | NUMERIC NOT NULL | |
| `total_amount` | NUMERIC NOT NULL | |
| `date` | DATE NOT NULL | |
| `notes` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

#### `target_allocations`
| Kolom | Type | Relatie |
|-------|------|---------|
| `id` | UUID PK | |
| `user_id` | UUID NOT NULL | `auth.users(id)` |
| `asset_class` | TEXT | `'stocks' \| 'bonds' \| 'cash'` etc. |
| `target_percentage` | NUMERIC | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

### 1.6 Huishouden (migratie 20260218)

#### `households`
| Kolom | Type | Relatie | Opmerking |
|-------|------|---------|-----------|
| `id` | UUID PK | | |
| `name` | TEXT NOT NULL | | |
| `split_mode` | TEXT | | `'equal' \| 'income_ratio' \| 'custom' \| 'one_carries_all'` |
| `custom_split_pct` | NUMERIC | | 0–100 |
| `primary_payer_id` | UUID | `auth.users(id)` | |
| `created_by` | UUID NOT NULL | `auth.users(id)` | |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

#### `household_members`
| Kolom | Type | Relatie |
|-------|------|---------|
| `id` | UUID PK | |
| `household_id` | UUID NOT NULL | `households(id)` CASCADE |
| `user_id` | UUID NOT NULL | `auth.users(id)` CASCADE |
| `role` | TEXT | `'owner' \| 'member'` |
| `sort_order` | INT | |
| `joined_at` | TIMESTAMPTZ | |
| UNIQUE | `(household_id, user_id)` | |

#### `household_invitations`
| Kolom | Type | Relatie |
|-------|------|---------|
| `id` | UUID PK | |
| `household_id` | UUID NOT NULL | `households(id)` CASCADE |
| `invited_by` | UUID NOT NULL | `auth.users(id)` |
| `invited_email` | TEXT NOT NULL | |
| `token` | UUID | Uitnodigingstoken |
| `status` | TEXT | `'pending' \| 'accepted' \| 'declined' \| 'expired'` |
| `expires_at` | TIMESTAMPTZ | Standaard +7 dagen |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

#### `settlement_entries`
| Kolom | Type | Relatie |
|-------|------|---------|
| `id` | UUID PK | |
| `household_id` | UUID NOT NULL | `households(id)` |
| `from_user_id` | UUID NOT NULL | `auth.users(id)` |
| `to_user_id` | UUID NOT NULL | `auth.users(id)` |
| `amount` | NUMERIC NOT NULL | |
| `description` | TEXT | |
| `related_transaction_id` | UUID | `transactions(id)` |
| `status` | TEXT | `'open' \| 'settled'` |
| `settled_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

---

### 1.7 Admin & Config

#### `app_settings`
| Kolom | Type | Opmerking |
|-------|------|-----------|
| `key` | TEXT PK | Configuratiesleutel |
| `value` | TEXT/JSONB | Waarde |
| `updated_at` | TIMESTAMPTZ | |

#### `next_step_completions` (migratie 20260215)
| Kolom | Type | Relatie |
|-------|------|---------|
| `id` | UUID PK | |
| `user_id` | UUID NOT NULL | `auth.users(id)` |
| `step_key` | TEXT NOT NULL | |
| `completed_at` | TIMESTAMPTZ | |
| `dismissed` | BOOLEAN | |
| UNIQUE | `(user_id, step_key)` | |

#### `report_configs`
| Kolom | Type | Relatie |
|-------|------|---------|
| `id` | UUID PK | |
| `user_id` | UUID NOT NULL | `auth.users(id)` |
| `name` | TEXT NOT NULL | |
| `period_type` | TEXT | `'month' \| 'quarter' \| 'year' \| 'custom'` |
| `date_from` | DATE | |
| `date_to` | DATE | |
| `is_scheduled` | BOOLEAN | |
| `schedule_frequency` | TEXT | |
| `last_generated_at` | TIMESTAMPTZ | |
| `use_ai` | BOOLEAN | |
| `cached_data` | JSONB | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

#### `nibud_reference_data`
| Kolom | Type | Opmerking |
|-------|------|-----------|
| `id` | UUID PK | |
| `category` | TEXT | Budget categorie slug |
| `household_type` | TEXT | `'single' \| 'couple' \| 'family'` |
| `income_bracket` | TEXT | |
| `median_amount` | NUMERIC | |
| `percentile_25` | NUMERIC | |
| `percentile_75` | NUMERIC | |
| `data_year` | INT | |
| `created_at` | TIMESTAMPTZ | |

#### `category_corrections`
| Kolom | Type | Relatie |
|-------|------|---------|
| `id` | UUID PK | |
| `user_id` | UUID NOT NULL | `auth.users(id)` |
| `transaction_id` | UUID | `transactions(id)` |
| `counterparty_name` | TEXT | |
| `assigned_budget_id` | UUID | `budgets(id)` |
| `created_at` | TIMESTAMPTZ | |

#### `transaction_splits`
| Kolom | Type | Relatie |
|-------|------|---------|
| `id` | UUID PK | |
| `transaction_id` | UUID NOT NULL | `transactions(id)` |
| `budget_id` | UUID NOT NULL | `budgets(id)` |
| `amount` | NUMERIC NOT NULL | |
| `created_at` | TIMESTAMPTZ | |

---

### 1.8 Overige tabellen (gevonden via Supabase queries)

| Tabel | Gebruik |
|-------|---------|
| `budget_rollovers` | Rollover-administratie per budget per periode |
| `goal_value_history` | Historische waarden van doelen |
| `share_events` | Gedeelde gebeurtenissen |
| `tier_assignments_log` | Sovereignty level toewijzingen |
| `user_own_ibans` | Eigen IBAN-nummers van gebruiker |
| `gocardless_accounts` | GoCardless bankrekening-koppelingen |
| `gocardless_requisitions` | GoCardless aanvragen |
| `gocardless_sync_log` | GoCardless synchronisatielog |

---

### 1.9 Database-functies

| Functie | Beschrijving | Bron |
|---------|-------------|------|
| `user_household_id()` | Retourneert household_id van huidige gebruiker | migratie 20260218 |
| `household_partner_totals()` | Privacy-veilige partner-totalen (assets, debts, net worth) | migratie 20260218 |

---

## 2. Berekeningenoverzicht

### 2.1 FIRE & Pensioen

#### `runSimulation()` — `lib/fire-simulation.ts:64`
**Doel:** Volledige FIRE-simulatie met opbouw- en afbouwfase.
**Inputs:** `currentAge`, `endAge`, `currentPortfolio`, `yearlyExpenses`, `annualSavings`, `grossReturn`, `returnModel`, `inflation`, `cashflows[]`, `strategyConfig`
**Output:** `SimResult` (rows[], fireAge, fireAgeFractional, requiredFirePortfolio, implicitWithdrawalRate)
**Formule:**
- Opbouwfase: `endPortfolio = portfolio + (portfolio × portReturn) + effectiveSavings`
- FIRE-detectie: binary search naar minimum portfolio bij elke leeftijd
- Afbouwfase: `withdrawal = max(0, expensesThisYear - recurringCashflows)`
- `portReturn = grossReturn - BOX3_DRAG` (voor nl_box3 model)
- Strategieën: `deplete` (portfolio=0 bij endAge), `legacy` (doelbedrag), `perpetual` (100 jaar)

#### `lifeEventsToCashflows()` — `lib/fire-simulation.ts:332`
**Doel:** Converteert levensgebeurtenissen naar simulatie-cashflows.
**Inputs:** `events: LifeEvent[]`
**Output:** `SimCashflow[]`
**Logica:** Per event 3 mogelijke cashflows: eenmalig (`one_time_cost`), maandelijkse kosten (`monthly_cost_change`), maandelijks inkomen (`monthly_income_change`)

#### `computeFireProjection()` — `lib/horizon-data.ts:469`
**Doel:** Snelle FIRE-projectie (zonder volledige simulatie).
**Inputs:** `HorizonInput`, `annualReturn`, `swrOverride`, `inflationOverride`
**Output:** `FireProjection` (fireTarget, freedomPercentage, fireAge, fireDate, countdown, monthlySavings, savingsRate)
**Formule:**
- `fireTarget = effectiveYearlyExpenses / swr`
- `freedomPercentage = min((netWorth / fireTarget) × 100, 100)`
- `realReturn = (1 + annualReturn) / (1 + inflation) - 1`
- Maandelijkse iteratie: `projected = projected × (1 + monthlyReturn) + monthlySavings`

#### `computeFireRange()` — `lib/horizon-data.ts:584`
**Doel:** Optimistisch/verwacht/pessimistisch FIRE-projecties.
**Formule:** Verwacht ±2-3% rendement variatie.

#### `computeScenarios()` — `lib/horizon-data.ts:666`
**Doel:** Drie divergerende scenario-paden (Drifter, Huidige Koers, Optimizer).
**Logica:** Varieert uitgavengroei, spaargroei, en initiële multipliers.

#### `runMonteCarlo()` — `lib/horizon/fire-sim-legacy.ts`
**Doel:** 1000 stochastische paden over N jaar.
**Formule:** `annualReturn = rng.normal(DEFAULT_RETURN, volatility)` met een deterministische, geseede PRNG (`rng = new SeededRandom(s * 7919 + 42)`) — reproduceerbaar, geen `Math.random`.
**Output:** Percentielband (p10/p25/p50/p75/p90), FIRE-kansen.

#### `computeWithdrawal()` — `lib/horizon-data.ts:841`
**Doel:** Simulatie van 4 onttrekkingsstrategieën.
**Strategieën:** Classic (vast %), Variable (% van portfolio), Guardrails (Guyton-Klinger), Bucket (cash/bonds/stocks).

#### `runBacktest()` — `lib/horizon-data.ts:1097`
**Doel:** Historische test tegen MSCI World real returns (1970–2024).
**Output:** Succespercentage, band (min/max/p25/p75).

#### `resolveFireParams()` — `lib/fire-params.ts:9`
**Doel:** Resolutie van FIRE-parameters uit gebruikersprofiel.
**Formule:** `effectiveSwr = max(0.001, grossReturn - BOX3_DRAG - inflationRate)`

#### `deriveCountdown()` — `lib/horizon-data.ts:561`
**Doel:** Afleiden van countdown uit simulatie-resultaat.
**Formule:** `yearsToFire = fireAgeFractional - currentAge`

---

### 2.2 Kerngetallen

#### `computeCoreData()` — `lib/core-metrics.ts`
**Doel:** Centrale dashboard-berekening: vrijheidstijd, FIRE-target, spaarquote, KPI's.
**Inputs:** `FinancialInput` (unified interface), `swrOverride?`
**Output:** `FinancialMetrics` (15 velden — input-velden niet meer in output)
**Formules:**
- `netWorth = totalAssets - totalDebts`
- `fireTarget = effectiveYearlyExpenses / swr` (swr = 0.04)
- `freedomPercentage = max(min((netWorth / fireTarget) × 100, 100), 0)`
- `freedomMonthsTotal = (netWorth / effectiveYearlyExpenses) × 12`
- `savingsRate = (monthlySavings / monthlyIncome) × 100`
- `dailyExpense = yearlyExpenses / 365`
- `daysWonPerMonth = monthlySavings / dailyExpense`
- `passiveIncome = netWorth × swr`
- `freeDaysPerYear = passiveIncome / dailyMustExpense`
- Autonomiescore: A+ (≥100%), A (≥75%), B (≥50%), C (≥25%), D (≥10%), E (<10%)
- FIRE-datum: maandelijkse iteratie met 7% rendement

---

### 2.3 Budget & Uitgaven

#### `computeYearlyMustExpenses()` — `lib/budget-utils.ts:44`
**Doel:** Jaarlijkse essentiële uitgaven uit budgetten.
**Logica:**
- A) Essential parents: gebruik essential children (indien aanwezig), anders alle children
- B) Orphan essential children: individual meegeteld
- `annualAmount()`: monthly ×12, quarterly ×4, yearly ×1

#### `computeRetirementExpenses()` — `lib/budget-utils.ts:110`
**Doel:** Pensioenuitgaven per methode.
**Methoden:** `essential_budgets` → mustExpenses, `custom_amount` → user input, `current_income` → jaarinkomen

#### `computeBudgetForecast()` — `lib/budget-forecast.ts:46`
**Doel:** Voorspelling volgende maand per budgetcategorie.
**Formule:** Gewogen voortschrijdend gemiddelde (6 maanden, recent = zwaarder)
**Betrouwbaarheid:** CV < 0.15 = hoog, < 0.35 = medium, anders laag

#### `shouldAlert()` — `lib/budget-alerts.ts:14`
**Doel:** Budget-waarschuwing.
**Logica:** Expense: alert als `spent/limit × 100 ≥ threshold`. Savings/debt: alert als `< threshold`.

#### `computeRollover()` — `lib/budget-rollover.ts:26`
**Doel:** Rollover-berekening.
**Formule:** `effectiveLimit = limit + previousCarry`, `remaining = max(0, effectiveLimit - spent)`

---

### 2.4 Belasting (Box 3)

#### `calculateBox3()` — `lib/box3-data.ts:182`
**Doel:** Volledige Box 3 vermogensrendementsheffing.
**15-staps berekening:**
1. Classificeer assets (spaargeld / beleggingen / uitgesloten)
2. Classificeer schulden (Box 3 / uitgesloten)
3. Tel totalen per categorie
4. `schuldendrempel` = €3.800 (single) / €7.600 (partner)
5. `aftrekbareSchulden = max(0, totaal - drempel)`
6. `forfaitairSpaargeld = spaargeld × 1.37%` (2025)
7. `forfaitairBeleggingen = beleggingen × 5.88%` (2025)
8. `forfaitairSchulden = aftrekbare × 2.70%`
9. `voordeelUitSparen = forfaitS + forfaitB - forfaitSch`
10. `rendementsgrondslag = bezittingen - aftrekbareSchulden`
11. `heffingsvrijVermogen` = €57.684 (single) / €115.368 (partner)
12. `grondslagSparen = max(0, grondslag - heffingsvrij)`
13. `effectiefRendement = voordeel / grondslag`
14. `box3Inkomen = grondslagSparen × effectiefRendement`
15. `belasting = inkomen × 36%`
16. `vrijheidsdagen = belasting / dailyExpenses`

#### `optimizePartnerAllocation()` — `lib/box3-data.ts:428`
**Doel:** Optimale verdeling tussen partners.
**Methode:** Brute-force search in 5%-stappen over alle combinaties.

#### `generateBox3Optimizations()` — `lib/box3-data.ts:333`
**Doel:** Belastingtips genereren (5 typen).

---

### 2.5 Vermogensprojectie

#### `computeNetWorthProjection()` — `lib/net-worth-projection.ts:58`
**Doel:** 5-jaar projectie van netto vermogen.
**Formule:** `projected = projected × (1 + monthlyReturn) + monthlySavings`
**Output:** 60 maandelijkse datapunten + jaar 1/3/5 mijlpalen.

---

### 2.6 Vrijheidstijd

#### `calculateFreedomTime()` — `lib/format.ts:74`
**Doel:** EUR-bedrag → vrijheidsdagen conversie.
**Formule:** `totalDays = |amount| / dailyExpenses`
**Output:** `FreedomTimeBreakdown` (years, months, days, isDeficit, isInfinite)

#### `formatWithFreedom()` — `lib/format.ts:209`
**Doel:** Gecombineerde valuta + vrijheidstijd string.
**Output:** bijv. `"€ 450.000 (12 jaar en 3 maanden)"`

#### `computeFreedomMilestones()` — `lib/freedom-milestones.ts:55`
**Doel:** Projectie van 25/50/75/100% vrijheidsmijlpalen.
**Formule:** Zelfde als `computeFireProjection` (inflatie-gecorrigeerd compound growth).

#### `buildMonthlyFreedomData()` — `lib/freedom-days-trend.ts:19`
**Doel:** 12-maanden trend van gewonnen vrijheidsdagen uit voltooide acties.

---

### 2.7 Patronen & Analyse

#### `detectSeasonalPatterns()` — `lib/spending-patterns.ts`
**Formule:** Afwijking = `(maandGem - totaalGem) / totaalGem`. Seizoenspatroon als |afwijking| > 25%.

#### `detectTrends()` — `lib/spending-patterns.ts`
**Formule:** Lineaire regressie: `slope = Σ(x-x̄)(y-ȳ) / Σ(x-x̄)²`. Trend als |slope/avg| > 3%.

#### `detectAnomalies()` — `lib/spending-patterns.ts`
**Formule:** Afwijking = `(huidigeMaand - gem) / gem`. Anomalie als |afwijking| > 40%.

#### `computeAllocationSlices()` — `lib/portfolio-allocation.ts`
**Doel:** Portefeuille-allocatie per asset class/sector/geografie.

#### `computeRebalancingSuggestions()` — `lib/portfolio-allocation.ts`
**Doel:** Herbalanceringsuggesties.
**Formule:** `drift = currentPct - targetPct`. Actie als |drift| > 2%.

#### `compareToBenchmarks()` — `lib/benchmark-comparison.ts`
**Doel:** Portefeuille vs benchmarks vergelijking.
**Formule:** `alpha = portfolioReturn - benchmarkReturn`

---

### 2.8 Weerbaarheid

#### `computeResilienceScore()` — `lib/horizon-data.ts:1028`
**Doel:** Weerbaarheidsscore 0–100.
**Componenten (elk 0–25):**
- Emergency: maanden noodreserve (30% liquide assets / maanduitgaven, max 6 mnd)
- Diversificatie: asset-to-debt ratio / 3
- Schuldenratio: 1 - (schulden / assets)
- Spaarquote: savingsRate / 30%

---

## 3. Geïdentificeerde Inconsistenties

### 3.1 HOOG — Dubbele berekeningen

| # | Probleem | Locatie A | Locatie B | Verschil |
|---|----------|-----------|-----------|----------|
| 1 | `fireTarget` dubbel berekend | `mock-data.ts:57` | `horizon-data.ts:481` | Identieke formule, geen gedeelde functie |
| 2 | `freedomYears/Months` dubbel | `mock-data.ts:61-63` | `horizon-data.ts:488-490` | Horizon voegt `Math.max(0, ...)` safety check toe |
| 3 | `savingsRate` dubbel | `mock-data.ts:66` | `horizon-data.ts:484` | Identiek |
| 4 | `freedomPercentage` dubbel | `mock-data.ts:58` | `horizon-data.ts:482` | mock-data: clamp 0–100; horizon: alleen clamp op 100 |

**Risico:** Bij aanpassing van één locatie kan de andere vergeten worden, waardoor kern- en horizonpagina verschillende waarden tonen.

### 3.2 HOOG — SWR inconsistentie

| # | Variabele | Waarde | Locatie | Gebruik |
|---|-----------|--------|---------|---------|
| 5 | `SWR` (lokaal) | 0.04 | `mock-data.ts:38` | Kern-pagina berekeningen |
| 6 | `SWR` (export) | 0.04 | `horizon-data.ts:12` | Horizon-pagina, Monte Carlo, scenarios |
| 7 | `NL_SWR` | 0.02883 | `horizon-data.ts:24` | Box 3-aangepaste berekening |
| 8 | `effectiveSwr` | dynamisch | `fire-params.ts:15` | `grossReturn - BOX3_DRAG - inflation` |

**Probleem:** De kern-pagina (`computeCoreData`) gebruikt altijd 4% SWR, terwijl de horizon-module en simulatie-engine een Box 3-gecorrigeerde SWR kunnen gebruiken. Dit leidt tot inconsistente FIRE-targets en vrijheidspercentages tussen pagina's.

### 3.3 HOOG — Meerdere input-interfaces

| # | Interface | Bestand | Karakter |
|---|-----------|---------|----------|
| 9 | ~~`CoreData`~~ → `FinancialInput` + `FinancialMetrics` | `core-metrics.ts` | **Opgelost (RF-003):** Input en output gescheiden |
| 10 | ~~`HorizonInput`~~ → `FinancialInput` | `core-metrics.ts` (re-exported via `horizon-data.ts`) | **Opgelost (RF-003):** Unified input interface |

**~~Probleem:~~** ~~Dezelfde financiële basisgegevens worden via twee verschillende interfaces verwerkt. `CoreData` mengt input en output, wat hergebruik bemoeilijkt.~~ **Opgelost:** `FinancialInput` is de unified input interface; `FinancialMetrics` bevat alleen berekende waarden.

### 3.4 MEDIUM — Naamgeving

| # | Probleem | Voorbeeld | Locaties |
|---|----------|-----------|----------|
| 11 | snake_case ↔ camelCase | `monthly_income_change` → `monthlyIncome` | `fire-simulation.ts:378`, alle DB queries |
| 12 | Verwarrend onderscheid | `dailyExpense` vs `dailyMustExpense` | `mock-data.ts:69,74` |
| 13 | Verwarrend onderscheid | `yearlyIncome` vs `estimatedYearlyIncome` | `mock-data.ts:50,124` |
| 14 | NL/EN mix | `vrijheidsdagen` vs `freedomDays` | `box3-data.ts:78` vs `horizon-data.ts:187` |

### 3.5 MEDIUM — Format-functies

| # | Probleem | Locatie | Oplossing |
|---|----------|---------|-----------|
| 15 | `formatEur()` dupliceert `formatCurrency()` | `box3-data.ts:519` vs `format.ts:15` | Gebruik `formatCurrency()` overal |
| 16 | Inline vrijheidsdagen-berekening | `box3-data.ts:270` | Gebruik `calculateFreedomTime()` uit `format.ts` |

### 3.6 LAAG — Constanten verspreid

| # | Constante | Waarde | Locaties |
|---|-----------|--------|----------|
| 17 | Annual return | 0.07 | `mock-data.ts:84` (hardcoded), `net-worth-projection.ts:62` (default param), `horizon-data.ts:13` (`DEFAULT_RETURN`) |
| 18 | AOW maandbedrag | 1380 | `horizon-data.ts:16`, `LIFE_EVENT_CATALOG.aow`, `CASHFLOW_CATALOG[0]` |

---

## Bijlage: Tabellenlijst per Supabase `.from()` aanroep

Alle tabellen die daadwerkelijk bevraagd worden in de codebase:

```
actions, app_settings, assets, bank_accounts, budget_amounts, budget_rollovers,
budgets, category_corrections, debts, goal_contributions, goal_value_history,
goals, gocardless_accounts, gocardless_requisitions, gocardless_sync_log,
holding_transactions, holdings, household_invitations, household_members,
households, life_events, net_worth_snapshots, next_step_completions,
nibud_reference_data, profiles, recommendation_feedback, recommendations,
recurring_transactions, report_configs, settlement_entries, share_events,
target_allocations, tier_assignments_log, transaction_splits, transactions,
user_feature_visits, user_own_ibans, valuations
```
