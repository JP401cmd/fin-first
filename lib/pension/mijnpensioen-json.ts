/**
 * mijnpensioen-json — DETERMINISTISCHE mapper voor de JSON-export van
 * mijnpensioen.nl (mijnpensioenoverzicht.nl) naar een `PensionParseResult`.
 *
 * Geen AI: dit is een pure, deterministische transformatie van de JSON-structuur
 * van het pensioenregister. De PDF-import (app/api/pension/parse/route.ts) leunt
 * op een LLM om bedragen uit een PDF te halen; de JSON-export bevat de getallen
 * gestructureerd, dus mappen we ze regelvast af.
 *
 * EENHEID (de hele reden van deze mapper):
 *   De JSON-bedragen van mijnpensioen.nl zijn bruto JAARbedragen, terwijl
 *   `PensionParseResult.brutoBedrag`/`aowBedrag` bruto MAANDbedragen zijn
 *   (de zod `.describe()` in route.ts zegt "Bruto maandbedrag in EUR" en
 *   apply-parse-result.ts schrijft ze direct naar `monthly_income_change`).
 *   Daarom delen we elk JSON-jaarbedrag door 12 en ronden af op hele euro's met
 *   `Math.round(...)`. Zo levert de JSON-import EXACT dezelfde eenheid als de
 *   PDF-import en kan het resultaat via `applyPensionParseResult` dezelfde
 *   life_events-conventie volgen.
 *
 * - Eén pensioenpot per pensioenuitvoerder (gegarandeerd + indicatief opgeteld);
 *   uitvoerders met een indicatief deel krijgen de naam-suffix " (deels indicatief)".
 * - AOW: naast `aowBedrag` leveren we ook de optionele `aowLeeftijd` (uit het
 *   AOW-blok, omhoog afgerond op hele jaren) en `aowLeefsituatie` (uit `opts`).
 *   Daarmee kan de strategie-editor de gebruiker een expliciete keuze bieden om
 *   de AOW over te nemen (aanmaken óf bijwerken) i.p.v. automatisch.
 * - Nabestaandenpensioen is best-effort en belandt alleen in het top-level
 *   `nabestaandenpensioen`-veld (niet als regeling in de array).
 */

import type { PensionParseResult } from '@/lib/pension/types'

// ── Defensieve narrowing-helpers ────────────────────────────────────────────
// We krijgen `unknown` binnen en mogen nooit throwen. Deze helpers smallen
// types veilig, zodat ontbrekende/verkeerd-getypeerde secties leeg teruggeven
// i.p.v. een crash. Geen blinde casts, geen `any`-leak in de signatures.

/** Geeft het object terug als het een non-null, niet-array-object is, anders null. */
function asRecord(x: unknown): Record<string, unknown> | null {
  if (typeof x === 'object' && x !== null && !Array.isArray(x)) {
    return x as Record<string, unknown>
  }
  return null
}

/** Geeft de waarde terug als het een array is, anders een lege array. */
function asArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : []
}

/** Geeft een eindig getal terug, of null voor alles wat geen getal is. */
function asNumber(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null
}

/** Geeft een niet-lege string terug, anders null. */
function asString(x: unknown): string | null {
  return typeof x === 'string' && x.length > 0 ? x : null
}

/** Jaarbedrag (EUR) → maandbedrag, afgerond op hele euro's. */
function jaarNaarMaand(jaar: number): number {
  return Math.round(jaar / 12)
}

// ── 1. Veilige top-level parser ─────────────────────────────────────────────

export type ParseOk = { ok: true; data: unknown }
export type ParseErr = { ok: false; error: string }

/**
 * Valideer een REEDS gedeserialiseerde mijnpensioen.nl-boom.
 *
 * Gedeeld door beide serialisaties (JSON én XML): het pensioenregister
 * publiceert één gecombineerde datamodel-spec, dus de statussemantiek hoort
 * maar op één plek te staan. Alleen de melding bij een onleesbaar bestand
 * verschilt per formaat, en die geeft de aanroeper mee.
 *
 * - Geen non-null object → `{ ok:false }` met `invalidMessage`.
 * - `StatusCode !== "000"` → `{ ok:false }` met de echte (of fallback) code.
 * - Een niet-lege `OntbrekendePuvsError` wordt in de foutmelding meegenomen.
 * Throwt nooit.
 */
