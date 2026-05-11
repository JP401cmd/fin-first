# Kern-rapport & Persoonlijk-plan-rapport — Design Spec

**Status:** Draft
**Auteur:** janpa (via project-assistant)
**Datum:** 2026-05-11
**Doel:** Twee nieuwe rapport-types toevoegen op `/rapportages`:

1. **Vermogensoverzicht (Kern-rapport)** — PDF-export van álle bezittingen en
   schulden met hun kenmerken, plus een diepere laag per app als die actief is
   (Budgetteren, Holdings, Woonbalans, Verhuurrendement, Hypotheekplanner).
2. **Persoonlijk plan (Instellingen & voorkeuren)** — PDF-export van demografie,
   inkomen, uitgaven, AOW/pensioen, FIRE-strategie, eindstrategie en
   onttrekkingsstrategie.

Beide rapporten volgen het bestaande editorial-rapport-patroon (`/rapportages/balans`,
`/rapportages/budget`) en gebruiken `window.print()` voor PDF-export via een
`@media print`-stylesheet — geen server-side rendering naar PDF nodig.

---

## 1. Plek in de UI

`/rapportages` toont nu drie editorial cards (`CardEditorial accent`):

| Romein | Titel | Route |
|--------|-------|-------|
| i. | Periodiek rapport | `/rapportages/[id]` |
| ii. | Balansstaat | `/rapportages/balans?date=...` |
| iii. | Maandbudget | `/rapportages/budget?month=...` |

We voegen **twee** cards toe, in deze volgorde (boven de "Eerder verschenen"-divider):

| Romein | Titel | Route |
|--------|-------|-------|
| **iv.** | **Vermogensoverzicht** | `/rapportages/vermogen?date=YYYY-MM-DD` |
| **v.** | **Persoonlijk plan** | `/rapportages/persoonlijk-plan` |

Per card: één kicker + sub-kicker, Romeinse num rechts, peildatum-input
(alleen bij vermogen), primary CTA-knop, italic toelichting onderaan. Volg
de bestaande Card-blueprint in `app/(app)/rapportages/page.tsx` lijnen 322–430.

Iconen (lucide): `Layers` voor vermogen, `Compass` voor persoonlijk plan.

---

## 2. Rapport A — Vermogensoverzicht (Kern)

### 2.1 Doel
Eén PDF die alle bezittingen + schulden op één peildatum toont, met alle
kenmerken die in de Supabase-tabellen `assets` en `debts` staan. Per asset
of debt waar een app actief is, volgt een **diepere sectie** met de
app-specifieke data.

Verschil met bestaande balansstaat:
- Balans = boekhoudkundige scontrovorm (activa/passiva), gericht op **getallen**.
- Vermogensoverzicht = **inventaris** — alle bezittingen + alle kenmerken
  per regel, plus app-deep-dive.

### 2.2 Layout — secties (Romeinse num.)

**i. Masthead**
- Dubbele-lijn header (`border-bottom: 4px double var(--ink)`)
- Kicker "Vermogensoverzicht"
- Hoofdtitel = peildatum in NL-locale
- Subline: `displayName` (uit profile) + "Peildatum X"

**ii. Mini-hero — `FiguresStrip` (4 cols)**
- Totaal activa
- Totaal passiva
- Eigen vermogen (winner-variant)
- Aantal regels (bv. "8 bezittingen · 2 schulden")

**iii. Methodologie-callout** (`ScenarioCallout`)
Toelichting hoe activa gewaardeerd worden, peildatum-semantiek, en dat
woz-waarde van eigen huis los wordt vermeld naast marktwaarde.

**iv. Bezittingen — per categorie**
Loop over `ASSET_TYPE_LABELS` (`lib/asset-data.ts`). Voor elke categorie
met ≥1 actief item: een sectie-tabel met:

Kolommen (in deze volgorde):
1. **Naam** (`name`)
2. **Subtype** (`subtype` → Nederlands label via `ASSET_SUBTYPE_LABELS`)
3. **Huidige waarde** (`current_value`)
4. **Verwacht rendement** (`expected_return × 100`, %)
5. **Mnd. inleg** (`monthly_contribution`)
6. **Inclusie %** (`net_worth_inclusion_pct`, alleen tonen als <100)
7. **Eigenaarschap** (`ownership`: 'personal' / 'shared')

