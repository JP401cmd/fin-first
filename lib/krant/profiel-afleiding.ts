// ── Profielafleiding (B8): het nieuwsprofiel uit de eigen data van de lezer ──
//
// Een Geheel-gebruiker vult zijn nieuwsprofiel niet in; de Krant leidt het af
// uit wat hij al heeft vastgelegd (profiel, bezittingen, schulden, inkomen) en
// vertaalt dat naar BANDEN — nooit naar bedragen (B1). Wat niet af te leiden
// is blijft `null` ("weet ik niet"): fiscaal partnerschap (keuze 10), de
// leeftijd van kinderen, de huursoort, het werk. Voornemens (woonplan) en de
// rubriekvoorkeur vult de gebruiker zelf (B8); die raakt deze afleiding nooit.
//
// NOOIT UIT AFWEZIGHEID. Een band wordt alleen gezet als er een FEIT achter
// zit: spaargeld en beleggingen alleen als er ten minste één Box 3-bezit of
// losse bankrekening is vastgelegd; "geen schulden" alleen als er bezittingen
// of schulden zijn vastgelegd; lijfrente alleen 'ja' (nooit 'nee' omdat er
// geen lijfrente tussen de potten staat); "geen kinderen" alleen bij `solo` of
// `samen` met 0 (bij `gezin` is 0 de DB-default van een overgeslagen veld);
// een verlopen rentevastdatum is stale data, geen "korter dan een jaar".
//
// Twee lagen, bewust gescheiden:
//   leidProfielAf(bronnen, ctx)         PUUR — testbaar op de persona's
//   laadAfleidingBronnen(client, uid)   IO  — de enige plek die tabellen leest
//
// EIGENAARSCHAP IS HIER HANDWERK. Deze code draait in de weekcron op een
// SERVICE-ROLE-client: `auth.uid()` is NULL en RLS scoopt níets. Bovendien is
// de SELECT-policy op `assets` huishoud-gedeeld, dus ook een sessie-client zou
// partnerrijen leveren. Daarom draagt ÉLKE query hier een expliciete
// `.eq('user_id', userId)` (op `profiles`: de eigen sleutel `id`) — bewaakt
// door profiel-afleiding.test.ts (bron-scan én gedragstest met een partnerrij).
// Geen `select('*')` op `assets` (ciphertext + blind index, kolomregel in
// CLAUDE.md): elke lezing noemt haar kolommen.
//
// HERLEIDEN, NIET OPHOGEN: elke run rekent de afgeleide velden opnieuw uit de
// bron; een eerder afgeleide waarde speelt geen rol. Een veld met herkomst
// 'zelf' wordt nooit overschreven.
//
// Consume, don't recompute — de canonieke bronnen per veld:
//   inkomen      het transactie-jaarinkomen op de HISTORIEBASIS (ADR 0138):
//                fetchRealizedBudgetAmounts → transactionAnnualIncome — het
//                maandaggregaat (geen max_rows-kap), transfer-gefilterd (ADR
//                0169), "budgetteren uit" gerespecteerd (ADR 0139), gedeeld door
//                historyMonths — met scope { userId, householdId: null } = EIGEN
//                rijen (B1: eigen inkomen; de huishoud-gedeelde budgetgrondslag
//                wordt daarom bewust NIET geraadpleegd), daarna de precedentie
//                van resolveEffectiveIncomeExpenses (manual wint, ADR 0103/0131).
//                De band kan daardoor afwijken van `monthlyIncome` op het
//                dashboard voor wie een inkomstenbudget als grondslag heeft.
//   spaargeld/   classifyAsset (lib/box3-data.ts) over de eigen bezittingen +
//   beleggingen  de losse bankrekeningen via selectUnlinkedBankAccountsForUser
//                en unlinkedCashTotal (zelfde optelling als de snapshots-cron).
//   werk         lookupAowAge op de tabelrijen (ctx.aowRows).
//
// euro-only (B2, ADR 0172): geen uitgavenband, geen dagtarief — bewaakt door
// lib/krant/euro-only.test.ts (dit bestand leest de uitgavenschatting niet).