export function validateMijnpensioenRoot(
  parsed: unknown,
  invalidMessage: string,
): ParseOk | ParseErr {
  const root = asRecord(parsed)
  if (!root) {
    return { ok: false, error: invalidMessage }
  }

  const statusCode = asString(root.StatusCode)
  if (statusCode !== '000') {
    // Append eventuele uitvoerder-fouten zodat de gebruiker weet dat een deel
    // van de gegevens mogelijk ontbreekt.
    const ontbrekend = asArray(root.OntbrekendePuvsError)
    const suffix =
      ontbrekend.length > 0
        ? ' — sommige pensioenuitvoerders gaven een fout.'
        : ''
    const codeLabel = statusCode ?? 'onbekend'
    return {
      ok: false,
      error: `mijnpensioen.nl gaf statuscode ${codeLabel} terug; geen gegevens verwerkt.${suffix}`,
    }
  }

  return { ok: true, data: parsed }
}

/**
 * Parse + valideer een mijnpensioen.nl JSON-export.
 *
 * - Ongeldige JSON → `{ ok:false }`.
 * - Verder: zie `validateMijnpensioenRoot`.
 * Throwt nooit.
 */
export function parseMijnpensioenJson(text: string): ParseOk | ParseErr {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Ongeldig JSON-bestand.' }
  }

  return validateMijnpensioenRoot(parsed, 'Ongeldig JSON-bestand.')
}

// ── 2. Pure transformatie naar PensionParseResult ───────────────────────────

type Regeling = PensionParseResult['regelingen'][number]

/** Tussenstand per pensioenuitvoerder tijdens het verzamelen. */
interface PotAccumulator {
  fondsNaam: string
  gegarandeerdJaar: number
  indicatiefJaar: number
  /** Vroegste ingangsleeftijd over ALLE blokken waarin de uitvoerder voorkomt. */
  earliestIngangLeeftijd: number | null
}

/**
 * Deterministische transformatie van een geparste mijnpensioen.nl-export naar
 * een `PensionParseResult`. Robuust tegen ontbrekende secties: dan lege/null
 * velden, nooit een throw.
 */
export function mijnpensioenJsonToParseResult(
  json: unknown,
  opts: { samenwonend: boolean },
): PensionParseResult {
  const root = asRecord(json)
  const details = root ? asRecord(root.Details) : null
  const opDetails = details ? asRecord(details.OuderdomsPensioenDetails) : null
  const blokken = opDetails ? asArray(opDetails.OuderdomsPensioen) : []

  const regelingen = collectOuderdomspensioen(blokken)
  const { aowBedrag, aowLeeftijd } = collectAow(blokken, opts.samenwonend)
  const nabestaandenpensioen = collectNabestaandenpensioen(details)
  const samenvatting = buildSamenvatting(regelingen.length, aowBedrag)

  // Woonsituatie volgt de aanroep; alleen relevant als er een AOW-bedrag is.
  const aowLeefsituatie: PensionParseResult['aowLeefsituatie'] =
    aowBedrag !== null
      ? opts.samenwonend
        ? 'samenwonend'
        : 'alleenstaand'
      : undefined

  return {
    aowBedrag,
    regelingen,
    nabestaandenpensioen,
    samenvatting,
    // undefined laten we bewust weg uit het PDF-pad; hier vullen we ze als bekend.
    ...(aowLeeftijd !== null ? { aowLeeftijd } : {}),
    ...(aowLeefsituatie !== undefined ? { aowLeefsituatie } : {}),
  }
}

/**
 * Verzamel ouderdomspensioen per uitvoerder en zet om naar regelingen.
 *
 * - Het LEVENSLANGE blok (`Tot.OuderdomsPensioenEvent === 'Overlijden'`) bepaalt
 *   WELKE uitvoerders een levenslange pot hebben en hun te-bereiken bedragen.
 * - De ingangsleeftijd is de VROEGSTE `Van.Leeftijd.Jaren` over ALLE blokken
 *   waarin die uitvoerder voorkomt (niet per se het levenslange blok).
 */
