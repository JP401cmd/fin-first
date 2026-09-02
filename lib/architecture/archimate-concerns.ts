// ── Aandachtspunten op de architectuur (gecureerd) ───────────────────────────
// Bekende schuld, drift en risico's, verankerd op de elementen waar ze spelen.
// Eén oogopslag op de plaat: wáár zit de spanning. Houd dit bij wanneer je een
// punt oplost (verwijderen) of er een nieuw structureel risico ontstaat.
//
// severity:
//   info  — bewuste situatie, geen actie nodig (bv. legacy-route die nog leeft)
//   debt  — technische schuld; opruimen levert onderhoudswinst
//   risk  — kan tot verkeerde uitkomsten of datalekken leiden; prioriteit

import type { ArchimateModel } from './archimate-model'

export type ArchiConcernSeverity = 'info' | 'debt' | 'risk'

export interface ArchiConcern {
  id: string
  title: string
  detail: string
  severity: ArchiConcernSeverity
  /** Element-id's waarop dit punt slaat */
  elementIds: string[]
  /** Datum (YYYY-MM-DD) waarop dit punt voor het laatst geverifieerd is tegen de code. */
  reviewedAt: string
}

export const ARCHI_CONCERNS: ArchiConcern[] = [
  {
    id: 'besteding-per-budget-meerdere-implementaties',
    title: '"Besteed per budget" heeft nog niet overal één implementatie',
    detail:
      'De canonieke bestedingssom woont sinds 30 aug 2026 in lib/budget-spending.ts (`spendingContribution` / `splitContribution` / `buildBudgetSpendingMap` / `spentForBudget`), met de richting per budget uit `buildBudgetTypeMap` (lib/budget-utils.ts) en de ophaalkant in lib/budget-spending-fetch.ts (`BUDGET_SPENDING_TX_COLUMNS`, `fetchSpendingSplits`, `getCurrentMonthSplits`). De hotfix van die dag zette de budgetten-pagina, de detail-pane, de rollover-carry, het 12-maands maandgemiddelde en de AI-lookup erop; laag A (schrijfpaden, 30-31 aug) bracht er de gezondheidsscore-pijler (lib/health-score-input.ts#buildBudgetCategories), de Budget-KPI (lib/cashflow-kpis.ts#deriveBudgetTotals), de check-in-route (app/api/checkin/budgets) en de NIBUD-benchmark (lib/aandachtspunten-loader.ts) bij, plus de drie snapshot-routes die de pijler wegschrijven. Wat er OP DIT MOMENT nog naast staat: de overige API-routes (budget-trends, budget-variance, report/budget, export), de resterende loaders (core-data-loader, lever-scores-loader) en de AI-contextbouwers (budget-insights-context, budget-summary, wil-context, recommendation-context, spending-patterns) — die lopen in parallelle sneden en zijn bij het schrijven van dit punt niet allemaal af. Los daarvan blijft er BEWUST één tweede grondslag bestaan: de bruto/absolute spaarbudget-som van de spaarquote-familie (o.a. `monthlySavingsBudgetSpent` in lib/dashboard-data-loader.ts), want die wordt van een rúwe uitgavensom afgetrokken en niet naast een budgetlimiet gelegd; op een savings-budget is de canonieke bijdrage juist het bedrag zélf. Zolang niet elke lezer op de gedeelde functies zit, kan hetzelfde budget in dezelfde maand op twee schermen een ander bedrag tonen — precies de melding die de hotfix aanleiding gaf (budgetpagina €2.616 besteed, Budget-kaart €26 nog te besteden, augustus 2026). Verwijder dit punt zodra ELKE lezer van "besteed per budget" door lib/budget-spending.ts loopt en de bewuste uitzondering (spaarquote-grondslag) als zodanig in de code gemarkeerd staat.',
    severity: 'risk',
    elementIds: ['as-budget', 'as-transacties', 'fn-budgetteren'],
    reviewedAt: '2026-08-31',
  },
  {
    id: 'mijlpaaldetectie-alleen-in-eigen-perspectief',
    title: 'Mijlpaaldetectie draait alleen in het eigen perspectief',
    detail:
      'ADR 0123 legt mijlpaaldetectie in-band in OverzichtSecondaryLoader, tegen de canonieke waarden (netWorth, freedomPct, totalDebts, emergencyFund) van het EIGEN perspectief. Wie uitsluitend in huishoud- of partnerweergave kijkt, krijgt geen mijlpaal-detectie: de personal-canonieke waarden zijn daar niet zonder extra kosten beschikbaar — ze zouden een tweede horizon-load vergen, alleen om te toetsen of een drempel is gepasseerd. Bewust geaccepteerd in ADR 0123 (Gevolgen): de detectie blijft op dit moment gebonden aan wanneer de gebruiker zijn eigen perspectief laadt. Verwijder dit punt zodra de personal-canonieke freedomPct in elk perspectief beschikbaar is zonder extra load (bv. via een gecachete of vooraf berekende waarde), zodat detectie ook vanuit huishoud-/partnerweergave kan draaien.',
    severity: 'debt',
    elementIds: ['as-coach', 'as-huishouden'],
    reviewedAt: '2026-08-31',
  },
  {
    id: 'per-rekening-zichtbaarheid-nog-niet-bewezen-op-de-database',
    title: 'De per-rekening zichtbaarheidsgate is geschreven maar nog niet op de database bewezen',
    detail:
      'ADR 0118 legt de zichtbaarheid van een bankrekening voor de huishoudpartner op LEES-tijd vast: drie SELECT-policies (transactions, transaction_splits, recurring_transactions) en de SECURITY DEFINER-RPC household_partner_items() sluiten rekeningen uit die de eigenaar niet op partner_visibility op ‘full’ heeft gezet. De migraties 20260829160000 en 20260829161000 liggen in de repo; ze zijn bij het schrijven van dit punt NIET toegepast (gemeten tegen supabase_migrations.schema_migrations, 29-08-2026: laatste geregistreerde versie is 20260828140000). Zolang dat zo is bestaat de poort alleen in de repo en niet in de database, en is de belofte "persoonlijk betekent dat je partner de boekingen niet ziet" nog steeds onwaar op productie. Wat de TS-kant wel dekt is bewezen (lib/bank-account-visibility.test.ts, 16 tests, incl. een repo-brede kolomprojectie-scan op bank_accounts); wat de DATABASE doet is dat niet: de norm uit ADR 0004 vraagt een RLS-leaktest met TWEE echte gebruikers in EEN huishouden, per stand exact 0 rijen uit de drie tabellen en de vier RPC-takken, plus een terugschakeltest full->balance op bestaande gedeelde historie en een EXPLAIN die aantoont dat partner_hidden_account_ids() als InitPlan landt en niet als per-rij-subquery op het drukste leespad van de app. Bewust geaccepteerd bij het besluit: een huishoudlid dat de helper rechtstreeks aanroept leert HOEVEEL niet-full-rekeningen zijn partner heeft (kale UUID’s, geen naam/saldo/IBAN/hash) - de per-rij-boolean die dat zou voorkomen draait de optimalisatieronde van 20260719090108 en 20260810220000 terug. LET OP dat de urgentie hier niet door een release wordt bepaald maar door een GEBRUIKERSACTIE: vandaag 0 huishoudens en 0 huishoudleden op productie (gemeten 29-08-2026), en dat venster sluit bij de eerste geaccepteerde partneruitnodiging. Verwijder dit punt zodra beide migraties geregistreerd staan en de leaktest + EXPLAIN gedraaid zijn.',
    severity: 'risk',
    elementIds: ['as-huishouden', 'as-transacties', 't-supabase'],
    reviewedAt: '2026-08-29',
  },
  {
    id: 'onzekerheid-twee-grondslagen-op-toekomst',
    title: '/toekomst doet twee onzekerheidsuitspraken op twee grondslagen',
    detail:
      'Sinds ADR 0117 schaalt de kernel-scenarioband (lib/horizon-kernel/wrappers/band.ts), de Monte-Carlo (wrappers/mc.ts) en de rendement-marge (rendement-marge.ts) hun verstoring PER POT met een markt-risicofactor: een obligatiepot krijgt 0,3× de uitslag van een breed gespreide aandelenpot, een premieregeling-pensioenpot beweegt voor het eerst überhaupt mee. De verwachtingsband achter "waarschijnlijk vrij tussen X en Y" doet dat NIET: die draait op SCENARIO_VARIANTS (components/app/horizon/sim-chart.tsx, delta ±0,02) via buildScenarioPathsFromSim → components/app/horizon/verwachtingsband.ts#computeVerwachtingsband, en past die ±2 procentpunt toe op `row.startPortfolio` — het AGGREGAAT netto vermogen, dus inclusief eigen woning en spaargeld. Twee gevolgen op één scherm: (1) de marktcheck-band volgt de mix en de verwachtingsband niet, dus dezelfde gebruiker krijgt twee onzekerheidsuitspraken die het oneens zijn over wie marktrisico loopt; (2) de aggregaat-benadering is de grovere van de twee — zij belast ook spaargeld en de eigen woning met een rendementsschok, wat de kernel-band (die spaargeld/woning op factor 0 zet) juist niet doet. BEWUST NIET in snede 1 opgelost: deze laag heeft per constructie geen pot-samenstelling (hij rekent op de al-geaggregeerde SimRow-reeks), dus gelijktrekken betekent hem vervangen door runScenarioBand — drie volledige FIRE-bisecties per render, waar nu een goedkope naloop op bestaande rijen staat. Dat is een prestatie-besluit én een herziening van de ADR 0085-semantiek van laatst/vroegst-FIRE, geen zijeffect van de risicofactor. Verwijder dit punt zodra de verwachtingsband op dezelfde per-pot-grondslag staat als de marktcheck, of zodra expliciet is vastgelegd dat de aggregaat-benadering daar bewust blijft.',
    severity: 'debt',
    elementIds: ['as-planning', 'app-comp'],
    reviewedAt: '2026-08-29',
  },
  {
    id: 'huishoud-inkomensverhouding-zonder-intervalconversie',
    title: 'De huishoud-inkomensverhouding telt budgetlimieten op zonder interval-conversie',
    detail:
      'lib/household/perspective-loader.ts (r172-182) leidt bij `split_mode = \'income_ratio\'` de verdeelsleutel `mySharePct` af uit de income-budgetten van beide partners: `.from(\'budgets\').select(\'user_id, default_limit\').eq(\'budget_type\', \'income\')` en dan `Number(b.default_limit) || 0` optellen. Er zit GEEN interval-conversie in — een jaarbudget van €60.000 en een maandbudget van €5.000 zijn economisch gelijk maar tellen hier als 60.000 tegen 5.000, een factor 12. Evenmin een parent/kind-oprol (een parent met kinderen telt zowel zijn eigen kop als zijn kinderen mee) en geen is_archived/merged_into-filter. De canonieke conversie bestaat al: `annualAmount` in lib/budget-utils.ts, en sinds ADR 0103 doet `computeBudgetBasis` (lib/budget-basis.ts) precies deze som wél goed. Gevolg: bij twee partners met verschillend ingestelde budget-intervallen krijgt de verkeerde partner het grootste aandeel, en dat aandeel weegt de losse-cash-optelling (lib/unlinked-cash.ts, ADR 0101) en de gedeelde-item-weging. Vandaag inert — nul huishoudens op productie (gemeten 11-8-2026) — maar dat venster sluit bij het eerste tweede huishoudlid. NIET opgelost in de ADR 0103-snede: het raakt de huishoudsplitsing, niet de cashflow-grondslag, en verdient een eigen besluit over of de verhouding überhaupt op budgetten hoort te staan (de code zelf noemt "de cashflow-fase standaardiseert dit later op transactie-inkomen"). Verwijder dit punt zodra die som via annualAmount/computeBudgetBasis loopt of op transactie-inkomen staat.',
    severity: 'risk',
    elementIds: ['as-budget', 'fn-budgetteren', 't-supabase'],
    reviewedAt: '2026-08-11',
  },
  {
    id: 'budget-kind-oprol-interval-mismatch',
    title: 'De budget-KPI rolt kinderen op met het interval van de PARENT',
    detail:
      'lib/cashflow-kpis.ts#deriveBudgetTotals (r196-212) bepaalt de maandlimiet per budget-type door de kinder-limieten RAUW op te tellen en die som daarna te normaliseren met het interval van de PARENT (`monthly` ×1, `quarterly` ÷3, alles anders ÷12). Elk kind met een ander interval dan zijn ouder komt daardoor verkeerd binnen: een MAANDkind van €300 onder een JAARouder telt als €25/mnd — 12× te laag; andersom telt een jaarkind onder een maandouder 12× te hoog. `budgets.interval` staat monthly/quarterly/yearly expliciet toe (CHECK-constraint), dus dit is bereikbaar gebruikersgedrag. Dezelfde fout-klasse als de gedupliceerde jaarconversie die `annualAmount` (lib/budget-utils.ts) ooit opruimde, één laag hoger. De correcte vorm staat in `computeYearlyMustExpenses` (elk kind met zijn eigen interval, terugval het parent-interval) en sinds ADR 0103 ook in `computeBudgetBasis` (lib/budget-basis.ts) — die laatste kopieert deriveBudgetTotals expliciet NIET, met een test die het verschil vastlegt. BEWUST NIET samengevoegd: deriveBudgetTotals beantwoordt een ándere vraag (budgetdekking déze maand) en voedt de Budget-KPI + budgetScore op /overzicht en /overzicht/cashflow; hem "repareren" verschuift die twee zichtbare getallen en hoort een eigen besluit te zijn. LET OP — dit punt gaat ALLEEN nog over de LIMIET-kant. De spent-pass van deriveBudgetTotals stond hier tot 30 aug 2026 beschreven als "bewust transfer-ONgefilterd"; dat gold niet meer zodra de referentie-schermen op de canonieke som gingen, en sinds 31 aug 2026 loopt die pass door `buildBudgetSpendingMap` (getekend, transfers eruit, richting per budget). OOK DE LIMIET-KANT IS PER 31 AUG 2026 DEELS GECONVERGEERD, en wat overblijft is scherper geworden: de PER-BUDGET limiet komt nu uit de canonieke `computeEffectiveLimit` (periode-override uit budget_amounts + rollover-carry uit budget_rollovers) via `createEffectiveLimitLookup` — in `deriveBudgetTotals`, in `monthlyLimitFor` (favorieten + topBudgets in lib/dashboard-data-loader.ts) en in de heatmap-beschikbaar-map tegelijk, zodat kaart, widget en budgetten-pagina dezelfde limiet dragen. Dit punt gaat daarmee nog uitsluitend over de INTERVAL-normalisatie erbovenop, plus een tweede, kleinere divergentie die daar bij hoort: een onbekend/NULL `interval` telt in `deriveBudgetTotals` als JAARbedrag (÷12, gelijk aan `annualAmount`) maar in `monthlyLimitFor` als MAANDbedrag (×1) — vandaag onbereikbaar via de CHECK-constraint, maar wel een echte tweede lezing van dezelfde kolom. Gevolg zolang het blijft staan: de budget-limiet-KPI en de budget-grondslag van de cashflow-kaarten kunnen voor dezelfde budgetten een ander bedrag noemen. Verwijder dit punt zodra deriveBudgetTotals de kind-oprol via annualAmount doet, met één gedeelde interval-terugval (met een eigen besluit over de verschoven KPI).',
    severity: 'debt',
    elementIds: ['as-budget', 'fn-budgetteren'],
    reviewedAt: '2026-08-11',
  },
  {
    id: 'essentiele-uitgaven-zonder-huishoud-deelfractie',
    title: 'De essentiële jaaruitgaven wegen een GEDEELD budget op 100%',
    detail:
      'lib/budget-utils.ts#computeYearlyMustExpenses (r83-102) sommeert de essentiële budgetrijen zoals `getBudgets` ze aanlevert, zonder huishoud-deelfractie. De SELECT-policy op `budgets` is `auth.uid() = user_id OR (ownership = \'shared\' AND household_id = user_household_id())`, dus die lijst bevat ook de als `shared` gemarkeerde budgetten van de partner — en die tellen hier voor 100% mee bij BEIDE partners. Bij een gedeeld essentieel budget van €1.000/mnd rekenen twee partners samen dus €24.000/jaar aan must-expenses waar het er €12.000 zijn. Dat voedt `yearlyMustExpenses` en daarmee het FIRE-doel: het doelvermogen komt te hoog uit en de FIRE-datum te laat. Sinds ADR 0103 doet de zusterberekening het wél goed: `lib/household/budget-share.ts` past `shareFractionFor` (lib/budget-perspective.ts) toe op kindniveau voor de inkomsten-/uitgavengrondslag, met fail-closed 50% en een fast path zonder extra query. BEWUST NIET meegenomen in de ADR 0103-snede: dit is een andere metriek (essentiële jaaruitgaven voor het FIRE-doel, niet de cashflow-grondslag), en meeveranderen zou de FIRE-datum van huishoudens verschuiven om een reden die los staat van de grondslagkeuze — dat hoort een eigen, aantoonbaar besluit te zijn. Vandaag inert zolang er geen huishoudens met gedeelde essentiële budgetten zijn (nul huishoudens op productie, gemeten 11-8-2026); dat venster sluit bij het eerste tweede huishoudlid. Verwijder dit punt zodra computeYearlyMustExpenses de deelfractie via shareFractionFor toepast.',
    severity: 'risk',
    elementIds: ['as-budget', 'as-planning', 'fn-budgetteren'],
    reviewedAt: '2026-08-11',
  },
  {
    id: 'volledige-profielrij-naar-de-client',
    title: 'De hele profiles-rij serialiseert naar de browser in kernel-snapshots',
    detail:
      'Server-gebouwde kernel-snapshots dragen `rawContext.profile` = de VOLLEDIGE `profiles`-rij: `getOwnProfile` doet `select(\'*\')` (lib/server-data/base.ts) en die rij wordt gespread in lib/horizon-data-loader.ts. De kernel gebruikt daar ~25 velden van (buildConvergentieAdapterProfile); de rest is dode payload — waaronder `full_name`, `marketplace_display_name`, `financial_context` (vrije tekst over de situatie van de gebruiker), `briefing_snapshot`, `role`, `commercial_tier` en `gross_annual_income`. Geen cross-user-lek (één own-row RLS-policy, live geverifieerd 2026-08-05) en géén nieuwe klasse: dit loopt al via `RegelSimSnapshot.rawContext` naar /toekomst/voorkeuren. Sinds aug 2026 komt er een tweede kanaal bij: GET /api/belasting/varianten-sweep. Waarom het telt: identiteit plus vrije-tekst-context worden opvraagbaar in één authenticated GET-URL — zichtbaar in een HAR-dump in een supportticket, in een toekomstige client-side error-reporter die fetch-bodies meepakt, of voor XSS elders in de app die dan één URL hoeft te raken. De gate `check:client-reads` ziet dit pad niet (die scant client-bestanden, geen server-gebouwde props). Fix hoort NIET per route maar als gedeelde `PROFILE_KERNEL_COLUMNS`-kolomlijst in de geest van ASSET_CLIENT_COLUMNS, toegepast op de profiel-bron; dat dicht beide kanalen tegelijk. Verwijder dit punt zodra die kolomlijst bestaat en beide snapshots erop draaien.',
    severity: 'debt',
    elementIds: ['as-planning', 'as-belasting', 't-supabase'],
    reviewedAt: '2026-08-05',
  },
  {
    id: 'schema-drift-buiten-migraties',
    title: 'Schema-elementen op productie die in geen enkele migratie staan',
    detail:
      'Bij het schrijven van 20260805120000 (band op de markt-aannames) bleken drie live schema-feiten nergens in supabase/migrations/ voor te komen: de CHECK-constraints `profiles_expected_return_check` (0,01–0,15) en `profiles_inflation_rate_check` (0–0,08), en de signup-trigger `on_auth_user_created` → `public.handle_new_user()` (die bij elke aanmelding een kale profielrij inserteert). Daarbovenop zeggen de repo-bestanden `expected_return NUMERIC DEFAULT 7` waar live `0.07` staat — een percentage waar een fractie hoort. Dat is out-of-band DDL zonder spiegel-migratie: ADR 0045 besluit 4 verbiedt dat, maar niets vangt het. Concreet risico: een ontwerp of review dat op de migratiemap steunt, redeneert op een schema dat niet bestaat — precies wat hier gebeurde (de eerste opzet van die migratie zou een dubbele constraint hebben toegevoegd en de defaults van élke nieuwe aanmelding hebben gekanteld). 20260805120000 codificeert de twee constraints en de defaults alsnog; de trigger niet. Losstaand: een schone `supabase db reset` uit deze repo faalt al op 20260611130000, dat `revoke execute on function public.handle_new_user()` doet terwijl geen enkele migratie die functie aanmaakt — er redeneren dus migraties over reset-veiligheid die niemand kan uitoefenen. Verwijder dit punt zodra de trigger is gecodificeerd, de reset-route werkt en er een terugkerende drift-check bestaat (schema-diff live vs. repo).',
    severity: 'debt',
    elementIds: ['t-supabase'],
    reviewedAt: '2026-08-05',
  },
  {
    id: 'bruto-box1-grondslag-meervoudig',
    title: 'Het bruto Box 1-inkomen wordt nog op drie manieren afgeleid',
    detail:
      'ADR 0086 maakte `resolveBox1GrossIncome` (handmatige override + schijfinversie) de canonieke bruto-Box 1-waarde voor hub, box1-subpagina en optimizer. Twee afleidingen staan daar nog naast: `box1JaarruimteStatus` (netto/(1−marginaal), bewust behouden als goedkope status-heuristiek voor de sidebar-dot, die sync moet blijven omdat hij in het shell-pad van élke route hangt) en `estimateGrossYearly` in lib/jaarruimte-facts.ts (fixed-point, voedt de cloud- én lokale Fin-context). Bekend gevolg: bij income_source=auto kan de dot rond de grens jaarruimte=0 van de kaart verschillen. Tweede, losse kant van hetzelfde punt: `resolveBox1GrossIncome` leest de override PAS ná de dure schatting, en trekt daarvoor `loadCoreData` (~18 queries) binnen voor één scalar — dat kost de belasting-hub ~20 extra queries per bezoek (op de AI-paden is loadCoreData al gecached, dus daar valt het mee). Twee opvolgacties: override-first met lazy estimate, en een smalle `loadEstimatedNetYearly` naast loadCashflowSettingsData. Verwijder dit punt zodra de drie afleidingen één bron delen én de zware koppeling weg is.',
    severity: 'debt',
    elementIds: ['as-belasting'],
    reviewedAt: '2026-08-05',
  },
  {
    id: 'box1-eigenwoning-invoer-fin',
    title: 'Fin rekent de Box 1-heffing nog zónder eigen woning',
    detail:
      'Restant van bevinding C8. `computeBox1Tax` is één motor, maar hij werd op drie plekken met VERSCHILLENDE invoer gevoed: de Box 1-subpagina gaf wozValue/hypotheekRente mee, de kansen-loader (hub + optimizer + aandachtspunten) niet, en lib/ai/context/tax-context.ts ook niet. De eerste twee delen sinds 26-08-2026 `resolveEigenWoningBox1Input` (lib/box1-income.ts) en zijn A=B; de AI-context staat er nog náást, dus wie Fin naar zijn Box 1-heffing vraagt kan een ander bedrag horen dan het scherm toont (richting hangt aan de hypotheek: te hoog bij rente > forfait, te laag bij een afgeloste hypotheek onder Wet Hillen). Bewust apart getrokken omdat datzelfde bestand óók nog op de derde bruto-afleiding zit (`estimateGrossYearly`, zie het punt hierboven) — één ingreep die beide invoerhelften gelijktrekt is goedkoper dan twee. Bron-grendel op de twee gefixte oppervlakken: lib/box1-income.eigen-woning.test.ts. Verwijder dit punt zodra tax-context.ts dezelfde resolutie consumeert.',
    severity: 'debt',
    elementIds: ['as-belasting'],
    reviewedAt: '2026-08-26',
  },
  {
    id: 'gedeelde-bezitting-ongewogen',
    title: 'Gedeelde bezitting telt bij béíde partners voor 100%',
    detail:
      'Opvolger van "gedeelde bankrekening telt dubbel" (11-8-2026 opgelost: de losse-cash-optelling weegt sinds ADR 0101 op households.split_mode, lib/unlinked-cash.ts). De ANDERE helft staat nog open: net_worth_inclusion_pct op assets/debts is géén huishoudsplitsing maar een handmatige 0-100-schuif met default 100, volledig los van ownership. Een bezitting op "gedeeld" zetten zet die schuif niet op 50, dus een gedeelde bezitting telt in het netto vermogen van béíde partners voor het volle bedrag — op huishoudniveau 200%. De wortelfix is expliciet huishoud-eigenaarschap (één rij, één eigenaar, verdeling afgeleid uit split_mode) en is vandaag gratis: nul huishoudens, nul gedeelde bezittingen op productie (gemeten 11-8-2026). Dat venster sluit bij het eerste tweede huishoudlid — een gebruikersactie, geen release. Zie ADR 0101. Reikwijdte-update 26-8-2026: hetzelfde ongewogen pad (volle WOZ bij beide partners) landt sinds de gedeelde eigenwoning-lookup resolveEigenWoningBox1Input (lib/box1-income.ts, kaart C8) ook op de belasting-hub, de optimizer en de aandachtspunten — voorheen alleen de Box 1-subpagina.',
    severity: 'debt',
    elementIds: ['as-vermogen', 'fn-vermogensregistratie', 't-supabase'],
    reviewedAt: '2026-08-26',
  },
  {
    id: 'checkin-snapshot-assets-own-row',
    title: 'Check-in en snapshots lezen assets/debts nog own-row',
    detail:
      'De SELECT-policies op assets en debts zijn huishoud-verbreed (eigen rijen OF ownership=shared binnen het huishouden) en het dashboard leunt daarop (lib/server-data/base.ts filtert niet op user_id). /api/checkin/overview, /api/checkin/gespreksstarters en de drie snapshot-schrijfpaden zetten er nog wél een .eq(user_id) overheen en tellen gedeelde bezittingen/schulden van de partner dus niet mee — een restdrift met de dashboard-grondslag. De losse bankrekening-cash in diezelfde routes is 2026-07-31 al wél gelijkgetrokken (lib/unlinked-cash.ts); assets/debts bleven bewust buiten die slice omdat het de opgeslagen snapshot-historie van betekenis verandert en dus een eigen eigenaarsbesluit vraagt.',
    severity: 'debt',
    elementIds: ['as-vermogen', 'fn-vermogensregistratie'],
    reviewedAt: '2026-07-31',
  },
  {
    id: 'legacy-backing-routes',
    title: 'Legacy backing-routes blijven leven',
    detail:
      'De canonieke navigatie is /overzicht · /toekomst · /mijn, maar /core · /horizon · /dashboard bestaan nog als backing-routes. Bewust, maar dubbele paden vergroten de kans op drift.',
    severity: 'info',
    elementIds: ['app-comp'],
    reviewedAt: '2026-07-21',
  },
  {
    id: 'horizon-god-component',
    title: 'horizon-client.tsx is een god-component',
    detail:
      'Eén client van 8800 regels (wc -l, 2026-08-08 — na de euro-weergave-render-grens van ADR 0093) draagt /toekomst zonder eigen tests. Decompositie loopt (stap 1 HorizonTrendGrid klaar); tot dan is dit het grootste wijzigingsrisico van de app.',
    severity: 'debt',
    elementIds: ['fn-toekomstplannen', 'as-planning'],
    reviewedAt: '2026-08-08',
  },
  {
    id: 'projectiemotoren-naast-de-kernel',
    title: 'Eigen projectiemotoren náást de horizon-kernel, buiten de euro-weergave-toggle',
    detail:
      'De euro-weergave-toggle (ADR 0093) volgt de kernel: alleen oppervlakken met een kernelrij onder zich (UnifiedProjectionRow.inflationFactor) kunnen meebewegen tussen nominaal en huidige euro\'s. Vier oppervlakken draaien een EIGEN projectiemotor náást de kernel en hebben dus geen canonieke factor — ze zijn `// euro-view: exempt` gemarkeerd, niet gedeflateerd: `components/core/net-worth-projection-chart.tsx` (eigen compound-projectie), `components/overview/compound-insight-card.tsx` + `fee-impact-card.tsx` (lib/compound-projection.ts, illustratief rekenvoorbeeld met slider) en — het vierde geval, niet voorzien in het oorspronkelijke ontwerp — de aanvullend-pensioenprojectie achter `DashboardData.pensionMonthlyGross` in `components/widgets/pensioen-aow-widget.tsx`. Dit is een structurele klasse, geen losse voetnoten: elke motor náást de kernel is een toekomstige plek waar "€ vandaag" en "€ toekomstig" impliciet door elkaar kunnen lopen zodra iemand er zonder dit punt te lezen een tweede weergave aan toevoegt. Opvolging is een rekenmotor-sanering (aparte productkaart), geen presentatiewerk — vermeng de twee soorten besluiten niet. Verwijder dit punt zodra die sanering deze vier motoren onder de kernel brengt of ze expliciet en blijvend als losstaand besluit.',
    severity: 'debt',
    elementIds: ['as-planning', 'as-vermogen', 'fn-toekomstplannen'],
    reviewedAt: '2026-08-08',
  },
  {
    id: 'simchart-grondslag-per-reeks',
    title: 'SimChart-reeksen declareren hun grondslag niet — overlays kunnen naast een J-hoofdlijn op I blijven staan',
    detail:
      'Sinds ADR 0114 kan de primaire lijn van de Toekomst-grafiek per woonstrategie van grondslag wisselen: bij "Uitsluiten" tekent `buildSimChartGeometry` haar uit `liquidPoints` (Prognose!J) in plaats van uit `rows` (Prognose!I). Die naad is netjes op één plek geregeld (`allPts`) en de vier reeksen die de kaart raakte schakelen mee: de tweede lijn (rolomkering), de twee FIRE-drempels (`showExclTargetLine`/`showInclTargetLine` in chart-static-layers.tsx) en de Monte-Carlo-band (`bandLiquide` uit wrappers/mc.ts). Wat NIET meeschakelt zijn de overige overlay-reeksen op dezelfde Y-as: `scenarioOverlays` (wat-als en het stop-pad via lib/horizon/doel-lijn-bron.ts), `baselineRows` (de ghost-lijn) en `householdOverlays` mappen alle `SimRow.endPortfolio` en staan dus onvoorwaardelijk op I. Vandaag inert: `doel-lijn-bron.ts` typt `rows: SimRow[]`, de huishoud-/partnerlijnen zetten `primaryBasis` per D6 terug op \'total\', en de wat-als-overlay is op /toekomst niet tegelijk met de J-hoofdlijn in beeld gebracht. Het venster sluit zodra iemand een wat-als- of doel-overlay bij "Uitsluiten" aanzet: dan ligt een I-lijn naast een J-hoofdlijn op één as, zonder dat iets dat tegenhoudt — precies de grondslagvermenging die CLAUDE.md verbiedt, en zonder de doellijn-guard die de drempels wél hebben. STRUCTURELE OPLOSSING (D7): elke reeks die `SimChart` binnenkomt declareert haar eigen grondslag, zodat de geometrie een reeks met een andere grondslag dan de primaire lijn kan weigeren of omzetten in plaats van \'m stilzwijgend te tekenen. Dat vraagt dat de overlay-bronnen op `UnifiedProjectionRow` gaan (waar `nettoLiquide` bestaat) i.p.v. op `SimRow` — de runs dragen die rijen al. Verwijder dit punt zodra `ScenarioOverlay`/`HouseholdPartnerOverlay` een grondslag-veld dragen en `buildSimChartGeometry` daarop afdwingt.',
    severity: 'risk',
    elementIds: ['as-planning', 'as-vermogen', 'app-comp'],
    reviewedAt: '2026-08-29',
  },
  {
    id: 'kassabon-cumulatief-buiten-euro-weergave',
    title: 'Fase-kassabons blijven altijd nominaal — geen "koopkracht van vandaag"-variant',
    detail:
      'De drie fase-modal-kassabons (opbouw/overgang/onttrekking) dragen elk een waterval-optelidentiteit over meerdere jaren (start + inleg + rendement − Box 3 + events ≈ eind). Die identiteit is klasse C (cumulatief) en heeft geen canonieke per-jaar-deflator: per term deflateren zou de sluitende som breken en het verschil in de afrondingsrij laten vallen (ADR 0093, D2). Besluit: het hele blok blijft nominaal, met in \'real\' één zichtbare grondslag-regel — geen bedrag verandert. Dat is een bewuste beperking, geen bug: een gebruiker die de kassabon in koopkracht van vandaag wil lezen, kan dat nu niet. Opvolging is een aparte productkaart ("kassabon in koopkracht van vandaag", ADR 0093 verworpen alternatief B) die een expliciet nieuw begrip (een aparte koopkracht-effect-regel) introduceert in plaats van de bestaande toggle te forceren. Verwijder dit punt zodra die kaart landt.',
    severity: 'debt',
    elementIds: ['fn-toekomstplannen', 'as-planning'],
    reviewedAt: '2026-08-08',
  },
  {
    id: 'chart-event-marker-label-maskeringslek',
    title: 'Event-marker aria-labels kunnen bedragen onder maskering lekken',
    detail:
      'De bedragmaskering op de vrijheidsgrafiek (ADR 0091/0093) dekt alle euro-labels van sim-chart.tsx en chart-static-layers.tsx zelf, inclusief hun title/aria-label. `components/app/horizon/chart-event-markers.tsx` zet echter `aria-label={`Open ${p.label}`}` met een label dat van de AANROEPER komt (`ChartEventOverlay.label`); dat component weet zelf niet of de string een bedrag bevat. Zet een caller ooit een euro-bedrag in een event-label, dan lekt dat door de maskering heen zonder dat sim-chart of chart-static-layers het kunnen zien. Vandaag geen bekende callsite die dat doet — dit is een structurele opening, geen actief lek. Verwijder dit punt zodra chart-event-markers een `masked`-parameter accepteert (of alle bestaande/toekomstige callers aantoonbaar nooit een bedrag in het label zetten, vastgelegd in een test).',
    severity: 'debt',
    elementIds: ['as-planning', 'fn-toekomstplannen'],
    reviewedAt: '2026-08-08',
  },
  {
    id: 'public-intake-write',
    title: 'Eerste publieke service-role-schrijfpad',
    detail:
      'De Vrijheidscheck-funnel laat een anonieme bezoeker (geen auth.uid()) server-side wegschrijven naar lead_intakes — het eerste publieke schrijfpad dat via de service-role RLS omzeilt. De vangrails (zod + payload-grens + IP-rate-limit + Turnstile, fail-closed) zijn ontworpen en security gaf een voorwaardelijke GO, maar de migratie/secrets zijn nog niet uitgerold. Tot de hardening getest én gedeployed is, blijft dit het scherpste structurele risico. Verwijder dit punt zodra deploy + GO rond zijn.',
    severity: 'risk',
    elementIds: ['as-vrijheidscheck', 't-supabase', 'do-lead'],
    reviewedAt: '2026-07-03',
  },
  {
    id: 'migration-drift',
    title: 'Supabase migratie-drift',
    detail:
      'De lokale supabase/migrations-map loopt niet gelijk met remote. DDL via apply_migration; check kolommen/functies vóór je erop bouwt, anders bouw je op een schema dat remote niet bestaat. Sinds 04-08-2026 weten we dat de drift ook de ANDERE kant op werkt en dan stil is: de perf-consolidatie van 19-07 dropte de FOR ALL-policies op assets, debts, recurring_transactions, goals en net_worth_snapshots en zette alleen een SELECT terug, terwijl de granulaire schrijf-policies alleen remote bestonden. Een verse db reset of preview-branch leverde dus read-only tabellen op — nergens zichtbaar, want de omgeving waar het wél werkt is precies de omgeving waar we niet resetten. Die vijf zijn hersteld (20260804101500), maar er is nog steeds geen automatische vergelijking van pg_policies tegen de migratieketen; de volgende drift wordt op dezelfde manier pas ontdekt als iemand toevallig reset. Diezelfde dag bleek de drift ook op FOREIGN KEYS te zitten en daar gevaarlijker te zijn: transactions.account_id en recurring_transactions.account_id staan in create_base_tables op ON DELETE SET NULL, maar op productie op ON DELETE CASCADE met een NOT NULL-kolom. Een RI-cascade omzeilt RLS volledig, dus een verwijdering die op de repo-lezing veilig lijkt vernietigt op prod ook rijen van de partner. Les: controleer een ON DELETE-actie tegen pg_constraint, nooit tegen het migratiebestand. Die twee FKs zijn inmiddels gecodificeerd (20260804110000, no-op op prod, herstel op een verse database) en de guard in delete_bank_account telt sindsdien buiten RLS via de SECURITY DEFINER-helper count_foreign_rows_on_bank_account. Wat NIET is opgelost — en de reden dat dit punt blijft staan — is het detectiegat zelf: er is nog steeds geen automatische vergelijking van pg_policies EN pg_constraint tegen de migratieketen, dus de volgende drift wordt weer pas gevonden doordat iemand er toevallig op stuit.',
    severity: 'risk',
    elementIds: ['t-supabase', 'data-cont'],
    reviewedAt: '2026-08-04',
  },
  {
    id: 'horizon-kernel-bekende-afwijkingen',
    title: 'Horizon-kernel: zes bekende, bewuste grenzen/afwijkingen t.o.v. het Excel-oracle',
    detail:
      'Zes structurele kanttekeningen bij de horizon-kernel (ADR 0032), geen bugs maar wel aandachtspunten. (1) B93 reached_now-quirk: bij een doelbedrag van €0 (legacy-nalatenschap €0, deplete zonder expliciet doel, én de pensioen-eindstrategie — B36 is daar per definitie 0) geeft het solver-statusblok altijd status reached_now zodra Prognose!J(0) ≥ 0 — letterlijke Excel-parity. De "nu al bereikt"-WEERGAVE is op beide consumer-paden afgedekt (bridge.ts#isKernelReachedNowDisplay sinds juli 2026; de scalar-router past sinds 2026-08-05 dezelfde regel toe nadat de benchmark-peer "nu al vrij" toonde op een mediaan-vermogen en pensioen-strategie-gebruikers via dit pad "Bereikt!" kregen): "nu al bereikt" alleen wanneer de bisectie ~ de startmaand vond, anders de echte gevonden FIRE-leeftijd. BIJGEWERKT 26-08-2026 (bevinding M6, gap-besluit V21 / ADR 0109): het restverschil — een reached_now-stand met gap < 0 (de verhulde horizon-parkeerstand) die alléén op het scalar-pad "Niet haalbaar" toonde terwijl de bridge fireReachable op true liet staan — is NIET langer alleen een weergaveverschil. Op het app-pad lost de KERN het nu op (zie punt 6). Wat open blijft: "fireAge ≥ eindleeftijd" (structureel ontsparen bij deplete, gap exact 0) toont op beide paden nog een concrete leeftijd — of dat "Niet haalbaar" hoort te zijn is een open weergave-besluit. Op het parity-/fixture-pad blijft de kern Excel-exact (docs/horizon-excel-oracle-plan.md §V12). (2) De scenario-band/Monte-Carlo-wrappers (lib/horizon-kernel/wrappers/band.ts, wrappers/mc.ts) leveren uitsluitend SCALAIRE uitkomsten per scenario (fireAge, netto-vermogen-bij-FIRE, netto-liquide-bij-eindleeftijd — de Sim!B/C/D-rij) — geen volledige per-jaar LedgerRow-achtige asset-/schuld-/onttrekkingsbreakdown per scenario. Een toekomstige UI die per-scenario samenstelling wil tonen (net als de hoofdgrafiek) vindt die breakdown niet; dat vereist een aparte volledige kernel-run per scenario. (3) Lege-surplus-doelpot-divergentie (gap-besluit V17, eigenaar 2026-07-03): staat de surplus-doelpot op €0, dan laat het Excel-oracle het maandspaar VERDAMPEN (Σgewicht=0 → inleg €0), terwijl de kernel via de bewuste degeneratie-fallback (toenameGewichten tak A) het spaargeld wél in de lege pot stort — bij het eigenaar-account het verschil tussen FIRE 59,58 (kernel) en 89,33 (Excel, zelfde invoer; end-to-end-verificatie scripts/horizon-oracle/*eigenaar-live*). De kernel-extensie is de gewenste semantiek; definitieve borging = Excel v6 fixen + fixtures herextraheren (eigenaar-actie); tot die tijd bewaken surplus-/withdrawal-evaporation-tests het kernel-gedrag en mag deze divergentie NIET "richting oracle" worden weggefixt zonder nieuw eigenaar-besluit. (4) Tekort-aflossing-uit-liquide (gap-besluit V19 / ADR 0033, eigenaar 2026-07-04, F6-bugfix): het Excel v5-oracle lost een tekort-lening alléén af uit de positieve maandkasstroom-surplus-tak — in de onttrekkingsfase 0 — waardoor een verkoop-transitie-lag-piek (eigenaar: €6.758 op leeftijd 75) 17 jaar met 5% rente compoundt terwijl er >€900k liquide náást staat. De kernel lost dit tekort voortaan (app-pad) maandelijks af uit de resterende liquide bezit-capaciteit (m−1-lag, onttrekking-waterval-volgorde, Σruw=0). Schakelbaar via KernelInput.tekortAflossingUitLiquide: app-pad AAN, parity-/fixture-pad UIT (input-from-fixture zet de vlag niet → 735 fixtures byte-groen). TRANSITIONEEL: borging = Excel v6 fixen + fixtures herextraheren; vangnet lib/horizon-kernel/tekort-aflossing-liquide.test.ts; niet "richting oracle" wegfixen zonder nieuw eigenaar-besluit. (5) AOW-basis-divergentie (gap-besluit V20 / ADR 0064, eigenaar 2026-07-29): het Excel v5-oracle rekent Auto-geb B21 op de 2025-basis €1.452 (alleenstaand) / €993 (samenwonend), terwijl de app de canonieke SVB-bedragen uit lib/constants.ts toont (€1.581,55 / €1.084,13 per 1-7-2026) — ~8% verschil. Opgelost als INJECTIE, niet als gelijktrekking: KernelInput.autoGebeurtenissen.aowBasisPerMaand is optioneel en inert-by-default (weggelaten → oracle-fallback in tables/auto-gebeurtenissen.ts; input-from-fixture zet het veld níet → fixtures byte-groen), en de app-adapter injecteert APP_AOW_BASIS_PER_MAAND (= de constants). Partner-AOW (PT!B9) volgt dezelfde grondslag. Gevolg: het app-pad rekent bewust met een hogere AOW dan het oracle; die divergentie blijft bestaan tot Excel v6 dezelfde basis draagt en de fixtures heréxtraheerd zijn. Vangnet lib/horizon-kernel/aow-basis-injectie.test.ts; oracle-fallback niet wijzigen zonder fixture-herijking + nieuw eigenaar-besluit. (6) Onmogelijke FIRE-uitkomsten uit B93 (gap-besluit V21 / ADR 0109, eigenaar 26-08-2026, bevinding M6): het Excel-statusblok toetst `Prognose!J(0) ≥ B36` VÓÓR `B38 < 0`. Bij B36 = 0 (deplete/pensioen/legacy-0) is die toets triviaal waar en maskeert hij de horizon-PARKEERSTAND (B16 = 100, gap < 0); bij perpetual wordt B36 zelfs negatief (J@FIRE < 0) en valt de gap op fireAge = 100 per constructie exact 0, zodat de horizon-check niet ingrijpt. bridge.ts leidde daaruit fireReachable = true + fireAgeFractional = 100 af — /toekomst toonde "VRIJHEIDSLEEFTIJD 100,0 jaar" en "DOELBEDRAG €−11.328.971 benodigd" als hard feit. Opgelost met KernelInput.reachedNowVereistBereikbaarDoel (optioneel, inert-by-default): reached_now mag niet vallen op B36 < 0 of B38 < 0 ⇒ unreachable_within_horizon. App-pad AAN (adapter), parity-/fixture-pad UIT (input-from-fixture zet de vlag niet → fixtures byte-groen, géén herijking). De bridge markeert bovendien de eind-horizon-terugval expliciet (requiredFireIsEndOfHorizonFallback) i.p.v. de geprojecteerde eindstand stil als "benodigd vermogen" door te geven. Tweede verdedigingslinie in de weergave: lib/horizon/outcome-guard.ts (leeftijd ≥ horizonplafond — alias van kernel MAX_AGE, geen tweede getal — of doelbedrag ≤ 0/terugval ⇒ "We missen gegevens"), geconsumeerd op /toekomst (KPI-tegels, kassabonnen, sim-widget, grafiek-uitleg) én /overzicht (Vrijheid-strip, mini-vermogensgrafiek via fireAgeForDisplay). Vangnet lib/horizon-kernel/onmogelijke-uitkomst.test.ts + lib/horizon/outcome-guard.test.ts; de kern-scoping niet "richting oracle" wegfixen zonder nieuw eigenaar-besluit.',
    severity: 'debt',
    elementIds: ['as-planning', 'fn-toekomstplannen'],
    reviewedAt: '2026-08-27',
  },
  {
    id: 'hypotheek-koppeling-bepaalt-j-grondslag',
    title: 'Een ongekoppelde hypotheek houdt het besteedbare FIRE-vermogen te hoog',
    detail:
      'Bij een niet-meetellen-woonstrategie knipt de kernel het eigen-woningblok uit het besteedbare vermogen: Prognose!J = I − (L − M), waarbij L de niet-liquide BEZITTINGEN zijn (categorie "Eigen huis") en M de niet-liquide SCHULDEN (categorie "Woning"). Die M telt dus weer bíj — terecht voor een eigenwoninghypotheek, want het huis zit ook niet in J. De categorie is daarmee een LIQUIDITEITS-as, geen fiscale as. Sinds 2026-08-05 haalt lib/horizon-kernel/adapter/potten.ts#isNietEigenWoningHypotheek een hypotheek die EXPLICIET (linked_asset_id) aan een bekende, actieve, niet-eigen_huis-asset hangt uit "Woning" → "Overig"; daarvóór telde een beleggingshypotheek op een verhuurd pand mee in M terwijl het pand zelf (categorie "Vastgoed") gewoon liquide in J bleef, wat de besteedbare pot met het volle hypotheeksaldo overschatte (op de regressiepersona €110k → FIRE te vroeg, doelbedrag te laag). WAT OPEN BLIJFT, bewust: (a) een ONGELINKTE verhuurpand-hypotheek blijft "Woning" en houdt J daar nog steeds te hoog. Dat is een gekozen asymmetrie, geen omissie — bij twee echte gebruikers hangt een EIGEN-woninghypotheek zonder koppeling in de data, en die op "Overig" zetten zou J juist ONDERschatten (FIRE te laat). Zonder koppeling kan de adapter de twee gevallen niet onderscheiden; classifyDebt (box3-data.ts) helpt niet, want dat is de fiscale as en die zet een ongelinkte hypotheek in box 3. (b) Spiegelbeeld: een ACTIEVE hypotheek gelinkt aan een INACTIEVE asset valt buiten activeAssetIds en blijft dus "Woning" — de schuld telt terug in J terwijl het pand (inactief) er niet in zit. Ook hier conservatief gekozen: liever J te hoog dan een schuld die nergens landt. Uitweg voor beide is dezelfde en ligt NIET in de rekenkern maar in de invoer: een UI-nudge die gebruikers hun hypotheek aan het bijbehorende bezit laat koppelen (en die een koppeling naar een inactief bezit signaleert). Verwijder dit punt zodra die nudge bestaat en de ongekoppelde hypotheken in de data zijn opgeruimd.',
    severity: 'risk',
    elementIds: ['as-planning', 'fn-toekomstplannen', 'as-vermogen'],
    reviewedAt: '2026-08-05',
  },
  {
    id: 'fire-historie-uit-een-andere-motor-dan-het-live-getal',
    title: 'De FIRE-trendlijn is met een andere motor geschreven dan het getal ernaast',
    detail:
      'Sinds H21 (27-08-2026, ADR 0107) komt élk LIVE vrijheidsgetal en élke live vrijheidsleeftijd uit de horizon-kernel — /overzicht-hero, gezondheidsgetal, widget-rail, /toekomst en beide Fins. De HISTORIE niet: `net_worth_snapshots.fire_age` en `.freedom_percentage` worden door app/api/snapshots{,/auto,/cron} nog steeds met de RAUWE scalar-lus (lib/horizon/fire-scalar.ts#computeFireProjection) geschreven — één blended reëel rendement, vlakke maandinleg, geen AOW, life-events, Box 3, aflossing, woonstrategie of per-asset-rendement. De trendlijn en het getal erboven meten dus niet hetzelfde. Er is BEWUST niet gebackfilld (eigenaar-besluit 26-08-2026): dat zou historie herschrijven met aannames die op die datum niet golden. Gevolg dat open blijft: zodra de snapshot-schrijvers wél naar de kernel gaan, krijgt de trendlijn een knik op de omslagdatum die niets met de gebruiker te maken heeft. Uitweg (nog niet genomen): een `engine_version`-kolom op net_worth_snapshots, zoals `score_version` bij de resilience-score, zodat de weergave de breuk kan benoemen in plaats van hem glad te strijken — `SnapshotForTrend.engine_bron` doet dit al voor de kernel-vlag maar wordt door dit pad niet gevuld. Verwijder dit punt zodra de snapshot-schrijvers op computeScalarFireProjection of de kernel zitten én de breuk in de weergave gemarkeerd is.',
    severity: 'debt',
    elementIds: ['as-planning', 'fn-toekomstplannen', 'as-vermogen'],
    reviewedAt: '2026-08-27',
  },
  {
    id: 'fire-run-perspectief-half-bedraad',
    title: 'De FIRE-run kent het huishoudperspectief, de uitgavenkant nog niet',
    detail:
      'ADR 0107 maakte de canonieke server-FIRE-run perspectief-bewust: `computeHorizonFireSim(supabase, perspective)` keyt zijn cache op het perspectief en voedt de kernel met `fireAssets`/`fireDebts` — de perspectief-rijen met het huishoud-aandeel toegepast. De VERMOGENS-kant is daarmee correct in de huishoud-/partnerblik. Drie dingen blijven bewust persoonlijk en horen bij de vervolgkaarten (M22/H6/H4): (1) de UITGAVEN-kant — `effectiveInput.monthlyExpenses` en `yearlyMustExpenses` komen uit de eigen transacties/budgetten, dus een huishoud-run deelt huishoudvermogen door persoonlijke uitgaven. Dat was óók de grondslag van de closed-form benadering die ADR 0107 verving, dus de scheefheid is geërfd, niet geïntroduceerd; ze is nu alleen exact in plaats van benaderd. (2) `loadDashboardData` (de widget-rail, briefing, deelbare vrijheidskaart) is in zijn geheel persoonlijk — mengen met een perspectief-FIRE-doel zou een huishoud-noemer onder een persoonlijke teller zetten, erger dan het huidige verschil. UITZONDERING sinds H4 (26 aug 2026): op /overzicht overschrijft `withCanonicalOverviewFigures` DRIE bundelvelden met de canonieke horizon-waarden — `healthScore`, `freedomPct` en `emergencyFund`. Dat mengt niets: het vervangt teller ÉN noemer in één keer door een intern consistent cijfer, precies zoals de hero en de kassabon erboven het al toonden. De onderliggende loader blijft persoonlijk; de noodfonds-pot is dat óók op het canonieke pad (hij leest de eigen assets-rijen, terwijl `totalAssets`/`totalDebts` in diezelfde bundel wél perspectief-correct zijn — een aparte kaart waard). (3) De /toekomst-CLIENT-run draait op de eigen asset-/schuldrijen (horizon-client#loadData haalt ze zelf op), dus /toekomst is end-to-end persoonlijk; /toekomst/page.tsx geeft daarom bewust géén perspectief mee, anders zou de server-hero huishoud zijn en de curve eronder persoonlijk. Zichtbaar gevolg: in de huishoudblik geeft /overzicht een huishoud-vrijheids-% en /toekomst een persoonlijk. Verwijder dit punt zodra de huishoud-uitgavengrondslag bestaat en /toekomst end-to-end op hetzelfde perspectief draait.',
    severity: 'debt',
    elementIds: ['as-planning', 'fn-toekomstplannen'],
    reviewedAt: '2026-08-27',
  },
  {
    id: 'fire-doel-zonder-preset-marker-blijft-statisch',
    title: 'Een zelfgemaakt FIRE-doel volgt de motor niet',
    detail:
      'Sinds bevinding C10 (26-08-2026) is het vrijheidsgetal-doel een LIVE tracker: `syncActiveGoalValues` vult huidige waarde, doelbedrag en verwachte datum uit de canonieke FIRE-motor (lib/goals/vrijheidsgetal-goal.ts + -source.ts), zodat /overzicht en /toekomst/doelen niet langer dertien jaar uiteen kunnen lopen. De discriminant is de preset-marker `metadata.standaardDoel === \'vrijheidsgetal\'`, die alléén de quick-add-kiezer wegschrijft — bewust, want gewone `net_worth`-doelen ("Eerste 10K belegd", "Erfenis structureren") mogen niet aan de FIRE-motor hangen. Wat OPEN blijft: een gebruiker die zijn FIRE-doel met de hand aanmaakt (Geavanceerd → GoalForm, of een doel van vóór de preset) krijgt géén marker en dus géén sync — die kaart toont nog steeds de ooit ingevoerde stand en streefdatum, precies het gedrag dat C10 aanwees. Zichtbaar is dat wel: de "Volgt automatisch je vrijheidsgetal"-regel ontbreekt dan. Uitwegen (geen van beide in de C10-snede genomen, want ze raken respectievelijk de invoer en een datamigratie): (a) GoalForm laat de gebruiker een doel expliciet als "mijn vrijheidsgetal" markeren, of (b) een eenmalige backfill die bestaande FIRE-achtige net_worth-doelen aanbiedt om te koppelen. Verwijder dit punt zodra een van beide bestaat.',
    severity: 'debt',
    elementIds: ['as-planning', 'fn-toekomstplannen'],
    reviewedAt: '2026-08-26',
  },
  {
    id: 'vermogenshistorie-persoonlijk-only',
    title: 'Vermogenshistorie-laag is persoonlijk-only',
    detail:
      'De "Netto vermogen — verloop"-uitsplitsing draait op balance_snapshots, en die tabel heeft (anders dan assets/debts) nog geen household-model — dus de per-groep-historie toont alleen het persoonlijke perspectief, terwijl de rest van Kern het huishoud-perspectief kan tonen. loadWealthGroupHistory is perspectief-agnostisch gebouwd (ownership-parameter aanwezig, nog niet vertakt), maar tot balance_snapshots een huishoud-eigenaarschap kent divergeert deze laag stil van het gedeelde perspectief. Verwijder dit punt zodra de household-variant (ownership: "all") is uitgerold. Zie ADR 0046.',
    severity: 'debt',
    elementIds: ['as-vermogen', 'fn-vermogensregistratie'],
    reviewedAt: '2026-07-17',
  },
  {
    id: 'signup-email-allowlist',
    title: 'Registratie-allowlist actief (besloten testfase)',
    detail:
      'Een Supabase auth-hook (signup_email_allowlist, ADR 0047) blokkeert registraties waarvan het e-mailadres niet op de allowlist staat — bedoeld om de app tijdens de besloten testfase gesloten te houden. Dit moet vóór publieke lancering weer uit, anders blijft de app onbereikbaar voor nieuwe gebruikers.',
    severity: 'debt',
    elementIds: ['t-supabase'],
    reviewedAt: '2026-07-17',
  },
  {
    id: 'fragiele-webgpu-lokaal-ai',
    title: 'Early-Preview-runtime in het lokale AI-pad',
    detail:
      'Sinds 19 jul 2026 vervangen: de oude Transformers.js/ONNX-fragiliteit (reproduceerbare unaligned accesses-crash, device-loss die het héle browser-GPU-proces vergiftigde tot een paginaherlaad — bevestigd in de L1-controlemeting, spikes/litert-lm/meetrapport-v1.md) is weg na de runtime-swap naar LiteRT-LM. Daarvoor in de plaats een kleiner, ander risico: `@litert-lm/core` 0.14.0 is Early Preview (API-breuk tussen versies mogelijk, daarom exact gepind, niet op een range), biedt geen sampling-controle op de web-SDK, en de Windows/NVIDIA-tak is minder getest dan de standaardpaden (kanarie: upstream-issue #2572). Windows-multi-GPU kiest bovendien de iGPU en negeert `powerPreference` (crbug 369219127) — geen runtime-bug maar een browserbeperking die de realistische performance bepaalt. Gemitigeerd met dezelfde bouwvoorwaarden als voorheen: review-UI-only, geen-cloud-fallback (fail-closed), automatisch sessieherstel (ADR 0043). Sinds ADR 0080 heeft de lokale nieuwseditie het derde gebruik van deze runtime — tot 20 losse generatie-calls per editie (twee tot vier minuten), dus het grootste geduldsbeslag tot nu toe op dezelfde fragiele fundering; een device-loss halverwege raakt hier maximaal één artikel dankzij de map-reduce-vorm, niet de hele editie. Sinds 4 aug 2026 hoort daar een scherper, ONZICHTBAAR risico bij: op mobiele GPU\'s (gemeten Adreno 7xx, upstream ook Adreno 830 en Xclipse 530 — LiteRT #8065 / LiteRT-LM #3012, alle open) rekent dezelfde runtime SNEL EN FOUT. Het toestel haalt WebGPU, shader-f16 én de buffergrens met gemak, draait 2,6 s per transactie, en levert 0% bruikbare uitvoer: meertalige token-soep. Geen enkele capability-vraag ziet dat, want het is geen capaciteits- maar een correctheidsfout (gewichten raken corrupt na de eerste compute-pass). Gemitigeerd met de uitvoer-toets (ADR 0081, lib/ai/local/output-proof.ts): drie proefgeneraties ná de download beslissen of dit apparaat toegelaten wordt, met een beheer-instelbare drempel. Verwijder of verzwak dit punt zodra LiteRT-LM JS uit Early Preview is, de Windows/NVIDIA-tak breder bewezen is én de mobiele correctheidsbug upstream gefixt is.',
    severity: 'debt',
    elementIds: ['t-lokale-ai', 'as-import', 'as-coach', 'as-nieuws'],
    reviewedAt: '2026-08-04',
  },
  {
    id: 'asset-bewerken-nog-client-direct',
    title: 'Bezitting AANMAKEN loopt via de route, BEWERKEN nog client-direct',
    detail:
      'Bevindingen H8/H9 legden bloot dat `components/core/assets-client.tsx` een bezitting schreef met een client-directe `supabase.from(\'assets\').insert()` — geen route, geen zod, en dus geen enkele validatielaag die je niet met een directe PostgREST-call kon overslaan (de RLS-policy op assets is eigen-rij maar KOLOM-onafhankelijk). Fase 1 (27-8-2026) verplaatste het AANMAAK-pad naar POST /api/assets met zod-validatie op de bedrag- en rendementsbanden uit lib/asset-parameter-bands.ts, met CHECK-constraints eronder (migratie 20260827140000). Het BEWERK-pad is bewust nog niet meegegaan: dat draagt twee na-ijlende schrijfacties (de valuations-upsert en de balance_snapshots-spiegel bij een gewijzigde waarde) plus de "0 rijen geraakt = niet jouw bezitting"-detectie die ADR 0082\'s valse succesmelding dichtzet. Zolang die PATCH er niet is, kan een bestaande bezitting nog steeds buiten elke applicatieband om bijgewerkt worden — de DB-constraints vangen dan het onmogelijke af, de per-type rendementsband niet. Tweede, zwaardere gevolg (securityreview 27-8-2026): het bewerk-pad schrijft `household_id` uit CLIENT-state, en de UPDATE-policy op assets is USING-only (`auth.uid() = user_id`) zonder controle DAT dat huishouden het eigen huishouden is. Een gebruiker kan op zijn eigen rij dus een willekeurig `household_id` zetten en die bezitting via de huishoud-verbrede SELECT-policy laten verschijnen bij een huishouden waar hij geen lid van is. Geen cross-user LEK (het blijft zijn eigen data), wel een integriteitsgat — POST /api/assets leest `household_id` sinds fase 1 wél server-side uit household_members. Verwijder dit punt zodra PATCH /api/assets bestaat, de client zijn update-tak erop draait, en household_id ook daar server-bepaald is.',
    severity: 'debt',
    elementIds: ['as-vermogen', 'fn-vermogensregistratie'],
    reviewedAt: '2026-08-27',
  },
  {
    id: 'budget-plan-route-zonder-zod',
    title: 'Budget-schrijfpaden: plan-route zonder zod, nu met tweede consument',
    detail:
      'Budget-aanmaken loopt via drie schrijfpaden — de client-directe budget-form.tsx (grandfathered), POST /api/budgets/plan (RPC save_budget_plan) en POST /api/budgetteren/setup (seed). Sinds de +-knop in sleepmodus (buildCreateBudgetDiff in lib/budget-plan-diff.ts) heeft de plan-route een tweede consument, terwijl de body nog niet met zod/parseBody gevalideerd wordt — alleen een handmatige array-check. Uitweg: zod-schema dat de BudgetPlanDiff-vorm exact spiegelt, retrofit op de route.',
    severity: 'debt',
    elementIds: ['as-budget', 'fn-budgetteren'],
    reviewedAt: '2026-07-29',
  },
  {
    id: 'maand-cashflow-grondslag-duplicaten',
    title: 'Check-in telt zijn eigen "deze maand" zonder transfer-filter',
    detail:
      'DashboardData draagt sinds ADR 0073 currentMonthIncome/currentMonthExpenses (gerealiseerde kalendermaand uit het tx-aggregaat) náást het effective monthlyIncome/monthlyExpenses (waar income_source=\'manual\' de profielinschatting laat winnen). Drie oppervlakken presenteerden de effective waarden als "deze maand"; twee zijn weg. De Transacties-kaart is op 30 jul 2026 omgezet; components/widgets/cash-flow-widget.tsx op 27 aug 2026 (bevinding H6) — dat widget consumeert nu currentMonth*, draagt zijn venster in de kicker én het hero-label, en zet in de vergelijking twee GEREALISEERDE vensters naast elkaar in plaats van effective vs. gerealiseerd. Bij die fix is ook de figures-strip op /overzicht/cashflow op de canonieke maandmotor gezet (lib/cashflow-month-totals.ts) en zijn drie handgeschreven kopieën van de maand-spaarquote samengevoegd tot currentMonthSavingsRate. WAT OPEN BLIJFT: app/api/checkin/overview/route.ts telt nog eigen kalendermaand-sommen (r.139-140) uit rauwe rijen, zónder transfer-filter — terwijl diezelfde route drie regels lager voor de 6-maands-gemiddelden wél op transfer/joint_transfer filtert. Een eigen-rekening-overboeking telt daar dus als inkomen én als uitgave in het maandcijfer, maar niet in het halfjaarcijfer. Uitweg: die twee sommen laten consumeren uit de bundel (currentMonthIncome/-Expenses), zoals de andere twee oppervlakken nu doen.',
    severity: 'risk',
    elementIds: ['as-budget'],
    reviewedAt: '2026-08-27',
  },
  {
    id: 'client-select-star-lekt-crypto-kolommen',
    title: 'Assets-kolomlek: dicht, maar zonder repo-brede gate die het dicht houdt',
    detail:
      'Het punt: een `select(\'*\')` op een tabel met veld-encryptie levert de browser óók `*_encrypted` en `*_hash`. Die hash is een blind index (HMAC-SHA256 onder een server-only sleutel): dezelfde invoer geeft altijd dezelfde waarde, dus een stabiele correlatiesleutel die niets toevoegt aan wat het scherm toont. Op `assets` weegt dat zwaarder dan op de zustertabellen omdat de SELECT-policy daar HUISHOUD-GEDEELD is (`auth.uid()=user_id OR (ownership=\'shared\' AND household_id IS NOT NULL AND household_id=user_household_id())`): bij een gedeelde bezitting belandt het materiaal van de PARTNER in de bundel van de vragende gebruiker. GEDICHT: `bank_accounts` (984b54eba), `bank_connection_accounts` (1e2125e8f), `bank_connections` heeft geen client-reads, en op `assets` loopt sinds 2 aug 2026 ELKE lezing die de browser kan bereiken via de gedeelde kolomconstante `ASSET_CLIENT_COLUMNS` (lib/asset-data.ts). Dat dekt drie klassen die eerder los van elkaar lekten: (a) letterlijke reads in `use client`-bestanden (negen stuks, 31 jul); (b) GEDEELDE LIB-FUNCTIES ZONDER `use client`-directive die tóch in de browser draaien — `lib/household/perspective-loader.ts#loadPerspectiveData` (aangeroepen uit assets-client, cash-overview, debt-category-page, box3-detail, debts-client) en `lib/household-projection.ts#buildHouseholdProjectionInput` (uit horizon-client, household-fire-section); (c) SERVER-LOADERS waarvan de rijen als prop naar een clientcomponent gaan en dus in de RSC-payload staan — `lib/core-data-loader.ts#fullAssets` → `<CoreLanding>`, `lib/server-data/base.ts#getActiveAssets` → `<HorizonPage>` (en dashboard/layout/lever-scores/aandachtspunten), `app/(app)/core/assets/[type]/page.tsx` → `<AssetCategoryPage>`; `lib/assets-data-loader.ts` leest via de perspectief-loader en is daarmee mee-gedicht. Klasse (b) en (c) zijn voor `scripts/check-client-data-reads.mjs` PER DEFINITIE onzichtbaar — die gate opent alleen bestanden mét een `use client`-directive — dus daar is de kolomconstante de enige vangrail; drie gedragstesten bewaken hem (lib/household/assets-column-contract.test.ts, lib/server-data/base.test.ts, components/core/deepenings/verhuurrendement-tab.test.tsx). Het plaintext `account_number` reist nu ook niet meer standaard mee: `AssetForm` haalt het bij een cash-bezitting zelf op (één rij, één kolom) en LAAT DE KOLOM UIT ZIJN SAVE-PAYLOAD zolang het onbekend is, zodat een bewerking het nummer niet stil wist (components/core/asset-form-iban.test.tsx); de twee één-rij-reloads in asset-pane/asset-detail-flow vragen \'m daardoor niet meer bij. DE DATABASEKANT IS INMIDDELS DICHT — en de tekst hier zei tot 29-08-2026 het tegenovergestelde. Gemeten tegen `supabase_migrations.schema_migrations` en `pg_get_functiondef` op de LIVE database (29-08-2026): `20260802190000_household_partner_items_expliciete_kolomprojectie` staat geregistreerd, en de DRAAIENDE `household_partner_items()` draagt daadwerkelijk uitgeschreven kolomlijsten voor assets/debts/budgets/transactions, met account_number, account_number_encrypted, account_number_hash en linked_bank_account_id expliciet weggelaten. De vorige lezing (‘ligt in de repo maar is nog niet gedeployed’) stamde uit het migratiebestand en niet uit de database — precies de drift die ADR 0045 beschrijft. WAT WÉL OPEN BLIJFT, en waarom dit punt niet weg mag: er is geen MECHANISCHE gate die deze toestand vasthoudt voor `assets`. `scripts/check-client-data-reads.mjs` opent per constructie alleen bestanden mét een use client-directive, dus klasse (b) en (c) hangen aan drie gedragstesten die elk één call-site bewaken — een vierde lezer die morgen select(*) doet wordt door niets gevangen. Voor `bank_accounts` bestaat die gate sinds ADR 0118 wél: `lib/bank-account-visibility.test.ts` scant app/, lib/, components/ en scripts/ op élke .select(...) die op een .from(bank_accounts) volgt, met een krimpende eigen-rij-allowlist. Verwijder dit punt zodra dezelfde repo-brede scan ook voor `assets` bestaat.',
    severity: 'debt',
    elementIds: ['as-vermogen', 't-supabase'],
    reviewedAt: '2026-08-29',
  },
  {
    id: 'fk-waarde-zonder-datalaag-guard',
    title: 'valuations.entity_id mist de eigenaarschaps-guard van zijn zusterkolommen',
    detail:
      'RLS scopet de RIJ, niet de WAARDE van een FK-kolom daarop (ADR 0075) — vijfde keer dat dit patroon opduikt, na profiles.role/commercial_tier (ADR 0049), bank_connections.target_bank_account_id (fase 4), bank_connection_accounts.bank_account_id (fase 6) en bank_accounts.linked_asset_id (20260730210321) — die vier zijn gedicht. Wat blijft staan is de zwaarste variant: valuations.entity_id heeft nul triggers, geen FK (het veld is polymorf — entity_type kiest assets of debts — dus een echte FK kán niet), en een INSERT-with_check die alléén user_id toetst, waardoor ook ownership en household_id vrij zetbaar zijn. Een huishoudpartner kan zo een verzonnen waardering op een GEDEELDE bezitting van de ander schrijven, en lib/assets-data-loader.ts leest valuations zonder user_id/ownership-filter en groepeert op entity_id — die rij landt dus in de waarderingshistorie van de eigenaar, buiten de perspectief-loader om. De oude globale sleutel UNIQUE (entity_id, valuation_date) remt dat als NEVENEFFECT tot dagen waarop de eigenaar zelf nog niets had; die sleutel valt zodra 20260730210158_drop_valuations_legacy_entity_date_unique.sql meeloopt in een deploy (de migratie ligt klaar en mag niet los worden toegepast — zie de deploy-voorwaarde in dat bestand). Bewust geaccepteerd bij die drop: de rem is partieel en nooit een control geweest, en het pad is vandaag onbereikbaar — remote telt 0 huishoudens, 0 huishoudleden en 0 ownership=shared-waarderingen. LET OP dat die acceptatiegrond vervalt door een GEBRUIKERSACTIE (een huishoud-uitnodiging accepteren), niet door een release: er is dus geen moment waarop iemand vanzelf gewaarschuwd wordt. Zolang er geen mechanische poort is (alarm zodra household_members > 0 terwijl dit punt open staat), is "dit punt moet vóór het eerste huishouden dicht" een voornemen en geen control — behandel het eerste tweede-huishoudlid als de deadline. Twee delen, allebei nodig: (1) een guard-trigger op valuations.entity_id (spiegel van guard_bank_account_linked_asset, met de polymorfe tak assets/debts op entity_type), en (2) de valuations-lezing in lib/assets-data-loader.ts eigenaar-scopen — let daarbij op dat een gedeelde bezitting van de partner zijn legitieme waarderingshistorie moet houden, dus dat is geen kale .eq(user_id) maar een perspectief-beslissing. Verwijder dit punt zodra beide rond zijn.',
    severity: 'risk',
    elementIds: ['t-bankconnect', 'as-vermogen', 't-supabase'],
    reviewedAt: '2026-07-30',
  },
  {
    id: 'bank-sync-gefaalde-batch-niet-retried',
    title: 'Een gesneuvelde insert-batch bij een banksync wordt niet opnieuw geprobeerd',
    detail:
      'app/api/bank-connect/sync/route.ts schrijft sinds fase 1 status: "partial" plus het aantal niet-weggeschreven rijen in error_message zodra een insert-batch faalt (voorheen werd zo\'n botsing stil als "success" weggeschreven — dat deel is gedicht). Wat blijft staan: de mislukte batch zelf is nog steeds niet-fataal voor de sync én wordt niet automatisch herhaald, dus de rijen blijven ontbreken tot de gebruiker zelf opnieuw synchroniseert. Kandidaat: retry met backoff, of een zichtbare "gedeeltelijk gelukt, probeer opnieuw"-actie op de success-pagina.',
    severity: 'debt',
    elementIds: ['t-bankconnect', 'do-transactie'],
    reviewedAt: '2026-07-30',
  },
  {
    id: 'box1-buiten-kernel-cashflow',
    title: 'De levenslange Box 1-heffing wordt gerapporteerd, niet in mindering gebracht',
    detail:
      'Fase 3 van de fiscale optimizer (ADR 0088) leidt de levenslange Box 1-druk af uit de projectierijen (lib/tax-lifetime/lifetime-tax.ts#computeLifetimeTax, Box1Streams via lib/horizon-kernel/bridge.ts) NÁÁST de horizon-kernel-cashflow, bewust niet erin: de kernel is Excel-oracle-bewezen (ADR 0032) en een terugkoppeling zou een buiten-oracle-extensie zijn met regressierisico op iedere bestaande projectie. De heffing die dit oplevert (box1NietVerrekend) vloeit dus NIET terug in de kernel-cashflow — het model rekent niet mee dat een gebruiker extra bruto moet opnemen om die belasting te kunnen betalen. Concreet gevolg: de getoonde bedragen op /overzicht/belasting/optimizer (katern IV) en de variantensweep (lib/tax-lifetime/varianten-sweep.ts) onderschatten de benodigde bruto-opname van elk plan met een pensioenuitkering of -onttrekking. Gemeld op het scherm zelf (een van de vijf Kanttekeningen in components/overview/belasting/optimizer-levenslang.tsx), geen stille aanname. Blijft staan tot Box 1 — met een eigen pariteitsbewijs tegen het Excel-oracle — daadwerkelijk de kernel in gaat; verwijder dit punt pas dan.',
    severity: 'debt',
    elementIds: ['as-belasting', 'as-planning'],
    reviewedAt: '2026-08-05',
  },
  {
    id: 'app-settings-select-denylist',
    title: 'De SELECT-policy op app_settings is een fail-open denylist',
    detail:
      'app_settings draagt naast gewone beheerinstellingen ook de externe geheimen van de app, en de SELECT-policy voor rol `authenticated` beschermt die met een DENYLIST in plaats van een allowlist. Live geverifieerd predicaat (06-08-2026): `key !~* \'<uuid-regex>\' AND key <> ALL (ARRAY[\'anthropic_api_key\',\'openai_api_key\',\'mistral_api_key\',\'truelayer_client_id\',\'truelayer_client_secret\'])`. Alles wat géén UUID bevat en niet LETTERLIJK in die hardcoded array staat, is dus leesbaar voor elke ingelogde gebruiker. Gevolg: een nieuw geheim is standaard LEKKEND en moet met de hand aan de array worden toegevoegd — en dat is nu voor de tweede keer nodig gebleken (eerst de TrueLayer-sleutels, nu de Notion-sleutels `notion_api_token` en `notion_reports_data_source_id` voor de meldingen-push). Wat dit scherper maakt dan gewone schuld: het lek ontstaat niet bij het schrijven van de code maar op het moment dat IEMAND DE KOPPELING INRICHT — het geheim wordt via de beheer-UI in de rij gezet, lang nadat de review voorbij is. Er is dus geen moment waarop een PR-review of een test dit vangt; niets in de repo weet welke keys er live bestaan. De structurele oplossing is de policy omkeren naar een ALLOWLIST: standaard dicht, en expliciet openzetten wat een gewone gebruiker mag lezen (de publieke instellingen). Dat is een APARTE beslissing — hij is hier BEWUST NIET genomen, want hij vraagt een inventarisatie van élke key die de client vandaag leest plus een migratie, en een fout daarin breekt stil functionaliteit in plaats van hem te lekken. Tot die omkering er is, geldt: elke nieuwe key in app_settings die een geheim draagt MOET in dezelfde PR aan de denylist worden toegevoegd. Verwijder dit punt zodra de policy een allowlist is.',
    severity: 'risk',
    elementIds: ['t-supabase', 't-aigateway', 't-bankconnect'],
    reviewedAt: '2026-08-06',
  },
  {
    id: 'grenzenpot-sql-ts-parity-zonder-test',
    title: 'Grenzenpot: SQL↔TS-parity-contract is alleen door discipline geborgd',
    detail:
      'De tegenpartij-normalisatie bestaat twee keer — `public.spend_limit_counterparty_key` (SQL, COLLATE "C") en `spendLimitCounterpartyKey` (TS). De som komt uit SQL, de uitleg uit TS. Er is geen geautomatiseerde test die beide naast elkaar uitvoert; de borging is een comment, een CHECK-constraint (`counterparty_key ~ \'^[0-9A-Z]+$\'`) en review-discipline (ADR 0089 besluit 3). Fase 2–4 (uitsplitsing via `tx_counterparty_name_breakdown`, match-preview via `findOverlappingLimits`) leunt zwaarder op dat contract dan fase 1: er hangt nu een derde consument aan dezelfde sleutel. GEDICHT (was hier gemeld): migratie `20260808170000_tx_counterparty_name_breakdown_transfer_parity.sql` voegt aan `tx_counterparty_name_breakdown` hetzelfde `transaction_type`-filter toe als `computePeriodOutcome` (`isRealAggRow`) — de uitsplitsing beschrijft nu dezelfde verzameling als het canonieke periodebedrag; de rest-bucket-klem op 0 blijft staan als vangnet tegen de top-50-afkap, niet meer tegen deze asymmetrie. Wat blijft staan: het SQL↔TS-parity-PAAR (`spend_limit_counterparty_key` ↔ `spendLimitCounterpartyKey`, en nu ook het transaction_type-predikaat zelf) is nog altijd alleen met de hand geborgd — er is geen geautomatiseerde test die beide talen naast elkaar uitvoert. GEGROEID (11-08-2026): migratie `20260811120000_spend_limit_rule_transactions.sql` voegt een VIERDE consument toe. De rij-RPC `spend_limit_rule_transactions` dupliceert nu niet alleen de normalisatiesleutel maar óók het `transaction_type`-predikaat én de `DISTINCT ON`-ontdubbelvolgorde in een tweede SQL-functie — en die twee bepalen samen of de getoonde boekingenlijst dezelfde verzameling beschrijft als het canonieke periodebedrag erboven. Wijkt één van de drie af, dan telt de lijst zichtbaar niet op tot het bedrag, zonder dat iets faalt. Het risico is daarmee gegroeid van "één sleutel, drie lezers" naar "drie predikaten, vier lezers". Verwijder dit punt zodra er een geautomatiseerde parity-test bestaat.',
    severity: 'debt',
    elementIds: ['as-budget'],
    reviewedAt: '2026-08-11',
  },
  {
    id: 'hard-verwijderde-banktransacties-keren-terug',
    title: 'Hard verwijderde banktransacties kunnen bij de volgende sync terugkomen',
    detail:
      'De transactiedienst (as-transacties, ADR 0104) laat een gebruiker transacties bulk hard verwijderen — bewuste eigenaarskeuze, geen prullenbak (B1). De unieke dedup-index transactions_import_hash_per_account_idx blokkeert een herimport alleen zolang de rij nog bestaat; is ze weg, dan importeert de eerstvolgende bank-sync of -import diezelfde boeking probleemloos opnieuw, alsof er nooit iets verwijderd was. De app waarschuwt daarvoor in de verwijder-bevestiging (F18) maar voorkomt het niet. Uitweg zou een tombstone op de dedup-sleutel zijn (bewust buiten scope, R-NF7). Verwijder dit punt zodra zo\'n tombstone bestaat of het risico anderszins is afgedekt.',
    severity: 'debt',
    elementIds: ['as-transacties', 't-bankconnect', 'do-transactie'],
    reviewedAt: '2026-08-11',
  },
  {
    id: 'vijf-paden-wijzen-transacties-toe',
    title: 'Vijf implementaties van "wijs N transacties toe aan een budget"',
    detail:
      'Met de transactiedienst (as-transacties, ADR 0104) erbij zijn er nu vijf plekken die hetzelfde doen — een selectie transacties in één keer aan een budget koppelen — elk net anders in paginatie, telling en scoping: sleepmodus (lib/category-rules.ts, auto-siblings, niet gepagineerd), ai-categorize-sheet.tsx (auto-groepen, wel gepagineerd op lezen niet op schrijven), het scope-prompt in transaction-form.tsx (auto-match op naam, telt geraakte rijen niet), own-accounts-reclassify.ts (IBAN/naam-regels, wél gepagineerd en telt correct — het enige eerder-correcte referentiepatroon) en nu lib/transactions/bulk-mutate.ts (vrije selectie, bevroren id-lijst, batching ≤200, telt uit .select(\'id\')). ADR 0104 besluit 10 kiest bewust géén convergentie nu: de vier bestaande paden zijn family (b) (criterium-gebaseerd) en die semantiek in de nieuwe bevroren-id-lijst-primitive trekken zou precies weghalen wat ADR 0104 besluit 1 koopt. Te verwijderen zodra alle vijf op bulk-mutate.ts (of een gedeelde opvolger) draaien — een aparte convergentiekaart.',
    severity: 'debt',
    elementIds: ['as-transacties', 'as-budget'],
    reviewedAt: '2026-08-11',
  },
  {
    id: 'overige-transactiesommen-blijven-budgettype-blind',
    title: 'Buiten het dagtarief blijven de transactiegebaseerde sommen budgettype-blind',
    detail:
      'ADR 0126 (D2) zuivert de dagtarief-grondslag tot consumptie (geen transfers, geen archief-/inkomsten-/spaarbudget) via `consumptionExpenseRows` in lib/expense-rate.ts. De overige transactiegebaseerde sommen op hetzelfde maandaggregaat blijven budgettype-blind: `aggExpenseByMonthAbs`, de effective `monthlyExpenses`, de `currentMonth*`-velden (ADR 0073) en de 6-maands spaarquote-meting filteren wél op (joint_)transfer (`isRealAggRow`) maar niet op budgettype — `TxMonthAggregateRow` draagt `budget_id`, geen type, en die sommen bouwen (bewust, binnen ADR 0126) geen eigen budgettype-map. Een gebruiker die zijn hypotheekaflossing op een archiefbudget boekt ziet die aflossing dus WEL uit het dagtarief verdwijnen maar NOG STEEDS in bv. `monthlyExpenses` en de 6-maands spaarquote — dezelfde onderliggende transactie telt op twee schermen verschillend mee, met opzet: het dagtarief is de marginale prijs (D1), de overige sommen blijven de bredere kasstroom. Verwijder dit punt zodra bewust is besloten die sommen óók te zuiveren (met een expliciete afweging van de kosten: elke caller zou dan zijn eigen budgettype-map moeten meenemen) of zodra het verschil elders zichtbaar is uitgelegd.',
    severity: 'debt',
    elementIds: ['as-budget', 'as-transacties', 'do-transactie'],
    reviewedAt: '2026-09-02',
  },
  {
    id: 'consumptiegrondslag-mist-partnerbudgettypes',
    title: 'De consumptie-grondslag van het dagtarief kent het budgettype van partnerbudgetten niet',
    detail:
      'De consumptie-definitie van het dagtarief (ADR 0126 D2) leest aggregaatrijen uit een huishoud-brede bron (`tx_month_aggregate` over `transactions`: zichtbaar bij `ownership=\'shared\'` binnen het huishouden) maar bouwt de budgettype-map uit de smallere `getBudgets` (eigen rijen óf `ownership=\'shared\'`). In het default budgetmodel \'separate\' zijn partnerbudgetten `personal` en dus onzichtbaar voor die map — een gedeelde transactie op een partner-ARCHIEFbudget valt daardoor door de blocklist en telt als eigen consumptie, precies de fout die ADR 0126 voor eigen budgetten oplost. `transactions.budget_id` draagt `ON DELETE SET NULL` (geverifieerd op de live database), dus de enige bron van "onbekend budgettype" is de partner, niet een opgeruimd budget. Kan vandaag niet vuren: nul huishoudens op productie (nagemeten 2 sep 2026), daarom bewust niet in dezelfde PR gefixt. Voorgestelde oplossing: een SECURITY DEFINER-RPC die uitsluitend `id, parent_id, budget_type` van de huishoudpartner teruggeeft (privacy-neutraal — geen bedragen/namen) en die in `buildBudgetTypeMap` wordt meegemengd. Verwijder dit punt zodra die RPC bestaat en de type-map huishoud-breed is, of zodra het eerste huishouden op productie staat en dit met voorrang is opgelost.',
    severity: 'risk',
    elementIds: ['as-budget', 'as-huishouden', 'do-budget'],
    reviewedAt: '2026-09-02',
  },
]

