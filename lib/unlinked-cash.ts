/**
 * LOSSE (NIET-GEKOPPELDE) BANKREKENING-CASH — één grondslag voor alle optellingen.
 *
 * ## Wat dit is
 *
 * Naast de `assets`-tabel telt het netto vermogen de saldi van bankrekeningen mee
 * die (nog) NIET aan een bezitting gekoppeld zijn (`linked_asset_id IS NULL`) —
 * de legacy/transitie-liquiditeit. Een rekening die WÉL aan een bezitting hangt
 * telt via het bezitting-pad mee (inclusion-gewogen); die hier ook optellen zou
 * dubbeltellen. Dat `is_active = true AND linked_asset_id IS NULL`-predicaat is
 * dus geen filterdetail maar de grondslag zelf, en woont daarom op één plek.
 *
 * ## Hoe er WEL gewogen wordt — het huishoud-aandeel, niet een eigen kolom
 *
 * Een GEDEELDE losse rekening (`ownership = 'shared'`) is via de huishoud-
 * verbrede SELECT-policy zichtbaar voor béíde partners. Ongewogen optellen
 * betekent dus dat hetzelfde saldo twee keer in het huishouden landt — 200% van
 * het werkelijke geld, en twee keer opgeslagen in de snapshotreeks.
 *
 * De correctie zit hier in de LEESLAAG, niet in een kolom op `bank_accounts`:
 * het aandeel komt uit `households.split_mode` (via
 * `PerspectiveContext.mySharePct`) en wordt toegepast met exact dezelfde
 * canonieke fractie-functie als budgetten en cashflow gebruiken
 * (`shareFractionFor`, `lib/budget-perspective.ts`). Zo is er GEEN derde
 * wegingsbegrip bijgekomen.
 *
 * Waarom geen wegingskolom op `bank_accounts`: `net_worth_inclusion_pct` op
 * `assets`/`debts` is GEEN huishoudsplitsing maar een handmatige 0-100-schuif
 * (default 100, los van `ownership`) voor gedeeltelijk eigendom búíten de app.
 * Die betekenis hergebruiken zou een derde begrip introduceren en het gros van
 * het geld — dat via de companion-cash-bezitting in `assets` loopt — niet raken.
 * Zie ADR 0101.
 *
 * **Consume, don't recompute:** {@link unlinkedCashTotal} is DE optelling. Geen
 * enkele loader, route of surface mag zelf over de rijen reduceren; het tweede
 * argument dwingt af dat elke consument expliciet zegt wélk aandeel telt.
 *
 * NOG NIET OPGELOST (bewust, buiten deze slice): een gedeelde BEZITTING telt met
 * de default-schuif van 100 óók bij beide partners volledig mee. Dat is
 * hetzelfde defect in een andere tabel en hoort bij het eigenaarschapsbesluit
 * van ADR 0101, niet bij deze module.
 *
 * ## Twee leespaden, want twee soorten client
 *
 * De SELECT-policy op `bank_accounts` is HUISHOUD-VERBREED:
 *
 *     auth.uid() = user_id
 *     OR (ownership = 'shared' AND household_id IS NOT NULL
 *         AND household_id = user_household_id())
 *
 * Met een sessie-client doet RLS die scoping dus zélf — een expliciete
 * `.eq('user_id', …)` maakt de query STRIKT SMALLER dan de policy en laat
 * gedeelde huishoudrekeningen wegvallen. Dat was precies de drift tussen de
 * check-in-/snapshot-routes en het dashboard. Gebruik daarom
 * {@link selectUnlinkedBankAccounts} en filter NIET zelf op `user_id`.
 *
 * Een service-role-client (de snapshot-cron draait zonder sessie) passeert RLS
 * volledig: `auth.uid()` is daar NULL, dus de policy scoopt niets en een
 * ongefilterde query zou de rekeningen van ÁLLE gebruikers optellen. Daar moet
 * de huishoud-scope met de hand mee — zie
 * {@link selectUnlinkedBankAccountsForUser}.
 *
 * ## Wat de verbreding écht veilig maakt
 *
 * Niet het `ownership = 'shared'`-predicaat op zichzelf. De UPDATE-policy op
 * `bank_accounts` is own-row in zowel `USING` als `WITH CHECK`, dus een gebruiker
 * mag zijn eigen rij herschrijven — inclusief `ownership` en `household_id`. Wat
 * dat onschadelijk maakt is de trigger `stamp_household_id()` (BEFORE INSERT OR
 * UPDATE): die zet `household_id := user_household_id()` bij `ownership =
 * 'shared'` en `NULL` bij al het andere, server-side. Een rij het huishouden van
 * een vreemde in schrijven kan daardoor niet. **Sloopt iemand die trigger, dan is
 * deze module (en de RLS-policy zelf) onmiddellijk een injectiepad** — verwijder
 * 'm dus niet zonder hier een vervangende garantie voor terug te zetten.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { shareFractionFor } from '@/lib/budget-perspective'
import { computeSharePct, type Perspective, type SplitMode } from '@/lib/household-data'
import { loadPerspectiveContext } from '@/lib/household/perspective-loader'

/**
 * Minimale rijvorm voor de saldo-optelling. `ownership` hoort erbij sinds de
 * weging: zonder die kolom is een gedeelde rekening niet te onderscheiden van
 * een eigen rekening en telt hij bij beide partners voor 100%.
 */
