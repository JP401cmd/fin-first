// ── Lokaal pensioen-uitlezen: modeloutput → gecontroleerde regeling ──────────
//
// Het ZUSJE van lib/ai/local/parse.ts. Dat bestand bergt een categorisatie-ARRAY;
// dit bergt één plat regeling-OBJECT en zet er een deterministische reken- en
// sanity-laag achter. De extractie-helft (fences, <think>-preambles, afkapping)
// wordt daar READ-ONLY hergebruikt via `extractLocalJsonObjects` — dat zijn
// eigenschappen van het MODEL, niet van de taak, en die logica een tweede keer
// overtypen is precies de drift die we bij prompts ook weigeren.
//
// ── REKENEN HOORT HIER, NIET BIJ HET MODEL ───────────────────────────────────
//
// Hetzelfde principe als de cijfer-guardrail in parse-intent.ts. De prompt vraagt
// het bedrag ALS TEKST plus een losse `periode`-label; alles wat daarna een
// bewerking is — NL-getalnotatie (1.234,56), euroteken, minteken, jaar→maand
// (delen door twaalf) — gebeurt hieronder in TypeScript. Een 2B-model dat deelt
// door twaalf is een 2B-model dat af en toe door tien deelt, en dit bedrag landt
// in het Horizon-pensioenmodel.
//
// ── EN DAAROM OOK: SANITY-GRENZEN ────────────────────────────────────────────
//
// pdfjs' `getTextContent()` levert fragmenten in contentstream-volgorde, niet in
// visuele kolomvolgorde. Bij een UPO-tabel met labels links en bedragen rechts
// kan de koppeling label↔bedrag dus verschuiven — en een klein model corrigeert
// dat niet, het neemt braaf over wat er staat. De grenzen hieronder vangen de
// grofste gevallen (een postcode of een jaartal dat als bedrag landt); de rest
// wordt als 'onzeker' gemarkeerd zodat de verplichte reviewstap het opvangt.

import { extractLocalJsonObjects } from './parse'
import { NL_AOW_AGE } from '@/lib/constants'
import type { PensionParseResult } from '@/lib/pension/types'

/** Eén regeling zoals het canonieke `PensionParseResultSchema` 'm kent. */
export type Regeling = PensionParseResult['regelingen'][number]

/** De toegestane `type`-waarden, gespiegeld aan `RegelingSchema` in lib/pension/types.ts. */
export const REGELING_TYPES: readonly Regeling['type'][] = [
  'ouderdomspensioen',
  'nabestaandenpensioen',
  'arbeidsongeschiktheidspensioen',
  'overig',
]

/** Velden die als 'minder zeker' aan de gebruiker getoond kunnen worden. */
export type PensionOnzekerVeld = 'fondsNaam' | 'brutoBedrag' | 'ingangLeeftijd' | 'isGeindexeerd' | 'type'

/**
 * Ruwe modelvelden, precies zoals de prompt ze vraagt. `bedrag` is bewust een
 * STRING: de notatie ("€ 1.234,56") is informatie die we in TS willen zien, niet
 * iets wat het model al mag interpreteren.
 */
export interface RawLocalRegeling {
  leeg: boolean
  fondsNaam: string | null
  bedrag: string | null
  periode: string | null
  ingangLeeftijd: string | null
  geindexeerd: boolean | null
  type: string | null
}

// ── Sanity-grenzen ───────────────────────────────────────────────────────────

/**
 * Ondergrens (exclusief) voor een bruto MAANDbedrag. Nul of negatief is geen
 * pensioenuitkering maar een leesfout.
 */
export const BRUTO_MAAND_MIN = 0

/**
 * Bovengrens voor een bruto MAANDbedrag. €15.000/mnd is ruim boven elk
 * realistisch Nederlands aanvullend pensioen; wat daarboven uitkomt is vrijwel
 * altijd een jaarbedrag dat als maandbedrag is gelezen, of een verschoven
 * kolom (een vermogen, een postcode, een jaartal).
 */
export const BRUTO_MAAND_MAX = 15000

/** Onder- en bovengrens voor een pensioeningangsleeftijd. */
export const INGANG_LEEFTIJD_MIN = 55
export const INGANG_LEEFTIJD_MAX = 75

// ── Deterministische getalconversie ──────────────────────────────────────────

/**
 * Lees een bedrag uit vrije tekst in Nederlandse (of Engelse) notatie.
 *
 * Regels, in deze volgorde:
 *  - alles wat geen cijfer, punt of komma is gaat eruit (€, spaties, harde
 *    spaties, "bruto", "per maand");
 *  - staan er punt ÉN komma in, dan is de LAATSTE de decimaalscheiding —
 *    dat dekt zowel "1.234,56" (NL) als "1,234.56" (EN) zonder te gokken;
 *  - staat er maar één soort in, dan is het een decimaalteken als er precies
 *    één van staat met 1 of 2 cijfers erachter ("12,5", "1234.56"), en anders
 *    een duizendtalscheiding ("1.234", "1.234.567").
 *
 * Retourneert `null` wanneer er geen getal in zit. Puur → los testbaar.
 */
