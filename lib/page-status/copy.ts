// lib/page-status/copy.ts
//
// Gecureerde Nederlandse copy voor de status-duiding-melding (PageStatusBanner)
// bovenaan niet-groene pagina's onder /overzicht. Géén IO, géén berekening — puur
// tekst per route.
//
// Filosofie ("Geld is opgeslagen tijd"): warm, concreet, gewone taal. GEEN
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
      remedy:
        'Overweeg extra aflossingen op je duurste lening — elke euro minder schuld is vrijheid die je terugkoopt.',
    },
    bad: {
      reason: 'Je schulden wegen zwaar ten opzichte van je vermogen ({figure}).',
      remedy:
        'Focus op de duurste schuld eerst (avalanche-methode) om sneller schuldenvrij te worden.',
    },
    will: {
      onderwerp: 'Mijn schulden afbouwen',
      detail: 'Ik wil weten welke schuld ik het beste eerst aanpak en wat dat oplevert.',
    },
  },

  '/overzicht/cashflow': {
    title: 'Cashflow',
    warn: {
      reason: 'Je houdt deze maand weinig over ({figure}).',
      remedy:
        'Bekijk je budget en vaste lasten — kleine besparingen tellen snel op tot meer ruimte.',
    },
    bad: {
      reason: 'Je geeft deze maand meer uit dan er binnenkomt ({figure}).',
      remedy:
        'Begin bij je grootste posten. Bekijk je budget en vaste lasten om de balans te herstellen.',
    },
    action: { label: 'Naar je budget', href: '/overzicht/cashflow/budget' },
    will: {
      onderwerp: 'Mijn maandelijkse cashflow',
      detail: 'Ik wil zien waar mijn geld heen gaat en hoe ik maandelijks meer kan overhouden.',
    },
  },

  '/overzicht/belasting': {
    title: 'Belasting',
    // H24 (Wft): beschrijvend, niet oordelend. "Je betaalt waarschijnlijk meer
    // belasting dan nodig" is een bewering die we niet hard kunnen maken —
    // we kennen de heffing, niet wat "nodig" was. Zelfde register als de
    // box3-pagina hieronder: benoem de grondslag, trek geen conclusie.
    warn: {
      reason: 'Een deel van je vermogen valt in de Box 3-heffing ({figure}).',
      remedy:
        'Bekijk je Box 1- en Box 3-overzicht om te zien hoe die heffing is opgebouwd.',
    },
    bad: {
      reason: 'Je vermogen ligt ruim boven de heffingsvrije voet ({figure}).',
      remedy:
        'In je Box 1- en Box 3-overzicht zie je per box waar de heffing vandaan komt.',
    },
    will: {
      onderwerp: 'Mijn belasting optimaliseren',
      detail: 'Ik wil weten waar ik legaal belasting kan besparen.',
    },
  },

  // ── Cashflow-subpagina's (de vier kaarten) ────────────────────────────────
  '/overzicht/cashflow/budget': {
    title: 'Budget',
    warn: {
      reason: 'Een paar budgetten dreigen over de limiet te gaan.',
      remedy: 'Bekijk welke categorieën uitlopen en stel je budget waar nodig bij.',
    },
    bad: {
      reason: 'Meerdere budgetten zijn over de limiet.',
      remedy:
        'Bekijk de kassabon per categorie en stel de overschreden budgetten bij.',
    },
    will: {
      onderwerp: 'Mijn budgetten op koers krijgen',
      detail: 'Ik wil weten welke budgetten uitlopen en hoe ik ze realistisch bijstel.',
    },
  },

  '/overzicht/cashflow/transacties': {
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

  '/overzicht/cashflow/vaste-lasten': {
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

  '/overzicht/cashflow/forecast': {
    title: 'Forecast',
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
// Filosofie behouden ("Geld is opgeslagen tijd"): het beeld toont nu onttrekking,
// geen opbouw — geen Wft-advies.

export interface FreedomBannerCopy {
  title: string
  reason: string
  remedy: string
  will: PageStatusWill
}

export const FREEDOM_BANNER_COPY: Record<'free' | 'pensioen', FreedomBannerCopy> = {
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