function collectOuderdomspensioen(blokken: unknown[]): Regeling[] {
  // Stap 1: bedragen uit het levenslange blok.
  const accumulators = new Map<string, PotAccumulator>()
  const levenslangBlok = blokken.find((b) => {
    const blok = asRecord(b)
    const tot = blok ? asRecord(blok.Tot) : null
    return asString(tot?.OuderdomsPensioenEvent) === 'Overlijden'
  })

  const levenslang = asRecord(levenslangBlok)
  if (levenslang) {
    accumulateBedragen(accumulators, asArray(levenslang.Pensioen), 'gegarandeerd')
    accumulateBedragen(accumulators, asArray(levenslang.IndicatiefPensioen), 'indicatief')
  }

  // Stap 2: vroegste ingangsleeftijd over ALLE blokken (ook vroege blokken).
  for (const b of blokken) {
    const blok = asRecord(b)
    if (!blok) continue
    const van = asRecord(blok.Van)
    const leeftijd = van ? asRecord(van.Leeftijd) : null
    const jaren = leeftijd ? asNumber(leeftijd.Jaren) : null
    if (jaren === null) continue

    // Welke uitvoerders komen in dit blok voor (gegarandeerd of indicatief)?
    const uitvoerdersInBlok = new Set<string>()
    for (const naam of uitvoerderNamen(asArray(blok.Pensioen))) uitvoerdersInBlok.add(naam)
    for (const naam of uitvoerderNamen(asArray(blok.IndicatiefPensioen))) uitvoerdersInBlok.add(naam)

    for (const naam of uitvoerdersInBlok) {
      const acc = accumulators.get(naam)
      // Alleen uitvoerders die een levenslange pot hebben tellen mee; we updaten
      // hun vroegste ingangsleeftijd met dit (mogelijk eerdere) blok.
      if (!acc) continue
      if (acc.earliestIngangLeeftijd === null || jaren < acc.earliestIngangLeeftijd) {
        acc.earliestIngangLeeftijd = jaren
      }
    }
  }

  // Stap 3: omzetten naar regelingen, 0-bedragen overslaan.
  const regelingen: Regeling[] = []
  for (const acc of accumulators.values()) {
    const totaalJaar = acc.gegarandeerdJaar + acc.indicatiefJaar
    if (totaalJaar <= 0) continue // lege uitvoerders / 0-bedragen overslaan

    const heeftIndicatief = acc.indicatiefJaar > 0
    regelingen.push({
      fondsNaam: heeftIndicatief ? `${acc.fondsNaam} (deels indicatief)` : acc.fondsNaam,
      brutoBedrag: jaarNaarMaand(totaalJaar),
      // Fallback 0 als er onverhoopt geen leeftijd-blok was; mag nooit throwen.
      ingangLeeftijd: acc.earliestIngangLeeftijd ?? 0,
      // Geen betrouwbaar indexatie-veld in de JSON.
      isGeindexeerd: false,
      type: 'ouderdomspensioen',
    })
  }

  // Stabiele sortering voor determinisme: op ingangLeeftijd, dan naam.
  regelingen.sort((a, b) => {
    if (a.ingangLeeftijd !== b.ingangLeeftijd) return a.ingangLeeftijd - b.ingangLeeftijd
    return a.fondsNaam.localeCompare(b.fondsNaam, 'nl')
  })

  return regelingen
}

/**
 * Tel `TeBereiken`-jaarbedragen op per uitvoerder uit een `Pensioen[]`- of
 * `IndicatiefPensioen[]`-array.
 */
function accumulateBedragen(
  accumulators: Map<string, PotAccumulator>,
  items: unknown[],
  bucket: 'gegarandeerd' | 'indicatief',
): void {
  for (const item of items) {
    const rec = asRecord(item)
    if (!rec) continue
    const naam = asString(rec.PensioenUitvoerder)
    if (!naam) continue
    const teBereiken = asNumber(rec.TeBereiken) ?? 0

    let acc = accumulators.get(naam)
    if (!acc) {
      acc = { fondsNaam: naam, gegarandeerdJaar: 0, indicatiefJaar: 0, earliestIngangLeeftijd: null }
      accumulators.set(naam, acc)
    }
    if (bucket === 'gegarandeerd') acc.gegarandeerdJaar += teBereiken
    else acc.indicatiefJaar += teBereiken
  }
}

/** Geeft de uitvoerder-namen terug die in een Pensioen-array voorkomen. */
function uitvoerderNamen(items: unknown[]): string[] {
  const namen: string[] = []
  for (const item of items) {
    const rec = asRecord(item)
    const naam = rec ? asString(rec.PensioenUitvoerder) : null
    if (naam) namen.push(naam)
  }
  return namen
}

/**
 * AOW-jaarbedrag → maandbedrag + de AOW-leeftijd. De `AOW`-sectie hangt op een
 * blok in `OuderdomsPensioen[]` met een `AOW`-veld. We pakken het EERSTE blok
 * waarin de gevraagde woonvorm (`TeBereikenSamenwonend`/`TeBereikenAlleenstaand`)
 * ook echt gevuld is; een blok zonder die woonvorm wordt overgeslagen. Geen enkel
 * blok met een gevulde woonvorm → bedrag null.
 *
 * De AOW-leeftijd komt uit `Van.Leeftijd` van datzelfde blok, omhoog afgerond op
 * hele jaren (`Math.ceil(Jaren + Maanden/12)`) zodat 'ie als integer `target_age`
 * bruikbaar is. Geen leeftijd in het blok → leeftijd null (bedrag kan dan toch
 * gevuld zijn).
 */
