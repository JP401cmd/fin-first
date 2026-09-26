/**
 * Voorstel-velden van de gebeurtenis-editor (EventPane) voor de twee
 * RISICO-gebeurtenissen: werkloosheid en overlijden partner.
 *
 * ## Waarom dit bestand bestaat
 * Het legacy-gebeurtenisformulier in horizon-client.tsx rekende deze voorstellen
 * uit (prefill via `computeSuggestedEventValues`, kasstroom via de risico-
 * rekenregels). Dat formulier is verwijderd (commit fb83b3783); de EventPane viel
 * daarna terug op de kale catalogus-defaults, waardoor bv. "overlijden partner"
 * als een blijvende INKOMST werd voorgesteld. Deze module herstelt het voorstel
 * in de vorm die de EventPane kent: voorgevulde blokken (eenmalig / tijdelijk /
 * blijvend), die de gebruiker vrij kan aanpassen.
 *
 * Consume-don't-recompute: de prefill komt uit `computeSuggestedEventValues`
 * (lib/horizon/event-prefill.ts), de kasstroom uit `berekenWerkloosheidImpact` /
 * `berekenOverlijdenPartnerImpact` (lib/horizon/risico-event-regels.ts). Hier
 * staat géén eigen som en géén financiële constante — alleen de vertaling van
 * de kasstroom-impact naar de drie blokken.
 *
 * Buiten scope: de PDF-parse van het nabestaandenpensioen (bestaat niet meer).
 * Het voorstel voor overlijden partner rekent daarom met nabestaandenpensioen 0.
 */

import { computeSuggestedEventValues } from '@/lib/horizon/event-prefill'
import {
  berekenWerkloosheidImpact,
  berekenOverlijdenPartnerImpact,
} from '@/lib/horizon/risico-event-regels'
import { lookupAowAge } from '@/lib/aow-leeftijd'
import type { FinancialInput } from '@/lib/horizon-data'
import type { EditFormState } from '@/lib/horizon/event-pane-edit-form'

/** De gebeurtenis-types waarvoor de EventPane een berekend voorstel invult. */
export const VOORSTEL_EVENT_TYPES = ['werkloosheid', 'overlijden_partner'] as const
export type VoorstelEventType = (typeof VOORSTEL_EVENT_TYPES)[number]

/** Profielinvoer die het voorstel leest — een deelverzameling van de baseline. */
export type VoorstelProfiel = Pick<FinancialInput, 'monthlyIncome' | 'monthlyExpenses'>

/** De blokvelden die een voorstel invult. */
export type VoorstelVelden = Pick<
  EditFormState,
  | 'oneTimeAmount'
  | 'oneTimeDirection'
  | 'tempEnabled'
  | 'tempAmount'
  | 'tempDirection'
  | 'tempDurationYears'
  | 'tempIndexed'
  | 'contEnabled'
  | 'contAmount'
  | 'contDirection'
  | 'contIndexed'
  | 'contUntilStop'
>

/** Grondslag van het werkloosheid-voorstel — voor de uitleg onder de blokken. */
export interface WerkloosheidGrondslag {
  kind: 'werkloosheid'
  /** Netto maandinkomen waarmee gerekend is. */
  huidigNetto: number
  /** True als dat netto inkomen uit het profiel komt (anders een aanname). */
  nettoUitProfiel: boolean
  /** Aangenomen bruto maandsalaris (catalogus-default). */
  huidigBruto: number
  /** Aangenomen dienstjaren (catalogus-default). */
  dienstjaren: number
  /** Totale werkloosheidsduur in maanden. */
  totaleDuurMaanden: number
  transitievergoeding: number
  inkomensgatPerMaand: number
}

/** Grondslag van het overlijden-partner-voorstel — voor de uitleg onder de blokken. */
export interface OverlijdenPartnerGrondslag {
  kind: 'overlijden_partner'
  /** Aangenomen netto partnerinkomen (catalogus-default; niet in het profiel). */
  partnerInkomen: number
  anwNetto: number
  kostendalingPct: number
  kostendaling: number
  /** True als de kostendaling op je profiel-maandlasten rust (anders 0). */
  maandlastenUitProfiel: boolean
  nettoMaandImpact: number
}

export interface EventVoorstel {
  type: VoorstelEventType
  velden: VoorstelVelden
  grondslag: WerkloosheidGrondslag | OverlijdenPartnerGrondslag
}

export function isVoorstelEventType(type: string): type is VoorstelEventType {
  return (VOORSTEL_EVENT_TYPES as readonly string[]).includes(type)
}

/** Maanden → jaren zoals de tijdelijk-blok-duur ze toont (hele jaren, min. 1). */
function maandenNaarJaren(maanden: number): number {
  return Math.max(1, Math.round(maanden / 12))
}

/**
 * Het berekende voorstel voor een risico-gebeurtenis, of null voor elk ander type.
 *
 * @param currentAge alleen doorgegeven aan de gedeelde prefill (die hem voor deze
 *   types niet gebruikt); de leeftijd van de gebeurtenis blijft van initFormState.
 */
