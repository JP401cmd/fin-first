// ── Uitvoergroepen: waar draait welke AI-functie? ───────────────────────────
//
// De gebruiker kiest op /mijn/privacy waar de AI draait: op zijn eigen apparaat
// (lokaal) of bij de AI-leverancier (cloud). Die keuze staat op TWEE niveaus:
//
//   1. `profiles.privacy_mode` — de hoofdschakelaar (de default voor álles).
//   2. `profiles.ai_execution_prefs` — een override per GROEP, die de
//      hoofdschakelaar overstemt.
//
// Dit bestand is de single source of truth voor die groepsindeling. Het bezit
// drie dingen die eerder verspreid of impliciet waren:
//
//   (a) WELKE GROEPEN er zijn en wat ze de gebruiker beloven — de indeling volgt
//       bewust de commerciële AI-lijst uit lib/feature-registry.ts (dat is de
//       lijst die iemand koopt en op /mijn/account ziet), plus één aparte groep
//       voor documentinvoer: die valt commercieel onder 'ai_analyse' maar is
//       qua privacy-afweging wezenlijk anders (je uploadt een aangifte of UPO).
//   (b) WELKE FEATURE bij welke groep hoort — `FEATURE_GROUP` is exhaustief over
//       `AiTokenFeature`, dus een nieuwe feature-string in token-usage.ts geeft
//       hier een compile-fout tot hij is ingedeeld. Datzelfde patroon als
//       FUNCTION_SERVICE_MAP in de ArchiMate-plaat.
//   (c) WELKE ROUTE bij welke groep hoort — `AI_ROUTE_BINDINGS` voedt zowel de
//       server-gate (lib/ai/privacy-gate-scan.ts) als de statische scan.
//
// PLATFORM-TAKEN. Niet elke AI-call is een gebruikerskeuze. De nieuws-ingest
// draait als cron om 05:00 met de service-role, zonder browser en zonder sessie,
// en leest uitsluitend openbare RSS-/webbronnen — er gaat geen enkel gegeven van
// een gebruiker doorheen. Die per gebruiker "blokkeren" zou schijnveiligheid
// zijn: het raakt hun data niet. Zulke calls krijgen scope 'platform': ze staan
// niet als schakelaar in de UI, maar worden wél benoemd (uitleg-regel), zodat de
// lijst eerlijk volledig is.

import type { AiTokenFeature } from './token-usage'

// ── Typen ───────────────────────────────────────────────────────────────────

/** De zeven groepen waartussen de gebruiker per stuk kan kiezen. */
export type AiExecutionGroup =
  | 'gesprek'
  | 'transacties'
  | 'briefing'
  | 'tips'
  | 'rapporten'
  | 'documenten'
  | 'nieuws'

/** Waar een groep draait. */
export type AiExecutionMode = 'lokaal' | 'cloud'

/**
 * Scope van een feature: een gebruikersgroep, of 'platform' voor centrale taken
 * zonder gebruikerskeuze (zie de kop van dit bestand).
 */
export type AiExecutionScope = AiExecutionGroup | 'platform'

/** Hoe volledig een groep lokaal kan draaien. */
export type LocalSupport = 'volledig' | 'gedeeltelijk'

export interface AiExecutionGroupInfo {
  id: AiExecutionGroup
  /** Naam zoals de gebruiker 'm op /mijn/privacy ziet. */
  label: string
  /** Eén zin: wat valt hieronder, in gewone taal. */
  omschrijving: string
  lokaal: LocalSupport
  /**
   * Wat er wegvalt zodra deze groep op 'lokaal' staat. Leeg bij 'volledig'.
   *
   * Dit is geen sier maar de kern van het scherm: met de gekozen semantiek
   * ("kan iets lokaal niet, dan blokkeren — niet stil doorlaten") mag een
   * gebruiker nooit ontdekken dát iets niet meer werkt zonder dat het er stond.
   */
  beperkingen: string[]
  /** Bijbehorende id's uit UNIFIED_FEATURES (lib/feature-registry.ts). */
  commercieleFeatures: string[]
}

// ── De groepen ──────────────────────────────────────────────────────────────

