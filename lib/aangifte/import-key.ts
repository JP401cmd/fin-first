/**
 * Server-afgeleide idempotentiesleutel voor de aangifte-import.
 *
 * ── WAAROM DIT BESTAAT ──────────────────────────────────────────────
 * De route accepteerde tot nu toe een `idempotency_key` die de CLIENT
 * meestuurde. Dat faalt op twee manieren tegelijk:
 *
 *   1. NIET STABIEL. `components/aangifte/review-step.tsx` mint een verse
 *      `crypto.randomUUID()` bij ELKE submit-poging. Twee submits vanuit
 *      dezelfde review dragen dus nooit dezelfde sleutel — de dedup kan
 *      principieel niet raken, ook niet op een warme serverinstantie.
 *   2. VERTROUWENSGRENS. Een client-geleverde sleutel kan botsen met een
 *      bestaande claim en een legitieme import stil laten overslaan.
 *
 * Daarom leidt de SERVER de sleutel af uit de INHOUD van de payload —
 * exact het patroon van `import_hash` in `/api/transactions/import`
 * (dat de client-waarde negeert en herberekent) en van
 * `lib/holdings-import-key.ts`.
 *
 * ── DE TWEE EISEN AAN EEN BRUIKBARE SLEUTEL ─────────────────────────
 * STABIEL — dezelfde aangifte levert altijd dezelfde sleutel:
 *   · Bedragen via `toFixed(2)`, zodat drijvendekomma-ruis (1234.5 vs
 *     1234.50 vs 1234.4999999999998) de sleutel niet breekt. Dezelfde
 *     invariant die `lib/parsers/shared.ts#computeHash` expliciet noemt.
 *   · Namen getrimd en lowercase.
 *   · Rijen GESORTEERD, zodat de sleutel niet afhangt van de volgorde
 *     die de review-stap toevallig oplevert. Sorteren raakt uitsluitend
 *     de hash-input — de schrijfvolgorde in de route blijft ongemoeid,
 *     dus de indices in `linked_mortgage_pairs` blijven geldig.
 *
 * ONDERSCHEIDEND — twee verschillende imports krijgen nooit dezelfde
 * sleutel: één gewijzigd bedrag, één verwijderde rij of één andere
 * hypotheek-koppeling levert een andere hash, zodat een GECORRIGEERDE
 * her-import gewoon doorgaat.
 *
 * ── WAAROM DE KOPPELPAREN OP INHOUD, NIET OP INDEX ──────────────────
 * `linked_mortgage_pairs` draagt INDICES in de verstuurde arrays. Die
 * indices letterlijk meehashen zou de sleutel weer volgorde-gevoelig
 * maken — precies wat het sorteren hierboven wegneemt. We vertalen elk
 * paar daarom eerst naar de CANONIEKE RIJTEKST van de asset en de debt
 * waar het naar wijst, en sorteren die. Zo is het paar-deel van de
 * sleutel tegelijk volgorde-onafhankelijk (stabiel) én gevoelig voor
 * een gewijzigde koppeling (onderscheidend).
 */

import { createHash } from 'node:crypto'
import type {
  AangifteAssetReviewItem,
  AangifteDebtReviewItem,
  AangifteImportPayload,
} from '@/lib/aangifte/types'

/**
 * Veldscheider binnen één gecanonicaliseerde rij. Unit Separator (U+001F)
 * is een stuurteken dat niet in namen of bedragen voorkomt, zodat
 * "a<SEP>bc" en "ab<SEP>c" nooit dezelfde tekst opleveren.
 */
const FIELD_SEP = String.fromCharCode(31)

/** Bedrag → vaste 2 decimalen. `1234.5`, `1234.50` en `1234.499999` → `"1234.50"`. */
function amount(value: number): string {
  return value.toFixed(2)
}

/** Optioneel bedrag → vaste decimalen, of lege tekst als het ontbreekt. */
function optionalAmount(value: number | undefined): string {
  return typeof value === 'number' ? amount(value) : ''
}

/** Naam → getrimd en lowercase, zodat spatie-/kapitalisatieruis niet telt. */
function name(value: string): string {
  return value.trim().toLowerCase()
}