export type UnlinkedCashRow = {
  balance?: number | string | null
  ownership?: string | null
}

/**
 * Het aandeel waarmee GEDEELDE losse rekeningen in deze optelling tellen.
 *
 * `mySharePct` (0-100) komt uit `PerspectiveContext.mySharePct`, dat op zijn
 * beurt uit `households.split_mode` volgt — dezelfde bron als budgetten,
 * cashflow en de bezitting-/schuldweging. Bewust geen los getal per surface.
 */
export type UnlinkedCashShare = {
  perspective: Perspective
  /** 0-100. */
  mySharePct: number
}

/**
 * Aandeel voor een context zonder huishouden: alles is van jou.
 *
 * Alleen te gebruiken waar vaststaat dat er geen huishoud-context te resolven
 * is. Overal elders: {@link resolveUnlinkedCashShare} — die valt zélf op dit
 * aandeel terug zodra er geen gedeelde rij in de set zit.
 */
export const SOLO_UNLINKED_CASH_SHARE: UnlinkedCashShare = {
  perspective: 'personal',
  mySharePct: 100,
}

/**
 * Aandeel wanneer er wél een gedeelde rekening is maar de huishoud-context niet
 * te laden valt. 50 is de fail-closed keuze: liever de helft te weinig dan het
 * saldo van je partner er nog eens bovenop. Spiegelt de clamp-default van
 * `shareFractionFor`.
 */
export const FAIL_CLOSED_SHARE_PCT = 50

/**
 * De ene kolomset. Bewust de RUIMSTE bestaande set (horizon-loader leest `id,
 * name, balance`; de optellers hebben genoeg aan `balance`) en bewust een
 * LITERAL, geen parameter: PostgREST leidt de rijvorm af uit de letterlijke
 * select-string, dus een `string`-parameter degradeert élke consument naar
 * `GenericStringError`. Twee extra kolommen op een handvol rekeningrijen is een
 * verwaarloosbare prijs voor één getypeerde query-definitie.
 */
export const UNLINKED_CASH_COLUMNS = 'id, name, balance, ownership'

/**
 * De fractie (0-1) waarmee één rekening in dit perspectief telt.
 *
 * Delegeert naar de canonieke {@link shareFractionFor} — hetzelfde begrip als
 * budgetten en cashflow — met één extra regel die specifiek is voor de
 * partner-blik: eigen-persoonlijke rekeningen tellen daar NIET mee (ze zijn niet
 * van de partner), en partner-persoonlijke rekeningen zijn überhaupt niet
 * leesbaar. Exact het scope-plus-weeg-gedrag van
 * `lib/cashflow-data-loader.ts#startingBalance`, dat dit al deed voor de
 * gekoppelde rekeningen.
 */
export function unlinkedCashFractionFor(
  perspective: Perspective,
  ownership: string | null | undefined,
  mySharePct: number,
): number {
  const own = ownership ?? 'personal'
  if (perspective === 'partner' && own !== 'shared') return 0
  return shareFractionFor(perspective, own, mySharePct)
}