export const AI_EXECUTION_GROUPS: readonly AiExecutionGroupInfo[] = [
  {
    id: 'gesprek',
    label: 'Gesprek met Fin',
    omschrijving: 'Je vragen aan Fin en de antwoorden daarop.',
    lokaal: 'volledig',
    beperkingen: [],
    commercieleFeatures: ['ai_assistent'],
  },
  {
    id: 'transacties',
    label: 'Transacties & vaste lasten',
    omschrijving: 'Transacties op de juiste budgetten zetten en je vaste lasten herkennen.',
    lokaal: 'volledig',
    beperkingen: [],
    commercieleFeatures: ['ai_analyse'],
  },
  {
    id: 'briefing',
    label: 'Dagelijkse briefing',
    omschrijving: 'De korte dagopening bovenaan je overzicht.',
    lokaal: 'volledig',
    beperkingen: [],
    commercieleFeatures: ['ai_briefing'],
  },
  {
    id: 'tips',
    label: "Tips & scenario's",
    omschrijving: "Persoonlijke tips en voorstellen bij je wat-als-scenario's.",
    lokaal: 'gedeeltelijk',
    beperkingen: ['Tips zijn korter en eenvoudiger geformuleerd.'],
    commercieleFeatures: ['ai_aanbevelingen'],
  },
  {
    id: 'rapporten',
    label: 'Rapporten & rekenhulpen',
    omschrijving: 'De inleiding boven je rapport en het bouwen van een eigen rekenhulp.',
    lokaal: 'gedeeltelijk',
    beperkingen: [
      'Een rekenhulp wordt een eenvoudigere versie: één scenario, minder invoervelden.',
      'Een bestaande rekenhulp verfijnen kan niet — die past niet in het geheugen van het lokale model.',
    ],
    commercieleFeatures: ['ai_rapportage'],
  },
  {
    id: 'documenten',
    label: 'Documenten lezen',
    omschrijving: 'Je aangifte, pensioenoverzicht of een korte beschrijving uitlezen.',
    lokaal: 'gedeeltelijk',
    beperkingen: [
      'Een gescande PDF of foto kan niet gelezen worden — het lokale model kan geen afbeeldingen bekijken.',
      'Het uitlezen duurt merkbaar langer dan via de cloud.',
    ],
    commercieleFeatures: ['ai_analyse'],
  },
  {
    id: 'nieuws',
    label: 'Nieuws',
    omschrijving: 'Je persoonlijke nieuwseditie: wat betekent dit nieuws voor jou?',
    lokaal: 'volledig',
    beperkingen: [],
    commercieleFeatures: ['ai_nieuws'],
  },
] as const

/** Alle groeps-id's in weergavevolgorde. */
export const AI_EXECUTION_GROUP_IDS = AI_EXECUTION_GROUPS.map((g) => g.id)

export function executionGroupInfo(group: AiExecutionGroup): AiExecutionGroupInfo {
  const found = AI_EXECUTION_GROUPS.find((g) => g.id === group)
  if (!found) throw new Error(`Onbekende uitvoergroep: ${group}`)
  return found
}

// ── Feature → groep ─────────────────────────────────────────────────────────

/**
 * Exhaustief over `AiTokenFeature`: elke feature-string die aan getModel wordt
 * meegegeven hoort bij precies één scope. Voeg je een feature toe in
 * lib/ai/token-usage.ts, dan faalt de build hier tot je 'm indeelt.
 */
export const FEATURE_GROUP: Record<AiTokenFeature, AiExecutionScope> = {
  chat: 'gesprek',

  categorisatie: 'transacties',
  abonnementen_detectie: 'transacties',
  abonnementen_analyse: 'transacties',
  abonnementen_advies: 'transacties',

  briefing: 'briefing',

  aanbevelingen: 'tips',
  aanbevelingen_initieel: 'tips',
  whatif_suggesties: 'tips',

  rapport: 'rapporten',
  rekenhulp_bouwen: 'rapporten',
  scherm_publicatie: 'rapporten',

  document_extractie: 'documenten',
  aangifte_extractie: 'documenten',
  pensioen_extractie: 'documenten',
  budget_suggesties: 'documenten',

  nieuws: 'nieuws',

  // Centrale bronverzameling: cron, service-role, uitsluitend openbaar nieuws.
  // Geen gebruikersgegevens → geen gebruikerskeuze. Zie de kop van dit bestand.
  nieuws_ingest: 'platform',
}

// ── Route → groep ───────────────────────────────────────────────────────────