export function parseDutchAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null

  const original = raw.trim()
  if (!original) return null
  const negative = original.includes('-')

  const digits = original.replace(/[^\d.,]/g, '')
  if (!digits || !/\d/.test(digits)) return null

  const lastComma = digits.lastIndexOf(',')
  const lastDot = digits.lastIndexOf('.')

  let normalized: string
  if (lastComma !== -1 && lastDot !== -1) {
    normalized =
      lastComma > lastDot
        ? digits.replace(/\./g, '').replace(',', '.')
        : digits.replace(/,/g, '')
  } else if (lastComma !== -1) {
    const decimals = digits.length - lastComma - 1
    const single = digits.indexOf(',') === lastComma
    normalized = single && (decimals === 1 || decimals === 2)
      ? digits.replace(',', '.')
      : digits.replace(/,/g, '')
  } else if (lastDot !== -1) {
    const decimals = digits.length - lastDot - 1
    const single = digits.indexOf('.') === lastDot
    normalized = single && (decimals === 1 || decimals === 2) ? digits : digits.replace(/\./g, '')
  } else {
    normalized = digits
  }

  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

/** Uitkomst van de periode-conversie: het maandbedrag plus of we de periode kenden. */
export interface MaandbedragUitkomst {
  maandbedrag: number
  /** True wanneer de periode niet uit het overzicht bleek (→ 'minder zeker'). */
  periodeOnbekend: boolean
}

/**
 * Zet een bedrag met periode-label om naar een MAANDbedrag.
 *
 * Jaar→maand is delen door twaalf en dat doen we hier, niet in de prompt.
 *
 * ONBEKENDE PERIODE. Dan nemen we het bedrag over als maandbedrag én zetten we
 * `periodeOnbekend`. Dat is bewust geen slimme gok (bv. "boven X zal wel jaar
 * zijn"): zo'n gok is precies het soort onzichtbare aanname dat een factor 12
 * verkeerd het Horizon-model in schuift. In plaats daarvan draagt het veld het
 * label 'minder zeker' en staat de regeling in de reviewstap standaard UIT.
 */
export function toMaandbedrag(amount: number, periode: string | null): MaandbedragUitkomst | null {
  if (!Number.isFinite(amount)) return null
  const p = (periode ?? '').toLowerCase()
  if (/jaar|jaarlijks|annu|year/.test(p)) return { maandbedrag: amount / 12, periodeOnbekend: false }
  if (/maand|mnd|month/.test(p)) return { maandbedrag: amount, periodeOnbekend: false }
  return { maandbedrag: amount, periodeOnbekend: true }
}

// ── Ruwe modeloutput → RawLocalRegeling ──────────────────────────────────────

function toStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') {
    const t = v.trim()
    return t && t.toLowerCase() !== 'null' ? t : null
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

function toBoolOrNull(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase()
    if (t === 'true' || t === 'ja') return true
    if (t === 'false' || t === 'nee') return false
  }
  return null
}

/**
 * Parse de modeloutput van één blok naar {@link RawLocalRegeling}.
 *
 * Fail-closed: geen bruikbaar JSON-object in de tekst → `null`. Het model mag
 * ook expliciet `{"leeg": true}` antwoorden voor een blok zonder regeling; dat
 * komt terug als `leeg: true` en de aanroeper slaat het blok over.
 */
export function parseLocalPensionBlock(text: string): RawLocalRegeling | null {
  const { objects } = extractLocalJsonObjects(text)
  const first = objects?.[0]
  if (!first || typeof first !== 'object') return null
  const o = first as Record<string, unknown>

  return {
    leeg: o.leeg === true || o.leeg === 'true',
    fondsNaam: toStringOrNull(o.fondsNaam),
    bedrag: toStringOrNull(o.bedrag),
    periode: toStringOrNull(o.periode),
    ingangLeeftijd: toStringOrNull(o.ingangLeeftijd),
    geindexeerd: toBoolOrNull(o.geindexeerd),
    type: toStringOrNull(o.type),
  }
}

// ── RawLocalRegeling → gecontroleerde Regeling ───────────────────────────────

export type NormalizeUitkomst =
  | { ok: true; regeling: Regeling; onzeker: PensionOnzekerVeld[] }
  | { ok: false; reden: 'leeg' | 'geen-bedrag' | 'bedrag-buiten-bereik' }

