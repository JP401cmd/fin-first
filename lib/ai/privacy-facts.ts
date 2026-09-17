import { UNIFIED_FEATURES } from '@/lib/feature-registry'

/**
 * De feiten over Fin en je gegevens — ÉÉN bron voor drie oppervlakken
 * (ADR 0155, kaart UR3-16):
 *
 *   · de keuzestap "Fin en je gegevens" in de onboarding
 *     (components/onboarding/onboarding-ai-keuze.tsx),
 *   · de eenmalige keuze-overlay voor bestaande accounts
 *     (components/app/ai-consent-interstitial.tsx),
 *   · de AI-schakelaar en transparantieblokken op /mijn/privacy
 *     (components/mijn/ai-privacy-settings.tsx).
 *
 * Waarom één bron: de toestemming die iemand geeft is toestemming voor WAT HIER
 * STAAT. Drift tussen het scherm waarop je "ja" zegt en het scherm waarop je die
 * keuze terugleest, maakt het bewijs waardeloos. Verandert een feit hier wezenlijk
 * (er gaat méér mee, een nieuwe verwerker, een ander land), verhoog dan
 * {@link AI_CONSENT_VERSION}: een gebruiker met een oudere versie op zijn profiel
 * heeft dan formeel voor iets anders gekozen.
 *
 * Toon: beschrijvend, gewone taal, geen aansporing en geen advies (Wft-grens).
 * De feiten hieronder zijn overgenomen uit de bestaande transparantieblokken op
 * /mijn/privacy en uit lib/ai/sanitize.ts (wat er gemaskeerd wordt).
 */

/**
 * Versie van de toestemmingsvraag. Verhoog bij een wezenlijke wijziging van de
 * feiten hieronder — niet bij een tekstuele bijschaving.
 */
export const AI_CONSENT_VERSION = 'ai_cloud_v1'

/** De vraag zelf — identiek op elk oppervlak. */
export const AI_CONSENT_QUESTION = 'Mag Fin je financiële gegevens gebruiken?'

/** De uitleg boven de keuze: wat Fin is en dat er een keuze te maken valt. */
export const AI_CONSENT_INTRO =
  'Fin is de AI in TriFinity: hij vertaalt je cijfers naar vrijheidstijd, schrijft je briefing en beantwoordt je vragen. Daarvoor gaan financiële gegevens naar een AI-aanbieder buiten de EU. Dat gebeurt alleen als jij dat goed vindt — en je keuze is altijd terug te draaien.'

/**
 * De twee keuzes, elk met keuze · effect · waarom (eigenaarsnorm 13 sep 2026 voor
 * elke helptekst bij een keuze). Beide gelijkwaardig; er is geen voorselectie.
 */
export const AI_CONSENT_OPTIONS = {
  granted: {
    keuze: 'Ja, Fin mag mijn gegevens gebruiken',
    effect:
      'Fin, de briefing, het nieuws en de AI-analyses werken (met het AI-abonnement). Je financiële gegevens gaan — met persoonsgegevens gemaskeerd waar dat kan — naar de AI-aanbieder.',
    waarom: 'Zo kan Fin je cijfers vertalen naar vrijheidstijd en je vragen erover beantwoorden.',
  },
  withdrawn: {
    keuze: 'Nee, geen AI',
    effect:
      'Er gaat niets naar een AI-aanbieder. Overzicht, budget, toekomst, belasting en doelen werken volledig; Fin, de briefing, het nieuws en de AI-analyses vervallen.',
    waarom: 'Je gegevens blijven dan uitsluitend in de app.',
  },
} as const

/** Wat er — bij "ja" — naar het model gaat. */
export const AI_SHARED_FACTS: readonly string[] = [
  'Geaggregeerde bedragen (netto vermogen, totale inkomsten/uitgaven)',
  "Percentages en ratio's (spaarquote, vrijheidspercentage, SWR)",
  'Budgetcategorieën en bijbehorende bedragen',
  'Leeftijd (niet je geboortedatum)',
  'Huishoudtype en temporal balance level',
  'De vraag die je zelf aan Fin typt — zoals jij hem typt',
  'Bij document-import: de volledige tekst van het document dat je uploadt',
  'Bij abonnement-herkenning: de omschrijvingen van je transacties',
]

/** Wat er vóór verzending wordt gemaskeerd (lib/ai/sanitize.ts). */
export const AI_MASKED_FACTS: readonly string[] = [
  "Namen (vervangen door 'gebruiker' / 'partner')",
  'IBAN-nummers en bankrekeningen',
  'BSN (burgerservicenummer)',
  'E-mailadressen en telefoonnummers',
  'Adressen en postcodes',
  'Geboortedatum (vervangen door leeftijd)',
]

/**
 * Nuance bij het maskeren: op welke paden de brontekst zelf meegaat. Eerlijk
 * benoemd, want zonder die inhoud kan de functie niet werken.
 */