export interface AiRouteBinding {
  /** Repo-relatief pad van het route-bestand. */
  route: string
  feature: AiTokenFeature
  scope: AiExecutionScope
  /**
   * Bestand waarin de `getModel(`-aanroep staat. Gelijk aan `route` wanneer de
   * route 'm zelf doet; anders het lib-bestand. De statische gate-scan heeft dit
   * nodig: hij vergeleek eerder de gate-positie met een `getModel(` die in het
   * routebestand helemaal niet voorkwam, en gaf dan een groen licht dat niets
   * bewees (zie lib/ai/privacy-gate-scan.ts).
   */
  modelCallIn: string
  /**
   * Moet deze route de privé-modus-403 dragen? Platform-taken niet: die hebben
   * geen gebruikerssessie om een voorkeur op te lezen.
   */
  gated: boolean
  /** Korte reden bij `gated: false`, zodat de uitzondering zichtbaar blijft. */
  ongatedReden?: string
}

export const AI_ROUTE_BINDINGS: readonly AiRouteBinding[] = [
  // Gesprek
  {
    route: 'app/api/ai/chat/route.ts',
    feature: 'chat',
    scope: 'gesprek',
    modelCallIn: 'app/api/ai/chat/route.ts',
    gated: true,
  },

  // Transacties & vaste lasten
  {
    route: 'app/api/ai/categorize/route.ts',
    feature: 'categorisatie',
    scope: 'transacties',
    modelCallIn: 'app/api/ai/categorize/route.ts',
    gated: true,
  },
  {
    route: 'app/api/subscriptions/analyse-ai/route.ts',
    feature: 'abonnementen_analyse',
    scope: 'transacties',
    modelCallIn: 'app/api/subscriptions/analyse-ai/route.ts',
    gated: true,
  },
  {
    route: 'app/api/subscriptions/detect-ai/route.ts',
    feature: 'abonnementen_detectie',
    scope: 'transacties',
    modelCallIn: 'app/api/subscriptions/detect-ai/route.ts',
    gated: true,
  },
  {
    route: 'app/api/subscriptions/advice/route.ts',
    feature: 'abonnementen_advies',
    scope: 'transacties',
    modelCallIn: 'app/api/subscriptions/advice/route.ts',
    gated: true,
  },

  // Briefing — getModel zit in de redactie-lib, niet in de route.
  {
    route: 'app/api/briefing/refresh/route.ts',
    feature: 'briefing',
    scope: 'briefing',
    modelCallIn: 'lib/briefing/redactie.ts',
    gated: true,
  },

  // Tips & scenario's
  {
    route: 'app/api/ai/recommendations/route.ts',
    feature: 'aanbevelingen',
    scope: 'tips',
    modelCallIn: 'app/api/ai/recommendations/route.ts',
    gated: true,
  },
  {
    route: 'app/api/ai/recommendations/initial/route.ts',
    feature: 'aanbevelingen_initieel',
    scope: 'tips',
    modelCallIn: 'app/api/ai/recommendations/initial/route.ts',
    gated: true,
  },
  {
    route: 'app/api/whatif/suggest/route.ts',
    feature: 'whatif_suggesties',
    scope: 'tips',
    modelCallIn: 'app/api/whatif/suggest/route.ts',
    gated: true,
  },

  // Rapporten & rekenhulpen
  {
    route: 'app/api/report/route.ts',
    feature: 'rapport',
    scope: 'rapporten',
    modelCallIn: 'app/api/report/route.ts',
    gated: true,
  },
  {
    route: 'app/api/ai/build-calculator/route.ts',
    feature: 'rekenhulp_bouwen',
    scope: 'rapporten',
    modelCallIn: 'lib/ai/build-calculator.ts',
    gated: true,
  },
  {
    route: 'app/api/calculators/publish/route.ts',
    feature: 'scherm_publicatie',
    scope: 'rapporten',
    modelCallIn: 'lib/ai/screen-publish-metadata.ts',
    gated: true,
  },

  // Documenten lezen
  {
    route: 'app/api/onboarding/extract/route.ts',
    feature: 'document_extractie',
    scope: 'documenten',
    modelCallIn: 'lib/ai/extract-financial-data.ts',
    gated: true,
  },
  {
    route: 'app/api/onboarding/save-own-data/route.ts',
    feature: 'document_extractie',
    scope: 'documenten',
    modelCallIn: 'lib/ai/extract-financial-data.ts',
    gated: true,
  },
  {
    route: 'app/api/onboarding/aangifte-extract/route.ts',
    feature: 'aangifte_extractie',
    scope: 'documenten',
    modelCallIn: 'lib/aangifte/extract-aangifte-data.ts',
    gated: true,
  },
  {
    route: 'app/api/pension/parse/route.ts',
    feature: 'pensioen_extractie',
    scope: 'documenten',
    modelCallIn: 'app/api/pension/parse/route.ts',
    gated: true,
  },
  {
    route: 'app/api/onboarding/suggest-budgets/route.ts',
    feature: 'budget_suggesties',
    scope: 'documenten',
    modelCallIn: 'app/api/onboarding/suggest-budgets/route.ts',
    gated: true,
  },
  {
    route: 'app/api/admin/extraction-test/route.ts',
    feature: 'document_extractie',
    scope: 'documenten',
    modelCallIn: 'lib/ai/extract-financial-data.ts',
    gated: true,
  },

  // Nieuws
  {
    route: 'app/api/news/route.ts',
    feature: 'nieuws',
    scope: 'nieuws',
    modelCallIn: 'app/api/news/route.ts',
    gated: true,
  },

  // Platform — geen gebruikerssessie, geen gebruikersgegevens, geen keuze.
  {
    route: 'app/api/news-ingest/cron/route.ts',
    feature: 'nieuws_ingest',
    scope: 'platform',
    modelCallIn: 'app/api/news-ingest/cron/route.ts',
    gated: false,
    ongatedReden:
      'Cron met service-role, zonder gebruikerssessie; verwerkt uitsluitend openbare nieuwsbronnen.',
  },
  {
    route: 'app/api/admin/news-ingest/route.ts',
    feature: 'nieuws_ingest',
    scope: 'platform',
    modelCallIn: 'app/api/admin/news-ingest/route.ts',
    gated: false,
    ongatedReden:
      'Handmatige beheerdersvariant van de centrale ingest; zelfde openbare bronnen, vult de gedeelde nieuwstabel.',
  },
] as const

