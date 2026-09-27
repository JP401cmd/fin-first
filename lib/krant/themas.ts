// ── De gesloten themalijst van de Krant (B35, 27 sep 2026) ───────────────────
//
// AANLEIDING (productie 27 sep): van 105 geduide artikelen had er 1 een
// doelgroep. Een doelgroepregel moet LETTERLIJK in het fragment te herleiden
// zijn (G6, `doelgroep-lexicon.ts`), en één ongegronde regel wijst de HELE
// duiding af (`doelgroep:ongegrond:*`) — terecht, want een lege doelgroep
// betekent iedereen en een verkeerde regel stuurt het artikel naar de verkeerde
// lezer. Het gevolg is dat het model de doelgroep veilig leeg laat, en een
// relevant bericht zonder doelgroep scoort 1 (`SCORE_RELEVANT_ALGEMEEN`).
//
// Thema's zijn de tweede, goedkopere route naar "voor wie": het model kiest uit
// deze GESLOTEN lijst waar het fragment over gaat, met per thema één letterlijk
// citaat als bewijs. Drie eigenschappen maken dat veilig:
//
//   1. DE KOPPELING THEMA → PROFIELVELD STAAT HIER, IN CODE. Het model zegt
//      alleen "dit gaat over huur"; wie huur raakt (`wonen in [huur-sociaal,
//      huur-vrije-sector]`) beslist deze tabel. Het model kan dus geen
//      doelgroep verzinnen, alleen een onderwerp aanwijzen.
//   2. EEN FOUT THEMA KOST ÉÉN LABEL. `duiding-controles.ts` houdt een thema
//      alleen als het citaat letterlijk in de grondslag staat én een trefwoord
//      van dát thema bevat; anders valt alleen dat thema weg (geteld in
//      `meta.themasGeweigerd`). De duiding wordt nooit om een thema afgewezen.
//   3. THEMA'S SLUITEN NIETS UIT. De matcher gebruikt ze alleen om een artikel
//      PERSOONLIJK te maken (score `SCORE_RELEVANT_GERICHT` in plaats van
//      `SCORE_RELEVANT_ALGEMEEN`), nooit om het bij iemand weg te laten — ook
//      niet uit het algemene katern. Een verkeerd thema maakt een bericht dus
//      hooguit onterecht persoonlijk, het verbergt nooit iets.
//
// `raakt` is een OF: één regel die 'ja' geeft voor het profiel is genoeg.
// 'iedereen' betekent: dit thema raakt elk profiel en maakt dus niemand in het
// bijzonder gericht (het telt niet als persoonlijk).
//
// `trefwoorden` is de gronding van het citaat, genormaliseerd zoals het
// doelgroep-lexicon (kleine letters, deelstring): "huurverhoging" dekt "huur".
// Houd ze specifiek genoeg dat een citaat over iets anders er niet op valt —
// een te breed trefwoord ("rente", "fonds", "zorg") laat de controle alles
// doorlaten en is dan geen controle meer.
//
// De dekking is HARD: `themas.test.ts` eist per thema een label, een
// omschrijving, ≥ 3 trefwoorden en geldige regels (veld, operator, waarde).
//
// PUUR: alleen constanten — client-veilig.

import type { DoelgroepRegel, DoelgroepOp } from './duiding-schema'
import type { DoelgroepSleutel } from './profiel-velden'

export const THEMA_IDS = [
  'box3-vermogen',
  'inkomstenbelasting',
  'pensioenopbouw',
  'aow',
  'huur',
  'eigen-woning',
  'huis-kopen',
  'toeslagen',
  'kinderen',
  'studieschuld',
  'zorgkosten',
  'sparen-rente',
  'beleggen',
  'ondernemers',
  'minimumloon-uitkering',
  'consumptief-krediet',
] as const
export type ThemaId = (typeof THEMA_IDS)[number]

export interface ThemaDefinitie {
  /** Korte naam voor beheer. */
  label: string
  /** Eén regel voor de prompt: waar gaat een bericht met dit thema over. */
  omschrijving: string
  /** Gronding van het citaat: minstens één moet (genormaliseerd) in het citaat staan. */
  trefwoorden: readonly string[]
  /** Wie dit thema raakt (OF-semantiek), of 'iedereen'. */
  raakt: readonly DoelgroepRegel[] | 'iedereen'
}

/** Eén regel, met een verse array (DoelgroepRegel.waarden is muteerbaar getypt). */
function regel(veld: DoelgroepSleutel, op: DoelgroepOp, ...waarden: string[]): DoelgroepRegel {
  return { veld, op, waarden }
}

const MET_KINDEREN = ['jongste-0-3', 'jongste-4-11', 'jongste-12-17'] as const

