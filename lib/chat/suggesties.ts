import type { CoachDataGaps } from '@/lib/coach-suggestions'

/**
 * De vragenset die Fin in de lege staat van het gesprek aanbiedt (W-004, D7).
 *
 * EÉN TABEL, ÉÉN WAARHEID. Deze tabel vervangt de vijf hardcoded
 * `CONTEXT_CHIPS` uit `chat-panel.tsx` (die zijn hier letterlijk de eerste vijf
 * records: zelfde tekst, zelfde routeprefixen). Er is dus geen tweede lijst
 * meer waar een vraag kan achterblijven.
 *
 * WAT HIER BEWUST NIET IN STAAT: `GENERIC_PROMPT` ("Geef me één concrete
 * tip…"). Die blijft de vaste, niet-roterende eerste chip in `chat-panel.tsx`.
 * Eigenaarsbesluit: die chip is het anker van de lege staat en mag nooit
 * wegroteren.
 *
 * SELECTIE IS DETERMINISTISCH. `selectSuggesties` gebruikt geen `Math.random`:
 * gelijke (pathname, databeeld, seed) geeft gelijke uitkomst. Dat is niet
 * netheid maar noodzaak — een willekeurige selectie zou bij elke re-render van
 * het paneel andere vragen tonen, en het is niet te testen.
 *
 * DATAVEREISTEN. `vereist` verwijst naar sleutels uit `CoachDataGaps` — de
 * signalen die de server-layout tóch al berekent voor de coach-bubbel. Geen
 * extra query, geen tweede definitie van "heeft deze gebruiker schulden".
 *
 * DE REGEL, IN ÉÉN ZIN: belooft een vraag een antwoord over JOUW cijfers, dan
 * draagt hij de sleutel die daarvoor nodig is. Concreet:
 *
 *  - vrijheidstijd-, vermogens- en plan-/FIRE-vragen → `hasAssets`
 *  - uitgaven-, inkomsten-, spaarquote- en patroonvragen → `hasTransactions`
 *  - vragen over de budgetten zelf → `hasBudgets` · schulden → `hasDebts` ·
 *    doelen → `hasGoals` · aannames van het plan → `hasFireParams`
 *  - een UITLEGVRAAG ("hoe werkt Box 3?", "wat is de lawine-methode?") draagt
 *    er geen: die is voor iedereen te beantwoorden, ook zonder één cijfer. Dat
 *    zijn precies de vragen die een leeg account overhoudt.
 *
 * WAT ER MISGING. `vereist` stond aanvankelijk uitsluitend op records met
 * `generiek: false` — dus alleen op de routegebonden pool, die per definitie al
 * contextueel klopte. De generieke pool (die de rij in de praktijk vult) werd
 * nooit gesnoeid, en iemand zonder inkomensgegevens kreeg "Hoeveel houd ik
 * netto over van mijn volgende verdiende euro?".
 *
 * WAAR GEEN SLEUTEL VOOR BESTAAT ("inkomen bekend", "eigen woning",
 * "leeftijd bekend", "afgeronde acties") staat de vraag op `generiek: false`:
 * dan kan hij alleen op zijn eigen route verschijnen, waar de context al klopt.
 * We verzinnen geen nieuwe sleutel — dat zou een tweede databeeld naast
 * `CoachDataGaps` introduceren, en dat is een eigenaarsbesluit.
 */

export type SuggestieCategorie =
  | 'budget'
  | 'schulden'
  | 'bezittingen'
  | 'belasting'
  | 'toekomst'
  | 'huishouden'
  | 'algemeen'

/** Datavereiste = één sleutel uit CoachDataGaps. Compile-gekoppeld: een typefout valt om. */
export type SuggestieVereiste = keyof CoachDataGaps

export interface ChatSuggestie {
  /** Stabiel, kort, kebab-case. Draagt de rotatie-uitsluiting en de tests. */
  id: string
  categorie: SuggestieCategorie
  /** Wat er op de regel staat. Kort genoeg om binnen het paneel op één regel te passen. */
  label: string
  /** Wat er verstuurd wordt. Volledige zin, Nederlands, vrijheidstijd-framing. */
  prompt: string
  /** Pathname-prefixen waarop deze vraag past. Leeg = nergens routegebonden. */
  routes: string[]
  /** Mag hij ook verschijnen zónder route-match? */
  generiek: boolean
  /** Alle vereisten moeten TRUE zijn in CoachDataGaps, anders valt hij af. */
  vereist?: SuggestieVereiste[]
}

