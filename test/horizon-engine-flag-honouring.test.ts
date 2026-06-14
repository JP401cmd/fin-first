/**
 * Regressietest: flag-honouring — C5-pre cutover
 *
 * Vergrendelt de correctiefout waarbij UI-surfaces de v1-engine DIRECT aanriepen
 * (flag-blind), zodat v2-gebruikers toch v1-getallen zagen. Na de cutover gebruiken
 * alle surfaces `runSelectedProjection(input, useV2)` uit `@/lib/horizon-engine/select`
 * als enig ingangspad, en de gedeelde preview-helper `computeFreedomShift` /
 * `previewFireAge` uit `@/lib/strategy-preview`.
 *
 * HOE DEZE TEST DE REGRESSIE VANGT
 * ─────────────────────────────────
 * Als een surface hardcodes naar v1 (of een helper die het flag negeert), produceert
 * die surface voor v2-gebruikers dezelfde getallen als v1. De test bewijst dat:
 *  1. `runSelectedProjection(input, true)` en `runSelectedProjection(input, false)`
 *     MEETBAAR VERSCHILLENDE resultaten opleveren — zodat hardcoding naar v1 niet
 *     per toeval het v2-getal kan repliceren.
 *  2. `computeFreedomShift` op een `PreviewBaseline` met `useV2: true` een ander
 *     resultaat geeft dan op een identieke baseline met `useV2: false` — dit is
 *     precies het pad dat EventPane / event-pane-view.tsx nu volgt.
 */

import { describe, it, expect } from 'vitest'
import { buildPersonaInput, DEFAULT_PARAMS } from '@/app/(app)/beheer/horizon-tabellen/persona'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import { runUnifiedProjection } from '@/lib/unified-projection'
import { computeFreedomShift, previewFireAge, type PreviewBaseline } from '@/lib/strategy-preview'
import type { LifeEvent } from '@/lib/horizon-data'

// ── Gedeelde test-input ────────────────────────────────────────────────────────
//
// De beheer-inspector persona (DEFAULT_PARAMS: leeftijd 38, netto ~€284k,
// investering + hypotheek, jaarlijkse inleg) is de beste kandidaat: de compare-
// harness (test/horizon-engine-compare.test.ts) heeft empirisch vastgesteld dat
// de v1- en v2-engine hierop STERK divergeren:
//   • requiredFirePortfolio  v1: ~1 818 829  vs  v2: ~699 565
//   • endNetWorth            v1: ~4 616 179  vs  v2: ~3 644 517
//   • FIRE-leeftijd          v1:  62          vs  v2:  63
// Door op dit input te asserteren sluit de test elke kans uit dat een surface
// die v1 hardcodes per toeval het v2-getal produceert.

const TEST_INPUT = buildPersonaInput(DEFAULT_PARAMS)

// ── Test 1: runSelectedProjection honoreert de useV2-boolean ──────────────────