Type-specifieke regels eronder (`text-[11px] text-[var(--ink-3)]`):
- `eigen_huis`: `WOZ-waarde {woz_value}`, adres `{address_postcode} {address_house_number}`
- `real_estate`: `Verhuurinkomen {rental_income}/jr` (indien >0)
- `retirement`: `Aanbieder: {retirement_provider_type}` ('bedrijfspensioenfonds' / 'verzekeraar' / 'ppi')
- `investment`: `Risicoprofiel: {risk_profile}`, ticker indien aanwezig
- `crypto`: subtype + bewaarder (`institution`)
- `deelneming`: `KvK {kvk_number}`, `Belang {ownership_percentage}%`, `Dividend {annual_dividend}/jr`
- `vehicle`: subtype + afschrijving `{depreciation_rate}%/jr`
- `levensverzekering`: vervaldatum `{expiry_date}`, begunstigde `{beneficiary}`
- `vordering`: gekoppeld aan asset-naam via `linked_asset_id`

Categorie-subtotaal in dubbele-lijn-finale onderaan.

**v. Schulden — per categorie**
Loop over `DEBT_TYPE_LABELS` (`lib/debt-data.ts`).

Kolommen:
1. **Naam**
2. **Soort** (`debt_type`-label)
3. **Hoofdsom** (`current_balance` — niet `original_amount`, dat is start-bedrag)
4. **Rente** (`interest_rate`, %)
5. **Looptijd resterend** (in maanden, afgeleid uit `end_date − today`)
6. **Mnd. termijn** (`monthly_payment`)
7. **Type aflossing** (`repayment_type`: annuïteit / lineair / aflossingsvrij)
8. **NHG** (`nhg`, alleen voor hypotheek, ja/nee)
9. **Schuldeiser** (`creditor`)

Type-specifieke regels:
- `mortgage`: rente-vast tot `{fixed_rate_end_date}`, aftrekbaar `{is_tax_deductible}`
- `student_loan`: stelsel `{subtype}` (oud/nieuw/sf35), draagkrachtmeting `{draagkrachtmeting_date}`
- `belastingschuld`: `{tax_year}`, betalingsregeling `{has_payment_plan}`
- `familielening`: schriftelijke overeenkomst `{has_written_agreement}`

**vi. App-deepening** — Eén sub-sectie per actieve app
Volg de registry: `components/core/category-deepening-registry.ts`. Per
actieve app een sectie met SectionLabel + de relevante data.

**vi.a Budgetteren** (`has_budget_tracking === true` op ≥1 cash-asset)
- Aantal budgetcategorieën (uit `budgets` tabel)
- Totaal begroot / besteed deze maand
- Top-5 categorieën op uitgaven (afgelopen maand)
- Spaarquote afgelopen maand
- Data uit: `lib/budget-utils.ts` + `lib/budget-report-data.ts`

**vi.b Holdings** (`has_holdings_tracking === true` op ≥1 investment-asset)
- Lijst van individuele holdings per asset (ticker, aantal, gem. aankoopkoers,
  huidige koers, marktwaarde, % van depot)
- Subtotaal per asset, totaal portefeuille
- Data uit: `holdings` tabel + `lib/holdings.ts`

**vi.c Woonbalans** (`has_woonbalans_tracking === true` op eigen_huis)
- WOZ-trend (laatste 3 jaar als sparkline)
- Huidige marktwaarde - hypotheek-rest = bruto overwaarde
- Stille-reserve = marktwaarde - WOZ
- Data uit: asset-row + gekoppelde mortgage-row

**vi.d Verhuurrendement** (`has_rental_tracking === true` op real_estate)
- Bruto-rendement (huur / waarde × 100)
- Netto-rendement (huur - kosten / waarde × 100)
- Bezettingsgraad (uit `vacancy_log`)
- Maand-onderhoud (`monthly_maintenance_cost` of 1%-schatting)
- VvE (`vva_fee`)

**vi.e Hypotheekplanner** (`has_hypotheekplanner_tracking === true` op mortgage)
- Maandlast bij huidige strategie
- Resterende rente-kosten over looptijd
- Aflos-schema overzicht (eerste 12 maanden + eindstand)
- Eventueel: extra-aflossing scenario indien geconfigureerd

**vii. Eigen-vermogen-finale**
Dubbele-lijn-finale onderaan met netto vermogen + vrijheidstijd-omrekening
(`eurToFreedomTime(eigenVermogen, dailyExpenseRate)`).

