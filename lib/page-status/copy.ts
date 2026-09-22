// lib/page-status/copy.ts
//
// Gecureerde Nederlandse copy voor de status-duiding-melding (PageStatusBanner)
// bovenaan niet-groene pagina's onder /overzicht. Géén IO, géén berekening — puur
// tekst per route.
//
// Filosofie ("Geld levert tijd op"): warm, concreet, gewone taal. GEEN
// Wft-advies (nooit "beleg in X", geen productadvies) — we duiden de situatie en
// wijzen naar de hefboom-pagina waar de gebruiker zélf handelt. De `remedy`-
// teksten leunen waar passend op de bestaande `improvementTip`-formuleringen uit
// lib/financial-health.ts (savings_rate, debt_ratio, asset_concentration) zodat
// de toon consistent is met de gezondheidspijlers.
//
// Per route leveren we:
//  - title:   kort gebieds-label voor de "Bespreek met Fin"-context.
//  - reason:  "wat is er aan de hand" voor de warn- én de bad-status. Mag het
//             live cijfer (uit resolve.ts) interpoleren via {figure}.
//  - remedy:  "wat kun je eraan doen" — concreet, niet-belerend.
//  - action?: optionele deeplink, ALLEEN waar een andere/diepere bestemming
//             helpt dan de pagina zelf (anders leunen we op de Fin-knop).
//  - will:    onderwerp + 1-regel context voor de "Bespreek met Fin"-knop.
//
// `figure` is de live waarde die resolve.ts uit de status-bron haalt (bv. de
// hefboom-detailtekst of de cashflow-kaart-subtext). `{figure}` wordt door
// resolve.ts ingevuld; ontbreekt 'ie, dan valt de zin terug op een neutrale vorm.

import type { LeverageStatus } from '@/lib/leverage-status'
import type { PageStatusAction, PageStatusWill } from '@/lib/page-status/types'
import type { FiscaleRuimteCause } from '@/lib/fiscale-ruimte'
import { formatCurrency } from '@/lib/format'
import { ankerTitel, ankerZin, type AnkerReach, type AnkerStop } from '@/lib/horizon/anker-copy'

/** Per status (warn/bad) een reason + remedy; {figure} = live cijfer. */
export interface StatusCopy {
  reason: string
  remedy: string
}

/** Gecureerde copy-set voor één route. */
export interface RouteCopy {
  title: string
  /** Copy voor de twee zichtbare statussen. good/neutral tonen geen banner. */
  warn: StatusCopy
  bad: StatusCopy
  /**
   * OORZAAK-SPECIFIEKE variant (ADR 0177 D4) — optioneel, en alléén gevuld voor
   * een route waarvan de statusbron méér levert dan een niveau.
   *
   * `LeverageStatus` draagt alleen "oranje" of "rood"; een melding die niets
   * anders kent kan niet zeggen waaróm. De belasting-hefboom levert sinds ADR
   * 0177 de openstaande posten mee, aflopend op besparing, en `resolve.ts` kiest
   * de variant van de GROOTSTE post. Ontbreekt de post of de variant, dan vallen
   * we terug op `warn`/`bad` — routes zónder `byCause` gedragen zich dus exact
   * zoals voorheen.
   *
   * Eén variant per oorzaak, niet per oorzaak × status: het NIVEAU zit al in de
   * kleur van de melding en in het bedrag, de oorzaak-tekst verschilt daar niet
   * door.
   *
   * VOLLEDIG, niet `Partial` — bewust. De hele reden van bestaan van dit veld is
   * dat oranje en rood hun oorzaak noemen; een `Partial` liet een vierde
   * `FiscaleRuimteCause` (bv. `tegenbewijs` uit ADR 0177 D7) gewoon compileren
   * zónder copy, waarna `resolve.ts` stil terugvalt op de generieke warn-tekst
   * met de detailregel als cijfer — "Er blijft fiscale ruimte onbenut
   * (Samenstelling vermogen · € 815 per jaar)", grammaticaal scheef en door geen
   * test gevangen. Het veld zelf blijft optioneel: een route die géén
   * oorzaak-bron heeft, hoort hier niets te zetten. Maar wie 'm zet, zet 'm vol.
   */
  byCause?: Record<FiscaleRuimteCause, StatusCopy>
  action?: PageStatusAction
  will: PageStatusWill
}