describe('runSelectedProjection — flag-honouring (C5-pre regressie)', () => {

  it('v1 en v2 produceren DETECTEERBAAR VERSCHILLENDE requiredFirePortfolio', () => {
    // Dit is de kernasserties van de regressietest:
    // Wanneer een surface v1 hardcodes (useV2 = false), kan hij per constructie
    // NOOIT het v2-getal produceren — want de delta tussen beide motoren is
    // groter dan 100k op requiredFirePortfolio.
    const v1Result = runSelectedProjection(TEST_INPUT, false)
    const v2Result = runSelectedProjection(TEST_INPUT, true)

    const delta = Math.abs(v1Result.requiredFirePortfolio - v2Result.requiredFirePortfolio)

    // Empirisch vastgesteld via horizon-engine-compare.test.ts:
    // delta > 1 000 000. We asserteren op > 50 000 voor stabiliteit —
    // een oppervlak dat v1 hardcodes zou delta = 0 geven.
    expect(
      delta,
      `requiredFirePortfolio verschil te klein: v1=${Math.round(v1Result.requiredFirePortfolio)}, v2=${Math.round(v2Result.requiredFirePortfolio)}, delta=${Math.round(delta)}. Als delta ≈ 0 is de flag niet gehoord.`,
    ).toBeGreaterThan(50_000)

    // Sanity: beide engines moeten een valide resultaat geven
    expect(v1Result.rows.length).toBeGreaterThan(0)
    expect(v2Result.rows.length).toBeGreaterThan(0)
    expect(Number.isFinite(v1Result.requiredFirePortfolio)).toBe(true)
    expect(Number.isFinite(v2Result.requiredFirePortfolio)).toBe(true)
  })

  it('v1 en v2 produceren DETECTEERBAAR VERSCHILLENDE eindvermogen (endNetWorth)', () => {
    // Aanvullende assertie op het eindvermogen (leeftijd 90) — een tweede
    // meetpunt zodat de test niet uitsluitend op requiredFirePortfolio draait.
    const v1Result = runSelectedProjection(TEST_INPUT, false)
    const v2Result = runSelectedProjection(TEST_INPUT, true)

    const v1End = v1Result.rows[v1Result.rows.length - 1]?.netWorth ?? 0
    const v2End = v2Result.rows[v2Result.rows.length - 1]?.netWorth ?? 0

    const delta = Math.abs(v1End - v2End)

    // Empirisch (compare-harness): v1 ~4 616 179 vs v2 ~3 644 517, delta > 900 000.
    // We asserteren op > 100 000 voor stabiliteit.
    expect(
      delta,
      `endNetWorth verschil te klein: v1=${Math.round(v1End)}, v2=${Math.round(v2End)}, delta=${Math.round(delta)}`,
    ).toBeGreaterThan(100_000)
  })

  it('useV2=false geeft v1-engine (runUnifiedProjection) — identiek aan directe aanroep', () => {
    // Bewijst dat useV2=false byte-identiek is aan de v1-engine direct aanroepen.
    // Als een surface v1 hardcodes VIA runSelectedProjection(input, false) is dat
    // hetzelfde als runUnifiedProjection — dit is het geaccepteerde v1-pad.
    // De test verificeert ook dat de selector niet per ongeluk een derde codepath
    // introduceert.
    const viaSelector = runSelectedProjection(TEST_INPUT, false)
    const direct = runUnifiedProjection(TEST_INPUT)

    expect(viaSelector.fireAge).toBe(direct.fireAge)
    expect(viaSelector.fireAgeFractional).toBe(direct.fireAgeFractional)
    expect(Math.round(viaSelector.requiredFirePortfolio)).toBe(Math.round(direct.requiredFirePortfolio))
    expect(viaSelector.rows.length).toBe(direct.rows.length)
  })

})

// ── Test 2: computeFreedomShift honoreert het useV2-veld van de baseline ──────