import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyAsset } from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import { resolveEffectiveIncomeExpenses } from '@/lib/effective-financials'
import { fetchRealizedBudgetAmounts, transactionAnnualIncome } from '@/lib/budget-realized'
import { selectUnlinkedBankAccountsForUser, unlinkedCashTotal, type UnlinkedCashRow } from '@/lib/unlinked-cash'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { GEBOORTEJAAR_MAX, GEBOORTEJAAR_MIN, PROFIEL_VELDEN, type ProfielVeld } from './profiel-velden'
import {
  BELEGGINGEN_BANDEN,
  HYPOTHEEK_RESTSCHULD_BANDEN,
  INKOMEN_BANDEN,
  LEEG_PROFIEL,
  PROFIEL_VERSIE,
  SPAARGELD_BANDEN,
  STUDIESCHULD_BANDEN,
  nieuwsprofielV1Schema,
  type Band,
  type NieuwsprofielV1,
} from './profiel'

// ── Types ────────────────────────────────────────────────────────────────────

export type Herkomst = Partial<Record<ProfielVeld, 'zelf' | 'afgeleid'>>

/** De kolommen die de afleiding van `profiles` leest — en niets meer. */
export const PROFIEL_AFLEIDING_KOLOMMEN = 'id, date_of_birth, household_type, number_of_children, income_source, net_monthly_income'
/** Kolommen van `assets`: expliciet (kolomregel), zonder `*_encrypted`/`*_hash`. */
export const ASSET_AFLEIDING_KOLOMMEN = 'id, asset_type, subtype, current_value, box3_vrijgesteld, box3_vrijstelling_reden'
export const DEBT_AFLEIDING_KOLOMMEN = 'id, debt_type, current_balance, fixed_rate_end_date'

export interface ProfielRij {
  id: string
  date_of_birth: string | null
  household_type: string | null
  number_of_children: number | null
  income_source: string | null
  net_monthly_income: number | null
}

export interface AssetRij {
  id: string
  asset_type: string
  subtype: string | null
  current_value: number | string | null
  box3_vrijgesteld: boolean | null
  box3_vrijstelling_reden: string | null
}

export interface DebtRij {
  id: string
  debt_type: string
  current_balance: number | string | null
  fixed_rate_end_date: string | null
}

/** De rij in `nieuwsprofiel` (migratie 20260922120000). */
export interface NieuwsprofielRij {
  user_id: string
  profiel_versie: number
  geboortejaar: number | null
  huishouden: string | null
  kinderen: string | null
  werk: string[] | null
  inkomen: string | null
  wonen: string | null
  hypotheek_restschuld: string | null
  hypotheek_rentevast: string | null
  woonplan: string | null
  spaargeld: string | null
  beleggingen: string | null
  beleggingen_vorm: string[] | null
  schulden: string[] | null
  pensioen_werkgever: string | null
  pensioen_lijfrente: string | null
  rubrieken: string[] | null
  herkomst: Herkomst
  afgeleid_at: string | null
}

export interface AfleidingBronnen {
  profiel: ProfielRij | null
  assets: AssetRij[]
  debts: DebtRij[]
  /** Eigen maandinkomen uit de transacties: transactieJAARinkomen (historiebasis, ADR 0138) ÷ 12. */
  inkomenTransacties: number
  /** Saldo van de losse (niet aan een cash-bezit gekoppelde) eigen bankrekeningen. */
  losseRekeningen: number
  /** Zijn er losse bankrekeningen vastgelegd (ook bij saldo 0)? */
  heeftLosseRekeningen: boolean
  /** De bestaande rij (voor 'zelf'-velden), of null. */
  bestaand: NieuwsprofielRij | null
}

export interface AfleidingContext {
  now: Date
  /** Rijen uit `aow_leeftijd` via getAowLeeftijden — nooit hier gelezen. */
  aowRows: AowLeeftijdRow[]
}

export interface AfgeleidProfiel {
  profiel: NieuwsprofielV1
  herkomst: Herkomst
}

// ── Rij ↔ profiel ────────────────────────────────────────────────────────────