/**
 * `{figure}` in een reason vervangen door het live cijfer. Wanneer er geen
 * cijfer is (lege string/undefined), strippen we de placeholder netjes mee
 * inclusief de omliggende `( … )`-haakjes zodat er geen "Je ratio is hoog ()."
 * overblijft. De templates gebruiken het patroon ` ({figure})`.
 */
export function fillFigure(template: string, figure: string | null | undefined): string {
  if (figure && figure.trim().length > 0) {
    return template.replace(/\{figure\}/g, figure.trim())
  }
  // Geen cijfer: verwijder eerst de hele ` ({figure})`-/`({figure})`-groep
  // (inclusief omsluitende haakjes), dan een eventueel kale `{figure}`, en
  // normaliseer ten slotte dubbele spaties.
  return template
    .replace(/\s*\(\{figure\}\)/g, '')
    .replace(/\s*\{figure\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ── Route-copy-catalogus ────────────────────────────────────────────────────

export const PAGE_STATUS_COPY: Record<string, RouteCopy> = {
  // ── Hefbomen (landingspagina's onder /overzicht) ──────────────────────────
  '/overzicht/bezittingen': {
    title: 'Bezittingen',
    warn: {
      reason: 'Je vermogen leunt sterk op één type bezit ({figure}).',
      remedy:
        'Spreiding verlaagt je risico. Bekijk over welke soorten bezit je vermogen verdeeld is.',
    },
    bad: {
      reason: 'Bijna je hele vermogen zit in één type bezit ({figure}).',
      remedy:
        'Eén klap kan dan veel ineens raken. Bekijk hoe je geleidelijk meer kunt spreiden.',
    },
    will: {
      onderwerp: 'De spreiding van mijn bezittingen',
      detail: 'Ik wil begrijpen hoe gespreid mijn vermogen is en wat ik eraan kan doen.',
    },
  },

  '/overzicht/schulden': {
    title: 'Schulden',
    warn: {
      reason: 'Je schulden zijn een merkbaar deel van je vermogen ({figure}).',
      // Beschrijvend handelingsperspectief (geen imperatief, Wft): wat aflossen
      // doet, niet wat je moet doen. Was "Overweeg extra aflossingen … vrijheid
      // die je terugkoopt" (koop-metafoor, ADR 0165).
      remedy:
        'Extra aflossen op de duurste lening scheelt rente — elke aflossing levert tijd op.',
    },
    bad: {
      reason: 'Je schulden wegen zwaar ten opzichte van je vermogen ({figure}).',
      remedy:
        // S17: merknaam weg, duiding blijft — "de duurste schuld eerst" ís de
        // uitleg van de avalanche-methode. De DebtStrategy-enumwaarde
        // 'avalanche' (lib/debt-data.ts) is een gepersisteerde identifier en
        // blijft ongemoeid; dit is uitsluitend schermtekst.
        'Focus op de duurste schuld eerst om sneller schuldenvrij te worden.',
    },
    will: {
      onderwerp: 'Mijn schulden afbouwen',
      detail: 'Ik wil weten welke schuld ik het beste eerst aanpak en wat dat oplevert.',
    },
  },

  // Hefboom 3. Was 'Cashflow' met een eigen hub; sinds UR3-28 is de budgetpagina
  // zelf de hefboom. De actie-knop is vervallen: hij wees naar '/overzicht/budget'
  // en dat is precies de pagina waarop deze melding staat.
  '/overzicht/budget': {
    title: 'Budget',
    // De hefboomscore is een menging van spaarquote en budgetdiscipline, dus de
    // melding benoemt beide. Hier stond tot ADR 0135 een tweede, budget-
    // specifieke entry onder dezelfde route ("Meerdere budgetten zijn over de
    // limiet"); die kon niet blijven bestaan, maar zijn onderwerp is hier
    // opgenomen zodat de melding past bij de pagina waar je staat.
    warn: {
      reason: 'Je houdt deze maand weinig over ({figure}), en een paar budgetten dreigen uit te lopen.',
      remedy:
        'Bekijk welke categorieën uitlopen en stel ze bij — kleine besparingen tellen snel op tot meer ruimte.',
    },
    bad: {
      reason: 'Je geeft deze maand meer uit dan er binnenkomt ({figure}).',
      remedy:
        'Begin bij je grootste posten: bekijk de kassabon per categorie en stel de overschreden budgetten bij.',
    },
    will: {
      onderwerp: 'Mijn budgetten op koers krijgen',
      detail: 'Ik wil weten welke budgetten uitlopen en hoe ik ze realistisch bijstel, zodat ik maandelijks meer overhoud.',
    },
  },

  // De hefboom Belasting oordeelt sinds ADR 0177 op ONBENUTTE FISCALE RUIMTE als
  // aandeel van de eigen heffing over Box 1 + Box 3 — niet meer op de hoogte van
  // de Box 3-heffing. De oude teksten ("Je vermogen ligt ruim boven de
  // heffingsvrije voet") beschreven precies de grondslag die is afgeschaft: die
  // was monotoon in vermogen, had geen plafond en kende geen handeling die hem
  // groen maakte. `warn`/`bad` hieronder zijn nu de TERUGVAL; de melding die de
  // gebruiker normaal leest komt uit `byCause`.
  '/overzicht/belasting': {
    title: 'Belasting',
    // H24 (Wft): beschrijvend, niet oordelend. We noemen wat er onbenut blijft en
    // waar het te zien is; we sporen niet aan om het te benutten.
    warn: {
      reason: 'Er blijft fiscale ruimte onbenut ({figure}).',
      remedy:
        'In je Box 1- en Box 3-overzicht zie je hoe je heffing is opgebouwd.',
    },
    bad: {
      reason: 'Een fors deel van je fiscale ruimte blijft onbenut ({figure}).',
      remedy:
        'In je Box 1- en Box 3-overzicht zie je per box waar de heffing vandaan komt.',
    },
    // De drie posten van ADR 0177 D2. Elke tekst is een CONSTATERING: hij benoemt
    // wat de post is en waar de gebruiker hem terugziet — nooit "benut je
    // jaarruimte" of een andere gebiedende wijs (Wft: inzicht mag, advies niet).
    byCause: {
      partnerverdeling: {
        reason:
          'Je laat fiscale ruimte liggen: de verdeling tussen jou en je fiscale partner ({figure}).',
        remedy:
          'De verdeling van je vermogen tussen jou en je fiscale partner bepaalt hoeveel Box 3-heffing er in totaal betaald wordt. In je Box 3-overzicht zie je de huidige verdeling.',
      },
      jaarruimte: {
        reason: 'Je laat fiscale ruimte liggen: onbenutte jaarruimte ({figure}).',
        remedy:
          'Onbenutte jaarruimte is fiscale ruimte voor pensioenopbouw die dit jaar niet gebruikt wordt. Je Box 1-overzicht laat zien hoeveel het is.',
      },
      samenstelling: {
        reason:
          'Je laat fiscale ruimte liggen: de verhouding tussen sparen en beleggen ({figure}).',
        remedy:
          'Sparen en beleggen worden in Box 3 verschillend belast. De optimizer laat zien wat een verschuiving netto oplevert, ná gemist rendement.',
      },
    },
    will: {
      onderwerp: 'De fiscale ruimte die ik nog niet gebruik',
      detail: 'Ik wil begrijpen welke fiscale ruimte ik onbenut laat en wat daarachter zit.',
    },
  },

  // ── De drie onderdelen van Budget ─────────────────────────────────────────
  // Hier stond ook een entry voor '/overzicht/budget' zelf, uit de tijd dat het
  // een sub-pagina van de cashflow-hub was. Die is verweesd: de budgetpagina is
  // nu de hefboom en haalt haar melding uit de hefboomscore hierboven.

  '/overzicht/budget/transacties': {
    title: 'Transacties',
    warn: {
      reason: 'Je spaarquote is deze maand aan de krappe kant.',
      remedy:
        'Bekijk je grootste uitgaven van deze maand — daar zit meestal de snelste winst.',
    },
    bad: {
      reason: 'Je hebt deze maand een tekort.',
      remedy:
        'Loop je uitgaven van deze maand langs en zoek de posten die je kunt terugdringen.',
    },
    will: {
      onderwerp: 'Mijn uitgaven deze maand',
      detail: 'Ik wil zien waar mijn geld deze maand heen ging en wat ik kan terugdringen.',
    },
  },

  '/overzicht/budget/vaste-lasten': {
    title: 'Vaste lasten',
    warn: {
      reason: 'Je vaste lasten nemen een fors deel van je inkomen in beslag ({figure}).',
      remedy:
        'Loop je abonnementen en terugkerende kosten langs — een paar opzeggingen geven blijvend lucht.',
    },
    bad: {
      reason: 'Je vaste lasten slokken een groot deel van je inkomen op ({figure}).',
      remedy:
        'Bekijk welke terugkerende kosten je kunt opzeggen of verlagen — dit verlicht elke maand opnieuw.',
    },
    will: {
      onderwerp: 'Mijn vaste lasten verlagen',
      detail: 'Ik wil weten welke vaste lasten ik kan opzeggen of verlagen.',
    },
  },

  '/overzicht/budget/forecast': {
    title: 'Vooruitblik',
    warn: {
      reason: 'Je verwachte saldo blijft de komende maanden vlak.',
      remedy:
        'Een klein maandelijks overschot bouwt op termijn flink op. Bekijk waar je ruimte kunt maken.',
    },
    bad: {
      reason: 'Je verwachte saldo daalt de komende maanden.',
      remedy:
        'Bekijk je terugkerende inkomsten en uitgaven om de daling te keren voordat ze doortikt.',
    },
    will: {
      onderwerp: 'Mijn verwachte kasstroom',
      detail: 'Ik wil begrijpen waarom mijn saldo zo loopt en hoe ik het ombuig.',
    },
  },

  // ── Belasting-subpagina's (Box 1 / Box 3) ─────────────────────────────────
  '/overzicht/belasting/box1': {
    title: 'Box 1 — werk & woning',
    warn: {
      reason: 'Je hebt onbenutte jaarruimte voor pensioenopbouw ({figure}).',
      remedy:
        'Met onbenutte jaarruimte kun je fiscaal voordelig extra pensioen opbouwen. Bekijk je Box 1-overzicht.',
    },
    bad: {
      reason: 'Er liggen onbenutte belastingvoordelen in Box 1 ({figure}).',
      remedy: 'Bekijk je Box 1-overzicht om de openstaande aftrekruimte te benutten.',
    },
    will: {
      onderwerp: 'Mijn jaarruimte en Box 1',
      detail: 'Ik wil weten hoeveel jaarruimte ik heb en wat ik daarmee kan.',
    },
  },

  '/overzicht/belasting/box3': {
    title: 'Box 3 — sparen + beleggen',
    warn: {
      reason: 'Je vermogen komt boven de heffingsvrije voet uit ({figure}).',
      remedy:
        'Er is Box 3-belasting verschuldigd. Bekijk je Box 3-overzicht om je positie in kaart te brengen.',
    },
    bad: {
      reason: 'Je hebt een hoge Box 3-blootstelling ({figure}).',
      remedy:
        'Bekijk je Box 3-overzicht om je positie volledig in kaart te brengen.',
    },
    will: {
      onderwerp: 'Mijn Box 3-vermogen',
      detail: 'Ik wil begrijpen hoeveel Box 3-belasting ik betaal en wat de opties zijn.',
    },
  },

  // ── Box 2 (zelden relevant) ───────────────────────────────────────────────
  // Box 2 is voor ~99% van de gebruikers niet relevant (geen aanmerkelijk
  // belang). resolve.ts levert hier vrijwel altijd 'neutral' → geen banner.
  // We houden de copy klaar voor het zeldzame DGA-geval.
  //
  // Sinds bevinding L8 vuurt deze banner op MATERIALITEIT, niet op aanwezigheid:
  // hij verschijnt alleen wanneer er daadwerkelijk een Box 2-heffing staat
  // (dividend en/of het bovenmatige deel boven de €500.000-leengrens). De
  // onderstaande warn-tekst mag daarom stellig zijn — er ís dan iets te doen.
  // Een DGA zonder heffing ziet de pagina rustig, zonder banner.
  '/overzicht/belasting/box2': {
    title: 'Box 2 — aanmerkelijk belang',
    warn: {
      reason: 'Je hebt een aanmerkelijk belang dat in Box 2 wordt belast.',
      remedy:
        'Bekijk je Box 2-overzicht voor dividend, vervreemdingswinst en de excessief-lenen-regeling.',
    },
    bad: {
      reason: 'Je Box 2-positie vraagt aandacht.',
      remedy: 'Bekijk je Box 2-overzicht om de heffing en de excessief-lenen-grens te beoordelen.',
    },
    will: {
      onderwerp: 'Mijn Box 2-positie',
      detail: 'Ik wil begrijpen hoe mijn aanmerkelijk belang in Box 2 wordt belast.',
    },
  },
}

// ── Vrijheids-/pensioenbanner (informatief, niet-alarmerend) ─────────────────
//
// Aparte copy-set (géén onderdeel van PAGE_STATUS_COPY, dat is warn/bad-only):
// de informatieve duiding op /overzicht wanneer de gebruiker al financieel vrij
// of met pensioen is. Twee varianten op basis van de gedeelde framing-vlag.
// Filosofie behouden ("Geld levert tijd op"): het beeld toont nu onttrekking,
// geen opbouw — geen Wft-advies.

export interface FreedomBannerCopy {
  title: string
  reason: string
  remedy: string
  will: PageStatusWill
}

export const FREEDOM_BANNER_COPY: Record<'free' | 'pensioen' | 'nu-stoppen', FreedomBannerCopy> = {
  free: {
    title: 'Financieel vrij',
    reason: 'Je bent financieel vrij — je hoeft niet meer te werken voor geld.',
    remedy:
      'Dit overzicht toont nu je onttrekking tot het einde van je leven, niet meer je opbouw. Je vrijheids-% en vrijheidsleeftijd zijn bereikt.',
    will: {
      onderwerp: 'Mijn vermogen behouden nu ik vrij ben',
      detail: 'Ik wil weten hoe lang mijn vermogen meegaat en hoe ik het verstandig behoud.',
    },
  },
  pensioen: {
    title: 'Met pensioen',
    reason: 'Je bent met pensioen — je leeft van je opgebouwde vermogen en je AOW.',
    remedy:
      'Dit overzicht toont nu je onttrekking tot het einde van je leven, niet meer je opbouw.',
    will: {
      onderwerp: 'Mijn pensioen-onttrekking',
      detail: 'Ik wil weten hoe lang mijn vermogen meegaat en hoe ik verstandig onttrek.',
    },
  },
  // ADR 0127 D6 — eindstrategie 'Nu stoppen'. BESCHRIJVEND, nooit "je bent vrij":
  // die kop zou onder dit anker ook boven een plan staan dat twee jaar reikt.
  // Deze banner verschijnt uitsluitend in de GEDEKTE substaat — `isFinanciallyFree`
  // laat 'm alleen door bij een tijdsdekking van 100% (D5), dus "reikt tot je
  // eindleeftijd" is hier een feit en geen belofte. De andere substaat ("reikt
  // tot leeftijd X") draagt de Vrijheid-strip, die de runway wél in handen heeft.
  'nu-stoppen': {
    title: 'Je rekent alsof je nu stopt',
    reason:
      'Je plan gaat ervan uit dat je vandaag stopt met werken — je vermogen reikt tot je ingestelde eindleeftijd.',
    remedy:
      'Dit overzicht toont je onttrekking vanaf vandaag, niet meer je opbouw.',
    will: {
      onderwerp: 'Hoe ver mijn vermogen reikt nu ik gestopt ben',
      detail: 'Ik wil weten tot welke leeftijd mijn vermogen reikt en hoe ik verstandig onttrek.',
    },
  },
}

/**
 * ADR 0129 F3b — de banner onder een VAST stopmoment dat nog niet 'free' is (de strip
 * volgend): kop = "Je rekent met stoppen op {stop}" / "Je rekent alsof je nu stopt",
 * reden = de bereik-zin uit anker-copy. Beschrijvend; geen AOW in een tekortzin,
 * geen "je kunt stoppen". `reach.kind === 'onbekend'` ⇒ null (geen banner).
 */
export function anchoredBannerCopy(reach: AnkerReach, stop: AnkerStop): FreedomBannerCopy | null {
  if (reach.kind === 'onbekend') return null
  const gedekt = reach.kind === 'gedekt'
  return {
    title: ankerTitel(stop),
    reason: ankerZin(reach, stop),
    remedy: gedekt
      ? 'Dit overzicht toont je opbouw tot je stopmoment en je onttrekking daarna. Vrij mogelijk vanaf een eerdere leeftijd zie je op Toekomst.'
      : 'Op Toekomst zie je wat er per maand bij hoort om je plan wél te laten reiken, en verken je een ander stopmoment.',
    will: {
      onderwerp: gedekt ? 'Of mijn plan tot het einde reikt' : 'Mijn plan laten reiken tot het einde',
      detail: gedekt
        ? 'Ik wil weten hoe stevig mijn plan is als ik op mijn stopmoment stop.'
        : 'Ik wil weten waar de ruimte zit om mijn liquide vermogen verder te laten reiken.',
    },
  }
}

// ── Fiscale ruimte: het live cijfer en de staartzin (ADR 0177 D4) ───────────

/**
 * Het live cijfer in een `byCause`-reason: "ongeveer € 2.960 per jaar".
 *
 * "Ongeveer" is geen sierwoord maar de hedge die bij de bron hoort: de posten
 * komen uit modelmatige motoren (partnerverdeling, jaarruimte, samenstelling) en
 * zijn een indicatie, geen aanslag. Bedragen altijd via `formatCurrency`
 * (nl-NL, hele euro's) — nooit met de hand opgemaakt.
 */
export function fiscaleRuimteFigure(besparing: number): string {
  return `ongeveer ${formatCurrency(besparing)} per jaar`
}

/**
 * Staartzin wanneer er naast de grootste post nog andere openstaan. Lege string
 * bij 0 — de melding noemt dan alleen de grootste post.
 *
 * Bewust een eigen ZIN en niet een staart binnen de haakjes van het bedrag:
 * "(ongeveer € 2.960 per jaar, en 1 andere)" leest alsof dat aantal bij het
 * bedrag hoort.
 */
export function overigePostenZin(extra: number): string {
  if (extra <= 0) return ''
  return extra === 1
    ? 'Daarnaast ligt er nog een andere post open.'
    : `Daarnaast liggen er nog ${extra} andere posten open.`
}

/** Helper: copy voor een route + status (warn/bad). null als route onbekend. */
export function getRouteCopy(route: string): RouteCopy | null {
  return PAGE_STATUS_COPY[route] ?? null
}

/** Copy voor een specifieke (warn|bad)-status van een route. */
export function getStatusCopy(route: string, status: LeverageStatus): StatusCopy | null {
  const rc = PAGE_STATUS_COPY[route]
  if (!rc) return null
  if (status === 'warn') return rc.warn
  if (status === 'bad') return rc.bad
  return null
}
