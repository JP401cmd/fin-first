/**
 * hefboom-status-copy.test.ts — UR2-04.
 *
 * Bewaakt dat het oordeel op een hefboomtegel de STATUS van diezelfde hefboom
 * volgt. De gemelde bug: op /overzicht stond bij een GROENE belasting-hefboom
 * de kaart "Belasting — Mogelijk betaal je meer dan nodig" naast het kompas
 * "Belasting: Goed op koers" — twee tegengestelde oordelen over dezelfde
 * categorie op hetzelfde scherm, omdat `HEFBOOM_VERDICT.belasting` voor
 * good/warn/bad één vaste, alarmerende zin teruggaf.
 */

import { describe, it, expect } from 'vitest'
import {
  HEFBOOM_VERDICT,
  HEFBOOM_VERDICT_NEUTRAL,
  hefboomVerdict,
} from './hefboom-status-copy'
import { HEFBOOM_CONFIG, type Hefboom } from './hefboom-config'
import type { LeverageStatus } from './leverage-status'

const HEFBOMEN = Object.keys(HEFBOOM_CONFIG) as Hefboom[]
const OORDEEL_STATUSSEN: Exclude<LeverageStatus, 'neutral'>[] = ['good', 'warn', 'bad']

describe('HEFBOOM_VERDICT — elk oordeel volgt zijn eigen status', () => {
  it.each(HEFBOMEN)('%s geeft drie ONDERSCHEIDEN oordelen (good/warn/bad)', (key) => {
    const zinnen = OORDEEL_STATUSSEN.map((s) => HEFBOOM_VERDICT[key][s])
    // Dít is de regressie: belasting gaf drie keer dezelfde zin terug, dus een
    // groene hefboom droeg de waarschuwingstekst van een oranje.
    expect(new Set(zinnen).size).toBe(3)
    zinnen.forEach((zin) => expect(zin.trim().length).toBeGreaterThan(0))
  })

  it('belasting: een groene status draagt géén waarschuwingszin', () => {
    expect(hefboomVerdict('belasting', 'good')).toBe('Belastingdruk beperkt')
    expect(hefboomVerdict('belasting', 'good')).not.toMatch(/meer dan nodig/i)
  })

  it('belasting: de geijkte BEL-3-hedge blijft op warn staan', () => {
    // Wft: hedge behouden ("Mogelijk"), geen imperatief, geen bedragbelofte.
    expect(hefboomVerdict('belasting', 'warn')).toBe('Mogelijk betaal je meer dan nodig')
  })

  it('geen enkel oordeel bevat een imperatief of een bedragbelofte (Wft)', () => {
    const alle = HEFBOMEN.flatMap((k) => OORDEEL_STATUSSEN.map((s) => HEFBOOM_VERDICT[k][s]))
    for (const zin of alle) {
      expect(zin).not.toMatch(/\b(stort|verschuif|verkoop|koop|beleg|los af)\b/i)
      expect(zin).not.toMatch(/€|\d+\s*%/)
    }
  })

  /**
   * Het tegelwoord mag niet méér beweren dan de status meet (kaart "Hefboomtegels
   * en budgetzinnen beweren meer dan de score meet", 22 sep).
   *
   * Schulden: de score is de verhouding schuld/bezit (`scoreDebtRatio`), geen
   * aflosschema — en wie schuldenvrij is mét vermogen staat op groen.
   *
   * Budget (cashflow): de status mengt spaarquote en budgetoverschrijding 50/50
   * (`computeLeverScores`). Alleen budgetten met drie overschrijdingen geeft rood
   * zonder dat er een tekort gemeten is; 0% sparen met alle budgetten binnen de
   * limiet geeft groen. Een woord dat één van de twee oorzaken noemt ("sparen",
   * "doel", "tekort", "rekening") is dus voor een deel van de gebruikers onwaar.
   */
  it('schulden.good zegt niets over aflossen of een schema', () => {
    expect(HEFBOOM_VERDICT.schulden.good).not.toMatch(/aflos|afgelost|schema/i)
  })

  it.each(OORDEEL_STATUSSEN)('cashflow.%s noemt geen van beide oorzaken apart', (s) => {
    expect(HEFBOOM_VERDICT.cashflow[s]).not.toMatch(/spa(ar|ren)|doel|tekort|rekening/i)
  })

  it('neutral levert geen oordeel — de call-site kiest de neutrale tekst', () => {
    for (const key of HEFBOMEN) expect(hefboomVerdict(key, 'neutral')).toBeNull()
    expect(HEFBOOM_VERDICT_NEUTRAL).toBe('Nog geen gegevens')
  })
})