**viii. Colophon**
`OrnamentColophon` met "Vermogensoverzicht" + gegenereerde-tijd.

### 2.3 Datasources
- `assets`-tabel: `select * where user_id = ... and is_active = true order by sort_order`
- `debts`-tabel: idem
- `bank_accounts` voor cash-banktegoeden: zelfde patroon als `BalansItem` in
  `app/api/report/balans/route.ts`
- `budgets` + `transactions` (huidige maand) voor Budgetteren-app
- `holdings`-tabel voor Holdings-app
- `mortgages` of `debts`-rij voor Hypotheekplanner
- `profiles.display_name` voor masthead

### 2.4 API-route
`app/api/report/vermogen/route.ts` — `GET ?date=YYYY-MM-DD`.
Output type: `VermogenReportData` met de exacte structuur die de page leest.
Pattern conform `app/api/report/balans/route.ts`.

### 2.5 Page-route
`app/(app)/rapportages/vermogen/page.tsx` — client component, structuur
conform `app/(app)/rapportages/balans/page.tsx`:
- `useSearchParams()` voor `date`
- `useFc()` voor masked-aware currency
- `NavStackMeta title="Vermogensoverzicht" bottomBar={{ kind: 'tabs' }}`
- Print-toolbar met `window.print()`
- Editorial masthead + FiguresStrip + content-secties + footer

---

## 3. Rapport B — Persoonlijk plan (Instellingen & voorkeuren)

### 3.1 Doel
Eén PDF die toont **welke aannames** en **persoonlijke voorkeuren** de FIRE-
en horizon-berekeningen aansturen. Voor de gebruiker om door te lezen
("klopt dit nog?") en om mee te nemen naar adviseur/partner.

### 3.2 Layout — secties

**i. Masthead**
- Kicker "Persoonlijk plan"
- Titel: "{full_name} — uitgangspunten en strategie"
- Subline: huishouden-type + aantal kinderen + gegenereerd-op

**ii. Mini-hero — `FiguresStrip` (4 cols)**
- Huidige leeftijd (afgeleid uit `date_of_birth`)
- AOW-leeftijd (uit `aow_leeftijd`-tabel via `lib/aow-leeftijd.ts`)
- Geplande eindleeftijd (`profile.fire_end_age`)
- Levensverwachting (placeholder: 90 jaar tot we apart veld toevoegen — zie
  open vragen)

**iii. Demografie & levensloop**
| Veld | Bron | Default als leeg |
|------|------|------------------|
| Geboortedatum | `profile.date_of_birth` | — |
| Huidige leeftijd | Computed | — |
| Huishouden-type | `profile.household_type` | "Alleenstaand" |
| Aantal kinderen | `profile.number_of_children` | 0 |
| Geplande eindleeftijd | `profile.fire_end_age` | 90 |
| AOW-leeftijd | `aow_leeftijd` lookup op `date_of_birth` | 67 |
| Levensverwachting | Open (niet in DB) | 90 |

**iv. Inkomen**
| Veld | Bron |
|------|------|
| Netto maandinkomen | `profile.net_monthly_income` |
| Bruto jaarinkomen (afgeleid) | `net_monthly_income × 12 / 0.65` als ruwe schatting *of* expliciet veld |
| Marginaal IB-tarief | `profile.marginaal_tarief` (37% of 49.5%) |
| Box 3 methode | `profile.box3_method` ('forfaitair' / 'werkelijk') |

**v. AOW & aanvullend pensioen**
Bron: `cashflows`-tabel waar `cashflow_type IN ('aow', 'pension')` AND
`is_active = true`. Toont per regel:
- Naam (bv. "AOW", "Pensioen ABP")
- Startleeftijd (`target_age` of `start_date` omgezet naar leeftijd)
- Maandbedrag (`monthly_amount`)
- Type ('aow' / 'pension')
- Eventueel: indexering (`is_indexed`)
- Indien `cashflow_type === 'pension'`: gekoppelde pensioenpot-asset
  (`linked_asset_id` → asset met `asset_type === 'retirement'`) — toon huidige
  waarde + verwachte uitkering

**vi. Uitgaven nu vs. na pensioen**
- Huidige uitgaven/jaar: som van `budgets.limit_amount` waar `budget_type='expense'`,
  jaarlijks (× 12) — of fallback via `lib/budget-utils.ts` → `computeRetirementExpenses()`
