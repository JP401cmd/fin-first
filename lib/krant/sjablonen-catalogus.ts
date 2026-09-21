// ── Sjablooncatalogus v1 van de Krant: de teksten, en alleen de teksten ──────
//
// Dit bestand is het MERKSTEM-OPPERVLAK `krant-sjablonen` (scripts/merkstem/
// scan.mjs) en de bron van het attest (lib/krant/sjablonen-attest.json): elke
// tekst hier draagt een sha256 in dat attest, en sjablonen-attest.test.ts
// weigert een tekst die er niet in staat. Wijzig je hier een woord, dan
// hoort de catalogus opnieuw door merkstem en compliance-check
// (`node scripts/krant/attest-sjablonen.mjs`).
//
// Bewust ZONDER imports en zonder logica: het attest-script laadt dit bestand
// rechtstreeks in Node (type-stripping), en een tekstbestand zonder gedrag is
// precies wat een toets moet kunnen lezen.
//
// De regels waar elke tekst aan voldoet — de compliance-check toetst ze, de
// Wft-woordenlijst (wft-woordenlijst.ts) vangt de bekende vormen in code:
//   · inzicht, geen advies: de som op jouw band, nooit "doe X"
//   · geen gebiedende wijs richting de lezer; een deadline is beschrijvend
//   · geen aanbieders of producten bij naam
//   · gevoeligheid (B5) zegt expliciet dat het geen voorspelling is
//   · alleen euro's (B2, ADR 0172): geen dagen, dagtarief of vrijheidstijd —
//     de bewuste uitzondering op "geld levert tijd op" voor dit oppervlak
//   · je/jij, kort, concreet; kansen, niet schaarste
//
// Slots staan als `{naam}`; de renderer (sjablonen.ts) vult ze en weigert
// een sjabloon waarvan een slot leeg blijft. Bedragen komen daar altijd via
// formatCurrency (hele euro's), de AOW-leeftijd via formatAowAge.
//
// euro-only (B2, ADR 0172).

export const SJABLOON_VERSIE = 1

export const SJABLONEN = {
  /** Box 3: {spaargeld} {beleggingen} {partner} {bedrag} {richting} {jaar} */
  'direct-box3': [
    'Met {spaargeld} spaargeld en {beleggingen} beleggingen{partner} komt dit voor jou neer op {bedrag} per jaar {richting} box 3-heffing vanaf {jaar}.',
    'Vanaf {jaar} scheelt dit jou {bedrag} per jaar {richting} box 3-heffing, gerekend op {spaargeld} spaargeld en {beleggingen} beleggingen{partner}.',
  ],
  /** Box 1: {inkomen} {bedrag} {richting} {jaar} */
  'direct-box1': [
    'Bij een netto inkomen van {inkomen} per maand betekent dit vanaf {jaar} {bedrag} per jaar {richting} inkomstenbelasting.',
    'Voor een netto inkomen van {inkomen} per maand komt dit vanaf {jaar} neer op {bedrag} per jaar {richting} belasting.',
  ],
  /** AOW-leeftijd: {geboortejaar} {oud} {nieuw} {maanden} */
  'direct-aow': [
    'Voor wie in {geboortejaar} is geboren gaat de AOW-leeftijd van {oud} naar {nieuw}: {maanden} later.',
    'Jouw AOW-leeftijd schuift hiermee van {oud} naar {nieuw}: {maanden} later.',
  ],
  /** Studieschuld: {schuld} {bedrag} {richting} */
  'direct-studieschuld': [
    'Op een studieschuld van {schuld} is dat {bedrag} per jaar {richting} rente.',
    'Voor jouw studieschuld ({schuld}) betekent de nieuwe rente {bedrag} per jaar {richting} aan rente.',
  ],
  /** Eigen risico: {oud} {nieuw} {bedrag} {richting} */
  'direct-eigen-risico': [
    'Het verplicht eigen risico gaat van {oud} naar {nieuw}: hoogstens {bedrag} per jaar {richting} zorgkosten.',
    'Voor jou is het verschil hoogstens {bedrag} per jaar {richting}: het eigen risico gaat van {oud} naar {nieuw}.',
  ],
  /** Spaarrente (B5): {stap} {spaargeld} {bedrag} */
  'gevoeligheid-spaarrente': [
    'Elke {stap} spaarrente is op {spaargeld} spaargeld {bedrag} per jaar. Of jouw bank meebeweegt, staat hier niet.',
    'Op {spaargeld} spaargeld scheelt elke {stap} {bedrag} per jaar. Wat jouw bank doet, weet alleen jouw bank.',
  ],
  /** Hypotheekrente (B5): {stap} {schuld} {bedrag} */
  'gevoeligheid-hypotheekrente': [
    'Bij een restschuld van {schuld} en een rente die binnenkort opnieuw wordt vastgezet, is elke {stap} {bedrag} per jaar.',
    'Elke {stap} hypotheekrente is op jouw restschuld ({schuld}) {bedrag} per jaar, zodra je rente opnieuw wordt vastgezet.',
  ],
  /** Studieschuld zonder canonieke huidige rente (terugval, keuze 11): {stap} {schuld} {bedrag} */
  'gevoeligheid-studieschuld': [
    'Elke {stap} rente is op een studieschuld van {schuld} {bedrag} per jaar. Welke rente het wordt, staat hier niet.',
  ],
  /** Raakt jou, maar er valt geen bedrag aan te hangen. */
  relevant: [
    'Dit raakt jouw situatie; een bedrag valt er nu niet aan te hangen.',
    'Dit geldt ook voor jou. Wat het in euro’s doet, hangt af van meer dan de Krant weet.',
  ],
  /** Wat mist: {velden} */
  'wat-mist': [
    'Met {velden} in je profiel kan de Krant hier een bedrag bij zetten.',
  ],
  /** Voorbehoud vóór de regel als het artikel een voorstel of een verwachting is (soort uit de duiding). */
  'voorbehoud-voorstel': ['Als dit voorstel doorgaat:'],
  'voorbehoud-verwachting': ['Als deze verwachting uitkomt:'],
  /** Deadlines, beschrijvend — nooit gebiedend: {datum} */
  'deadline-aanvraag': ['De aanvraag moet vóór {datum} binnen zijn.'],
  'deadline-aangifte': ['De aangifte moet vóór {datum} zijn gedaan.'],
  'deadline-bezwaar': ['Bezwaar maken kan tot {datum}.'],
  'deadline-einde-regeling': ['De regeling loopt tot {datum}.'],
  /** Het algemene katern (B7): kop en label. */
  'algemeen-kop': ['Ook in het nieuws'],
  'algemeen-label': ['Niet op jouw situatie afgestemd.'],
  /** De lege editie is een geldige uitkomst. */
  'editie-leeg': ['Deze week is er geen nieuws dat jouw situatie raakt.'],
} as const

export type SjabloonId = keyof typeof SJABLONEN