describe('computeFreedomShift / previewFireAge — flag-honouring (C5-pre regressie)', () => {
  /**
   * Construct een minimaal live event (inkomensstijging) dat de FIRE-leeftijd
   * meetbaar beweegt. Omdat previewFireAge de cashflows vervangt, is het event
   * type en bedrag bepalend voor de magnitude van deltaMonths.
   *
   * LifeEvent (uit @/lib/horizon-data) velden:
   *   id, name, event_type, target_age, target_date, one_time_cost,
   *   monthly_cost_change, monthly_income_change, duration_months, icon,
   *   is_active, sort_order, is_indexed, metadata?
   */
  const DRAFT_EVENT: LifeEvent = {
    id: 'test-event-1',
    name: 'Testevenement bijbaantje',
    event_type: 'income',
    target_age: TEST_INPUT.currentAge + 2,
    target_date: null,
    // Eenmalige inkomensstijging: geen one-time cost, maar extra maandinkomen
    // voor 96 maanden (8 jaar) van €500/mnd = €6 000/jaar
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 500,
    duration_months: 96,
    icon: 'briefcase',
    is_active: true,
    sort_order: 0,
    is_indexed: false,
  }

  // Baseline zonder events
  const v1Baseline: PreviewBaseline = {
    input: { ...TEST_INPUT, cashflows: [] },
    useV2: false,
  }

  const v2Baseline: PreviewBaseline = {
    input: { ...TEST_INPUT, cashflows: [] },
    useV2: true,
  }

  it('previewFireAge geeft andere leeftijden voor v1 vs v2 baseline (zelfde event)', () => {
    // Het bewijs dat previewFireAge de engine-selector aanroept, niet
    // rechtstreeks één engine hardcodes. Als de helper de flag negeert,
    // zouden v1Baseline en v2Baseline identieke fireAge opleveren.
    const v1Age = previewFireAge(v1Baseline, [DRAFT_EVENT])
    const v2Age = previewFireAge(v2Baseline, [DRAFT_EVENT])

    // Beide moeten een waarde teruggeven (niet null) voor dit invoerprofiel
    expect(v1Age, 'v1 previewFireAge mag niet null zijn').not.toBeNull()
    expect(v2Age, 'v2 previewFireAge mag niet null zijn').not.toBeNull()

    // De twee waarden moeten meetbaar verschillen — niet identiek.
    // Empirisch: de motoren verschillen minstens 1 jaar in FIRE-leeftijd voor
    // dit profiel. We asserteren op ≥ 0.5 (½ jaar = 6 maanden) voor stabiliteit.
    // Als een helper v1 hardcodes, zou |v1Age - v2Age| ≈ 0 zijn.
    const ageDelta = Math.abs((v1Age ?? 0) - (v2Age ?? 0))
    expect(
      ageDelta,
      `previewFireAge delta te klein: v1Age=${v1Age?.toFixed(2)}, v2Age=${v2Age?.toFixed(2)}, delta=${ageDelta.toFixed(2)}. Als delta≈0 is de flag genegeerd.`,
    ).toBeGreaterThan(0.5)
  })

  it('computeFreedomShift levert VERSCHILLENDE draftAge voor v1 vs v2 baseline', () => {
    // Dit is het pad dat event-pane-view.tsx en event-pane-edit.tsx nu volgen:
    //   computeFreedomShift(baseline, otherEvents, draftEvent)
    // waarbij baseline.useV2 bepaalt welke engine draait.
    // Als de helper de flag negeert en altijd v1 aanroept, zijn v1Shift.draftAge
    // en v2Shift.draftAge identiek — wat de regressie zou onthullen.
    //
    // We asserteren op draftAge (de fractionele vrijheidsleeftijd) in plaats van
    // deltaMonths, omdat de afrondingsstap in Math.round() kleine leeftijdsverschillen
    // tot 0 kan afvlakken terwijl de fractionele waarden wél aantoonbaar verschillen.
    const v1Shift = computeFreedomShift(v1Baseline, [], DRAFT_EVENT)
    const v2Shift = computeFreedomShift(v2Baseline, [], DRAFT_EVENT)

    // Beide moeten een geldige draftAge hebben
    expect(v1Shift.draftAge, 'v1 draftAge mag niet null zijn').not.toBeNull()
    expect(v2Shift.draftAge, 'v2 draftAge mag niet null zijn').not.toBeNull()

    // De fractionele FIRE-leeftijden moeten meetbaar verschillen.
    // Test 4 (previewFireAge) bewijst al dat de engines andere leeftijden geven;
    // deze test verificeert dat computeFreedomShift dat verschil ook doorgeeft
    // (i.e. de helper is het composiet van two previewFireAge-aanroepen die elk
    // de engine-selector gebruiken).
    const ageDelta = Math.abs((v1Shift.draftAge ?? 0) - (v2Shift.draftAge ?? 0))
    expect(
      ageDelta,
      `draftAge verschil te klein: v1=${v1Shift.draftAge?.toFixed(3)}, v2=${v2Shift.draftAge?.toFixed(3)}, delta=${ageDelta.toFixed(3)}. Als delta≈0 is de flag genegeerd in computeFreedomShift.`,
    ).toBeGreaterThan(0.5)
  })

  it('computeFreedomShift met null draftEvent (verwijdereffect) — ook flag-bewust', () => {
    // Edge case: verwijder-effect (draftEvent = null) laat het number-van-events
    // onveranderd. Het baselineAge hoort dan wel te tracken via de correcte engine.
    const v1Shift = computeFreedomShift(v1Baseline, [DRAFT_EVENT], null)
    const v2Shift = computeFreedomShift(v2Baseline, [DRAFT_EVENT], null)

    // Beide moeten een geldige baselineAge teruggeven
    expect(v1Shift.baselineAge, 'v1 baselineAge mag niet null zijn').not.toBeNull()
    expect(v2Shift.baselineAge, 'v2 baselineAge mag niet null zijn').not.toBeNull()

    // Bij draftEvent = null zijn alle events hetzelfde → draftAge = baselineAge
    // → deltaMonths = 0 voor beide. Maar baselineAge zelf verschilt per engine.
    expect(v1Shift.deltaMonths).toBe(0)
    expect(v2Shift.deltaMonths).toBe(0)

    // De baselineAges moeten verschillen (v1 vs v2 engine-keuze)
    const baseDelta = Math.abs((v1Shift.baselineAge ?? 0) - (v2Shift.baselineAge ?? 0))
    expect(
      baseDelta,
      `baselineAge in verwijder-modus is identiek voor v1/v2: ${v1Shift.baselineAge?.toFixed(2)} vs ${v2Shift.baselineAge?.toFixed(2)}`,
    ).toBeGreaterThan(0.5)
  })

})