/** De vorm vóór validatie: de kolommen van de rij gehergroepeerd tot het profiel. */
function rijNaarKandidaat(rij: NieuwsprofielRij) {
  return {
    versie: PROFIEL_VERSIE,
    geboortejaar: rij.geboortejaar,
    huishouden: rij.huishouden,
    kinderen: rij.kinderen,
    werk: rij.werk,
    inkomen: rij.inkomen,
    wonen: rij.wonen,
    hypotheek: { restschuld: rij.hypotheek_restschuld, rentevast: rij.hypotheek_rentevast },
    woonplan: rij.woonplan,
    spaargeld: rij.spaargeld,
    beleggingen: { band: rij.beleggingen, vorm: rij.beleggingen_vorm },
    schulden: rij.schulden,
    pensioenopbouw: { werkgever: rij.pensioen_werkgever, lijfrente: rij.pensioen_lijfrente },
    rubrieken: rij.rubrieken,
  }
}

/** De DB-rij naar het matcher-profiel; een rij die het schema niet haalt geeft het lege profiel. */
export function rijNaarProfiel(rij: NieuwsprofielRij | null): NieuwsprofielV1 {
  if (!rij) return LEEG_PROFIEL
  const parsed = nieuwsprofielV1Schema.safeParse(rijNaarKandidaat(rij))
  return parsed.success ? parsed.data : LEEG_PROFIEL
}

/**
 * Eén veld uit de rij, PER VELD gevalideerd tegen het schema. Een ongeldige
 * waarde in het ene veld mag een geldige 'zelf'-waarde in een ander veld niet
 * meeslepen (een alles-of-niets-parse zou de hele rij op leeg zetten en de
 * upsert daarna de ingevulde waarden overschrijven).
 */
export function zelfWaarde<K extends ProfielVeld>(rij: NieuwsprofielRij, veld: K): NieuwsprofielV1[K] {
  const kandidaat = rijNaarKandidaat(rij)[veld]
  const parsed = nieuwsprofielV1Schema.shape[veld].safeParse(kandidaat)
  return (parsed.success ? parsed.data : LEEG_PROFIEL[veld]) as NieuwsprofielV1[K]
}

/** Het profiel naar de kolommen van `nieuwsprofiel` (zonder user_id/tijdstempels). */
export function profielNaarKolommen(profiel: NieuwsprofielV1, herkomst: Herkomst) {
  return {
    profiel_versie: profiel.versie,
    geboortejaar: profiel.geboortejaar,
    huishouden: profiel.huishouden,
    kinderen: profiel.kinderen,
    werk: profiel.werk,
    inkomen: profiel.inkomen,
    wonen: profiel.wonen,
    hypotheek_restschuld: profiel.hypotheek.restschuld,
    hypotheek_rentevast: profiel.hypotheek.rentevast,
    woonplan: profiel.woonplan,
    spaargeld: profiel.spaargeld,
    beleggingen: profiel.beleggingen.band,
    beleggingen_vorm: profiel.beleggingen.vorm,
    schulden: profiel.schulden,
    pensioen_werkgever: profiel.pensioenopbouw.werkgever,
    pensioen_lijfrente: profiel.pensioenopbouw.lijfrente,
    rubrieken: profiel.rubrieken,
    herkomst,
  }
}

// ── Helpers (puur) ───────────────────────────────────────────────────────────

function num(v: number | string | null | undefined): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** De band waarin `bedrag` valt (lo ≤ x < hi; hi null = open); null als geen band past. */
export function bandVoor<K extends string>(banden: Readonly<Record<K, Band>>, bedrag: number): K | null {
  for (const [sleutel, band] of Object.entries(banden) as [K, Band][]) {
    if (band.lo === band.hi) continue // de lege band ('geen') kiest de aanroeper zelf
    if (bedrag >= band.lo && (band.hi == null || bedrag < band.hi)) return sleutel
  }
  return null
}

function geboortejaarUit(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(dateOfBirth)
  if (!m) return null
  const jaar = Number(m[1])
  return jaar >= GEBOORTEJAAR_MIN && jaar <= GEBOORTEJAAR_MAX ? jaar : null
}

/** Leeftijd in jaren (fractioneel) op `now`. */
function leeftijdOp(dateOfBirth: string, now: Date): number | null {
  const dob = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(dob.getTime())) return null
  return (now.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
}

const MAAND_MS = 30.4375 * 24 * 60 * 60 * 1000

