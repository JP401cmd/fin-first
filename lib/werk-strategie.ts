/**
 * Werk-strategie — zet een loopbaan-/inkomensambitie om in reële inkomens-DELTA-
 * kasstromen t.o.v. het vlakke basisinkomen dat de FIRE-engine al via de
 * spaarquote (`annualSavings`) meeneemt. Eén `life_events`-rij (event_type='werk')
 * met `WerkMetadata` → een reeks recurring `SimCashflow`-delta's.
 *
 * Model (zie docs/CLAUDE.md "Berekeningen"):
 *  - REËEL: alle delta's zijn `indexed:true` (vlak-reëel; groei staat boven inflatie,
 *    plafond is een reële cap).
 *  - DELTA: we dragen alléén het verschil met `huidigNettoMaand` — het basisinkomen
 *    wordt nooit opnieuw geïnjecteerd (geen dubbeltelling).
 *  - `onlyWhileWorking:true` → de engine gate't deze flows op de werk-stopgrens
 *    (`werkt`), net als het basissalaris; salarisgroei lekt zo niet de
 *    onttrekkingsfase in.
 *
 * Puur, geen Supabase. `import type` voorkomt een runtime-cycle met fire-simulation.
 */

import type { SimCashflow } from '@/lib/fire-simulation'
import type { WerkMetadata, WerkFase } from '@/lib/horizon-data'

/**
 * Bovengrens waartoe we groeisegmenten samplen. De `onlyWhileWorking`-gate in de
 * engine kapt de delta's af op de werkelijke werk-stopgrens; deze cap bepaalt
 * alleen tot welke leeftijd er segmenten gegenereerd worden.
 */
export const WERK_HORIZON_CAP = 71

/** Samplecadans (jaren) voor de gladde groeicurve tussen structurele grenzen. */
export const GROWTH_STEP_YEARS = 5

export interface WerkExpandCtx {
  eventId: string
  name: string
  /** Huidige leeftijd (= `target_age` van de werk-rij). */
  currentAge: number
}

/** Deeltijdfactor (0–1) op een leeftijd: de laatste faseStap met `fromAge <= age`. */
function deeltijdFactor(fases: WerkFase[], age: number): number {
  let pct = 100
  for (const f of [...fases].sort((a, b) => a.fromAge - b.fromAge)) {
    if (age >= f.fromAge) pct = f.pct
  }
  return Math.max(0, pct) / 100
}

/**
 * Het netto maandinkomen op een gegeven leeftijd, REËEL (in huidige euro's).
 * Promotie-sprongen worden op hun leeftijd opgeteld, daarna compoundt de reële
 * groei verder; het plafond capt het totaal (maar nooit onder het basisinkomen).
 * Tot slot wordt de deeltijdfactor toegepast.
 */
export function salaryAt(meta: WerkMetadata, currentAge: number, age: number): number {
  const base = Math.max(0, meta.huidigNettoMaand ?? 0)
  const groei = meta.reeleGroeiPct ?? 0
  const plafond = meta.plafondNettoMaand ?? 0
  // plafond knipt nooit onder de basis
  const cap = plafond > 0 ? Math.max(plafond, base) : Infinity
  const sprongen = meta.sprongen ?? []

  let s = base
  for (let y = currentAge + 1; y <= age; y++) {
    // 1. Promotie-/salarissprongen die op dit jaar ingaan
    for (const sp of sprongen) {
      if (Math.round(sp.atAge) === y) s += sp.deltaNettoMaand
    }
    // 2. Reële groei (tot groeiTotLeeftijd, indien gezet)
    if (meta.groeiTotLeeftijd == null || y <= meta.groeiTotLeeftijd) {
      s *= 1 + groei
    }
    // 3. Reëel plafond
    if (s > cap) s = cap
  }
  return Math.max(0, s) * deeltijdFactor(meta.faseStappen ?? [], age)
}

/**
 * Expandeert een WerkMetadata naar reële inkomens-DELTA-kasstromen.
 * Segmenten lopen tussen structurele grenzen (deeltijd-stappen, sprongen,
 * groei-stop) + een grove samplecadans voor de gladde groei; per segment dragen
 * we de delta op het MIDPOINT-niveau (minder bias dan begin/eind). Aangrenzende
 * segmenten met dezelfde delta worden samengevoegd.
 */
export function werkMetadataToCashflows(meta: WerkMetadata, ctx: WerkExpandCtx): SimCashflow[] {
  const base = Math.max(0, meta.huidigNettoMaand ?? 0)
  if (base <= 0) return []
  const currentAge = Math.round(ctx.currentAge)

  // Structurele grenzen waarop het niveau verandert.
  const boundarySet = new Set<number>([currentAge])
  for (const f of meta.faseStappen ?? []) {
    const a = Math.round(f.fromAge)
    if (a > currentAge) boundarySet.add(a)
  }
  for (const sp of meta.sprongen ?? []) {
    const a = Math.round(sp.atAge)
    if (a > currentAge) boundarySet.add(a)
  }
  if (meta.groeiTotLeeftijd != null && meta.groeiTotLeeftijd > currentAge) {
    boundarySet.add(Math.round(meta.groeiTotLeeftijd) + 1)
  }
  // Grove samplecadans voor de gladde groei.
  const lastBoundary = Math.max(WERK_HORIZON_CAP, ...boundarySet)
  for (let y = currentAge; y <= lastBoundary; y += GROWTH_STEP_YEARS) boundarySet.add(y)

  const boundaries = [...boundarySet].filter((b) => b >= currentAge).sort((a, b) => a - b)

  // Bereken delta per segment op het midpoint en voeg gelijke deltas samen.
  const segments: { fromAge: number; toAge: number | null; delta: number }[] = []
  for (let i = 0; i < boundaries.length; i++) {
    const fromAge = boundaries[i]!
    const toAge = i + 1 < boundaries.length ? boundaries[i + 1]! : null
    const sampleAge = toAge == null ? fromAge : Math.round((fromAge + toAge) / 2)
    const delta = Math.round(salaryAt(meta, currentAge, sampleAge) - base)
    const prev = segments[segments.length - 1]
    if (prev && prev.delta === delta) {
      prev.toAge = toAge // verleng het lopende segment
    } else {
      segments.push({ fromAge, toAge, delta })
    }
  }

  const flows: SimCashflow[] = []
  for (const seg of segments) {
    if (seg.delta === 0) continue
    flows.push({
      id: `le-werk-${ctx.eventId}-${seg.fromAge}`,
      name: `${ctx.name} (${seg.fromAge}+)`,
      type: 'recurring',
      direction: seg.delta > 0 ? 'income' : 'expense',
      amount: Math.abs(seg.delta),
      fromAge: seg.fromAge,
      toAge: seg.toAge,
      indexed: true,
      onlyWhileWorking: true,
    })
  }
  return flows
}