export function risicoEventVoorstel(
  type: string,
  profiel: VoorstelProfiel,
  currentAge: number,
): EventVoorstel | null {
  if (!isVoorstelEventType(type)) return null

  // De gedeelde prefill leest voor deze twee types alleen `effectiveInput`; de
  // overige context-velden (AOW-leeftijd, huishouden, vermogen, schulden) raken
  // alleen andere types en staan hier op hun neutrale waarde.
  const suggested = computeSuggestedEventValues(type, {
    userAowAge: lookupAowAge([], null),
    currentAge,
    effectiveInput: {
      totalAssets: 0,
      totalDebts: 0,
      monthlyIncome: profiel.monthlyIncome,
      monthlyExpenses: profiel.monthlyExpenses,
      yearlyMustExpenses: 0,
      monthlyContributions: 0,
      dateOfBirth: null,
    },
    isHouseholdView: false,
    effectiveNetWorth: 0,
    debts: [],
  })
  const metadata = suggested.metadata

  if (type === 'werkloosheid') {
    const impact = berekenWerkloosheidImpact(metadata)
    const gat = Math.round(impact.inkomensgatPerMaand)
    return {
      type,
      velden: {
        // Transitievergoeding = eenmalige inkomst.
        oneTimeAmount: Math.round(impact.transitievergoeding),
        oneTimeDirection: 'income',
        // Inkomensgat over de totale werkloosheidsduur. Als uitgave: in de kern
        // telt `inkomen − lasten`, dus minder inkomen weegt even zwaar als meer
        // uitgeven — en de blokken kennen geen "negatieve inkomst".
        tempEnabled: gat > 0,
        tempAmount: gat,
        tempDirection: 'expense',
        tempDurationYears: maandenNaarJaren(impact.totaleDuurMaanden),
        tempIndexed: suggested.isIndexed,
        contEnabled: false,
        contAmount: 0,
        contDirection: 'expense',
        contIndexed: true,
        contUntilStop: false,
      },
      grondslag: {
        kind: 'werkloosheid',
        huidigNetto: impact.huidigNetto,
        nettoUitProfiel: profiel.monthlyIncome > 0,
        huidigBruto: Number(metadata.huidigBruto),
        dienstjaren: Number(metadata.dienstjaren),
        totaleDuurMaanden: impact.totaleDuurMaanden,
        transitievergoeding: impact.transitievergoeding,
        inkomensgatPerMaand: impact.inkomensgatPerMaand,
      },
    }
  }

  // overlijden_partner
  const maandlasten = Number.isFinite(profiel.monthlyExpenses) ? Math.max(0, profiel.monthlyExpenses) : 0
  const impact = berekenOverlijdenPartnerImpact(metadata, { maandlastenHuishouden: maandlasten })
  const netto = Math.round(impact.nettoMaandImpact)
  return {
    type,
    velden: {
      // Levensverzekering/ORV = eenmalige inkomst (default 0: geen polis bekend).
      oneTimeAmount: Math.round(impact.levensverzekering),
      oneTimeDirection: 'income',
      tempEnabled: false,
      tempAmount: 0,
      tempDirection: 'expense',
      tempDurationYears: 5,
      tempIndexed: true,
      // Het wegvallende partnerinkomen is blijvend (durMonths 0) en loopt óók na
      // je stopmoment door (RISICO_EVENT_NA_FIRE: overlijden_partner = doorlopen).
      contEnabled: netto !== 0,
      contAmount: Math.abs(netto),
      contDirection: netto < 0 ? 'expense' : 'income',
      contIndexed: suggested.isIndexed,
      contUntilStop: false,
    },
    grondslag: {
      kind: 'overlijden_partner',
      partnerInkomen: impact.partnerInkomen,
      anwNetto: impact.anwNetto,
      kostendalingPct: impact.kostendalingPct,
      kostendaling: impact.kostendaling,
      maandlastenUitProfiel: maandlasten > 0,
      nettoMaandImpact: impact.nettoMaandImpact,
    },
  }
}

/**
 * True als de blokken in `state` inhoudelijk afwijken van het voorstel (dan heeft
 * "voorstel opnieuw invullen" zin). Velden van een uitgeschakeld blok tellen niet
 * mee — die bereiken de gebeurtenis niet (zie buildDraftEvent).
 */
export function wijktAfVanVoorstel(state: EditFormState, velden: VoorstelVelden): boolean {
  if (state.oneTimeAmount !== velden.oneTimeAmount) return true
  if (velden.oneTimeAmount > 0 && state.oneTimeDirection !== velden.oneTimeDirection) return true
  if (state.tempEnabled !== velden.tempEnabled) return true
  if (
    velden.tempEnabled &&
    (state.tempAmount !== velden.tempAmount ||
      state.tempDirection !== velden.tempDirection ||
      state.tempDurationYears !== velden.tempDurationYears ||
      state.tempIndexed !== velden.tempIndexed)
  ) return true
  if (state.contEnabled !== velden.contEnabled) return true
  if (
    velden.contEnabled &&
    (state.contAmount !== velden.contAmount ||
      state.contDirection !== velden.contDirection ||
      state.contIndexed !== velden.contIndexed ||
      state.contUntilStop !== velden.contUntilStop)
  ) return true
  return false
}