export const THEMAS: Record<ThemaId, ThemaDefinitie> = {
  'box3-vermogen': {
    label: 'Box 3 en vermogen',
    omschrijving: 'belasting op spaargeld en beleggingen in box 3: vermogensbelasting, werkelijk rendement, heffingsvrij vermogen',
    trefwoorden: [
      'box 3',
      'box3',
      'vermogensbelasting',
      'vermogensrendementsheffing',
      'rendementsheffing',
      'werkelijk rendement',
      'werkelijke rendement',
      'fictief rendement',
      'fictieve rendement',
      'forfaitair rendement',
      'inkomsten uit vermogen',
      'vermogenswinstbelasting',
      'heffingsvrij',
      'vermogensaanwas',
    ],
    raakt: [
      regel('spaargeld', 'minstens', '50k-100k'),
      regel('beleggingen', 'minstens', '25k-100k'),
      regel('beleggingen_vorm', 'bevat', 'tweede-woning'),
    ],
  },
  inkomstenbelasting: {
    label: 'Inkomstenbelasting',
    omschrijving: 'belasting op inkomen uit werk en woning (box 1): schijven, tarieven, heffingskortingen, loonheffing',
    trefwoorden: [
      'inkomstenbelasting',
      'box 1',
      'box1',
      'schijf',
      'heffingskorting',
      'arbeidskorting',
      'loonheffing',
      'loonbelasting',
      'belastingtarief',
      'netto loon',
      'nettoloon',
      'ouderenkorting',
    ],
    // Raakt vrijwel elk profiel (iedereen met inkomen uit werk, uitkering of
    // pensioen): telt daarom als 'iedereen', niet als gericht (eindreview 1G, M5).
    raakt: 'iedereen',
  },
  pensioenopbouw: {
    label: 'Pensioenopbouw',
    omschrijving: 'aanvullend pensioen: pensioenfondsen, de Wet toekomst pensioenen (Wtp), het pensioenstelsel, lijfrente en jaarruimte',
    trefwoorden: ['pensioen', 'wtp', 'lijfrente', 'jaarruimte', 'derde pijler'],
    raakt: [regel('pensioen_werkgever', 'is', 'ja'), regel('pensioen_lijfrente', 'is', 'ja')],
  },
  aow: {
    label: 'AOW',
    omschrijving: 'de AOW en de AOW-leeftijd (Algemene Ouderdomswet)',
    trefwoorden: ['aow', 'ouderdomswet', 'pensioenleeftijd', 'ouderdom'],
    raakt: [regel('geboortejaar', 'hoogstens', '1970'), regel('werk', 'bevat', 'pensioen')],
  },
  huur: {
    label: 'Huur',
    omschrijving: 'huren: huurverhoging, huurprijzen, huurtoeslag, sociale en vrije sector',
    trefwoorden: ['huur', 'huurder', 'verhuurder', 'huurwoning', 'woningcorporatie'],
    raakt: [regel('wonen', 'in', 'huur-sociaal', 'huur-vrije-sector')],
  },
  'eigen-woning': {
    label: 'Eigen woning',
    omschrijving: 'een eigen koopwoning: hypotheek, hypotheekrente(aftrek), eigenwoningforfait, WOZ-waarde',
    trefwoorden: [
      'hypotheek',
      'eigenwoningforfait',
      'eigen woning',
      'eigen-woning',
      'huizenbezitter',
      'woningbezitter',
      'eigenwoningschuld',
      'woz',
      'huiseigen',
      'woningeigen',
      'renteaftrek',
    ],
    raakt: [regel('wonen', 'in', 'koop-met-hypotheek', 'koop-zonder-hypotheek')],
  },
  'huis-kopen': {
    label: 'Huis kopen',
    omschrijving: 'een huis kopen: starters, de woningmarkt, huizenprijzen, overdrachtsbelasting, NHG',
    trefwoorden: [
      'starters op de',
      'koopstarter',
      'starterslening',
      'huizenkoper',
      'woningkoper',
      'woningmarkt',
      'huizenmarkt',
      'huizenprijs',
      'woningprijs',
      'overdrachtsbelasting',
      'huis kopen',
      'woning kopen',
      'koopwoning',
      'nhg',
      'nationale hypotheek garantie',
    ],
    raakt: [regel('woonplan', 'is', 'kopen-binnen-2-jaar')],
  },
  toeslagen: {
    label: 'Toeslagen',
    omschrijving: 'toeslagen van de Dienst Toeslagen: zorgtoeslag, huurtoeslag, kinderopvangtoeslag, kindgebonden budget',
    trefwoorden: ['toeslag', 'kindgebonden budget', 'dienst toeslagen'],
    raakt: [regel('inkomen', 'hoogstens', '2500-3250'), regel('kinderen', 'in', ...MET_KINDEREN)],
  },
  kinderen: {
    label: 'Kinderen',
    omschrijving: 'regelingen voor ouders en kinderen: kinderbijslag, kinderopvang, kindregelingen',
    trefwoorden: ['kind', 'gezin', 'kinderopvang', 'kinderbijslag', 'ouderschap'],
    raakt: [regel('kinderen', 'in', ...MET_KINDEREN, 'alleen-18-plus')],
  },
  studieschuld: {
    label: 'Studieschuld',
    omschrijving: 'studiefinanciering en studieschuld: DUO, studielening, rente en aflossing, collegegeld',
    trefwoorden: ['studieschuld', 'studielening', 'studiefinanciering', 'duo', 'student', 'collegegeld', 'basisbeurs'],
    raakt: [
      regel('schulden', 'in', 'studieschuld-tot-15k', 'studieschuld-15k-40k', 'studieschuld-boven-40k'),
      regel('werk', 'bevat', 'studie'),
    ],
  },
  zorgkosten: {
    label: 'Zorgkosten',
    omschrijving: 'zorgkosten: eigen risico, zorgpremie, zorgverzekering en basispakket',
    trefwoorden: ['eigen risico', 'zorgpremie', 'zorgverzekering', 'zorgverzekeraar', 'basisverzekering', 'basispakket', 'zorgkosten'],
    raakt: 'iedereen',
  },
  'sparen-rente': {
    label: 'Sparen en spaarrente',
    omschrijving: 'sparen en de rente erop: spaarrente, ECB-rente, depositorente',
    trefwoorden: [
      'spaarrente',
      'spaarrekening',
      'spaargeld',
      'spaarder',
      'spaar',
      'ecb',
      'depositorente',
      'beleidsrente',
      'renteverlaging',
      'renteverhoging',
    ],
    raakt: [regel('spaargeld', 'minstens', '5k-25k')],
  },
  beleggen: {
    label: 'Beleggen',
    omschrijving: 'beleggen: de beurs, fondsen, aandelen, obligaties en beleggers',
    trefwoorden: ['beleg', 'de beurs', 'aandelenbeurs', 'beurskoers', 'aandelen', 'effecten', 'aex', 'beleggingsfonds', 'indexfonds', 'etf', 'obligatie', 'crypto', 'bitcoin'],
    raakt: [regel('beleggingen', 'minstens', 'tot-25k')],
  },
  ondernemers: {
    label: 'Ondernemers',
    omschrijving: 'ondernemers: zzp, zelfstandigen, dga, winst uit onderneming, zelfstandigenaftrek',
    trefwoorden: [
      'zzp',
      'zelfstandigen',
      'zelfstandige ondernemer',
      'ondernem',
      'dga',
      'directeur-grootaandeelhouder',
      'eenmanszaak',
      'freelance',
      'mkb',
      'winst uit onderneming',
      'box 2',
      'aanmerkelijk belang',
    ],
    raakt: [regel('werk', 'in', 'zelfstandig', 'dga')],
  },
  'minimumloon-uitkering': {
    label: 'Minimumloon en uitkering',
    omschrijving: 'het minimumloon en uitkeringen: bijstand, WW, WIA, Participatiewet, het sociaal minimum',
    trefwoorden: ['minimumloon', 'bijstand', 'ww-uitkering', 'uitkeringsgerechtigd', 'werkloos', 'participatiewet', 'sociaal minimum', 'wia', 'wajong'],
    raakt: [regel('werk', 'in', 'uitkering'), regel('inkomen', 'hoogstens', 'tot-1750')],
  },
  'consumptief-krediet': {
    label: 'Lenen en krediet',
    omschrijving: 'lenen voor consumptie: persoonlijke lening, doorlopend krediet, roodstand, BKR, achteraf betalen',
    trefwoorden: [
      'krediet',
      'persoonlijke lening',
      'roodstand',
      'rood staan',
      'bkr',
      'consumptief',
      'creditcard',
      'achteraf betalen',
      'flitskrediet',
      'schuldhulp',
    ],
    raakt: [regel('schulden', 'in', 'consumptief-krediet')],
  },
}

export function isThemaId(waarde: string): waarde is ThemaId {
  return (THEMA_IDS as readonly string[]).includes(waarde)
}

/** Hoogstens zoveel gegronde thema's per duiding (de rest valt af en telt als geweigerd). */
export const THEMA_MAX = 4
/** Hoogstens zoveel tekens per citaat in de opgeslagen duiding. */
export const THEMA_CITAAT_MAX = 200
/**
 * Minstens zoveel tekens én woorden per citaat. Een los woord ("pensioen")
 * staat vrijwel altijd érgens in een fragment — ook in een menu — en bewijst
 * dan niet dat het fragment over dat thema gaat (eindreview 1G, M3).
 */
export const THEMA_CITAAT_MIN = 20
export const THEMA_CITAAT_MIN_WOORDEN = 3