export const AI_MASKING_NOTE =
  'Op de chat-, categorisatie- en nieuwsroutes maskeren we persoonsgegevens automatisch vóór verzending. Bij document-import en abonnement-herkenning gaat de brontekst zelf mee — zonder die inhoud kan de functie niet werken.'

export interface AiProcessingFact {
  title: string
  text: string
}

/** Hoe de AI-aanbieder met de gegevens omgaat. */
export const AI_PROCESSING_FACTS: readonly AiProcessingFact[] = [
  {
    title: 'Geen training',
    text: 'je gegevens worden door de AI-providers niet gebruikt om modellen te trainen',
  },
  {
    title: 'Korte provider-retentie',
    text: 'AI-providers (Anthropic, OpenAI) bewaren verzoeken kortdurend volgens hun eigen voorwaarden, o.a. voor misbruikdetectie',
  },
  {
    title: 'Data-minimalisatie',
    text: 'per functie gaat alleen de context mee die voor die taak nodig is — nooit je volledige dataset',
  },
  {
    title: 'Versleuteld',
    text: 'alle communicatie verloopt via HTTPS/TLS',
  },
]

/**
 * De lokale variant — een nuance van "ja", géén derde keuze. Wie AI aanzet kan
 * daarna per functie kiezen dat het model op het eigen apparaat draait
 * (lib/ai/execution-groups.ts); wie "nee" zegt heeft geen AI, ook niet lokaal
 * (de kill-switch gaat vóór de plaatsingskeuze, lib/ai/privacy-gate.ts).
 */
export const AI_LOCAL_VARIANT_FACT =
  'Zeg je ja, dan kun je op Mijn → Privacy per functie kiezen dat het model op je eigen apparaat draait — dan verlaat er niets je toestel. Zeg je nee, dan staat alle AI uit, ook lokaal.'

/** Omkeerbaarheid — identiek op elk oppervlak. */
export const AI_REVERSIBLE_FACT =
  'Je keuze is altijd terug te draaien op Mijn → Privacy. Vanaf dat moment gaat er niets meer naar een AI-aanbieder; wat al verstuurd is, valt onder de korte bewaartermijn van de aanbieder.'

export interface AiFeatureLost {
  label: string
  description: string
}

/**
 * Wat er wegvalt bij "nee": de AI-features uit het feature-register (dezelfde
 * lijst die het AI-abonnement en /mijn/account tonen) plus de documentimport,
 * die geen los feature is maar wél een cloud-AI-pad (app/api/pension/parse).
 * Bewust afgeleid, niet overgetypt: verandert het register, dan beweegt dit mee.
 */
export function aiFeaturesLostWithoutConsent(): readonly AiFeatureLost[] {
  const fromRegistry = UNIFIED_FEATURES.filter((f) => f.requiredTier === 'ai').map((f) => ({
    label: f.label,
    description: f.description,
  }))
  return [
    ...fromRegistry,
    {
      label: 'AI-documentimport',
      description: 'Een pensioenoverzicht (PDF) laten uitlezen; de XML-/JSON-route blijft werken',
    },
  ]
}

/**
 * De koppen boven de feitenblokken. De eerste drie zijn de koppen die /mijn/privacy
 * al droeg; de rest hoort bij de keuzestap en de overlay. Eén bron, zodat de
 * gebruiker op elk oppervlak dezelfde woorden terugleest.
 */
export const AI_FACT_HEADINGS = {
  shared: 'Wat wordt gedeeld',
  masked: 'Wat wordt gemaskeerd',
  processing: 'Hoe je data wordt verwerkt',
  local: 'Op je eigen apparaat',
  reversible: 'Terugdraaien',
  lost: 'Wat vervalt bij nee',
  kept: 'Wat blijft werken bij nee',
} as const

/**
 * Het feitenpaneel naast de keuzestap in de onboarding: het aantal AI-functies
 * (afgeleid uit {@link aiFeaturesLostWithoutConsent}) met deze duiding eronder.
 */
export const AI_CONSENT_PANEL_SUB =
  'functies in TriFinity gebruiken AI. Al het andere werkt ook zonder.'
export const AI_CONSENT_PANEL_SOURCE = 'TriFinity · overzicht van de AI-functies'

/** Generieke fouttekst wanneer het vastleggen van de keuze mislukt. */
export const AI_CONSENT_SAVE_ERROR = 'Je keuze is niet opgeslagen. Probeer het opnieuw.'

/**
 * Wat blijft werken bij "nee" — het antwoord op "is dat nog een product?" (ja:
 * de app is in de eerste plaats een financieel dagblad; Fin is de coach erbij).
 */
export const APP_WITHOUT_AI_FACTS: readonly string[] = [
  'Overzicht, budget en transacties',
  'Toekomst: je plan, de tijdas en het lab',
  'Belasting en de rekenhulpen',
  'Doelen, meldingen en de rondleiding',
]