- Verwachte uitgaven na pensioen:
  - Methode: `profile.retirement_expense_method`
    - `'essential_budgets'`: alleen budgetten met `is_essential=true`
    - `'percentage'`: huidige × `profile.retirement_expense_pct` (bv. 0.7)
    - `'custom'`: `profile.retirement_expense_custom_amount`
  - Bedrag: zoals teruggegeven door `computeRetirementExpenses(profile, budgets)`
- Verschil (delta) + "%-van-huidig"-pill

**vii. FIRE-rekenparameters**
| Veld | Bron | Default |
|------|------|---------|
| Bruto rendement | `profile.expected_return` | 0.07 |
| Inflatie | `profile.inflation_rate` | 0.02 |
| Box 3 methode | `profile.box3_method` | 'forfaitair' |
| Effectieve SWR | `resolveFireParams().effectiveSwr` | — |

Toon ook de formule die de effectieve SWR berekent (`grossReturn − BOX3_DRAG
− inflationRate`) als italic subtekst — past bij methodologie-stijl van
balans-rapport.

**viii. Eindstrategie**
Uit `lib/fire-strategy.ts` → `parseFireStrategy(profile)`:
- **Strategie**: één van 4 (`STRATEGY_LABELS`)
  - `deplete` — Vermogen opeten
  - `legacy` — Nalatenschap
  - `perpetual` — Eeuwigdurend
  - `pensioen` — Pensioenleeftijd
- **Eindleeftijd**: `endAge`
- **Doelbedrag**: `legacyAmount` (alleen relevant bij `legacy`)
- **Subtitle** van `STRATEGY_LABELS[strategy].subtitle` als italic toelichting

**ix. Onttrekkingsstrategie**
Uit `lib/withdrawal-strategy.ts` → `WithdrawalStrategyConfig`:
- **Type**: `'static' | 'guardrails' | 'vpw' | 'bucket'`
- Indien `guardrails`: floor, ceiling, cut-step, raise-step
- Default = `static` (klassieke SWR) — toelichting "default is prima"

**x. Colophon**
`OrnamentColophon module="Persoonlijk plan"` met gegenereerd-op.

### 3.3 Datasources
- `profiles`-tabel: één rij voor user (alle bovenstaande velden)
- `cashflows`-tabel: voor AOW/pensioen-entries
- `aow_leeftijd`-lookup: voor exacte AOW-leeftijd op basis van geboortedatum
- `budgets`-tabel: voor huidige uitgaven (jaarlijks)
- Geen externe API nodig

### 3.4 API-route
`app/api/report/persoonlijk-plan/route.ts` — `GET` (geen params).
Output type: `PersoonlijkPlanData`.

### 3.5 Page-route
`app/(app)/rapportages/persoonlijk-plan/page.tsx` — client component,
patroon conform balans/budget.

---

## 4. PDF-export — A4 compact editorial opmaak

Beide rapporten gebruiken **`window.print()`** (geen server-side PDF). De
visuele opmaak in de PDF moet aan deze drie principes voldoen:

1. **A4 portrait, niet groter dan nodig** — gebruiker mag niet 6 pagina's krijgen
   voor wat in 2-3 past. Alle ruimte die schermweergave nodig heeft (lucht,
   grote koppen, hoge FiguresStrip-cells) wordt voor print compacter.
2. **Editorial stijl behouden** — serif-hiërarchie (Playfair / Source Serif),
   dubbele-lijn dividers, kicker-streep, DM Mono voor getallen, italic
   subtekst. De stijl is "nieuwsbrief / staatsblad", niet "spreadsheet".
3. **Per rapport een eigen typografisch karakter** via de module-accent-kleur:
   Vermogensoverzicht ↦ Kern-amber, Persoonlijk plan ↦ Horizon-paars/goud,
   Balans/Budget blijven Kern/Wil.

### 4.1 Bestaande print-fundament

`app/globals.css` lijnen 595-789 bevatten al een uitgebreide `@media print`-
stylesheet met:
- `@page { size: A4 portrait; margin: 12mm 12mm }` → printable width = 186mm
- `body { font-size: 12px }` voor print
- `data-print-hide` op chrome/toolbars
- Shadow / transition / animation reset
- `[class*="overflow-y-auto"] { overflow: visible }` voor shell-pagination
- `.report-section`, `.kassabon-block`, `.pull-quote`, `table`, `blockquote`
  hebben `break-inside: avoid`