/** `field3` is string | number | null | undefined → één tekstvorm. */
function field3(value: string | number | null | undefined): string {
  return value == null ? '' : String(value)
}

/** Canonieke rijtekst van één bezitting. */
function canonicalAsset(item: AangifteAssetReviewItem): string {
  return [
    item.asset_type,
    name(item.name),
    amount(item.current_value),
    optionalAmount(item.current_value_actual),
    field3(item.field3),
  ].join(FIELD_SEP)
}

/** Canonieke rijtekst van één schuld. */
function canonicalDebt(item: AangifteDebtReviewItem): string {
  return [
    item.debt_type,
    name(item.name),
    amount(item.current_balance),
    optionalAmount(item.current_balance_actual),
    field3(item.field3),
    // Een schuld die aan een ánder pand is gekoppeld is een andere import.
    item.linked_asset_id ?? '',
  ].join(FIELD_SEP)
}

/**
 * Profielvelden als gesorteerde sleutel/waarde-paren. Alleen daadwerkelijk
 * aanwezige velden tellen mee: de route doet een PARTIËLE update en slaat
 * ontbrekende velden over, dus `{}` en `{gross_annual_income: undefined}`
 * moeten dezelfde sleutel geven.
 */
function canonicalProfile(
  updates: AangifteImportPayload['profile_updates'],
): string[] {
  const pairs: string[] = []
  for (const [key, value] of Object.entries(updates)) {
    if (value == null) continue
    const text = typeof value === 'number' ? amount(value) : String(value)
    pairs.push(`${key}${FIELD_SEP}${text}`)
  }
  return pairs.sort()
}

/**
 * Koppelparen vertaald naar de inhoud waar ze naar wijzen (zie kopcommentaar).
 * Paren die buiten de arrays wijzen worden overgeslagen — exact zoals de
 * route ze overslaat, zodat sleutel en schrijfgedrag niet uit elkaar lopen.
 */
function canonicalPairs(payload: AangifteImportPayload): string[] {
  const pairs = payload.linked_mortgage_pairs ?? []
  const out: string[] = []
  for (const pair of pairs) {
    const asset = payload.assets[pair.asset_idx]
    const debt = payload.debts[pair.debt_idx]
    if (!asset || !debt) continue
    out.push(`${canonicalAsset(asset)}${FIELD_SEP}->${FIELD_SEP}${canonicalDebt(debt)}`)
  }
  return out.sort()
}

/**
 * Leidt de idempotentiesleutel af uit de INHOUD van de payload.
 *
 * Let op: `payload.idempotency_key` wordt hier BEWUST niet gelezen. Het veld
 * blijft in het zod-schema staan zodat oude clients tijdens een rollende
 * deploy niet stuklopen, maar de waarde wordt genegeerd — net zoals de
 * bankimport de client-aangeleverde `import_hash` negeert.
 *
 * ── WAAROM `userId` MEEHASHT ────────────────────────────────────────
 * Niet voor de scoping — die zit al in de primaire sleutel
 * (user_id, scope, key). Wel voor de PRIVACY: een ongezouten hash over
 * bedragen en namen is een verifieerbare commitment. Zonder gebruiker in
 * de invoer zouden twee gebruikers met identieke aangifte-inhoud
 * dezelfde hash krijgen, en dat is een correleerbaar gegeven voor wie de
 * tabel kan lezen. Met de gebruiker erin is de sleutel per account uniek
 * en valt die correlatie weg. Een hash van persoonsgegevens is onder de
 * AVG gepseudonimiseerd, niet geanonimiseerd — dus dit kost niets en
 * neemt een echte lekbron weg.
 *
 * @returns SHA-256 als hex-tekst (64 tekens).
 */
export function deriveAangifteImportKey(
  payload: AangifteImportPayload,
  userId: string,
): string {
  const canonical = {
    user: userId,
    peildatum: payload.peildatum,
    tax_year: payload.tax_year,
    assets: payload.assets.map(canonicalAsset).sort(),
    debts: payload.debts.map(canonicalDebt).sort(),
    profile: canonicalProfile(payload.profile_updates),
    pairs: canonicalPairs(payload),
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

/** Scope-waarde voor `import_idempotency.scope` bij dit importpad. */
export const AANGIFTE_IMPORT_SCOPE = 'aangifte_import'