export const CHAT_SUGGESTIES: readonly ChatSuggestie[] = [
  /* ── De vijf gemigreerde CONTEXT_CHIPS — letterlijk overgenomen ──────────
     Zelfde prompt, zelfde label, zelfde prefixen als de verwijderde tabel in
     chat-panel.tsx. Ze staan bovenaan zodat de herkomst zichtbaar blijft. */
  {
    id: 'tip-schulden',
    categorie: 'schulden',
    label: 'Tip voor mijn schulden',
    prompt: 'Geef me één concrete tip om mijn schulden sneller of slimmer af te lossen.',
    routes: ['/overzicht/schulden', '/core/debts'],
    generiek: false,
  },
  {
    id: 'tip-bezittingen',
    categorie: 'bezittingen',
    label: 'Tip voor mijn bezittingen',
    prompt:
      'Geef me één concrete tip om mijn bezittingen beter te laten renderen of risico te verlagen.',
    routes: ['/overzicht/bezittingen', '/core/assets'],
    generiek: false,
  },
  {
    id: 'tip-cashflow',
    categorie: 'budget',
    label: 'Tip voor mijn cashflow',
    prompt: 'Geef me één concrete tip om mijn maandelijkse cashflow te verbeteren.',
    routes: ['/overzicht/budget', '/core/budgets', '/core/cash'],
    generiek: false,
  },
  {
    id: 'tip-belasting',
    categorie: 'belasting',
    label: 'Tip om belasting te besparen',
    prompt: 'Geef me één concrete tip om dit jaar belasting te besparen (Box 1, 2 of 3).',
    routes: ['/overzicht/belasting', '/core/belasting'],
    generiek: false,
  },
  {
    id: 'tip-fire',
    categorie: 'toekomst',
    label: 'Versnel mijn vrijheidsdatum',
    prompt: 'Geef me één concrete tip om mijn FIRE-datum naar voren te halen.',
    routes: ['/toekomst', '/horizon'],
    generiek: false,
  },

  /* ── A · Bezittingen & vermogen (1–12) ─────────────────────────────────── */
  {
    id: 'vrijheid-vrijgekocht',
    categorie: 'bezittingen',
    label: 'Hoeveel vrijheid heb ik al vrijgekocht?',
    prompt: 'Hoeveel vrijheid heb ik al vrijgekocht?',
    routes: ['/overzicht', '/overzicht/bezittingen'],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'vermogen-stil-op-spaarrekening',
    categorie: 'bezittingen',
    label: 'Welk deel van mijn vermogen staat stil op een spaarrekening?',
    prompt: 'Welk deel van mijn vermogen staat stil op een spaarrekening?',
    routes: ['/overzicht/bezittingen'],
    generiek: false,
    vereist: ['hasAssets'],
  },
  {
    id: 'vermogen-tien-procent-daling',
    categorie: 'bezittingen',
    label: 'Wat als mijn vermogen 10% daalt?',
    prompt: 'Wat als mijn vermogen 10% daalt — hoeveel vrijheid kost dat me?',
    routes: ['/overzicht/bezittingen'],
    generiek: false,
    vereist: ['hasAssets'],
  },
  {
    id: 'vrijheidsdagen-per-jaar-uit-vermogen',
    categorie: 'bezittingen',
    label: 'Hoeveel vrijheidsdagen levert mijn vermogen me nu per jaar op?',
    prompt: 'Hoeveel vrijheidsdagen levert mijn vermogen me nu per jaar op?',
    routes: ['/overzicht'],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'vermogensverdeling',
    categorie: 'bezittingen',
    label: 'Hoe is mijn vermogen verdeeld?',
    prompt: 'Hoe is mijn vermogen verdeeld over sparen, beleggen en pensioen?',
    routes: ['/overzicht/bezittingen'],
    generiek: false,
    vereist: ['hasAssets'],
  },
  {
    id: 'zwaarste-bezitting',
    categorie: 'bezittingen',
    label: 'Welke bezitting weegt het zwaarst in mijn totaal?',
    prompt: 'Welke bezitting weegt het zwaarst in mijn totaal?',
    routes: ['/overzicht/bezittingen'],
    generiek: false,
    vereist: ['hasAssets'],
  },
  {
    id: 'over-vijf-jaar-ongewijzigd',
    categorie: 'bezittingen',
    label: 'Wat staat er over 5 jaar op de teller als ik niets verander?',
    prompt: 'Wat staat er over 5 jaar op de teller als ik niets verander?',
    routes: ['/overzicht/bezittingen', '/toekomst'],
    generiek: false,
    vereist: ['hasAssets'],
  },
  {
    id: 'maandinleg-op-termijn',
    categorie: 'bezittingen',
    label: 'Hoeveel maandinleg heb ik lopen, en wat doet dat op termijn?',
    prompt: 'Hoeveel maandinleg heb ik lopen, en wat doet dat op termijn?',
    routes: ['/overzicht/bezittingen'],
    generiek: false,
    vereist: ['hasAssets'],
  },
  {
    id: 'vrijheidsdagen-deze-maand-erbij',
    categorie: 'bezittingen',
    label: 'Hoeveel dagen vrijheid heb ik deze maand erbij gekregen?',
    prompt: 'Hoeveel dagen vrijheid heb ik deze maand erbij gekregen?',
    routes: ['/overzicht'],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'netto-vermogen-in-jaren-vrijheid',
    categorie: 'bezittingen',
    label: 'Wat is mijn netto vermogen in jaren vrijheid uitgedrukt?',
    prompt: 'Wat is mijn netto vermogen in jaren vrijheid uitgedrukt?',
    routes: ['/overzicht'],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'niet-aanspreekbaar-vermogen',
    categorie: 'bezittingen',
    label: 'Welk deel van mijn vermogen kan ik niet zomaar aanspreken?',
    prompt: 'Welk deel van mijn vermogen kan ik niet zomaar aanspreken?',
    routes: ['/overzicht/bezittingen'],
    generiek: false,
    vereist: ['hasAssets'],
  },
  {
    id: 'vermogensgroei-eigen-aannames',
    categorie: 'bezittingen',
    label: 'Hoeveel groeit mijn vermogen per jaar?',
    prompt: 'Hoeveel groeit mijn vermogen per jaar bij mijn eigen aannames?',
    routes: ['/overzicht/bezittingen', '/toekomst/voorkeuren'],
    generiek: true,
    vereist: ['hasAssets'],
  },

  /* ── B · Schulden (13–23) ──────────────────────────────────────────────── */
  {
    id: 'vrijheid-terug-zonder-schulden',
    categorie: 'schulden',
    label: 'Hoeveel vrijheid koop ik terug als mijn schulden weg zijn?',
    prompt: 'Hoeveel vrijheid koop ik terug als mijn schulden weg zijn?',
    routes: ['/overzicht/schulden'],
    generiek: false,
    vereist: ['hasDebts'],
  },
  {
    id: 'schuldenvrij-datum',
    categorie: 'schulden',
    label: 'Wanneer ben ik schuldenvrij bij mijn huidige maandbedrag?',
    prompt: 'Wanneer ben ik schuldenvrij bij mijn huidige maandbedrag?',
    routes: ['/overzicht/schulden'],
    generiek: false,
    vereist: ['hasDebts'],
  },
  {
    id: 'totale-rente-schulden',
    categorie: 'schulden',
    label: 'Hoeveel rente betaal ik in totaal nog over al mijn schulden?',
    prompt: 'Hoeveel rente betaal ik in totaal nog over al mijn schulden?',
    routes: ['/overzicht/schulden'],
    generiek: false,
    vereist: ['hasDebts'],
  },
  {
    id: 'duurste-schuld-in-dagen',
    categorie: 'schulden',
    label: 'Wat kost mijn duurste schuld me per jaar aan vrijheidsdagen?',
    prompt: 'Wat kost mijn duurste schuld me per jaar aan vrijheidsdagen?',
    routes: ['/overzicht/schulden'],
    generiek: false,
    vereist: ['hasDebts'],
  },
  {
    id: 'vijftig-euro-extra-aflossen',
    categorie: 'schulden',
    label: 'Wat doet €50 extra aflossen met mijn schuldvrije datum?',
    prompt: 'Wat doet €50 extra aflossen met mijn schuldvrije datum?',
    routes: ['/overzicht/schulden'],
    generiek: false,
    vereist: ['hasDebts'],
  },
  {
    id: 'aandeel-inkomen-aflossen',
    categorie: 'schulden',
    label: 'Hoeveel van mijn maandinkomen gaat op aan aflossen?',
    prompt: 'Hoeveel van mijn maandinkomen gaat op aan aflossen?',
    routes: ['/overzicht/schulden'],
    generiek: false,
    vereist: ['hasDebts'],
  },
  {
    id: 'schuld-versus-vermogen',
    categorie: 'schulden',
    label: 'Hoe verhoudt mijn schuld zich tot mijn vermogen?',
    prompt: 'Hoe verhoudt mijn schuld zich tot mijn vermogen?',
    routes: ['/overzicht/schulden', '/overzicht'],
    generiek: false,
    vereist: ['hasDebts'],
  },
  {
    id: 'sneeuwbal-en-lawine',
    categorie: 'schulden',
    label: 'Wat betekenen de sneeuwbal- en de lawine-methode eigenlijk?',
    prompt: 'Wat betekenen de sneeuwbal- en de lawine-methode eigenlijk?',
    routes: ['/overzicht/schulden'],
    generiek: true,
  },
  {
    id: 'langstlopende-schuld',
    categorie: 'schulden',
    label: 'Welke van mijn schulden loopt het langst door?',
    prompt: 'Welke van mijn schulden loopt het langst door?',
    routes: ['/overzicht/schulden'],
    generiek: false,
    vereist: ['hasDebts'],
  },
  {
    id: 'rente-in-vrijheidsdagen',
    categorie: 'schulden',
    label: 'Hoeveel dagen vrijheid kost mijn schuld me per jaar aan rente?',
    prompt: 'Hoeveel dagen vrijheid kost mijn schuld me per jaar aan rente?',
    routes: ['/overzicht/schulden'],
    generiek: false,
    vereist: ['hasDebts'],
  },
  {
    id: 'aflostempo-versus-vermogensgroei',
    categorie: 'schulden',
    label: 'Los ik sneller af dan mijn vermogen groeit?',
    prompt: 'Los ik sneller af dan mijn vermogen groeit?',
    routes: ['/overzicht/schulden', '/overzicht'],
    generiek: false,
    vereist: ['hasDebts', 'hasAssets'],
  },

  /* ── C · Budget & uitgaven (24–38) ─────────────────────────────────────── */
  {
    id: 'kosten-van-een-vrijheidsdag',
    categorie: 'budget',
    label: 'Wat kost één dag vrijheid mij op dit moment?',
    prompt: 'Wat kost één dag vrijheid mij op dit moment?',
    routes: ['/overzicht/budget', '/overzicht'],
    generiek: true,
    vereist: ['hasTransactions'],
  },
  {
    id: 'budget-uit-de-pas',
    categorie: 'budget',
    label: 'Welk budget loopt deze maand het hardst uit de pas?',
    prompt: 'Welk budget loopt deze maand het hardst uit de pas?',
    routes: ['/overzicht/budget'],
    generiek: false,
    vereist: ['hasBudgets'],
  },
  {
    id: 'boven-nibud-norm',
    categorie: 'budget',
    label: 'Waar geef ik meer uit dan de NIBUD-norm?',
    prompt: 'Waar geef ik meer uit dan de NIBUD-norm voor mijn huishouden?',
    routes: ['/overzicht/budget'],
    generiek: false,
    vereist: ['hasBudgets'],
  },
  {
    id: 'duurste-uitgave-deze-maand',
    categorie: 'budget',
    label: 'Welke uitgave kostte me deze maand de meeste vrijheidsdagen?',
    prompt: 'Welke uitgave kostte me deze maand de meeste vrijheidsdagen?',
    routes: ['/overzicht/budget/transacties'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'honderd-euro-minder-per-maand',
    categorie: 'budget',
    label: 'Wat als ik €100 per maand minder uitgeef — wat levert dat op?',
    prompt: 'Wat als ik €100 per maand minder uitgeef — wat levert dat op?',
    routes: ['/overzicht/budget'],
    generiek: true,
    vereist: ['hasTransactions'],
  },
  {
    id: 'overschot-deze-maand-in-dagen',
    categorie: 'budget',
    label: 'Hoeveel houd ik deze maand over, en wat is dat in dagen?',
    prompt: 'Hoeveel houd ik deze maand over, en wat is dat in dagen?',
    routes: ['/overzicht/budget'],
    generiek: true,
    vereist: ['hasTransactions'],
  },
  {
    id: 'stilletjes-stijgende-categorie',
    categorie: 'budget',
    label: 'Welke categorie is stilletjes aan het stijgen?',
    prompt: 'Welke categorie is stilletjes aan het stijgen?',
    routes: ['/overzicht/budget'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'opvallend-hoge-uitgave',
    categorie: 'budget',
    label: 'Welke uitgave was deze maand opvallend hoog?',
    prompt: 'Welke uitgave was deze maand opvallend hoog?',
    routes: ['/overzicht/budget'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'dure-maanden-patroon',
    categorie: 'budget',
    label: 'In welke maanden geef ik altijd meer uit dan normaal?',
    prompt: 'In welke maanden geef ik altijd meer uit dan normaal?',
    routes: ['/overzicht/budget'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'spaarquote-en-tempo',
    categorie: 'budget',
    label: 'Hoe hoog is mijn spaarquote en wat zegt dat over mijn tempo?',
    prompt: 'Hoe hoog is mijn spaarquote en wat zegt dat over mijn tempo?',
    routes: ['/overzicht/budget', '/overzicht'],
    generiek: true,
    vereist: ['hasTransactions'],
  },
  {
    id: 'echte-vaste-kosten',
    categorie: 'budget',
    label: 'Wat zijn mijn echte vaste kosten per maand?',
    prompt: 'Wat zijn mijn echte vaste kosten per maand?',
    routes: ['/overzicht/budget'],
    generiek: true,
    vereist: ['hasTransactions'],
  },
  {
    id: 'essentieel-versus-niet',
    categorie: 'budget',
    label: 'Hoeveel van mijn uitgaven is essentieel en hoeveel niet?',
    prompt: 'Hoeveel van mijn uitgaven is essentieel en hoeveel niet?',
    routes: ['/overzicht/budget'],
    generiek: false,
    vereist: ['hasBudgets'],
  },
  {
    id: 'budget-structureel-verlagen',
    categorie: 'budget',
    label: 'Welk budget kan ik met één beslissing structureel verlagen?',
    prompt: 'Welk budget kan ik met één beslissing structureel verlagen?',
    routes: ['/overzicht/budget'],
    generiek: false,
    vereist: ['hasBudgets'],
  },
  {
    id: 'maand-zonder-onnodige-uitgaven',
    categorie: 'budget',
    label: 'Wat als ik één maand niets onnodigs uitgeef — wat wint dat?',
    prompt: 'Wat als ik één maand niets onnodigs uitgeef — wat wint dat?',
    routes: ['/overzicht/budget'],
    generiek: true,
    vereist: ['hasTransactions'],
  },
  {
    id: 'spaartempo-in-vrijheidsdagen',
    categorie: 'budget',
    label: 'Hoeveel vrijheidsdagen levert mijn spaartempo per jaar op?',
    prompt: 'Hoeveel vrijheidsdagen levert mijn spaartempo per jaar op?',
    routes: ['/overzicht/budget', '/overzicht'],
    generiek: true,
    vereist: ['hasTransactions'],
  },

  /* ── D · Abonnementen & vaste lasten (39–46) ───────────────────────────── */
  {
    id: 'abonnementen-jaartotaal',
    categorie: 'budget',
    label: 'Wat kosten al mijn abonnementen me samen per jaar?',
    prompt: 'Wat kosten al mijn abonnementen me samen per jaar?',
    routes: ['/overzicht/budget/vaste-lasten'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'abonnementen-in-vrijheidsdagen',
    categorie: 'budget',
    label: 'Hoeveel vrijheidsdagen kosten mijn abonnementen me per jaar?',
    prompt: 'Hoeveel vrijheidsdagen kosten mijn abonnementen me per jaar?',
    routes: ['/overzicht/budget/vaste-lasten'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'duurste-abonnement',
    categorie: 'budget',
    label: 'Welk abonnement is mijn duurste, en wat levert het me op?',
    prompt: 'Welk abonnement is mijn duurste, en wat levert het me op?',
    routes: ['/overzicht/budget/vaste-lasten'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'ongemerkt-opgelopen-vaste-lasten',
    categorie: 'budget',
    label: 'Zijn er vaste lasten die ik ongemerkt heb laten oplopen?',
    prompt: 'Zijn er vaste lasten die ik ongemerkt heb laten oplopen?',
    routes: ['/overzicht/budget/vaste-lasten'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'nieuwe-vaste-lasten-dit-jaar',
    categorie: 'budget',
    label: 'Wat is er dit jaar aan nieuwe vaste lasten bijgekomen?',
    prompt: 'Wat is er dit jaar aan nieuwe vaste lasten bijgekomen?',
    routes: ['/overzicht/budget/vaste-lasten'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'drie-kleinste-abonnementen-opzeggen',
    categorie: 'budget',
    label: 'Wat win ik als ik mijn drie kleinste abonnementen opzeg?',
    prompt: 'Wat win ik als ik mijn drie kleinste abonnementen opzeg?',
    routes: ['/overzicht/budget/vaste-lasten'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'heronderhandelbare-maandlasten',
    categorie: 'budget',
    label: 'Welk deel van mijn maandlasten is heronderhandelbaar?',
    prompt: 'Welk deel van mijn maandlasten is heronderhandelbaar?',
    routes: ['/overzicht/budget/vaste-lasten'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'aandeel-inkomen-vaste-lasten',
    categorie: 'budget',
    label: 'Hoeveel procent van mijn inkomen gaat naar vaste lasten?',
    prompt: 'Hoeveel procent van mijn inkomen gaat naar vaste lasten?',
    routes: ['/overzicht/budget/vaste-lasten'],
    generiek: false,
    vereist: ['hasTransactions'],
  },

  /* ── E · Toekomst & FIRE (47–62) ───────────────────────────────────────── */
  {
    id: 'honderd-euro-bij-fire-leeftijd',
    categorie: 'toekomst',
    label: 'Wat geeft €100 besparen bij mijn FIRE-leeftijd?',
    prompt: 'Wat als ik nu €100 bespaar — hoeveel vrijheid geeft dat bij mijn FIRE-leeftijd?',
    routes: ['/toekomst'],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'vrijheidsleeftijd-huidig-tempo',
    categorie: 'toekomst',
    label: 'Op welke leeftijd ben ik vrij bij mijn huidige tempo?',
    prompt: 'Op welke leeftijd ben ik vrij bij mijn huidige tempo?',
    routes: ['/toekomst'],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'tweehonderd-euro-extra-per-maand',
    categorie: 'toekomst',
    label: 'Hoeveel eerder ben ik vrij met €200 per maand extra opzij?',
    prompt: 'Hoeveel eerder ben ik vrij met €200 per maand extra opzij?',
    routes: ['/toekomst'],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'jaar-langer-doorwerken',
    categorie: 'toekomst',
    label: 'Hoeveel scheelt één jaar langer doorwerken?',
    prompt: 'Hoeveel scheelt één jaar langer doorwerken in mijn eindbedrag?',
    routes: ['/toekomst'],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'voortgang-fire-doel',
    categorie: 'toekomst',
    label: 'Hoe ver ben ik op weg naar mijn FIRE-doel?',
    prompt: 'Hoe ver ben ik op weg naar mijn FIRE-doel?',
    routes: ['/toekomst', '/overzicht'],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'fire-doel-in-geld-van-vandaag',
    categorie: 'toekomst',
    label: 'Wat is mijn FIRE-doel in geld van vandaag?',
    prompt: 'Wat is mijn FIRE-doel in geld van vandaag?',
    routes: ['/toekomst'],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'aannames-rendement-inflatie',
    categorie: 'toekomst',
    label: 'Welke aannames hanteert mijn plan?',
    prompt: 'Welke aannames voor rendement en inflatie hanteert mijn plan?',
    routes: ['/toekomst/voorkeuren'],
    generiek: true,
    vereist: ['hasFireParams'],
  },
  {
    id: 'opnamepercentage-in-gewone-taal',
    categorie: 'toekomst',
    label: 'Wat betekent mijn veilig opnamepercentage in gewone taal?',
    prompt: 'Wat betekent mijn veilig opnamepercentage in gewone taal?',
    routes: ['/toekomst/voorkeuren'],
    generiek: true,
    vereist: ['hasFireParams'],
  },
  {
    id: 'hoe-lang-gaat-mijn-vermogen-mee',
    categorie: 'toekomst',
    label: 'Hoe lang gaat mijn vermogen mee als ik nu zou stoppen?',
    prompt: 'Hoe lang gaat mijn vermogen mee als ik nu zou stoppen?',
    routes: ['/toekomst', '/overzicht'],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'gat-aow-en-vrijheidsleeftijd',
    categorie: 'toekomst',
    label: 'Wat is het gat tussen mijn AOW- en mijn vrijheidsleeftijd?',
    prompt: 'Wat is het gat tussen mijn AOW- en mijn vrijheidsleeftijd?',
    routes: ['/toekomst'],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'vier-dagen-werken',
    categorie: 'toekomst',
    label: 'Wat als ik vanaf nu vier dagen ga werken?',
    prompt: 'Wat als ik vanaf nu vier dagen ga werken?',
    routes: [],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'vrij-op-mijn-vijfenvijftigste',
    categorie: 'toekomst',
    label: 'Hoeveel moet ik opzij zetten om op mijn 55e vrij te zijn?',
    prompt: 'Hoeveel moet ik opzij zetten om op mijn 55e vrij te zijn?',
    routes: ['/toekomst', '/toekomst/rekenhulp'],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'jaar-sabbatical',
    categorie: 'toekomst',
    label: 'Wat gebeurt er met mijn plan bij een jaar sabbatical?',
    prompt: 'Wat gebeurt er met mijn plan bij een jaar sabbatical?',
    routes: [],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'tien-procent-meer-uitgeven',
    categorie: 'toekomst',
    label: 'Wat kost het me als ik mijn uitgaven met 10% verhoog?',
    prompt: 'Wat kost het me als ik mijn uitgaven met 10% verhoog?',
    routes: ['/toekomst'],
    generiek: true,
    vereist: ['hasTransactions'],
  },
  {
    id: 'vermogen-op-mijn-67e',
    categorie: 'toekomst',
    label: 'Hoe ziet mijn vermogen eruit op mijn 67e?',
    prompt: 'Hoe ziet mijn vermogen eruit op mijn 67e?',
    routes: ['/toekomst'],
    generiek: false,
  },
  {
    id: 'grootste-versneller',
    categorie: 'toekomst',
    label: 'Welke stap versnelt mijn vrijheidsdatum het meest?',
    prompt: 'Welke stap versnelt mijn vrijheidsdatum het meest?',
    routes: ['/toekomst'],
    generiek: true,
    vereist: ['hasAssets'],
  },

  /* ── F · Belasting (63–74) ─────────────────────────────────────────────── */
  {
    id: 'belasting-in-vrijheidsdagen',
    categorie: 'belasting',
    label: 'Hoeveel belasting betaal ik dit jaar, in vrijheidsdagen?',
    prompt: 'Hoeveel belasting betaal ik dit jaar, in vrijheidsdagen?',
    routes: ['/overzicht/belasting'],
    generiek: false,
  },
  {
    id: 'marginaal-tarief',
    categorie: 'belasting',
    label: 'Wat is mijn marginale tarief en wat betekent dat voor me?',
    prompt: 'Wat is mijn marginale tarief en wat betekent dat voor me?',
    routes: ['/overzicht/belasting/box1'],
    generiek: false,
  },
  {
    id: 'box3-over-mijn-vermogen',
    categorie: 'belasting',
    label: 'Hoeveel Box 3-belasting betaal ik over mijn vermogen?',
    prompt: 'Hoeveel Box 3-belasting betaal ik over mijn vermogen?',
    routes: ['/overzicht/belasting/box3'],
    generiek: false,
    vereist: ['hasAssets'],
  },
  {
    id: 'hoe-werkt-box3',
    categorie: 'belasting',
    label: 'Hoe werkt Box 3 eigenlijk, in gewone taal?',
    prompt: 'Hoe werkt Box 3 eigenlijk, in gewone taal?',
    routes: ['/overzicht/belasting/box3'],
    generiek: true,
  },
  {
    id: 'onbenutte-jaarruimte',
    categorie: 'belasting',
    label: 'Hoeveel onbenutte jaarruimte heb ik nog?',
    prompt: 'Hoeveel onbenutte jaarruimte heb ik nog?',
    routes: ['/overzicht/belasting/optimizer'],
    generiek: false,
  },
  {
    id: 'jaarruimte-benutten',
    categorie: 'belasting',
    label: 'Wat levert het benutten van mijn jaarruimte fiscaal op?',
    prompt: 'Wat levert het benutten van mijn jaarruimte fiscaal op?',
    routes: ['/overzicht/belasting/optimizer'],
    generiek: false,
  },
  {
    id: 'eerstvolgende-fiscale-deadline',
    categorie: 'belasting',
    label: 'Welke fiscale deadline komt als eerste op me af?',
    prompt: 'Welke fiscale deadline komt als eerste op me af?',
    routes: ['/overzicht/belasting'],
    generiek: true,
  },
  {
    id: 'eigen-woning-en-belasting',
    categorie: 'belasting',
    label: 'Wat doet mijn eigen woning met mijn belasting?',
    prompt: 'Wat doet mijn eigen woning met mijn belasting?',
    routes: ['/overzicht/belasting/box1'],
    generiek: false,
  },
  {
    id: 'netto-van-de-volgende-euro',
    categorie: 'belasting',
    label: 'Hoeveel houd ik netto over van mijn volgende verdiende euro?',
    prompt: 'Hoeveel houd ik netto over van mijn volgende verdiende euro?',
    routes: ['/overzicht/belasting/box1'],
    generiek: false,
  },
  {
    id: 'heffingsvrij-vermogen',
    categorie: 'belasting',
    label: 'Wat is het heffingsvrij vermogen en benut ik dat volledig?',
    prompt: 'Wat is het heffingsvrij vermogen en benut ik dat volledig?',
    routes: ['/overzicht/belasting/box3'],
    generiek: false,
    vereist: ['hasAssets'],
  },
  {
    id: 'aanmerkelijk-belang',
    categorie: 'belasting',
    label: 'Wat betekent aanmerkelijk belang, en geldt dat voor mij?',
    prompt: 'Wat betekent aanmerkelijk belang, en geldt dat voor mij?',
    routes: ['/overzicht/belasting/box2'],
    generiek: true,
  },
  {
    id: 'werkjaar-voor-de-belastingdienst',
    categorie: 'belasting',
    label: 'Hoeveel van mijn werkjaar werk ik voor de Belastingdienst?',
    prompt: 'Hoeveel van mijn werkjaar werk ik voor de Belastingdienst?',
    routes: ['/overzicht/belasting'],
    generiek: false,
  },

  /* ── G · Huishouden & levensfase (75–82) ───────────────────────────────── */
  {
    id: 'uitgaven-versus-vergelijkbaar-huishouden',
    categorie: 'huishouden',
    label: 'Vergelijk mijn uitgaven met een huishouden als het mijne',
    prompt: 'Hoe verhouden mijn uitgaven zich tot een huishouden als het mijne?',
    routes: ['/overzicht/budget', '/mijn/profiel'],
    generiek: false,
    vereist: ['hasBudgets'],
  },
  {
    id: 'kind-in-vrijheidstijd',
    categorie: 'huishouden',
    label: 'Wat kost een kind me aan vrijheidstijd?',
    prompt: 'Wat kost een kind me aan vrijheidstijd?',
    routes: [],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'huis-kopen-over-drie-jaar',
    categorie: 'huishouden',
    label: 'Wat als we over drie jaar een huis willen kopen?',
    prompt: 'Wat als we over drie jaar een huis willen kopen?',
    routes: [],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'samenwonen-en-vaste-lasten',
    categorie: 'huishouden',
    label: 'Wat zou samenwonen doen met mijn vaste lasten?',
    prompt: 'Wat zou samenwonen doen met mijn vaste lasten?',
    routes: ['/toekomst/gebeurtenissen'],
    generiek: false,
  },
  {
    id: 'jaar-verlof-om-te-reizen',
    categorie: 'huishouden',
    label: 'Wat als ik een jaar met verlof ga om te reizen?',
    prompt: 'Wat als ik een jaar met verlof ga om te reizen?',
    routes: [],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'verbouwing-dertigduizend',
    categorie: 'huishouden',
    label: 'Hoe past een verbouwing van €30.000 in mijn plan?',
    prompt: 'Hoe past een verbouwing van €30.000 in mijn plan?',
    routes: ['/toekomst/gebeurtenissen'],
    generiek: false,
  },
  {
    id: 'carriereswitch-minder-salaris',
    categorie: 'huishouden',
    label: 'Wat doet een carrièreswitch met minder salaris?',
    prompt: 'Wat doet een carrièreswitch met minder salaris met mijn plan?',
    routes: [],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'profiel-van-geldgedrag',
    categorie: 'huishouden',
    label: 'Welk profiel van geldgedrag past bij mij, en klopt dat nog?',
    prompt: 'Welk profiel van geldgedrag past bij mij, en klopt dat nog?',
    routes: ['/mijn/profiel'],
    generiek: true,
    vereist: ['hasTransactions'],
  },

  /* ── H · Gedrag & gewoontes (83–92) ────────────────────────────────────── */
  {
    id: 'duurste-gewoonte-ongemerkt',
    categorie: 'algemeen',
    label: 'Welke gewoonte kost me ongemerkt de meeste vrijheid?',
    prompt: 'Welke gewoonte kost me ongemerkt de meeste vrijheid?',
    routes: ['/overzicht', '/overzicht/budget'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'waarin-ben-ik-beter-geworden',
    categorie: 'algemeen',
    label: 'Waar ben ik de afgelopen maanden beter in geworden?',
    prompt: 'Waar ben ik de afgelopen maanden beter in geworden?',
    routes: ['/overzicht', '/berichten'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'uitgave-die-ik-zo-weer-zou-doen',
    categorie: 'algemeen',
    label: 'Welke uitgave van vorige maand zou ik zo weer doen?',
    prompt: 'Welke uitgave van vorige maand zou ik zo weer doen?',
    routes: ['/berichten', '/overzicht/budget'],
    generiek: true,
    vereist: ['hasTransactions'],
  },
  {
    id: 'spaarquote-balans-nu-en-later',
    categorie: 'algemeen',
    label: 'Wat zegt mijn spaarquote over de balans tussen nu en later?',
    prompt: 'Wat zegt mijn spaarquote over de balans tussen nu en later?',
    routes: ['/overzicht'],
    generiek: true,
    vereist: ['hasTransactions'],
  },
  {
    id: 'consistenter-gaan-sparen',
    categorie: 'algemeen',
    label: 'Ben ik dit jaar consistenter gaan sparen of juist niet?',
    prompt: 'Ben ik dit jaar consistenter gaan sparen of juist niet?',
    routes: ['/overzicht'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'onopgemerkt-uitgavenpatroon',
    categorie: 'algemeen',
    label: 'Welk patroon in mijn uitgaven had ik zelf niet doorgehad?',
    prompt: 'Welk patroon in mijn uitgaven had ik zelf niet doorgehad?',
    routes: ['/overzicht/budget'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'duurste-gewoonte-in-levenstijd',
    categorie: 'algemeen',
    label: 'Wat is mijn duurste gewoonte, omgerekend naar levenstijd?',
    prompt: 'Wat is mijn duurste gewoonte, omgerekend naar levenstijd?',
    routes: ['/overzicht/budget'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'waar-lekt-geld-weg',
    categorie: 'algemeen',
    label: 'Waar lekt er geld weg zonder dat het me iets oplevert?',
    prompt: 'Waar lekt er geld weg zonder dat het me iets oplevert?',
    routes: ['/overzicht/budget'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'beste-maand-dit-jaar',
    categorie: 'algemeen',
    label: 'Welke maand was financieel mijn beste maand dit jaar?',
    prompt: 'Welke maand was financieel mijn beste maand dit jaar?',
    routes: ['/overzicht'],
    generiek: false,
    vereist: ['hasTransactions'],
  },
  {
    id: 'meest-opleverende-actie',
    categorie: 'algemeen',
    label: 'Welke afgeronde actie leverde me het meeste op?',
    prompt: 'Welke afgeronde actie leverde me het meeste op?',
    routes: ['/overzicht/tips'],
    generiek: false,
  },

  /* ── I · Mijlpalen & wat-als (93–100) ──────────────────────────────────── */
  {
    id: 'afstand-tot-eerstvolgende-mijlpaal',
    categorie: 'algemeen',
    label: 'Hoe ver ben ik van mijn eerstvolgende mijlpaal?',
    prompt: 'Hoe ver ben ik van mijn eerstvolgende mijlpaal?',
    routes: ['/toekomst/doelen', '/overzicht'],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'meevaller-tienduizend-opzij',
    categorie: 'algemeen',
    label: 'Wat als ik een meevaller van €10.000 helemaal opzij zet?',
    prompt: 'Wat als ik een meevaller van €10.000 helemaal opzij zet?',
    routes: [],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'spaarquote-verdubbelen',
    categorie: 'algemeen',
    label: 'Wat als ik vanaf morgen mijn spaarquote verdubbel?',
    prompt: 'Wat als ik vanaf morgen mijn spaarquote verdubbel?',
    routes: [],
    generiek: true,
    vereist: ['hasTransactions'],
  },
  {
    id: 'wanneer-mijn-eerste-ton',
    categorie: 'algemeen',
    label: 'Wanneer bereik ik mijn eerste ton?',
    prompt: 'Wanneer bereik ik mijn eerste ton?',
    routes: ['/toekomst', '/overzicht'],
    generiek: true,
    vereist: ['hasAssets'],
  },
  {
    id: 'doel-dichtst-bij-de-finish',
    categorie: 'algemeen',
    label: 'Welk doel van mij staat het dichtst bij de finish?',
    prompt: 'Welk doel van mij staat het dichtst bij de finish?',
    routes: ['/toekomst/doelen'],
    generiek: false,
    vereist: ['hasGoals'],
  },
  {
    id: 'woonlasten-tweehonderd-lager',
    categorie: 'algemeen',
    label: 'Wat als ik mijn woonlasten met €200 zou verlagen?',
    prompt: 'Wat als ik mijn woonlasten met €200 zou verlagen?',
    routes: [],
    generiek: true,
    vereist: ['hasTransactions'],
  },
  {
    id: 'dertiende-maand-in-vrijheid',
    categorie: 'algemeen',
    label: 'Hoeveel vrijheid koop ik met een dertiende maand?',
    prompt: 'Hoeveel vrijheid koop ik met een dertiende maand?',
    routes: [],
    generiek: true,
    vereist: ['hasTransactions'],
  },
  {
    id: 'vijf-euro-per-dag',
    categorie: 'algemeen',
    label: 'Wat als ik elke dag €5 opzij leg — waar sta ik over 10 jaar?',
    prompt: 'Wat als ik elke dag €5 opzij leg — waar sta ik over 10 jaar?',
    routes: [],
    generiek: true,
    vereist: ['hasAssets'],
  },
]

export interface SuggestieSelectie {
  pathname: string
  data: CoachDataGaps
  /** Rotatieteller; +1 bij elke klik op "Andere vragen". */
  seed: number
  /**
   * Hoeveel suggesties naast de vaste tip-chip. Default 3 — één leest als een
   * opdracht, zes duwt het invoerveld van het scherm.
   */
  aantal?: number
}

const STANDAARD_AANTAL = 3

/**
 * Het databeeld waarmee we rekenen zolang de layout er nog geen heeft
 * meegegeven: alles op false. Bewust conservatief — een suggestie die data
 * nodig heeft die er niet is, is een belofte die Fin niet kan waarmaken.
 */
export const LEGE_DATA_GAPS: CoachDataGaps = {
  hasBank: false,
  hasAssets: false,
  hasBudgets: false,
  hasGoals: false,
  hasDebts: false,
  hasTransactions: false,
  hasHoldings: false,
  hasHoldingsWithIsin: false,
  hasFireParams: false,
  hasLifeEvents: false,
}

/** Voldoet deze suggestie aan het databeeld? Geen `vereist` = altijd. */
function heeftData(suggestie: ChatSuggestie, data: CoachDataGaps): boolean {
  return (suggestie.vereist ?? []).every((sleutel) => data[sleutel] === true)
}

function opRoute(suggestie: ChatSuggestie, pathname: string): boolean {
  return suggestie.routes.some((prefix) => pathname.startsWith(prefix))
}

/**
 * De twee pools voor een gegeven (pathname, databeeld): eerst wat bij deze
 * pagina hoort, dan wat overal past. Gescheiden gehouden omdat de selectie de
 * routegebonden pool vóór laat gaan — een vraag over jouw schulden is op de
 * schuldenpagina meer waard dan een algemene.
 */
function pools(pathname: string, data: CoachDataGaps) {
  const beschikbaar = CHAT_SUGGESTIES.filter((s) => heeftData(s, data))
  const routegebonden = beschikbaar.filter((s) => opRoute(s, pathname))
  const routeIds = new Set(routegebonden.map((s) => s.id))
  const generiek = beschikbaar.filter((s) => s.generiek && !routeIds.has(s.id))
  return { routegebonden, generiek }
}

/**
 * Neemt roterend uit één pool, zonder dubbele ids. De index-formule
 * `(seed * aantal + i) % pool.length` loopt bij oplopende `i` precies één keer
 * door de hele pool — "Andere vragen" schuift dus een heel blok op i.p.v. één
 * vraag te verwisselen.
 */
function neem(
  pool: readonly ChatSuggestie[],
  doel: number,
  seed: number,
  aantal: number,
  gekozen: Map<string, ChatSuggestie>,
): void {
  if (pool.length === 0) return
  const start = ((seed * aantal) % pool.length + pool.length) % pool.length
  for (let i = 0; i < pool.length && gekozen.size < doel; i++) {
    const kandidaat = pool[(start + i) % pool.length]
    if (!gekozen.has(kandidaat.id)) gekozen.set(kandidaat.id, kandidaat)
  }
}

/**
 * Puur en deterministisch: gelijke input ⇒ gelijke output. Geen `Math.random`.
 *
 * 1. Filter op `vereist` (elke sleutel moet TRUE zijn in `data`).
 * 2. Routegebonden gaat vóór generiek.
 * 3. Neem er `aantal` uit, roterend op `seed`.
 * 4. Nooit twee dezelfde ids; is er niets routegebonden, dan vult de generieke
 *    pool volledig aan (A11 — de rij naast de tip-chip mag nooit leeg zijn).
 */
export function selectSuggesties(input: SuggestieSelectie): ChatSuggestie[] {
  const { pathname, data, seed } = input
  const aantal = Math.max(0, input.aantal ?? STANDAARD_AANTAL)
  if (aantal === 0) return []

  const { routegebonden, generiek } = pools(pathname, data)
  const gekozen = new Map<string, ChatSuggestie>()
  neem(routegebonden, aantal, seed, aantal, gekozen)
  neem(generiek, aantal, seed, aantal, gekozen)
  return [...gekozen.values()]
}

/**
 * Hoeveel suggesties er voor deze input überhaupt in aanmerking komen.
 *
 * De UI verbergt "Andere vragen" zodra dit getal `<= aantal` is: er valt dan
 * niets te verversen en een knop die niets doet is erger dan geen knop.
 */
export function suggestiePoolGrootte(input: Omit<SuggestieSelectie, 'seed'>): number {
  const { routegebonden, generiek } = pools(input.pathname, input.data)
  return routegebonden.length + generiek.length
}
