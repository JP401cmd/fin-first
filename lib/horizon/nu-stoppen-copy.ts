// lib/horizon/nu-stoppen-copy.ts
//
// COMPAT-LAAG (ADR 0129 F3a → F4). De kopij voor het nu-anker (ADR 0127) is
// opgegaan in `anker-copy.ts`, dat hetzelfde antwoord voor élk vast stop-anker
// geeft ("als ik op {stop} stop, tot welke leeftijd reikt mijn liquide vermogen?").
// Dit bestand bindt de oude namen aan de anker-generieke functies met het
// nu-anker vast ingevuld, zodat de bestaande /toekomst- en /overzicht-lezers
// blijven compileren tot F3b ze op `anker-copy` overzet. Er staat hier GEEN
// logica en GEEN zin meer: elke tekst komt uit `anker-copy.ts`.
//
// @deprecated Nieuwe lezers importeren `anker-copy.ts`; F4 verwijdert dit bestand.

import type { RunwayResult } from './runway'
import {
  ANKER_KPI_LABEL,
  ANKER_KPI_LABEL_KORT,
  ankerGrafiekZin,
  ankerKort,
  ankerKpiCaption,
  ankerReachFromRunway,
  ankerReachFromSim,
  ankerReachYear,
  ankerTitel,
  ankerZin,
  ankerZinKort,
  type AnkerReach,
  type AnkerStop,
} from './anker-copy'

/** @deprecated Gebruik `AnkerReach` (anker-copy.ts). */
export type NuStoppenReach = AnkerReach

const NU: AnkerStop = { kind: 'now' }

/** @deprecated Gebruik `ankerReachFromSim`. */
export const nuStoppenReachFromSim = ankerReachFromSim
/** @deprecated Gebruik `ankerReachFromRunway`. */
export const nuStoppenReachFromRunway: (runway: RunwayResult) => AnkerReach = ankerReachFromRunway
/** @deprecated Gebruik `ANKER_KPI_LABEL`. */
export const NU_STOPPEN_KPI_LABEL = ANKER_KPI_LABEL
/** @deprecated Gebruik `ANKER_KPI_LABEL_KORT`. */
export const NU_STOPPEN_KPI_LABEL_KORT = ANKER_KPI_LABEL_KORT
/** @deprecated Gebruik `ankerTitel({ kind: 'now' })`. */
export const NU_STOPPEN_TITEL = ankerTitel(NU)
/** @deprecated Gebruik `ankerReachYear`. */
export const nuStoppenReachYear = ankerReachYear
/** @deprecated Gebruik `ankerKpiCaption`. */
export const nuStoppenKpiCaption = ankerKpiCaption
/** @deprecated Gebruik `ankerKort`. */
export const nuStoppenKort = ankerKort
/** @deprecated Gebruik `ankerZin(reach, stop)`. */
export const nuStoppenZin = (reach: AnkerReach): string => ankerZin(reach, NU)
/** @deprecated Gebruik `ankerZinKort(reach, stop)`. */
export const nuStoppenZinKort = (reach: AnkerReach): string => ankerZinKort(reach, NU)
/** @deprecated Gebruik `ankerGrafiekZin(reach, stop)`. */
export const nuStoppenGrafiekZin = (reach: AnkerReach): string => ankerGrafiekZin(reach, NU)
