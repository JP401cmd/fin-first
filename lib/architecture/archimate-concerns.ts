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
    id: 'gedeelde-bankrekening-ongewogen',
    title: 'Gedeelde bankrekening telt bij béíde partners voor 100%',
    detail:
      'bank_accounts heeft géén net_worth_inclusion_pct-kolom, terwijl assets en debts die wél hebben. Een GEDEELDE losse rekening (ownership=shared, linked_asset_id IS NULL) telt daardoor in het netto vermogen van beide partners voor het volle saldo, waar een gedeelde bezitting via inclusion-% over hen verdeeld wordt — op huishoudniveau dus 200% versus 100%. Dit is pre-existent en app-breed consistent (het dashboard deed het altijd al zo; sinds 2026-07-31 doen de check-in- en snapshot-routes het ook, wat de drift tússen de schermen juist wegnam). Oplossen vraagt een schemabesluit — de kolom toevoegen en een migratiepad voor bestaande gedeelde rekeningen — niet een lokale correctie in een route. Verwijder dit punt zodra dat besluit gevallen en uitgevoerd is.',
    severity: 'debt',
    elementIds: ['as-vermogen', 'fn-vermogensregistratie', 't-supabase'],
    reviewedAt: '2026-07-31',
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
      'Eén client van ~6900 regels draagt /toekomst zonder eigen tests. Decompositie loopt (stap 1 HorizonTrendGrid klaar); tot dan is dit het grootste wijzigingsrisico van de app.',
    severity: 'debt',
    elementIds: ['fn-toekomstplannen', 'as-planning'],
    reviewedAt: '2026-07-21',
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
      'De lokale supabase/migrations-map loopt niet gelijk met remote. DDL via apply_migration; check kolommen/functies vóór je erop bouwt, anders bouw je op een schema dat remote niet bestaat.',
    severity: 'risk',
    elementIds: ['t-supabase', 'data-cont'],
    reviewedAt: '2026-07-20',
  },
  {
    id: 'horizon-kernel-bekende-afwijkingen',
    title: 'Horizon-kernel: vijf bekende, bewuste grenzen/afwijkingen t.o.v. het Excel-oracle',
    detail:
      'Vijf structurele kanttekeningen bij de horizon-kernel (ADR 0032), geen bugs maar wel aandachtspunten. (1) B93 reached_now-quirk: bij een doelbedrag van €0 (bv. legacy-nalatenschap €0, of deplete zonder expliciet doel) geeft het solver-statusblok altijd status reached_now zodra Prognose!J(0) ≥ 0 — letterlijke Excel-parity, maar mogelijk verwarrend als UI-tekst ("je kunt nu al stoppen" bij een leeg doel). Nog geen apart gap-besluit genomen (docs/horizon-excel-oracle-plan.md §V12). (2) De scenario-band/Monte-Carlo-wrappers (lib/horizon-kernel/wrappers/band.ts, wrappers/mc.ts) leveren uitsluitend SCALAIRE uitkomsten per scenario (fireAge, netto-vermogen-bij-FIRE, netto-liquide-bij-eindleeftijd — de Sim!B/C/D-rij) — geen volledige per-jaar LedgerRow-achtige asset-/schuld-/onttrekkingsbreakdown per scenario. Een toekomstige UI die per-scenario samenstelling wil tonen (net als de hoofdgrafiek) vindt die breakdown niet; dat vereist een aparte volledige kernel-run per scenario. (3) Lege-surplus-doelpot-divergentie (gap-besluit V17, eigenaar 2026-07-03): staat de surplus-doelpot op €0, dan laat het Excel-oracle het maandspaar VERDAMPEN (Σgewicht=0 → inleg €0), terwijl de kernel via de bewuste degeneratie-fallback (toenameGewichten tak A) het spaargeld wél in de lege pot stort — bij het eigenaar-account het verschil tussen FIRE 59,58 (kernel) en 89,33 (Excel, zelfde invoer; end-to-end-verificatie scripts/horizon-oracle/*eigenaar-live*). De kernel-extensie is de gewenste semantiek; definitieve borging = Excel v6 fixen + fixtures herextraheren (eigenaar-actie); tot die tijd bewaken surplus-/withdrawal-evaporation-tests het kernel-gedrag en mag deze divergentie NIET "richting oracle" worden weggefixt zonder nieuw eigenaar-besluit. (4) Tekort-aflossing-uit-liquide (gap-besluit V19 / ADR 0033, eigenaar 2026-07-04, F6-bugfix): het Excel v5-oracle lost een tekort-lening alléén af uit de positieve maandkasstroom-surplus-tak — in de onttrekkingsfase 0 — waardoor een verkoop-transitie-lag-piek (eigenaar: €6.758 op leeftijd 75) 17 jaar met 5% rente compoundt terwijl er >€900k liquide náást staat. De kernel lost dit tekort voortaan (app-pad) maandelijks af uit de resterende liquide bezit-capaciteit (m−1-lag, onttrekking-waterval-volgorde, Σruw=0). Schakelbaar via KernelInput.tekortAflossingUitLiquide: app-pad AAN, parity-/fixture-pad UIT (input-from-fixture zet de vlag niet → 735 fixtures byte-groen). TRANSITIONEEL: borging = Excel v6 fixen + fixtures herextraheren; vangnet lib/horizon-kernel/tekort-aflossing-liquide.test.ts; niet "richting oracle" wegfixen zonder nieuw eigenaar-besluit. (5) AOW-basis-divergentie (gap-besluit V20 / ADR 0064, eigenaar 2026-07-29): het Excel v5-oracle rekent Auto-geb B21 op de 2025-basis €1.452 (alleenstaand) / €993 (samenwonend), terwijl de app de canonieke SVB-bedragen uit lib/constants.ts toont (€1.581,55 / €1.084,13 per 1-7-2026) — ~8% verschil. Opgelost als INJECTIE, niet als gelijktrekking: KernelInput.autoGebeurtenissen.aowBasisPerMaand is optioneel en inert-by-default (weggelaten → oracle-fallback in tables/auto-gebeurtenissen.ts; input-from-fixture zet het veld níet → fixtures byte-groen), en de app-adapter injecteert APP_AOW_BASIS_PER_MAAND (= de constants). Partner-AOW (PT!B9) volgt dezelfde grondslag. Gevolg: het app-pad rekent bewust met een hogere AOW dan het oracle; die divergentie blijft bestaan tot Excel v6 dezelfde basis draagt en de fixtures heréxtraheerd zijn. Vangnet lib/horizon-kernel/aow-basis-injectie.test.ts; oracle-fallback niet wijzigen zonder fixture-herijking + nieuw eigenaar-besluit.',
    severity: 'debt',
    elementIds: ['as-planning', 'fn-toekomstplannen'],
    reviewedAt: '2026-07-29',
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
      'Sinds 19 jul 2026 vervangen: de oude Transformers.js/ONNX-fragiliteit (reproduceerbare unaligned accesses-crash, device-loss die het héle browser-GPU-proces vergiftigde tot een paginaherlaad — bevestigd in de L1-controlemeting, spikes/litert-lm/meetrapport-v1.md) is weg na de runtime-swap naar LiteRT-LM. Daarvoor in de plaats een kleiner, ander risico: `@litert-lm/core` 0.14.0 is Early Preview (API-breuk tussen versies mogelijk, daarom exact gepind, niet op een range), biedt geen sampling-controle op de web-SDK, en de Windows/NVIDIA-tak is minder getest dan de standaardpaden (kanarie: upstream-issue #2572). Windows-multi-GPU kiest bovendien de iGPU en negeert `powerPreference` (crbug 369219127) — geen runtime-bug maar een browserbeperking die de realistische performance bepaalt. Gemitigeerd met dezelfde bouwvoorwaarden als voorheen: review-UI-only, geen-cloud-fallback (fail-closed), automatisch sessieherstel (ADR 0043). Verwijder of verzwak dit punt zodra LiteRT-LM JS uit Early Preview is en de Windows/NVIDIA-tak breder bewezen is.',
    severity: 'debt',
    elementIds: ['t-lokale-ai', 'as-import', 'as-coach'],
    reviewedAt: '2026-07-19',
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
    title: '"Deze maand"-oppervlakken lezen nog de effective grondslag',
    detail:
      'DashboardData draagt sinds ADR 0073 currentMonthIncome/currentMonthExpenses (gerealiseerde kalendermaand uit het tx-aggregaat) náást het effective monthlyIncome/monthlyExpenses (waar income_source=\'manual\' de profielinschatting laat winnen). De Transacties-kaart is omgezet, maar twee oppervlakken presenteren de effective waarden nog als "deze maand": components/widgets/cash-flow-widget.tsx zet ze zelfs in één vergelijking naast prevMonthIncome/prevMonthExpenses (effective vs. gerealiseerd in hetzelfde beeld), en app/api/checkin/overview/route.ts telt eigen kalendermaand-sommen zónder transfer-filter. Uitweg: beide laten consumeren uit de bundelvelden — per surface een one-liner.',
    severity: 'risk',
    elementIds: ['as-budget'],
    reviewedAt: '2026-07-30',
  },
  {
    id: 'client-select-star-lekt-crypto-kolommen',
    title: 'Assets-kolomlek: applicatiekant dicht, de partner-RPC nog niet',
    detail:
      'Het punt: een `select(\'*\')` op een tabel met veld-encryptie levert de browser óók `*_encrypted` en `*_hash`. Die hash is een blind index (HMAC-SHA256 onder een server-only sleutel): dezelfde invoer geeft altijd dezelfde waarde, dus een stabiele correlatiesleutel die niets toevoegt aan wat het scherm toont. Op `assets` weegt dat zwaarder dan op de zustertabellen omdat de SELECT-policy daar HUISHOUD-GEDEELD is (`auth.uid()=user_id OR (ownership=\'shared\' AND household_id IS NOT NULL AND household_id=user_household_id())`): bij een gedeelde bezitting belandt het materiaal van de PARTNER in de bundel van de vragende gebruiker. GEDICHT: `bank_accounts` (984b54eba), `bank_connection_accounts` (1e2125e8f), `bank_connections` heeft geen client-reads, en op `assets` loopt sinds 2 aug 2026 ELKE lezing die de browser kan bereiken via de gedeelde kolomconstante `ASSET_CLIENT_COLUMNS` (lib/asset-data.ts). Dat dekt drie klassen die eerder los van elkaar lekten: (a) letterlijke reads in `use client`-bestanden (negen stuks, 31 jul); (b) GEDEELDE LIB-FUNCTIES ZONDER `use client`-directive die tóch in de browser draaien — `lib/household/perspective-loader.ts#loadPerspectiveData` (aangeroepen uit assets-client, cash-overview, debt-category-page, box3-detail, debts-client) en `lib/household-projection.ts#buildHouseholdProjectionInput` (uit horizon-client, household-fire-section); (c) SERVER-LOADERS waarvan de rijen als prop naar een clientcomponent gaan en dus in de RSC-payload staan — `lib/core-data-loader.ts#fullAssets` → `<CoreLanding>`, `lib/server-data/base.ts#getActiveAssets` → `<HorizonPage>` (en dashboard/layout/lever-scores/aandachtspunten), `app/(app)/core/assets/[type]/page.tsx` → `<AssetCategoryPage>`; `lib/assets-data-loader.ts` leest via de perspectief-loader en is daarmee mee-gedicht. Klasse (b) en (c) zijn voor `scripts/check-client-data-reads.mjs` PER DEFINITIE onzichtbaar — die gate opent alleen bestanden mét een `use client`-directive — dus daar is de kolomconstante de enige vangrail; drie gedragstesten bewaken hem (lib/household/assets-column-contract.test.ts, lib/server-data/base.test.ts, components/core/deepenings/verhuurrendement-tab.test.tsx). Het plaintext `account_number` reist nu ook niet meer standaard mee: `AssetForm` haalt het bij een cash-bezitting zelf op (één rij, één kolom) en LAAT DE KOLOM UIT ZIJN SAVE-PAYLOAD zolang het onbekend is, zodat een bewerking het nummer niet stil wist (components/core/asset-form-iban.test.tsx); de twee één-rij-reloads in asset-pane/asset-detail-flow vragen \'m daardoor niet meer bij. WAT OPEN BLIJFT, en waarom dit punt níét weg mag: de DATABASEKANT. De SECURITY DEFINER RPC `household_partner_items(\'assets\')` gaf bij privacyniveau `full` een `to_jsonb(a)` van de PERSOONLIJKE bezittingen van de partner terug — hele rijen, dus inclusief alle drie de account-nummer-kolommen — en die rijen lopen door dezelfde perspectief-loader naar de browser. Geen enkele kolomlijst in de applicatie kan dat afvangen. De migratie die de RPC een expliciete kolomprojectie geeft (supabase/migrations/20260802190000_household_partner_items_expliciete_kolomprojectie.sql, assets volgt daar dezelfde ASSET_CLIENT_COLUMNS) ligt in de repo maar is nog niet gedeployed — tot dat gebeurd is, is de applicatiekant het bewijs en de RPC het gat. Verwijder dit punt pas ná die deploy.',
    severity: 'risk',
    elementIds: ['as-vermogen', 't-supabase'],
    reviewedAt: '2026-08-02',
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
    id: 'assetform-schrijft-alleen-plaintext-account-number',
    title: 'AssetForm is de laatste browser-schrijver van één helft van een encrypted kolom-triple',
    detail:
      '`assets.account_number` heeft sinds Stage B een encrypted tegenhanger (`account_number_encrypted`, AES-256-GCM) en een blind index (`account_number_hash`), geschreven via de gedeelde helper `accountNumberWriteColumns()` (lib/asset-account-number.ts, spiegel van ibanWriteColumns) — voor élk server-side pad: de OAuth-callback, de TrueLayer cash-asset-backfill en de aangifte-import. Ntt: `components/core/assets-client.tsx` (AssetForm) is een `use client`-bestand dat een bewerkte cash-bezitting rechtstreeks via de browser-supabase-client wegschrijft en daarbij ALLEEN de plaintext-kolom zet — versleutelen kan daar niet, `ENCRYPTION_KEY_V1` is server-only. Datzelfde bestand is ook de laatste plaintext-LEZER (een nalees-fetch die het zichtbare IBAN-veld vult); dat leesgat valt onder het bestaande punt `client-select-star-lekt-crypto-kolommen`, dit punt is het SCHRIJF-gat. Gemeten op productie (2026-08-02): van 33 cash-bezittingen hebben er 2 wél `account_number` maar géén `account_number_encrypted`, allebei `source=\'manual\'` — dus via dit formulier aangemaakt — met een companion-rij in `bank_accounts` waarvan `iban_encrypted` óók leeg is. Zie ADR 0077 voor het bredere contract (gedeelde write/read-helper + wissen-alleen-bij-bekend-leeg) en de Stage B-stoplijn die deze route expliciet noemt als blokkade voor de DROP van `assets.account_number`/`bank_accounts.iban`. Verwijder dit punt zodra de AssetForm-save server-side loopt (via een route die `accountNumberWriteColumns()` gebruikt).',
    severity: 'risk',
    elementIds: ['as-vermogen', 't-supabase'],
    reviewedAt: '2026-08-02',
  },
  {
    id: 'idx-transactions-user-date-drift-remote',
    title: 'idx_transactions_user_date staat in de repo maar niet op remote',
    detail:
      'supabase/migrations/20260504000001_perf_composite_indexes.sql definieert deze index, maar pg_indexes op remote toont hem niet (wel de losse idx_transactions_user_id en idx_transactions_date). De hotste query van de app draait dus zonder de samengestelde index die ervoor bedoeld was, en de eerste-ophaal-strategie (B8/ADR 0072) vergroot het transactievolume per rekening fors — een prestatiemeting ná die fase kan hierdoor misleidend zijn. Migratie opnieuw toepassen op remote (of expliciet vervangen als hij inmiddels overbodig is) sluit dit punt.',
    severity: 'debt',
    elementIds: ['t-supabase', 'do-transactie'],
    reviewedAt: '2026-07-30',
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
