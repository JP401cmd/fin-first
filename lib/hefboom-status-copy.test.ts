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
    expect(hefboomVerdict('belasting', 'good')).toBe('Niets onbenut')
    // Geen vermoeden-formulering (de oude BEL-3-hedge) en niet te verwarren met
    // de twee niet-groene oordelen. Bewust GEEN regex op /onbenut/: het groene
    // woord is een ONTKENNING ("Niets onbenut") en bevat die stam dus legitiem.
    expect(hefboomVerdict('belasting', 'good')).not.toMatch(/meer dan nodig/i)
    expect(hefboomVerdict('belasting', 'good')).not.toBe(hefboomVerdict('belasting', 'warn'))
    expect(hefboomVerdict('belasting', 'good')).not.toBe(hefboomVerdict('belasting', 'bad'))
  })

  it('belasting: het groene woord botst niet met het Box 1-jaarruimte-label', () => {
    // Op /overzicht/belasting staan de hefboomtegel en de Box 1-kaart onder
    // elkaar. `box1JaarruimteVerdict` gebruikt 'Ruimte benut' voor UITSLUITEND
    // de jaarruimte; de hefboom weegt drie posten. Dezelfde twee woorden voor
    // twee grootheden, tien centimeter uit elkaar, is drift (eigenaarsbesluit
    // 22 sep 2026).
    expect(hefboomVerdict('belasting', 'good')).not.toBe('Ruimte benut')
  })

  /**
   * ADR 0177 — de hefboom oordeelt op ONBENUTTE FISCALE RUIMTE (aandeel van de
   * eigen heffing over Box 1 + Box 3), niet op de hoogte van de Box 3-heffing.
   * Daarmee vervalt de BEL-3-hedge "Mogelijk": die stond er omdat "je betaalt
   * meer dan nodig" een vermoeden was dat de bron niet kon dragen. De posten
   * worden nu geteld, dus het tegelwoord is een constatering. Het BEDRAG blijft
   * uit de tegel — dat staat in de status-duiding-melding.
   */
  it('belasting: de tegel noemt onbenutte ruimte, niet de hoogte van de heffing', () => {
    expect(hefboomVerdict('belasting', 'warn')).toBe('Ruimte onbenut')
    expect(hefboomVerdict('belasting', 'bad')).toBe('Veel ruimte onbenut')
    for (const s of OORDEEL_STATUSSEN) {
      expect(HEFBOOM_VERDICT.belasting[s]).not.toMatch(/mogelijk|belastingdruk|heffing/i)
    }
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