/** Alle routes die de privé-modus-403 moeten dragen. */
export const GATED_AI_ROUTES = AI_ROUTE_BINDINGS.filter((b) => b.gated).map((b) => b.route)

export function routeBinding(route: string): AiRouteBinding | undefined {
  return AI_ROUTE_BINDINGS.find((b) => b.route === route)
}

// ── De keuze oplossen ───────────────────────────────────────────────────────

/** De twee profielvelden die samen de keuze bepalen. */
export interface AiExecutionPrefsRow {
  privacy_mode?: boolean | null
  ai_execution_prefs?: Partial<Record<AiExecutionGroup, AiExecutionMode>> | null
}

/**
 * Waar draait deze groep? De per-groep-override wint; ontbreekt die, dan volgt
 * de groep de hoofdschakelaar.
 *
 * Een onbekende of onzinnige waarde in de JSONB (handmatig gezet, of een groep
 * die niet meer bestaat) wordt genegeerd i.p.v. vertrouwd — dan valt de groep
 * terug op de hoofdschakelaar. Dat is de veilige kant op: bij privacy_mode=true
 * betekent onleesbare rommel 'lokaal', niet 'cloud'.
 */
export function resolveExecutionMode(
  row: AiExecutionPrefsRow | null | undefined,
  group: AiExecutionGroup,
): AiExecutionMode {
  const override = row?.ai_execution_prefs?.[group]
  if (override === 'lokaal' || override === 'cloud') return override
  return row?.privacy_mode ? 'lokaal' : 'cloud'
}

/** Idem, maar voor alle groepen tegelijk — handig voor de instellingen-UI. */
export function resolveAllExecutionModes(
  row: AiExecutionPrefsRow | null | undefined,
): Record<AiExecutionGroup, AiExecutionMode> {
  const out = {} as Record<AiExecutionGroup, AiExecutionMode>
  for (const id of AI_EXECUTION_GROUP_IDS) out[id] = resolveExecutionMode(row, id)
  return out
}

/**
 * Mag deze feature nu naar de cloud? Platform-taken altijd (geen gebruiker om
 * een voorkeur van te lezen); de rest volgt de groepskeuze.
 */
export function cloudAllowedForFeature(
  row: AiExecutionPrefsRow | null | undefined,
  feature: AiTokenFeature,
): boolean {
  const scope = FEATURE_GROUP[feature]
  if (scope === 'platform') return true
  return resolveExecutionMode(row, scope) === 'cloud'
}