/** Is dit de AOW en niet een aanvullende regeling? Deterministische naamtoets. */
export function isAowRegeling(fondsNaam: string | null): boolean {
  if (!fondsNaam) return false
  return /\baow\b|sociale\s+verzekeringsbank|\bsvb\b/i.test(fondsNaam)
}

/** Normaliseer een `type`-label naar de enum; onbekend → 'overig' (+ onzeker). */
function normalizeType(raw: string | null): { type: Regeling['type']; onzeker: boolean } {
  const t = (raw ?? '').toLowerCase().trim()
  const exact = REGELING_TYPES.find((k) => k === t)
  if (exact) return { type: exact, onzeker: false }
  // Tolerante herkenning: het model schrijft soms "nabestaanden" of "OP".
  if (/nabestaand|partnerpensioen/.test(t)) return { type: 'nabestaandenpensioen', onzeker: false }
  if (/arbeidsongeschikt/.test(t)) return { type: 'arbeidsongeschiktheidspensioen', onzeker: false }
  if (/ouderdom|\bop\b/.test(t)) return { type: 'ouderdomspensioen', onzeker: false }
  return { type: 'overig', onzeker: true }
}

/**
 * Zet één ruwe modelregeling om naar een gecontroleerde {@link Regeling}, met
 * de lijst velden die als 'minder zeker' getoond moeten worden.
 *
 * BUITEN BEREIK = ONBEKEND (opdracht-eis):
 *  - een bruto maandbedrag buiten (0, 15.000] is geen bedrag maar een leesfout →
 *    de hele regeling valt af (`bedrag-buiten-bereik`), want een pensioenpot
 *    zonder betrouwbaar bedrag heeft geen betekenis. De resolver rapporteert
 *    hoeveel blokken zo zijn afgevallen.
 *  - een ingangsleeftijd buiten [55, 75] of ontbrekend wordt NIET verzonnen: het
 *    veld valt terug op de canonieke constante `NL_AOW_AGE` (lib/constants.ts —
 *    geconsumeerd, niet hier bedacht) en wordt als 'minder zeker' gemarkeerd. De
 *    reviewstap zet zo'n regeling standaard uit, zodat er nooit stilzwijgend een
 *    verkeerde leeftijd het Horizon-model in glijdt.
 */
export function normalizeLocalRegeling(raw: RawLocalRegeling): NormalizeUitkomst {
  if (raw.leeg) return { ok: false, reden: 'leeg' }

  const onzeker: PensionOnzekerVeld[] = []

  // ── Bedrag: parse → periode → sanity ──
  const bedrag = parseDutchAmount(raw.bedrag)
  if (bedrag === null) return { ok: false, reden: 'geen-bedrag' }
  const maand = toMaandbedrag(bedrag, raw.periode)
  if (maand === null) return { ok: false, reden: 'geen-bedrag' }
  if (maand.periodeOnbekend) onzeker.push('brutoBedrag')

  // Afronden op hele centen: pdfjs + ÷12 levert anders bedragen met tien
  // decimalen die verderop als "€1.234,5666667" zouden opduiken.
  const brutoBedrag = Math.round(maand.maandbedrag * 100) / 100
  if (brutoBedrag <= BRUTO_MAAND_MIN || brutoBedrag > BRUTO_MAAND_MAX) {
    return { ok: false, reden: 'bedrag-buiten-bereik' }
  }

  // ── Fondsnaam ──
  const fondsNaam = raw.fondsNaam?.trim() ?? ''
  if (!fondsNaam) onzeker.push('fondsNaam')

  // ── Ingangsleeftijd ──
  const leeftijdRaw = parseDutchAmount(raw.ingangLeeftijd)
  const leeftijd = leeftijdRaw === null ? null : Math.round(leeftijdRaw)
  let ingangLeeftijd: number
  if (leeftijd === null || leeftijd < INGANG_LEEFTIJD_MIN || leeftijd > INGANG_LEEFTIJD_MAX) {
    ingangLeeftijd = NL_AOW_AGE
    onzeker.push('ingangLeeftijd')
  } else {
    ingangLeeftijd = leeftijd
  }

  // ── Indexatie ──
  const isGeindexeerd = raw.geindexeerd ?? false
  if (raw.geindexeerd === null) onzeker.push('isGeindexeerd')

  // ── Type ──
  const t = normalizeType(raw.type)
  if (t.onzeker) onzeker.push('type')

  return {
    ok: true,
    regeling: {
      fondsNaam: fondsNaam || 'Onbekende uitvoerder',
      brutoBedrag,
      ingangLeeftijd,
      isGeindexeerd,
      type: t.type,
    },
    onzeker,
  }
}
