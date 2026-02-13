# Plan: Huishouden-functionaliteit voor TriFinity

> **Status**: IJskast — geparkeerd voor latere ontwikkeling
> **Datum**: 2026-02-13
> **Aanleiding**: Gap-analyse YNAB vs TriFinity (zie `docs/ynab-gap-analyse.md`)

## Context

TriFinity is nu single-user. We willen dat een stel samen kan werken: gedeelde financien (hypotheek, boodschappen) en persoonlijke zaken (pensioen, eigen spaargeld) naast elkaar. De kernvraag: "Hoeveel vrijheid hebben wij samen, en hoeveel heb ik persoonlijk?"

**Ontwerpkeuzes (bevestigd):**
- **Drie perspectieven**: huishouden-totaal + persoonlijk per partner
- **Per item kiezen**: elk asset/schuld/budget markeerbaar als 'gedeeld' of 'persoonlijk'
- **Privacy**: gedeelde items zichtbaar voor beiden, persoonlijke items alleen voor eigenaar
- **Kostenverdeling**: instelbaar — 50/50, inkomenratio, handmatig %, of een draagt alles

---

## Fase 1: Database Foundation

**Migratie: `add_household_support`**

### Nieuwe tabellen

1. **`households`** — id, name, split_mode ('equal'|'income_ratio'|'custom'|'one_carries_all'), custom_split_pct, primary_payer_id, created_by
2. **`household_members`** — household_id, user_id, role ('owner'|'member'), sort_order, joined_at. Unique op (household_id, user_id)
3. **`household_invitations`** — household_id, invited_by, invited_email, token, status ('pending'|'accepted'|'declined'|'expired'), expires_at

### Bestaande tabellen uitbreiden

Toevoegen aan `assets`, `debts`, `budgets`, `transactions`, `bank_accounts`, `net_worth_snapshots`, `valuations`, `recurring_transactions`:
- `ownership TEXT NOT NULL DEFAULT 'personal'` — CHECK ('personal', 'shared')
- `household_id UUID REFERENCES households(id)` — nullable
- CHECK constraint: `ownership = 'personal' OR household_id IS NOT NULL`
- Index op `household_id WHERE household_id IS NOT NULL`

Toevoegen aan `profiles`:
- `household_id UUID REFERENCES households(id)` — snelle lookup

### RLS-strategie

Helper functie:
```sql
CREATE FUNCTION public.user_household_id() RETURNS uuid
-- Returns household_id voor ingelogde user, of NULL voor solo users
```

Alle data-tabellen krijgen hetzelfde policy-patroon:
```sql
-- SELECT/UPDATE/DELETE: eigen items OF gedeelde items van mijn huishouden
(auth.uid() = user_id) OR (ownership = 'shared' AND household_id = user_household_id())
```

Solo users: `user_household_id()` returns NULL, OR-tak faalt, gedrag ongewijzigd.

### Privacy-functie voor huishouden-totaal

```sql
CREATE FUNCTION public.household_partner_totals()
-- Returns alleen SOMMEN van partner's persoonlijke assets/debts
-- Nooit individuele items — privacy gewaarborgd
```

### Verificatie
- `get_advisors(security)` draaien na migratie
- Bestaande solo-user queries testen — ongewijzigd gedrag

---

## Fase 2: Huishouden Management (Uitnodiging + Instellingen)

### Nieuwe bestanden

- **`lib/household-context.tsx`** — React context met: household data, actief perspectief, mySharePct, setPerspective()
- **`app/api/household/invite/route.ts`** — POST: maak household + stuur uitnodiging
- **`app/api/household/accept/route.ts`** — POST: accepteer uitnodiging, join household
- **`app/api/household/settings/route.ts`** — PATCH: update split_mode/percentage
- **`app/auth/household-invite/route.ts`** — Callback voor email-link

### Bestaande bestanden wijzigen

- **`app/(app)/layout.tsx`** — Wrap children in HouseholdContext, prefetch household data server-side
- **`app/(app)/identity/page.tsx`** — Nieuw "Huishouden" blok:
  - Geen household: uitnodigingsformulier (email partner)
  - Pending: uitnodigingsstatus + annuleren
  - Actief: partnernaam, split-mode selector (4 radio cards), percentage slider, verlaten-knop

### Split-mode opties (UI)

| Mode | Label | Gedrag |
|------|-------|--------|
| `equal` | 50/50 | Gelijke verdeling |
| `income_ratio` | Inkomenratio | Auto-berekend uit ieders inkomsten-budget |
| `custom` | Aangepast | Handmatig percentage instellen (slider) |
| `one_carries_all` | Een draagt alles | Een partner betaalt 100% |

### Flow
1. User vult email partner in → API maakt household + invitation
2. Partner ontvangt email met link → accepteert → wordt lid
3. Beide zien nu huishouden-UI

---

## Fase 3: Ownership Toggle in De Kern

### Bestanden wijzigen

- **`app/(app)/core/assets/page.tsx`** — Ownership toggle in AssetForm modal ('Persoonlijk' / 'Gedeeld')
- **`app/(app)/core/debts/page.tsx`** — Idem in DebtForm
- **`app/(app)/core/budgets/page.tsx`** — Idem in BudgetEditModal
- **`app/(app)/core/cash/page.tsx`** — Idem bij bankrekening-aanmaak en transactie-import

