// lib/horizon/eindstrategie-volgorde.ts
//
// De PRESENTATIEVOLGORDE van de eindstrategieën — één bron voor elk oppervlak
// dat ze als lijstje toont (de Voorkeuren-regel, de strategie-modal, het
// FIRE-paneel, de module-activatie).
//
// AANLEIDING (ADR 0127). Drie oppervlakken itereerden over `STRATEGY_LABELS` en
// kregen 'nu-stoppen' er gratis bij; het vierde (`components/future/regels/
// eindstrategie-body.tsx`) droeg een HANDMATIGE lijst en miste hem dus stil.
// Half zichtbaar is slechter dan onzichtbaar: de gebruiker kon de strategie op
// het ene scherm kiezen en 'm op het andere niet terugvinden.
//
// DE REGEL: de lijst wordt AFGELEID uit `FIRE_END_STRATEGIES` (= de sleutels van
// `STRATEGY_LABELS`), zodat een zesde strategie nooit meer kan ontbreken. De
// volgorde is wél bewust — zie hieronder — maar valt terug op "achteraan" voor
// alles wat hier niet genoemd is. Een nieuwe strategie verschijnt dus vanzelf,
// en de dag dat iemand hem eerder in de rij wil hebben is dát een expliciete
// keuze in dit bestand in plaats van een vergeten regel elders.
//
// ── De gekozen volgorde en waarom ───────────────────────────────────────────
// De enum conflateert twee assen (ADR 0127 D1): *wat moet er aan het eind
// gelden* (eind-vorm) en *wanneer stop ik* (stop-anker). De presentatie volgt
// die tweedeling, want zo leest de lijst als twee vragen in plaats van vijf
// losse opties:
//
//   1. eind-vormen  — deplete · legacy · perpetual
//        oplopend in "hoeveel laat je staan": alles op, een bedrag na, alles.
//   2. stop-ankers  — pensioen · nu-stoppen
//        van veraf naar dichtbij: de AOW-leeftijd, en dan vandaag.
//
// 'nu-stoppen' staat bewust ACHTERAAN en niet bovenaan: hij is het smalste
// geval (je bent al gestopt, of overweegt dat vandaag) en zou als eerste optie
// als een aanbeveling lezen — precies de aansporende toon die dit besluit
// verbiedt. Dat dit toevallig samenvalt met de declaratievolgorde van
// `STRATEGY_LABELS` is prettig maar niet de reden; die map is een
// woordenboek, geen volgorde-afspraak.

import { FIRE_END_STRATEGIES, type FireEndStrategy } from '@/lib/fire-strategy'

/** Lager = eerder in de lijst. Niet-genoemde strategieën komen erachter. */
const RANG: Partial<Record<FireEndStrategy, number>> = {
  deplete: 10,
  legacy: 20,
  perpetual: 30,
  pensioen: 40,
  'nu-stoppen': 50,
}

/** Alles wat hier niet in `RANG` staat, sorteert hierachter (in enum-volgorde). */
const ACHTERAAN = Number.MAX_SAFE_INTEGER

/**
 * Alle eindstrategieën in presentatievolgorde. Afgeleid — nooit met de hand
 * bijgehouden. Stabiel gesorteerd, dus binnen dezelfde rang (en voor alles
 * zonder rang) blijft de volgorde van `STRATEGY_LABELS` staan.
 */
export const EINDSTRATEGIE_VOLGORDE: readonly FireEndStrategy[] = [...FIRE_END_STRATEGIES].sort(
  (a, b) => (RANG[a] ?? ACHTERAAN) - (RANG[b] ?? ACHTERAAN),
)

/**
 * Toont deze strategie een instelbare EINDLEEFTIJD?
 *
 * `perpetual` niet (daar is de eindleeftijd alleen weergave-horizon). Onder
 * 'nu-stoppen' is hij juist bétekenisvol: hij is de lat waar het vermogen tot
 * moet reiken — het verschil tussen "gedekt" en "reikt tot je 78e" (ADR 0127 D2).
 * Nieuwe strategieën tonen 'm standaard (`?? true`): een veld te veel is
 * zichtbaar en corrigeerbaar, een ontbrekende instelling niet.
 */
const GEEN_EINDLEEFTIJD: readonly FireEndStrategy[] = ['perpetual']

export function toontEindleeftijd(strategy: FireEndStrategy): boolean {
  return !GEEN_EINDLEEFTIJD.includes(strategy)
}
