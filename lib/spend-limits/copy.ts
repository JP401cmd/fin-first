/**
 * WEERGAVENAMEN voor grenzenpotten — de enige plek in de app waar de
 * gebruikerszichtbare naam van dit concept staat.
 *
 * Intern heet alles `spend_limit(s)` (tabel, routes, types, bestanden), omdat
 * "pot" al bezet is door `profiles.pot_rules` — de onttrekkingsvolgorde op
 * /toekomst. De koppeling tussen de neutrale identifier en de naam die de
 * gebruiker ziet, leeft uitsluitend hier.
 *
 * ALIAS (fase 5, ADR 0089 besluit 1): de gebruiker kan op /mijn/uiterlijk kiezen
 * tussen "Grenzenpot" (default) en het confronterendere "Schaamtepot". Dat is
 * PUUR COSMETISCH — het raakt geen data, geen regel, geen berekening en geen
 * historische periode. De voorkeur staat als scalar op `profiles.spend_limit_alias`
 * en wordt reactief gelezen via `useSpendLimitCopy()`
 * (`lib/hooks/use-spend-limit-alias.tsx`); server-samengestelde tekst (meldingen)
 * roept `spendLimitCopy(alias)` aan met de alias die op GENERATIEMOMENT gold.
 *
 * Deze module is bewust puur en import-vrij: server- én client-safe, geen React,
 * geen Supabase. `lib/spend-limits/copy.test.ts` bewaakt dat de literals
 * "Grenzenpot"/"Schaamtepot" nergens anders in `lib/spend-limits/**` of
 * `app/api/spend-limits/**` in code terechtkomen.
 */

/**
 * Alle toegestane weergavenamen, in weergavevolgorde. Spiegelt de
 * CHECK-constraint op `profiles.spend_limit_alias` en voedt zowel de keuze op
 * /mijn/uiterlijk als het zod-schema van de PUT-route — één lijst, geen tweede
 * opsomming die stil uiteen kan lopen.
 */
export const SPEND_LIMIT_ALIASES = ['grenzenpot', 'schaamtepot'] as const

/** De twee toegestane weergavenamen. */
export type SpendLimitAlias = (typeof SPEND_LIMIT_ALIASES)[number]

/** De standaardalias: wat elke gebruiker ziet zonder expliciete keuze. */
export const DEFAULT_SPEND_LIMIT_ALIAS: SpendLimitAlias = 'grenzenpot'

export interface SpendLimitCopy {
  singular: string
  plural: string
  singularLower: string
  pluralLower: string
  /** Eén zin die uitlegt waar dit over gaat — gebruikt boven de lijst. */
  intro: string
  /** Eén regel over de toon van deze naam — gebruikt in de naamkeuze op /mijn/uiterlijk. */
  aliasDescription: string
}

/**
 * Toon per alias. Beide varianten zijn observationeel en niet-prescriptief: ze
 * beschrijven wat er gebeurt, ze zeggen niet wat je moet doen (Wft-grens,
 * merkstem). "Schaamtepot" mag confronterender zijn — moraliserend niet.
 */
const COPY_BY_ALIAS: Record<SpendLimitAlias, SpendLimitCopy> = {
  grenzenpot: {
    singular: 'Grenzenpot',
    plural: 'Grenzenpotten',
    singularLower: 'grenzenpot',
    pluralLower: 'grenzenpotten',
    intro:
      'Een grens die je jezelf stelt: geef je meer uit dan dat, dan zie je precies hoeveel eroverheen ging. Geen spaardoel — alleen je eigen grens.',
    aliasDescription: 'Neutraal en feitelijk: een grens die je jezelf stelt.',
  },
  schaamtepot: {
    singular: 'Schaamtepot',
    plural: 'Schaamtepotten',
    singularLower: 'schaamtepot',
    pluralLower: 'schaamtepotten',
    intro:
      'De grens die je jezelf stelt, met een naam die blijft hangen: geef je meer uit dan dat, dan zie je precies hoeveel eroverheen ging. Geen spaardoel — alleen je eigen grens, recht voor z’n raap.',
    aliasDescription: 'Confronterender van toon. Alleen de naam verandert — je cijfers, regels en reeksen blijven exact hetzelfde.',
  },
}

/**
 * De teksten voor één alias. Server- én client-safe; gebruik deze functie
 * overal waar de alias bekend is (loaders, meldingen, route-handlers).
 * Onbekende invoer valt terug op de default — een profielrij van vóór de
 * migratie levert `undefined` en mag niets breken.
 */
export function spendLimitCopy(alias: SpendLimitAlias | null | undefined): SpendLimitCopy {
  return COPY_BY_ALIAS[alias as SpendLimitAlias] ?? COPY_BY_ALIAS[DEFAULT_SPEND_LIMIT_ALIAS]
}

/**
 * Niet-reactieve fallback voor plekken die (nog) geen alias kennen. Bestaande
 * importeurs blijven hiermee werken; reactieve oppervlakken horen
 * `useSpendLimitCopy()` te gebruiken zodat een wissel direct doorwerkt.
 */
export const SPEND_LIMIT_COPY: SpendLimitCopy = COPY_BY_ALIAS[DEFAULT_SPEND_LIMIT_ALIAS]
