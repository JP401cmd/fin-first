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
    title: 'select(\'*\') in clientcomponenten stuurt crypto-kolommen naar de browser',
    detail:
      'Een `select(\'*\')` op een tabel met veld-encryptie levert de browser óók `*_encrypted` en `*_hash`. Die hash is een blind index (HMAC-SHA256 onder een server-only sleutel): een STABIELE identifier die dezelfde waarde altijd op hetzelfde getal afbeeldt, dus een correlatiesleutel die niets toevoegt aan wat het scherm toont. Twee van de vier tabellen zijn gedicht — `bank_accounts` (984b54eba) en `bank_connection_accounts` (31 jul, components/app/cash-account-view.tsx#loadGcAccounts, nu een expliciete kolomlijst + tripwire in cash-account-view.test.tsx); `bank_connections` heeft geen client-reads. Wat blijft staan is `assets`, en dat weegt zwaarder dan de twee gedichte: de SELECT-policy daar is HUISHOUD-GEDEELD (`auth.uid()=user_id OR (ownership=\'shared\' AND household_id=user_household_id())`), dus bij een gedeelde bezitting belanden `account_number_hash`, `account_number_encrypted` én het plaintext `account_number` van de PARTNER in de bundel van de vragende gebruiker — buiten de perspectief-loaders om. Negen bevestigde plekken, zwaarst eerst: components/core/asset-detail-flow.tsx:164 en components/app/core/assets/asset-pane.tsx:174 (alle actieve assets), app/(app)/core/checkin/page.tsx:244, app/(app)/horizon/whatif/whatif-page-client.tsx:210, app/(app)/core/assets/revalue/page.tsx:74, components/core/deepenings/verhuurrendement-tab.tsx:122, components/core/deepenings/hypotheekplanner-tab.tsx:171, plus de één-rij-varianten asset-detail-flow.tsx:260 en asset-pane.tsx:267. STRUCTUREEL: alle staan op de grandfather-allowlist van scripts/check-client-data-reads.mjs, en die gate kent alleen "client-read ja/nee", niet "wélke kolommen" — een select(\'*\') op een tabel mét crypto-kolommen glipt er per definitie doorheen, wat verklaart waarom deze twee lekken handmatig gevonden moesten worden. Uitweg: per bestand een expliciete kolomlijst (de crypto-kolommen worden nergens client-side gebruikt — decryptField heeft server-only sleutels), plus een tweede, NIET-allowlistbare regel in die gate die select(\'*\') op assets/bank_accounts/bank_connection_accounts/bank_connections in \'use client\'-bestanden hard afkeurt. Verwijder dit punt zodra de negen om zijn én die regel bestaat.',
    severity: 'risk',
    elementIds: ['as-vermogen', 't-supabase'],
    reviewedAt: '2026-07-31',
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
