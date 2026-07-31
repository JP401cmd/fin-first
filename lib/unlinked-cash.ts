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
 * ## Waarom er GEEN weging op zit
 *
 * De app weegt gedeeld bezit met `net_worth_inclusion_pct` (zie
 * `lib/dashboard-wealth-weighting.ts`). Die kolom bestaat op `assets` en `debts`
 * — en bewust NIET op `bank_accounts`. Er valt hier dus niets te wegen: elke
 * "weging" die deze module zou aanbrengen is een verzonnen tweede som die
 * onmiddellijk zou driften met het dashboard, dat losse rekeningen altijd al op
 * 100% telt (`lib/server-data/base.ts#getUnlinkedBankAccounts` →
 * `computeLiquidPot`). Consume, don't recompute: de grondslag is "volledig
 * saldo", en dat is hier de canonieke waarheid.
 *
 * Gevolg op huishoudniveau — bewust en pre-existent: een GEDEELDE losse rekening
 * telt bij béíde partners voor 100% mee, terwijl een gedeelde bezitting via
 * `net_worth_inclusion_pct` over de partners verdeeld wordt. Dat asymmetrische
 * gedrag komt niet uit deze module maar uit het ontbreken van de kolom op
 * `bank_accounts`; het is vastgelegd als aandachtspunt, niet hier stilletjes
 * gecorrigeerd (dat zou het dashboard-getal en het snapshot-getal uit elkaar
 * laten lopen).
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

/** Minimale rijvorm voor de saldo-optelling. */
export type UnlinkedCashRow = { balance?: number | string | null }

/**
 * De ene kolomset. Bewust de RUIMSTE bestaande set (horizon-loader leest `id,
 * name, balance`; de optellers hebben genoeg aan `balance`) en bewust een
 * LITERAL, geen parameter: PostgREST leidt de rijvorm af uit de letterlijke
 * select-string, dus een `string`-parameter degradeert élke consument naar
 * `GenericStringError`. Twee extra kolommen op een handvol rekeningrijen is een
 * verwaarloosbare prijs voor één getypeerde query-definitie.
 */
export const UNLINKED_CASH_COLUMNS = 'id, name, balance'

/**
 * DE som over losse bankrekening-saldi. Ongewogen — zie de moduledocstring.
 * `null`/`undefined` (gefaalde leesronde) levert 0: een ontbrekend saldo mag het
 * netto vermogen niet doen crashen, en 0 is de eerlijke val-terug.
 */
export function unlinkedCashTotal(
  rows: ReadonlyArray<UnlinkedCashRow> | null | undefined,
): number {
  return (rows ?? []).reduce((sum, row) => sum + Number(row.balance ?? 0), 0)
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
    .select('id, name, balance')
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

function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/**
 * `user_id → household_id` voor een set gebruikers, in één leesronde.
 *
 * Alleen voor service-role-context: de cron verwerkt álle gebruikers en heeft per
 * gebruiker het huishouden nodig om {@link selectUnlinkedBankAccountsForUser} te
 * voeden. Een gefaalde leesronde levert een lege map — dan valt élke gebruiker
 * terug op alleen-eigen-rijen (fail-closed: liever een saldo te weinig dan het
 * saldo van een vreemde).
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
export async function loadHouseholdIdsByUser(
  supabase: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
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

  for (const row of data as Array<{ user_id: string | null; household_id: string | null }>) {
    // Eerste (oudste) lidmaatschap wint — zie de docstring over meerdere huishoudens.
    if (row.user_id && row.household_id && !map.has(row.user_id)) {
      map.set(row.user_id, row.household_id)
    }
  }
  return map
}