function maandenTot(datum: string, now: Date): number | null {
  const t = new Date(datum).getTime()
  if (Number.isNaN(t)) return null
  return (t - now.getTime()) / MAAND_MS
}

/**
 * Rentevastband uit de resterende maanden, halfopen zoals elke band: [0, 12)
 * tot-1-jaar, [12, 60) 2-5-jaar, [60, ∞) boven-5-jaar. Het vocabulaire kent
 * geen 1–2-jaarband; 12–23 maanden landt in de dichtstbijzijnde (2-5-jaar).
 * Een verlopen einddatum is stale data — onbekend, geen "korter dan een jaar".
 */
export function rentevastBand(maanden: number | null): NieuwsprofielV1['hypotheek']['rentevast'] {
  if (maanden == null || maanden < 0) return null
  if (maanden < 12) return 'tot-1-jaar'
  if (maanden < 60) return '2-5-jaar'
  return 'boven-5-jaar'
}

const CONSUMPTIEF_TYPES = new Set(['personal_loan', 'credit_card', 'revolving_credit', 'car_loan', 'payment_plan'])

// ── De afleiding (puur) ──────────────────────────────────────────────────────

export function leidProfielAf(bronnen: AfleidingBronnen, ctx: AfleidingContext): AfgeleidProfiel {
  const { profiel: p, assets, debts } = bronnen
  const heeftFinancieleData = assets.length > 0 || debts.length > 0 || bronnen.heeftLosseRekeningen
  const afgeleid: NieuwsprofielV1 = {
    ...LEEG_PROFIEL,
    hypotheek: { ...LEEG_PROFIEL.hypotheek },
    beleggingen: { ...LEEG_PROFIEL.beleggingen },
    pensioenopbouw: { ...LEEG_PROFIEL.pensioenopbouw },
  }

  // geboortejaar — profiles.date_of_birth (tekst)
  afgeleid.geboortejaar = geboortejaarUit(p?.date_of_birth ?? null)

  // huishouden — alleen 'solo' is zeker; samen/gezin = partner, fiscaal partnerschap ONBEKEND (keuze 10)
  afgeleid.huishouden = p?.household_type === 'solo' ? 'alleen' : null

  // kinderen — aantal zonder leeftijd: alleen 'geen' is af te leiden, en alleen
  // waar 0 geloofwaardig is (bij `gezin` is 0 de DB-default van een leeg veld).
  afgeleid.kinderen = p?.number_of_children === 0 && (p.household_type === 'solo' || p.household_type === 'samen') ? 'geen' : null

  // werk — geen kolom; alleen "al met AOW" is een feit (lookupAowAge op de tabelrijen)
  if (p?.date_of_birth) {
    const leeftijd = leeftijdOp(p.date_of_birth, ctx.now)
    const aow = lookupAowAge(ctx.aowRows, p.date_of_birth)
    afgeleid.werk = leeftijd != null && ctx.aowRows.length > 0 && leeftijd >= aow.fractional ? ['pensioen'] : null
  }

  // inkomen — canonieke precedentie (manual wint) op het eigen transactie-inkomen;
  // grondslag 'unknown' (niets gemeten, niets ingevuld) blijft onbekend.
  if (p) {
    const inkomen = resolveEffectiveIncomeExpenses(
      { net_monthly_income: p.net_monthly_income, income_source: p.income_source },
      bronnen.inkomenTransacties,
      0,
    )
    afgeleid.inkomen = inkomen.incomeBasis === 'unknown' ? null : bandVoor(INKOMEN_BANDEN, inkomen.income)
  }

  // wonen + hypotheek — eigen_huis (eigen user_id) + mortgage-schulden (eigen rijen; een
  // hypotheek op de rij van de partner telt niet — B1, eigen situatie)
  const hypotheken = debts.filter((d) => d.debt_type === 'mortgage' && num(d.current_balance) > 0)
  const restschuld = hypotheken.reduce((s, d) => s + num(d.current_balance), 0)
  const heeftEigenHuis = assets.some((a) => a.asset_type === 'eigen_huis')
  if (heeftEigenHuis) {
    afgeleid.wonen = restschuld > 0 ? 'koop-met-hypotheek' : 'koop-zonder-hypotheek'
  }
  if (restschuld > 0) {
    afgeleid.hypotheek.restschuld = bandVoor(HYPOTHEEK_RESTSCHULD_BANDEN, restschuld)
    // De grootste hypotheek bepaalt de rentevastband; zonder (of met een
    // verlopen) einddatum blijft hij onbekend — nooit "variabel" gokken.
    const grootste = [...hypotheken].sort((a, b) => num(b.current_balance) - num(a.current_balance))[0]
    afgeleid.hypotheek.rentevast = rentevastBand(grootste.fixed_rate_end_date ? maandenTot(grootste.fixed_rate_end_date, ctx.now) : null)
  }

  // spaargeld / beleggingen — Box 3-indeling per bezitting (classifyAsset) plus de
  // losse bankrekeningen; alleen als er ten minste één Box 3-feit is vastgelegd
  let spaargeld = bronnen.losseRekeningen
  let beleggingen = 0
  let heeftBox3Feit = bronnen.heeftLosseRekeningen
  const vormen = new Set<'fondsen' | 'aandelen' | 'crypto' | 'tweede-woning'>()
  for (const a of assets) {
    const { category } = classifyAsset(a as unknown as Asset)
    if (!category) continue
    heeftBox3Feit = true
    const waarde = num(a.current_value)
    if (category === 'spaargeld') spaargeld += waarde
    if (category === 'beleggingen') {
      beleggingen += waarde
      if (a.asset_type === 'crypto') vormen.add('crypto')
      else if (a.asset_type === 'real_estate') vormen.add('tweede-woning')
      else if (a.asset_type === 'investment') vormen.add(a.subtype === 'aandelen' ? 'aandelen' : 'fondsen')
    }
  }
  if (heeftBox3Feit) {
    afgeleid.spaargeld = bandVoor(SPAARGELD_BANDEN, Math.max(0, spaargeld))
    afgeleid.beleggingen.band = beleggingen <= 0 ? 'geen' : bandVoor(BELEGGINGEN_BANDEN, beleggingen)
    afgeleid.beleggingen.vorm = beleggingen <= 0 ? null : vormen.size > 0 ? [...vormen].sort() : null
  }

  if (heeftFinancieleData) {
    // schulden — studieschuld als band, consumptief als vlag; anders 'geen'
    const studieschuld = debts.filter((d) => d.debt_type === 'student_loan').reduce((s, d) => s + num(d.current_balance), 0)
    const consumptief = debts.some((d) => CONSUMPTIEF_TYPES.has(d.debt_type) && num(d.current_balance) > 0)
    const schulden: NonNullable<NieuwsprofielV1['schulden']> = []
    if (studieschuld > 0) {
      const band = bandVoor(STUDIESCHULD_BANDEN, studieschuld)
      if (band) schulden.push(band)
    }
    if (consumptief) schulden.push('consumptief-krediet')
    afgeleid.schulden = schulden.length > 0 ? schulden : ['geen']
  }

  // pensioenopbouw — uit de geregistreerde pensioenpotten; alleen 'ja' is een feit
  const pensioen = assets.filter((a) => a.asset_type === 'retirement')
  if (pensioen.some((a) => a.subtype === 'lijfrente')) afgeleid.pensioenopbouw.lijfrente = 'ja'
  if (pensioen.some((a) => a.subtype !== 'lijfrente')) afgeleid.pensioenopbouw.werkgever = 'ja'

  return voegSamen(afgeleid, bronnen.bestaand)
}