/** Aandachtspunten die een specifiek element raken. */
export function getConcernsFor(elementId: string): ArchiConcern[] {
  return ARCHI_CONCERNS.filter((c) => c.elementIds.includes(elementId))
}

/** Telling per element, voor badges op de plaat. */
export function concernCountByElement(): Map<string, number> {
  const map = new Map<string, number>()
  for (const c of ARCHI_CONCERNS) {
    for (const id of c.elementIds) map.set(id, (map.get(id) ?? 0) + 1)
  }
  return map
}

/** Valideert dat elk aandachtspunt naar bestaande elementen verwijst. */
export function validateConcerns(model: ArchimateModel): string[] {
  const ids = new Set(model.nodes.map((n) => n.id))
  const errors: string[] = []
  const seen = new Set<string>()
  for (const c of ARCHI_CONCERNS) {
    if (seen.has(c.id)) errors.push(`dubbel concern-id: ${c.id}`)
    seen.add(c.id)
    if (c.elementIds.length === 0) errors.push(`concern ${c.id} heeft geen elementen`)
    for (const e of c.elementIds) if (!ids.has(e)) errors.push(`concern ${c.id} verwijst naar onbekend element ${e}`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.reviewedAt)) errors.push(`concern ${c.id} heeft geen geldige reviewedAt (YYYY-MM-DD)`)
  }
  return errors
}

/** Aandachtspunten die langer dan `maxAgeMonths` niet herzien zijn tegen `now` (default: vandaag). */
export const CONCERN_MAX_AGE_MONTHS = 6

export function findStaleConcerns(maxAgeMonths: number = CONCERN_MAX_AGE_MONTHS, now: Date = new Date()): ArchiConcern[] {
  const cutoff = new Date(now.getFullYear(), now.getMonth() - maxAgeMonths, now.getDate())
  return ARCHI_CONCERNS.filter((c) => {
    const [y, m, d] = c.reviewedAt.split('-').map(Number)
    const reviewed = new Date(y, m - 1, d)
    return reviewed.getTime() < cutoff.getTime()
  })
}
