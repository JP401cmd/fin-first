// ── Profielmodel v1 van de Krant: de velden en hun bandwaarden ───────────────
//
// Dit is het VOCABULAIRE, niet de tabel. Eén gesloten set sleutels die drie
// plekken delen zodat ze niet uit elkaar lopen:
//
//   1A  de duiding (`doelgroep[].veld` + `waarden`) — dit bestand is het contract
//   1B  de matcher en het profielschema (`lib/krant/profiel.ts`), de bandgrenzen
//       (lo/hi) horen dáár, niet hier
//   2x  het profielscherm
//
// Besluiten die het model bepalen (K0/K1, 21 sep 2026):
//   B1  veertien velden in banden, geboortejaar i.p.v. leeftijdsband, netto
//       inkomen per maand, geen partnerinkomen
//   B2  alleen euro's — de uitgavenband VERVALT, dus dertien velden. Er is
//       geen dagtarief en geen omrekening naar vrijheidstijd in de Krant; dit
//       is een bewuste uitzondering op de app-brede regel (ADR 0171).
//
// Het model geeft banden, geen bedragen. "Weet ik niet" is overal geldig (dat
// is de afwezigheid van een waarde in het profiel, geen sleutel hier). De
// drempels uit de regelgeving komen pas bij het matchen uit lib/box3-data.ts,
// lib/box1-tax.ts en lib/constants.ts (zie `lib/krant/drempels.ts`).
//
// PUUR: alleen constanten en typen — client-veilig.

/** De dertien profielvelden (B1 − uitgavenband, B2). */
export const PROFIEL_VELDEN = [
  'geboortejaar',
  'huishouden',
  'kinderen',
  'werk',
  'inkomen',
  'wonen',
  'hypotheek',
  'woonplan',
  'spaargeld',
  'beleggingen',
  'schulden',
  'pensioenopbouw',
  'rubrieken',
] as const

export type ProfielVeld = (typeof PROFIEL_VELDEN)[number]

/** Aantal velden — B2 schrapt de uitgavenband uit de veertien van B1 (de test pint 13). */
export const PROFIEL_VELD_AANTAL = PROFIEL_VELDEN.length

/**
 * De sleutels waarop een DOELGROEPREGEL of een MECHANISME leest. Samengestelde
 * velden (hypotheek, beleggingen, pensioenopbouw) splitsen hier in hun
 * dimensies; `rubrieken` stuurt alleen de selectie en heeft geen doelgroepsleutel.
 */
export const DOELGROEP_SLEUTELS = {
  geboortejaar: {
    veld: 'geboortejaar',
    soort: 'jaartal',
    waarden: [],
  },
  huishouden: {
    veld: 'huishouden',
    soort: 'keuze',
    waarden: ['alleen', 'fiscaal-partner', 'samenwonend-zonder-fiscaal-partner'],
  },
  kinderen: {
    veld: 'kinderen',
    soort: 'keuze',
    waarden: ['geen', 'jongste-0-3', 'jongste-4-11', 'jongste-12-17', 'alleen-18-plus'],
  },
  werk: {
    veld: 'werk',
    soort: 'meerkeuze',
    waarden: ['loondienst', 'zelfstandig', 'dga', 'uitkering', 'pensioen', 'studie'],
  },
  /** Netto per maand, eigen inkomen (geen partnerinkomen, B1). */
  inkomen: {
    veld: 'inkomen',
    soort: 'band',
    waarden: ['tot-1750', '1750-2500', '2500-3250', '3250-4250', '4250-5500', 'boven-5500'],
  },
  wonen: {
    veld: 'wonen',
    soort: 'keuze',
    waarden: ['huur-sociaal', 'huur-vrije-sector', 'koop-met-hypotheek', 'koop-zonder-hypotheek', 'inwonend'],
  },
  /** Alleen bij `wonen = koop-met-hypotheek`. */
  hypotheek_restschuld: {
    veld: 'hypotheek',
    soort: 'band',
    waarden: ['tot-150k', '150k-300k', '300k-450k', 'boven-450k'],
  },
  hypotheek_rentevast: {
    veld: 'hypotheek',
    soort: 'keuze',
    waarden: ['tot-1-jaar', '2-5-jaar', 'boven-5-jaar', 'variabel'],
  },
  woonplan: {
    veld: 'woonplan',
    soort: 'keuze',
    waarden: ['kopen-binnen-2-jaar', 'geen-koopplan'],
  },
  /** Met fiscaal partner: samen. */
  spaargeld: {
    veld: 'spaargeld',
    soort: 'band',
    waarden: ['tot-5k', '5k-25k', '25k-50k', '50k-100k', '100k-250k', 'boven-250k'],
  },
  beleggingen: {
    veld: 'beleggingen',
    soort: 'band',
    waarden: ['geen', 'tot-25k', '25k-100k', '100k-250k', 'boven-250k'],
  },
  beleggingen_vorm: {
    veld: 'beleggingen',
    soort: 'meerkeuze',
    waarden: ['fondsen', 'aandelen', 'crypto', 'tweede-woning'],
  },
  schulden: {
    veld: 'schulden',
    soort: 'meerkeuze',
    waarden: ['studieschuld-tot-15k', 'studieschuld-15k-40k', 'studieschuld-boven-40k', 'consumptief-krediet', 'geen'],
  },
  pensioen_werkgever: {
    veld: 'pensioenopbouw',
    soort: 'keuze',
    waarden: ['ja', 'nee', 'weet-niet'],
  },
  pensioen_lijfrente: {
    veld: 'pensioenopbouw',
    soort: 'keuze',
    waarden: ['ja', 'nee'],
  },
} as const satisfies Record<
  string,
  { veld: ProfielVeld; soort: 'jaartal' | 'keuze' | 'meerkeuze' | 'band'; waarden: readonly string[] }
>

export type DoelgroepSleutel = keyof typeof DOELGROEP_SLEUTELS

export const DOELGROEP_SLEUTEL_LIJST = Object.keys(DOELGROEP_SLEUTELS) as DoelgroepSleutel[]

/** Alle bandsleutels van een doelgroepsleutel (leeg bij een jaartal). */
export function doelgroepWaarden(sleutel: DoelgroepSleutel): readonly string[] {
  return DOELGROEP_SLEUTELS[sleutel].waarden
}

/** Ondergrens/bovengrens van een geldig geboortejaar in het profiel. */
export const GEBOORTEJAAR_MIN = 1920
export const GEBOORTEJAAR_MAX = 2020

/**
 * Is `waarde` een geldige waarde voor deze sleutel? Voor een jaartal: een
 * geheel jaar binnen de grenzen (als string, zoals de duiding 'm aanlevert);
 * voor de rest: precies één van de bandsleutels.
 */
export function isGeldigeDoelgroepWaarde(sleutel: DoelgroepSleutel, waarde: string): boolean {
  const def = DOELGROEP_SLEUTELS[sleutel]
  if (def.soort === 'jaartal') {
    if (!/^\d{4}$/.test(waarde)) return false
    const jaar = Number(waarde)
    return jaar >= GEBOORTEJAAR_MIN && jaar <= GEBOORTEJAAR_MAX
  }
  return (def.waarden as readonly string[]).includes(waarde)
}