/** Velden die de afleiding NOOIT zet: de gebruiker vult ze zelf in (B8). */
export const ZELF_VELDEN: readonly ProfielVeld[] = ['woonplan', 'rubrieken']

/**
 * Afgeleide waarden over de bestaande rij heen: een 'zelf'-veld houdt zijn
 * (per veld gevalideerde) waarde, de zelf-velden blijven wat ze waren, de
 * rest wordt 'afgeleid'.
 */
function voegSamen(afgeleid: NieuwsprofielV1, bestaand: NieuwsprofielRij | null): AfgeleidProfiel {
  const herkomst: Herkomst = { ...(bestaand?.herkomst ?? {}) }
  const profiel: NieuwsprofielV1 = {
    ...afgeleid,
    hypotheek: { ...afgeleid.hypotheek },
    beleggingen: { ...afgeleid.beleggingen },
    pensioenopbouw: { ...afgeleid.pensioenopbouw },
  }
  for (const veld of PROFIEL_VELDEN) {
    const zelf = herkomst[veld] === 'zelf' || ZELF_VELDEN.includes(veld)
    if (zelf) {
      if (bestaand) zetVeld(profiel, veld, zelfWaarde(bestaand, veld))
      continue
    }
    herkomst[veld] = 'afgeleid'
  }
  return { profiel, herkomst }
}