function collectAow(
  blokken: unknown[],
  samenwonend: boolean,
): { aowBedrag: number | null; aowLeeftijd: number | null } {
  for (const b of blokken) {
    const blok = asRecord(b)
    const aow = blok ? asRecord(blok.AOW) : null
    const opbouw = aow ? asRecord(aow.AOWDetailsOpbouw) : null
    if (!opbouw) continue

    const jaar = samenwonend
      ? asNumber(opbouw.TeBereikenSamenwonend)
      : asNumber(opbouw.TeBereikenAlleenstaand)
    // Leeg gevraagd woonvorm-veld? Probeer het volgende AOW-blok i.p.v. te stoppen —
    // een later blok kan de gevraagde woonvorm wél bevatten.
    if (jaar === null) continue

    // Leeftijd uit het Van-blok; ontbreekt 'ie, dan null (bedrag blijft geldig).
    const van = blok ? asRecord(blok.Van) : null
    const leeftijd = van ? asRecord(van.Leeftijd) : null
    const jaren = leeftijd ? asNumber(leeftijd.Jaren) : null
    const maanden = leeftijd ? asNumber(leeftijd.Maanden) : null
    const aowLeeftijd =
      jaren !== null ? Math.ceil(jaren + (maanden ?? 0) / 12) : null

    return { aowBedrag: jaarNaarMaand(jaar), aowLeeftijd }
  }
  return { aowBedrag: null, aowLeeftijd: null }
}

/**
 * Best-effort nabestaandenpensioen (top-level veld). Bron-voorkeur:
 * `Details.PartnerPensioenDetails.PartnerPensioen[]`, het blok met
 * `Tot.PartnerEvent === 'Overlijden'`. Som `VerzekerdBedragNaPens`
 * (fallback `OpgebouwdBedragNaPens`) als jaarbedrag over de uitvoerders.
 * Geen data → null.
 *
 * NB: We tellen bewust ALLEEN het gegarandeerde `Pensioen[]` — een eventueel
 * indicatief `IndicatiefPensioen[]` partnerpensioen wordt genegeerd, omdat dat
 * een onzekere prognose is en we het nabestaandenpensioen conservatief houden.
 */
function collectNabestaandenpensioen(
  details: Record<string, unknown> | null,
): number | null {
  if (!details) return null
  const ppDetails = asRecord(details.PartnerPensioenDetails)
  if (!ppDetails) return null
  const ppBlokken = asArray(ppDetails.PartnerPensioen)

  const levenslangBlok = ppBlokken.find((b) => {
    const blok = asRecord(b)
    const tot = blok ? asRecord(blok.Tot) : null
    return asString(tot?.PartnerEvent) === 'Overlijden'
  })

  const levenslang = asRecord(levenslangBlok)
  if (!levenslang) return null

  let somJaar = 0
  let gevonden = false
  for (const item of asArray(levenslang.Pensioen)) {
    const rec = asRecord(item)
    const bedragen = rec ? asRecord(rec.Bedragen) : null
    if (!bedragen) continue
    const bedrag =
      asNumber(bedragen.VerzekerdBedragNaPens) ??
      asNumber(bedragen.OpgebouwdBedragNaPens)
    if (bedrag === null) continue
    somJaar += bedrag
    gevonden = true
  }

  if (!gevonden || somJaar <= 0) return null
  return jaarNaarMaand(somJaar)
}

/** Korte NL-samenvatting met nette enkelvoud/meervoud en AOW alleen als aanwezig. */
function buildSamenvatting(aantalPotten: number, aowBedrag: number | null): string {
  const heeftAow = aowBedrag !== null

  if (aantalPotten === 0 && !heeftAow) {
    return 'Geen pensioengegevens gevonden in je mijnpensioen.nl-overzicht.'
  }

  const potLabel =
    aantalPotten === 1 ? '1 pensioenpot' : `${aantalPotten} pensioenpotten`

  if (aantalPotten === 0) {
    // Alleen AOW gevonden. De `!heeftAow`-tak hierboven is al afgehandeld, dus
    // hier impliceert `aantalPotten === 0` noodzakelijk `heeftAow === true`.
    return 'AOW gevonden in je mijnpensioen.nl-overzicht.'
  }

  const aowDeel = heeftAow ? ' en AOW' : ''
  return `${potLabel}${aowDeel} gevonden in je mijnpensioen.nl-overzicht.`
}