- OKLCH-fallbacks voor module-accent kleuren
- CSS-var fallbacks voor `bg-[var(--paper)]`, `text-[var(--ink)]` etc.

Hergebruik dit fundament — niet vervangen, wel **aanvullen** met de
compact-tier hieronder.

### 4.2 Compact-tier (nieuw — toe te voegen aan `@media print`)

Doel: verticale-ruimte ~30% inkorten voor print, zonder de editorial
hiërarchie te verliezen.

```css
@media print {
  /* === Compact typografische schaal — alleen voor rapport-content === */
  /* Selecteer alleen binnen .report-pdf-root zodat we andere geprinte
     pagina's niet ongewenst beïnvloeden. Beide nieuwe rapporten zetten
     deze class op de outer container. */
  .report-pdf-root h1 { font-size: 22pt !important; line-height: 1.1; }
  .report-pdf-root h2 { font-size: 13pt !important; line-height: 1.2; }
  .report-pdf-root h3 { font-size: 11pt !important; line-height: 1.2; }
  .report-pdf-root .report-kicker,
  .report-pdf-root [class*="text-[10px]"][class*="uppercase"] {
    font-size: 8pt !important;
    letter-spacing: 0.08em !important;
  }

  /* Reduceer vertical rhythm */
  .report-pdf-root .mb-8 { margin-bottom: 14pt !important; }
  .report-pdf-root .mt-8 { margin-top: 14pt !important; }
  .report-pdf-root .mb-6 { margin-bottom: 10pt !important; }
  .report-pdf-root .mt-6 { margin-top: 10pt !important; }
  .report-pdf-root .py-6 { padding-top: 8pt !important; padding-bottom: 8pt !important; }

  /* FiguresStrip: compacter, geen dubbele lijn dik bovenop een page-break */
  .report-pdf-root [data-figures-strip] {
    page-break-inside: avoid;
    margin-bottom: 12pt !important;
  }
  .report-pdf-root [data-figures-strip] [data-figure-amount] {
    font-size: 18pt !important;
  }

  /* Tabel-rijen: krap maar leesbaar */
  .report-pdf-root table {
    font-size: 10pt !important;
  }
  .report-pdf-root td,
  .report-pdf-root th {
    padding-top: 2pt !important;
    padding-bottom: 2pt !important;
  }

  /* Body tekst: 10.5pt is sweet-spot voor A4 met serif */
  .report-pdf-root,
  .report-pdf-root p,
  .report-pdf-root span,
  .report-pdf-root li {
    font-size: 10.5pt !important;
    line-height: 1.35;
  }

  /* Editorial dividers blijven dun maar zichtbaar */
  .report-pdf-root [style*="border-bottom: 4px double"] {
    border-bottom-width: 2px !important;
  }
}
```

### 4.3 Page-break planning per rapport