/** Zet één profielveld (incl. de samengestelde) met een verse kopie. */
function zetVeld<K extends ProfielVeld>(naar: NieuwsprofielV1, veld: K, waarde: NieuwsprofielV1[K]): void {
  const kopie = Array.isArray(waarde) ? [...waarde] : waarde && typeof waarde === 'object' ? structuredClone(waarde) : waarde
  naar[veld] = kopie as NieuwsprofielV1[K]
}

// ── IO ───────────────────────────────────────────────────────────────────────

/**
 * Leest de bronnen voor één gebruiker. Elke query draagt `.eq('user_id', …)`
 * (op `profiles`: `.eq('id', …)`), omdat de aanroeper een service-role-client
 * meegeeft en RLS hier niets scoopt. Het inkomen en de losse rekeningen lopen
 * via de canonieke helpers met een expliciete eigen scope.
 */
export async function laadAfleidingBronnen(client: SupabaseClient, userId: string): Promise<AfleidingBronnen> {
  const [profielRes, assetsRes, debtsRes, rekeningenRes, venster, bestaandRes] = await Promise.all([
    client.from('profiles').select(PROFIEL_AFLEIDING_KOLOMMEN).eq('id', userId).maybeSingle(),
    client.from('assets').select(ASSET_AFLEIDING_KOLOMMEN).eq('user_id', userId).eq('is_active', true),
    client.from('debts').select(DEBT_AFLEIDING_KOLOMMEN).eq('user_id', userId).eq('is_active', true),
    // Losse bankrekeningen: expliciete kolommen, eigen rijen (householdId null).
    selectUnlinkedBankAccountsForUser(client, userId, null),
    // Transactie-inkomen op de historiebasis, eigen rijen (householdId null).
    fetchRealizedBudgetAmounts(client, { userId, householdId: null }),
    client.from('nieuwsprofiel').select('*').eq('user_id', userId).maybeSingle(),
  ])

  const fout = profielRes.error ?? assetsRes.error ?? debtsRes.error ?? rekeningenRes.error ?? bestaandRes.error
  if (fout) throw new Error(`[krant/profiel-afleiding] lezen mislukt voor ${userId}: ${fout.message}`)

  const rekeningen = (rekeningenRes.data ?? []) as UnlinkedCashRow[]
  return {
    profiel: (profielRes.data as ProfielRij | null) ?? null,
    assets: (assetsRes.data ?? []) as AssetRij[],
    debts: (debtsRes.data ?? []) as DebtRij[],
    inkomenTransacties: transactionAnnualIncome(venster) / 12,
    losseRekeningen: unlinkedCashTotal(rekeningen, { perspective: 'personal', mySharePct: 100 }),
    heeftLosseRekeningen: rekeningen.length > 0,
    bestaand: (bestaandRes.data as NieuwsprofielRij | null) ?? null,
  }
}

/** Lees + afleiden + wegschrijven (upsert op user_id). Geeft het profiel terug dat de matcher leest. */
export async function afleidNieuwsprofiel(client: SupabaseClient, userId: string, ctx: AfleidingContext): Promise<AfgeleidProfiel> {
  const bronnen = await laadAfleidingBronnen(client, userId)
  const uitkomst = leidProfielAf(bronnen, ctx)
  const { error } = await client.from('nieuwsprofiel').upsert(
    {
      user_id: userId,
      ...profielNaarKolommen(uitkomst.profiel, uitkomst.herkomst),
      afgeleid_at: ctx.now.toISOString(),
      updated_at: ctx.now.toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error(`[krant/profiel-afleiding] schrijven mislukt voor ${userId}: ${error.message}`)
  return uitkomst
}