/** Zit er een gedeelde rekening in de set? Zo nee, is er niets te wegen. */
export function hasSharedUnlinkedCash(
  rows: ReadonlyArray<UnlinkedCashRow> | null | undefined,
): boolean {
  return (rows ?? []).some((row) => (row.ownership ?? 'personal') === 'shared')
}

/**
 * DE som over losse bankrekening-saldi, gewogen op het huishoud-aandeel.
 *
 * `share` is VERPLICHT en heeft bewust geen default: een vergeten aandeel is
 * precies het defect dat deze functie oplost (gedeelde rekening telt bij beide
 * partners voor 100% → 200% op huishoudniveau). Een consument zonder
 * huishoud-context geeft expliciet {@link SOLO_UNLINKED_CASH_SHARE} mee.
 *
 * `null`/`undefined` (gefaalde leesronde) levert 0: een ontbrekend saldo mag het
 * netto vermogen niet doen crashen, en 0 is de eerlijke val-terug.
 */
export function unlinkedCashTotal(
  rows: ReadonlyArray<UnlinkedCashRow> | null | undefined,
  share: UnlinkedCashShare,
): number {
  return (rows ?? []).reduce(
    (sum, row) =>
      sum +
      Number(row.balance ?? 0) *
        unlinkedCashFractionFor(share.perspective, row.ownership, share.mySharePct),
    0,
  )
}

/**
 * Het aandeel voor deze set rijen, via een RLS-client (sessie).
 *
 * FAST PATH: zit er geen gedeelde rekening bij, dan is er niets te wegen en
 * gaat er GEEN extra query naar de database. Dat is vandaag het pad van élke
 * gebruiker (nul huishoudens op productie, gemeten 11-8-2026) en blijft het pad
 * van elke solo-gebruiker — de weging kost dus niets waar ze niets doet.
 *
 * Faalt het laden van de huishoud-context terwijl er wél een gedeelde rij is,
 * dan valt het aandeel fail-closed terug op {@link FAIL_CLOSED_SHARE_PCT}.
 */
export async function resolveUnlinkedCashShare(
  supabase: SupabaseClient,
  rows: ReadonlyArray<UnlinkedCashRow> | null | undefined,
  perspective: Perspective = 'personal',
): Promise<UnlinkedCashShare> {
  if (!hasSharedUnlinkedCash(rows)) return { perspective, mySharePct: 100 }
  try {
    const ctx = await loadPerspectiveContext(supabase)
    return { perspective, mySharePct: ctx.hasHousehold ? ctx.mySharePct : 100 }
  } catch (error) {
    console.error('[unlinked-cash] huishoud-aandeel laden mislukt:', error)
    return { perspective, mySharePct: FAIL_CLOSED_SHARE_PCT }
  }
}

/**
 * Losse, actieve bankrekeningen via een RLS-client (sessie).
 *
 * **Voeg hier NOOIT een `.eq('user_id', …)` aan toe.** De policy is
 * huishoud-verbreed; een eigen user-filter zou gedeelde rekeningen wegsnijden en
 * dit getal laten driften met het dashboard.
 *
 * MAG UITSLUITEND met de anon/authenticated client (`lib/supabase/server.ts`)
 * worden aangeroepen — met `getServiceClient()` levert deze query de rekeningen
 * van álle gebruikers op. Gebruik daar {@link selectUnlinkedBankAccountsForUser}.
 */
export function selectUnlinkedBankAccounts(supabase: SupabaseClient) {
  return supabase
    .from('bank_accounts')
    .select('id, name, balance, ownership')
    .eq('is_active', true)
    .is('linked_asset_id', null)
}