**Vermogensoverzicht (verwacht 3-4 A4-pagina's bij gemiddelde gebruiker):**
- Pagina 1: Masthead + FiguresStrip + Methodologie + begin van Bezittingen
- Pagina 2-3: Rest bezittingen + schulden
- Pagina 4: App-deepening + finale + colophon

Page-break-richtlijnen:
- Elke top-level sectie (`SectionLabel num="iv."` etc.) krijgt een wrapper
  `<div className="report-section">` zodat de bestaande globale CSS-regel
  `break-inside: avoid` op die class triggert.
- Categorie-tabellen (cash / investment / etc.) ook in `report-section`.
- App-deepening: elke app-sectie in eigen `report-section`.
- Tussen "Bezittingen" en "Schulden" een impliciete pagina-overgang
  forceren via `page-break-before: auto` (laat browser kiezen).

**Persoonlijk plan (verwacht 2 A4-pagina's):**
- Pagina 1: Masthead + FiguresStrip + Demografie + Inkomen + AOW/pensioen
- Pagina 2: Uitgaven + FIRE-params + Eindstrategie + Onttrekking + Colophon

### 4.4 Module-accent-kleur per rapport

In de page-root een data-attribuut zetten waarop print-CSS hangt:
```tsx
<div className="report-pdf-root mx-auto max-w-[900px] ..." data-report-module="kern">
```

Module-mapping:
| Rapport | data-report-module | Accent-kleur OKLCH-fallback |
|---------|--------------------|-----------------------------|
| Periodiek | `kern` (huidig) | `#6b4339` |
| Balans | `kern` (huidig) | `#6b4339` |
| Budget | `wil` (huidig) | `#3d3048` |
| **Vermogensoverzicht** | `kern` | `#6b4339` |
| **Persoonlijk plan** | `horizon` | `#c4a06b` |

In print-CSS:
```css
.report-pdf-root[data-report-module="kern"] .report-kicker,
.report-pdf-root[data-report-module="kern"] [data-accent] {
  color: #6b4339 !important;
}
.report-pdf-root[data-report-module="horizon"] .report-kicker,
.report-pdf-root[data-report-module="horizon"] [data-accent] {
  color: #c4a06b !important;
}
.report-pdf-root[data-report-module="wil"] .report-kicker,
.report-pdf-root[data-report-module="wil"] [data-accent] {
  color: #3d3048 !important;
}
```

### 4.5 Print-toolbar (huidige patroon — niet wijzigen)

```tsx
<div data-print-hide className="mb-6 flex items-center justify-end">
  <button type="button" onClick={() => window.print()} ...>
    <Printer className="h-4 w-4" />
    Afdrukken als PDF
  </button>
</div>
```

De `data-print-hide` zorgt dat de toolbar zelf niet in de PDF verschijnt.

### 4.6 Verificatie (browser print-preview)

- Open Chrome → print preview → A4 → marges "default"
- Het rapport moet:
  - Beginnen met een **volle masthead** op pagina 1 (geen wezen-titels)
  - Geen pagina hebben met alleen één regel uit een tabel
  - Geen pagina hebben die voor minder dan ~40% gevuld is (behalve de laatste)
  - Editorial typografie behouden (geen sans-serif fallback voor titels)
  - Module-accent-kleur correct tonen in het kleur-print-pad (test ook
    grayscale: kicker moet leesbaar blijven via `font-weight` en niet alleen
    via kleur)

### 4.7 Wat NIET te doen

- Geen externe PDF-bibliotheek toevoegen (pdfkit, jspdf, react-pdf etc.) —
  `window.print()` is voldoende en blijft consistent met balans/budget.
- Geen aparte "print-only"-page-route bouwen. Print is een **view-laag** op
  dezelfde page; we togglen via `@media print` en `data-print-hide` /
  `data-print-only` attributen.
- Geen aanpassingen aan de scherm-render alleen om print mooi te krijgen.
  Print-tweaks gaan in `@media print`-blok in `app/globals.css`.

---

## 5. Module-gating (zie CLAUDE.md fallback-regel)

**Vermogensoverzicht**: vereist géén module. Werkt altijd, ook als alle apps
uit staan (toont dan gewoon geen app-deepening-secties — niet stilzwijgend
verbergen, maar de sectie sla je dan over zonder placeholder).

**Persoonlijk plan**: vereist géén module. Werkt altijd; lege velden tonen
als "—" met `text-[var(--ink-4)]` zodat duidelijk is dat het veld nog
ingevuld kan worden in `/identity/instellingen`.

---

## 6. Acceptatiecriteria

### Vermogensoverzicht
- [ ] Card iv. zichtbaar op `/rapportages` tussen `iii.` en de archief-divider
- [ ] Peildatum-input default = vandaag
- [ ] Toont alle assets met `is_active=true`, gegroepeerd per `asset_type`
- [ ] Toont alle debts met `is_active=true`, gegroepeerd per `debt_type`
- [ ] Per asset/debt: alle relevante type-specifieke velden uit Supabase
- [ ] App-deepening-sectie verschijnt als `has_*_tracking` true is op ≥1 row
- [ ] FiguresStrip toont totaal-activa, totaal-passiva, eigen vermogen, aantal regels
- [ ] Print-knop genereert correcte PDF (handmatig getest in Chrome)
- [ ] Werkt zonder Holdings/Budget/Woonbalans-modules — toont dan geen app-secties

### Persoonlijk plan
- [ ] Card v. zichtbaar op `/rapportages`
- [ ] Toont demografie, inkomen, AOW/pensioen, uitgaven, FIRE-params, eindstrategie,
      onttrekkingsstrategie — secties iii t/m ix
- [ ] AOW-leeftijd komt uit `aow_leeftijd`-tabel via `lib/aow-leeftijd.ts`, niet
      hardcoded
- [ ] Pensioen-cashflows worden uit `cashflows` gehaald (`cashflow_type IN ('aow','pension')`)
- [ ] Lege profile-velden tonen als "—" zonder fouten
- [ ] Print-knop werkt
- [ ] FIRE-params + strategie kloppen met wat in `/identity/instellingen` staat
      (single source of truth verificatie)

---

## 7. Open vragen

1. **Levensverwachting**: er is geen `life_expectancy`-veld in `profiles`. Drie
   opties:
   a. Hard-coden op 90 in het rapport
   b. Hergebruiken van `fire_end_age` als proxy
   c. Nieuwe migratie + UI-veld in `/identity/instellingen` (Sectie C)

   **Aanbeveling**: optie (b) voor MVP — `fire_end_age` is feitelijk de
   geplande eindleeftijd. Levensverwachting kan later in een aparte iteratie.

2. **BV-uitkeringsstructuur**: voor DGA's met een holding-BV (`deelneming`-type
   asset met `subtype='holding_bv'`) is de uitkeringsstructuur (gebruikelijk
   loon + dividenden) relevant. Twee opties:
   a. Toon `annual_dividend` + ruling-loon (afgeleid uit netto maandinkomen) op
      het deelneming-item zelf in Rapport A
   b. Apart "BV-structuur"-blok in Rapport B als er ≥1 holding-BV is

   **Aanbeveling**: beide doen — (a) als feitelijke registratie in vermogens-
   rapport, (b) als beleidsmatige beslissing in persoonlijk plan.

3. **Bruto jaarinkomen**: staat niet expliciet in `profiles` — alleen
   `net_monthly_income`. Twee opties:
   a. Afleiden uit netto via ruwe schatting (riskant — hangt af van toeslagen,
      30%-regeling, etc.)
   b. Nieuw veld `gross_annual_income` toevoegen in profiles + onboarding

   **Aanbeveling**: optie (b), als nieuwe migratie. Past ook bij Aangifte-import
   die `gross_annual_income` al kent in `lib/aangifte/types.ts:48`.

4. **Verwachte uitgaven na pensioen**: methode + bedrag staan in `profile`,
   maar wel altijd correct? `computeRetirementExpenses()` heeft de
   single-source-of-truth-logica — die hergebruiken zodat rapport en
   horizon-simulatie synchroon blijven.

---

## 8. Implementatie-volgorde (suggestie)

1. **Type definities** in `lib/vermogen-report-data.ts` en
   `lib/persoonlijk-plan-data.ts` — Server-data types.
2. **API-routes** schrijven met testdata.
3. **Page-routes** schrijven, hergebruik van `FiguresStrip`, `ScenarioCallout`,
   `OrnamentColophon`, `RekeningTag`, `SectionLabel`, etc.
4. **Twee nieuwe `CardEditorial`** op `/rapportages` (vier en vijf in de rij).
5. **Print-stylesheet** verifiëren of bestaande `@media print`-regels dekken.
6. **Open-vragen-veld** `gross_annual_income` toevoegen aan profiles (migratie)
   indien aanbeveling 3 wordt overgenomen.
7. **Handmatig testen**: alle 4 module-combinaties (alle apps aan / alle uit /
   mix). Print-test in Chrome + Firefox.

---

## 9. Referenties

- Bestaande rapport-pages:
  - `app/(app)/rapportages/balans/page.tsx`
  - `app/(app)/rapportages/budget/page.tsx`
  - `app/(app)/rapportages/page.tsx` (landing)
- Bestaande API-routes:
  - `app/api/report/balans/route.ts` — referentie-implementatie voor data-loader
  - `app/api/report/budget/route.ts` — voor maand-gerelateerde data
- Data-types:
  - `lib/asset-data.ts` (`Asset`, `AssetType`, `ASSET_TYPE_LABELS`)
  - `lib/debt-data.ts` (`Debt`, `DebtType`, `DEBT_TYPE_LABELS`)
  - `lib/fire-params.ts` (`resolveFireParams`)
  - `lib/fire-strategy.ts` (`parseFireStrategy`, `STRATEGY_LABELS`)
  - `lib/withdrawal-strategy.ts` (`WithdrawalStrategyConfig`)
  - `lib/aow-leeftijd.ts` (AOW-leeftijd lookup)
  - `lib/budget-utils.ts` (`computeRetirementExpenses`)
- App-registry: `components/core/category-deepening-registry.ts`
- Editorial primitives: `components/editorial/` (zie memory `feedback_editorial_library.md`)
- Profile-velden: `supabase/migrations/20260215000000_create_base_tables.sql`