### UI-patroon voor alle lijsten

- Gedeelde items krijgen een klein `Users` icoon (Lucide) of "Gedeeld" pill-badge
- In formulieren: simpele toggle `[Persoonlijk] [Gedeeld]`
- Als user geen household heeft en 'Gedeeld' kiest → melding "Nodig eerst je partner uit via Identiteit"

### Architectuurbeslissing

Gedeelde items behouden `user_id` van de maker. Als household ophoudt te bestaan, houdt de maker het item.

---

## Fase 4: Perspectief-bewuste Vrijheidsberekening

### Nieuw bestand

- **`lib/household-data.ts`** — Pure functies:
  - `computePerspectiveFinancials(perspective, mySharePct, personal, shared, partnerPersonal?)` → totalen
  - `computeSharePct(splitMode, customPct, primaryPayerId, userId, myIncome, partnerIncome)` → percentage

### Perspectief-switcher

- **`components/app/app-header.tsx`** — Dropdown/segmented control, alleen zichtbaar bij actief household:
  - **Huishouden** — alles gecombineerd (shared + mijn persoonlijk + partner persoonlijk via aggregate functie)
  - **Mijn perspectief** — mijn persoonlijk + mijn aandeel% van gedeeld

### Bestaande pagina's aanpassen

- **`app/(app)/dashboard/page.tsx`** — Laad data, splits op ownership, gebruik perspectief voor freedom %
- **`app/(app)/core/page.tsx`** — KPI's en net worth chart perspectief-bewust
- **`app/(app)/horizon/page.tsx`** — FIRE-projectie, scenario's en Monte Carlo op basis van actief perspectief

### Berekening

| Perspectief | Assets | Debts | Expenses |
|-------------|--------|-------|----------|
| **Huishouden** | alle shared + alle personal (beide partners) | idem | idem |
| **Mijn perspectief** | mijn personal + (share% x shared) | idem | idem |

De bestaande pure functies (`computeCoreData`, `computeFireProjection`) wijzigen NIET — ze krijgen alleen andere input.

---

## Fase 5: Polish & Edge Cases

- **Huishouden verlaten**: graceful — shared items terug naar eigenaar, household opruimen
- **Uitnodiging verlopen**: automatisch na 7 dagen
- **Net worth snapshots**: perspectief-bewust opslaan of on-the-fly berekenen
- **AI context builders** (`lib/ai/context/`): household-context toevoegen zodat aanbevelingen gedeelde kosten meenemen
- **Test persona**: koppel-persona toevoegen aan seed-data
- **Life events**: ook markeerbaar als gedeeld (baby, verhuizing) — past bij "per item kiezen"

---

## Wat NIET wijzigt

- **De Wil (acties, aanbevelingen, goals)** — altijd persoonlijk. Ieder eigen pad.
- **Solo users** — zien nul verandering. Alle defaults zijn `ownership = 'personal'`, `household_id = NULL`.
- **Bestaande data** — blijft ongewijzigd. Migratie is puur additief.

---

## Kritieke bestanden

| Bestand | Wijziging |
|---------|-----------|
| `app/(app)/layout.tsx` | HouseholdContext wrapper |
| `app/(app)/dashboard/page.tsx` | Perspectief-bewuste data loading |
| `app/(app)/core/page.tsx` | KPI's + freedom calc per perspectief |
| `app/(app)/core/assets/page.tsx` | Ownership toggle + shared badges |
| `app/(app)/core/debts/page.tsx` | Idem |
| `app/(app)/core/budgets/page.tsx` | Idem |
| `app/(app)/core/cash/page.tsx` | Idem |
| `app/(app)/horizon/page.tsx` | FIRE-projectie per perspectief |
| `app/(app)/identity/page.tsx` | Huishouden-sectie |
| `components/app/app-header.tsx` | Perspectief-switcher |
| `lib/mock-data.ts` | computeCoreData (geen wijziging, andere input) |
| `lib/horizon-data.ts` | computeFireProjection (geen wijziging, andere input) |

### Nieuwe bestanden

| Bestand | Doel |
|---------|------|
| `lib/household-context.tsx` | React context voor household state |
| `lib/household-data.ts` | Perspectief-berekeningen |
| `app/api/household/invite/route.ts` | Uitnodiging API |
| `app/api/household/accept/route.ts` | Acceptatie API |
| `app/api/household/settings/route.ts` | Instellingen API |
| `app/auth/household-invite/route.ts` | Email callback |

---

## Verificatie

1. **Solo user regressie**: inloggen als bestaande user → alles werkt identiek
2. **Household creatie**: user A nodigt user B uit → B accepteert → beiden zien household
3. **Ownership toggle**: asset markeren als gedeeld → partner ziet het, partner ziet NIET persoonlijke items van ander
4. **Perspectief-switch**: huishouden-view toont gecombineerde totalen, persoonlijk-view toont eigen deel
5. **Split modes**: alle 4 modes testen met bekende bedragen → correcte percentages
6. **RLS check**: `get_advisors(security)` na elke migratie
7. **FIRE-projectie**: horizon berekeningen kloppen in beide perspectieven