/**
 * Losse, actieve bankrekeningen van ÉÉN gebruiker, met de huishoud-verbreding
 * expliciet in de query — voor service-role-context (cron), waar RLS niet scoopt.
 *
 * Spiegelt de SELECT-policy exact: eigen rijen OF gedeelde rijen binnen hetzelfde
 * huishouden. Zonder huishouden (`householdId === null`) blijft het bij de eigen
 * rijen.
 *
 * `householdId` wordt op UUID-vorm gecontroleerd vóór interpolatie in het
 * PostgREST-`or`-filter: die filtergrammatica is komma-/haakje-gescheiden, dus een
 * waarde met leestekens zou het predicaat kunnen herschrijven. De waarde komt uit
 * een `uuid`-kolom en kan dat in de praktijk niet zijn — de controle is de
 * garantie dat dat zo blijft, en degradeert fail-closed naar alleen-eigen-rijen.
 */
export function selectUnlinkedBankAccountsForUser(
  supabase: SupabaseClient,
  userId: string,
  householdId: string | null,
) {
  const base = selectUnlinkedBankAccounts(supabase)
  if (!householdId || !isUuid(householdId) || !isUuid(userId)) {
    return base.eq('user_id', userId)
  }
  return base.or(
    `user_id.eq.${userId},and(ownership.eq.shared,household_id.eq.${householdId})`,
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * UUID-vormcontrole vóór interpolatie in een PostgREST-`or`-filter. Geëxporteerd
 * zodat `lib/household/budget-share.ts` exact dezelfde guard gebruikt voor zijn
 * service-role budget-scope — één injectie-garantie, niet twee.
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/** Huishoud-scope + aandeel van één gebruiker, voor de service-role-context. */
export type HouseholdCashShare = {
  householdId: string
  /** 0-100 — hetzelfde begrip als `PerspectiveContext.mySharePct`. */
  mySharePct: number
}

/**
 * `user_id → { household_id, mySharePct }` voor een set gebruikers.
 *
 * Alleen voor service-role-context: de cron verwerkt álle gebruikers en heeft per
 * gebruiker het huishouden nodig om {@link selectUnlinkedBankAccountsForUser} te
 * voeden, én het aandeel om {@link unlinkedCashTotal} te wegen. Een sessie-client
 * heeft dit niet nodig — die gebruikt {@link resolveUnlinkedCashShare}.
 *
 * Het aandeel wordt met dezelfde {@link computeSharePct} berekend als
 * `loadPerspectiveContext`, inclusief de income-budgetten voor `income_ratio`,
 * zodat de snapshot van de cron niet drift met het dashboard van de gebruiker.
 * Een gefaalde leesronde levert een lege map — dan valt élke gebruiker terug op
 * alleen-eigen-rijen (fail-closed: liever een saldo te weinig dan het saldo van
 * een vreemde).
 *
 * MEERDERE HUISHOUDENS: `household_members` is uniek op (household_id, user_id) —
 * niet op user_id — dus één gebruiker in twee huishoudens is schema-technisch
 * mogelijk. De RLS-kant kiest er dan één met `user_household_id()`, dat een
 * `LIMIT 1` ZONDER `ORDER BY` doet. We sorteren hier op `joined_at` en houden de
 * eerste, zodat déze kant in elk geval deterministisch is; volledige pariteit met
 * de SQL-functie is pas te garanderen als die functie zelf een `ORDER BY` krijgt
 * (migratie, buiten deze slice). Geen lek — de gebruiker is lid van beide
 * huishoudens — maar wél mogelijke drift tussen dashboard en snapshot. Vandaag
 * theoretisch: er zijn nul `household_members`-rijen.
 */
export async function loadHouseholdSharesByUser(
  supabase: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, HouseholdCashShare>> {
  const map = new Map<string, HouseholdCashShare>()
  if (userIds.length === 0) return map

  const { data, error } = await supabase
    .from('household_members')
    .select('user_id, household_id, joined_at')
    .in('user_id', userIds as string[])
    .order('joined_at', { ascending: true })

  if (error || !data) {
    // Stil terugvallen zou de huishoud-verbreding uit ÁLLE snapshots laten
    // verdwijnen zonder één signaal; de cron-samenvatting ziet deze fout niet.
    console.error('[unlinked-cash] huishoud-map laden mislukt:', error)
    return map
  }

  const householdIdByUser = new Map<string, string>()
  for (const row of data as Array<{ user_id: string | null; household_id: string | null }>) {
    // Eerste (oudste) lidmaatschap wint — zie de docstring over meerdere huishoudens.
    if (row.user_id && row.household_id && !householdIdByUser.has(row.user_id)) {
      householdIdByUser.set(row.user_id, row.household_id)
    }
  }
  if (householdIdByUser.size === 0) return map

  // Vanaf hier draaien er extra leesronden. Ze staan ACHTER de leegte-check
  // hierboven, dus zolang er geen huishoudleden zijn kost de weging niets.
  const householdIds = [...new Set(householdIdByUser.values())]
  const [settingsResult, allMembersResult] = await Promise.all([
    supabase
      .from('households')
      .select('id, split_mode, custom_split_pct, primary_payer_id')
      .in('id', householdIds),
    // ÁLLE leden van die huishoudens — ook leden die niet in `userIds` zitten.
    // Zonder de partner is `income_ratio` niet te berekenen en weten we niet of
    // een huishouden wel twee leden heeft.
    supabase.from('household_members').select('user_id, household_id').in('household_id', householdIds),
  ])

  if (settingsResult.error || allMembersResult.error) {
    console.error(
      '[unlinked-cash] huishoud-aandeel laden mislukt:',
      settingsResult.error ?? allMembersResult.error,
    )
    // Scope behouden, aandeel fail-closed: de rijen blijven correct gescoopt,
    // maar een gedeelde rekening telt op de helft i.p.v. speculatief vol.
    for (const [userId, householdId] of householdIdByUser) {
      map.set(userId, { householdId, mySharePct: FAIL_CLOSED_SHARE_PCT })
    }
    return map
  }

  const settingsById = new Map(
    (settingsResult.data ?? []).map((h) => [
      h.id as string,
      {
        splitMode: ((h.split_mode as string | null) ?? 'equal') as SplitMode,
        customSplitPct: (h.custom_split_pct as number | null) ?? null,
        primaryPayerId: (h.primary_payer_id as string | null) ?? null,
      },
    ]),
  )
  const memberIdsByHousehold = new Map<string, string[]>()
  for (const row of (allMembersResult.data ?? []) as Array<{
    user_id: string | null
    household_id: string | null
  }>) {
    if (!row.user_id || !row.household_id) continue
    const list = memberIdsByHousehold.get(row.household_id) ?? []
    if (!list.includes(row.user_id)) list.push(row.user_id)
    memberIdsByHousehold.set(row.household_id, list)
  }

  // Income-budgetten alleen ophalen als er écht een income_ratio-huishouden bij
  // zit — spiegelt de conditionele read in `loadPerspectiveContext`.
  const incomeByUser = new Map<string, number>()
  const needsIncome = [...settingsById.values()].some((s) => s.splitMode === 'income_ratio')
  if (needsIncome) {
    const memberIds = [...new Set([...memberIdsByHousehold.values()].flat())]
    const { data: incomeBudgets, error: incomeError } = await supabase
      .from('budgets')
      .select('user_id, default_limit')
      .eq('budget_type', 'income')
      .in('user_id', memberIds)
    if (incomeError) {
      console.error('[unlinked-cash] income-budgetten laden mislukt:', incomeError)
    }
    for (const b of (incomeBudgets ?? []) as Array<{
      user_id: string | null
      default_limit: number | string | null
    }>) {
      if (!b.user_id) continue
      incomeByUser.set(b.user_id, (incomeByUser.get(b.user_id) ?? 0) + (Number(b.default_limit) || 0))
    }
  }

  for (const [userId, householdId] of householdIdByUser) {
    const settings = settingsById.get(householdId)
    const members = memberIdsByHousehold.get(householdId) ?? []
    // Een huishouden met één lid deelt met niemand — spiegelt de
    // `members.length < 2 → SOLO_CONTEXT`-regel van loadPerspectiveContext.
    if (!settings || members.length < 2) {
      map.set(userId, { householdId, mySharePct: 100 })
      continue
    }
    const partnerId = members.find((id) => id !== userId) ?? null
    map.set(userId, {
      householdId,
      mySharePct: computeSharePct(
        settings,
        userId,
        incomeByUser.get(userId) ?? 0,
        partnerId ? (incomeByUser.get(partnerId) ?? 0) : 0,
      ),
    })
  }
  return map
}
