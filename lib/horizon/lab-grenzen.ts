// lib/horizon/lab-grenzen.ts
//
// DE GRENZEN OP DE VIJF KNOPPEN (ADR 0170, 19 sep 2026)
// ───────────────────────────────────────────────────────────────────────────
// Elke knop in het doelscenario-lab draagt een driekleurige schaal: rood (het plan reikt
// niet), oranje (gedekt, minder dan `LAB_RUIM_MARGE` marge), groen (ruim gedekt). De grens
// rood → oranje is de BEREKENDE waarde waarop het plan precies gedekt is — met de andere
// vier knoppen op hun huidige stand. Beweegt één knop, dan verschuiven de grenzen op alle
// knoppen mee. Deze module is de generalisatie van `solveHaalbareUitgave` (ADR 0160): niet
// één knop, maar vijf; niet één predicaat, maar twee (gedekt en ruim).
//
// EÉN PREDICAAT OVERAL (ADR 0170 § Rekenwerk). `gedekt(input, S)` =
//   `solveFire({ ...kernelInput, stopAnker: { soort: 'leeftijd', leeftijd: S } }).status`
//   ∉ {anchor_shortfall, stop_now_shortfall, pension_shortfall}.
// Waarom niet "solved fireAge ≤ S"? Omdat die twee niet equivalent zijn: de solved-bisectie
// toetst `isToereikend` (gap ≥ 0 plus geen blijvende tekort-lening), terwijl de vast-anker-
// toets élke piek-tekortlening tot de eindleeftijd meetelt plus de `doelbedrag < 0`-regel.
// Anchored-gedekt impliceert dus wel `fireAge ≤ S`, maar niet omgekeerd (een tijdelijke
// tekort-episode). Bovendien zet `evaluateFireAt` — het bestaande stop-pad — géén
// `stopAnker`, waardoor de shortfall-set daar een tekort zou missen. Eén predicaat voor
// `huidig` én voor elke grens is de enige manier waarop de gekleurde schaal en het
// zone-woord elkaar niet kunnen tegenspreken. Het anker gaat op de KernelInput (niet via
// een rijpatch): onder een vast anker kortsluit `solveFire` dan tot één engine-run.
//
// HET RUIM-PREDICAAT is hetzelfde oordeel op een gestreste invoer (B3):
//  - vast anker (aow/age/now): rijpatch `fire_end_age = min(MAX_AGE, eind + marge × (eind −
//    planStop))` — werkt omdat `buildEindstrategie` beide eindleeftijden uit `plan.endAge`
//    leest. De span hangt aan het PLAN (planStop), niet aan de stand van de stop-knop.
//  - solved: anker op `S′ = (S + marge × nu) / (1 + marge)`, want
//    `S ≥ vrij + marge × (vrij − nu) ⟺ vrij ≤ S′`.
//  - eind-vorm perpetual: er is geen eindleeftijd om op te rekken. `ruim` valt dan samen
//    met `gedekt` (oranje band leeg: rood → groen) en `huidig.ruim = huidig.gedekt`.
//
// PER KNOP grijpt de variatie aan waar de app dat al doet: verdienen/uitgeven via
// `buildSliderEvent`/`applySliderEvent` (de engine bouwt de slider-events zélf uit de
// standen, zodat `huidig` en de bisectie één parameterisatie delen), uitgave na pensioen
// via de `custom_amount`-rijpatch (= `haalbare-uitgave.ts#inputMet`), nalatenschap via
// `patchNalatenschap`, stopleeftijd via S zelf. Geen partnerblok (F6, ADR 0160).
//
// WORKER-VEILIG: alleen pure reken-imports (adapter, solver, scenario-events) — geen
// React, DOM of Supabase. Draait via `runLabGrenzenAsync` in de kernel-worker.

import type { WhatIfEvent } from '@/lib/types/horizon-whatif'
import type { KernelInput } from '@/lib/horizon-kernel/types'
import { MAX_AGE } from '@/lib/horizon-kernel/types'
import { LAB_RUIM_MARGE } from '@/lib/constants'
import {
  buildConvergentieAdapterProfile,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { buildKernelInputFromApp } from '@/lib/horizon-kernel/adapter'
import { solveFire, type SolveFireResult, type SolverStatus } from '@/lib/horizon-kernel/solver'
import { applySliderEvent, buildSliderEvent } from '@/lib/scenario-events'
import { patchNalatenschap } from '@/lib/horizon/kernel-profile-basis'
import {
  HEFBOOM_KEYS,
  HEFBOOM_RICHTING,
  type HefboomBereik,
  type HefboomGrenzen,
  type HefboomKey,
  type HefboomRichting,
  type LabGrenzenContext,
  type LabGrenzenResultaat,
  type LabGrenzenWaarden,
} from '@/lib/horizon/lab-grenzen-types'

/**
 * De drie statussen die de kern onder een vast anker zet bij een tekort — dezelfde set als
 * `lib/horizon/haalbare-uitgave.ts` (daar privaat; dat bestand blijft bewust ongewijzigd).
 * Gelezen uit `SolveFireResult.status`, de formule uit `computeStatusBlok` wordt niet herhaald.
 */
const SHORTFALL: ReadonlySet<SolverStatus> = new Set<SolverStatus>([
  'anchor_shortfall',
  'stop_now_shortfall',
  'pension_shortfall',
])

/** Standaard-noodrem op het aantal kernel-runs per batch (≈ 90 verwacht; zie ADR 0170). */
export const LAB_GRENZEN_MAX_RUNS = 160

/** Eindleeftijd van het plan wanneer de rij er geen draagt — dezelfde terugval als `parseFirePlan`. */
const PLAN_EIND_DEFAULT = 90

/** Het kern-oordeel dat de engine nodig heeft; injecteerbaar voor pure tests (default `solveFire`). */
export type LabSolve = (input: KernelInput) => Pick<SolveFireResult, 'status'>

/** Interne stop: het runbudget is op — de resterende grenzen blijven `null`. */
class RunbudgetOp extends Error {
  constructor() {
    super('lab-grenzen: runbudget op')
  }
}

// ── Raster-bisectie (puur, knop-onafhankelijk) ─────────────────────────────

export interface BisectieSpec extends HefboomBereik {
  richting: HefboomRichting
}

export interface BisectieUitkomst {
  /** De eerste rasterwaarde aan de gedekte kant, of `null` (heel/niet bepaalbaar). */
  grens: number | null
  heel: 'gedekt' | 'ongedekt' | null
}

/**
 * Zoekt op het raster `{min, max, stap}` de eerste waarde waarop `gedekt` waar is, in de
 * richting van de knop (`stijgend`: hoger = beter, `dalend`: lager = beter).
 *
 *  1. Bracket op de twee uiteinden (2 runs). Beide gedekt ⇒ `heel: 'gedekt'`; geen van
 *     beide ⇒ `heel: 'ongedekt'`; gedekt aan de VERKEERDE kant ⇒ `null` (de dekking loopt
 *     niet in de richting die de knop belooft — dan zegt een grens niets).
 *  2. Raster-bisectie in ⌈log2(n)⌉ runs, met een probe-cache per rasterindex.
 *  3. Monotonie-vangrail (spiegel `haalbare-uitgave.ts`): de rasterstap aan de verkeerde
 *     kant van de grens moet ongedekt zijn. Op een raster is die probe per constructie al
 *     gedaan (de bisectie-invariant), dus de toets leest uit de cache en kost geen run —
 *     hij staat er om de belofte expliciet te maken, niet omdat hij anders kan uitvallen.
 */
export function bisecteerGrens(spec: BisectieSpec, gedekt: (v: number) => boolean): BisectieUitkomst {
  const { min, max, stap, richting } = spec
  if (!(stap > 0) || !Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    return { grens: null, heel: null }
  }
  const n = Math.floor((max - min) / stap + 1e-9)
  // j-ruimte: j = 0 is de slechtste kant, j = n de beste — onafhankelijk van de richting.
  const waarde = (j: number) => afronden(richting === 'stijgend' ? min + j * stap : max - j * stap)
  const cache = new Map<number, boolean>()
  const probe = (j: number): boolean => {
    let r = cache.get(j)
    if (r === undefined) {
      r = gedekt(waarde(j))
      cache.set(j, r)
    }
    return r
  }

  const slecht = probe(0)
  const goed = n === 0 ? slecht : probe(n)
  if (slecht && goed) return { grens: null, heel: 'gedekt' }
  if (!slecht && !goed) return { grens: null, heel: 'ongedekt' }
  if (slecht && !goed) return { grens: null, heel: null }

  let lo = 0 // ongedekt
  let hi = n // gedekt
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (probe(mid)) hi = mid
    else lo = mid
  }
  if (probe(hi - 1) !== false) return { grens: null, heel: null }
  return { grens: waarde(hi), heel: null }
}

/** Raster-artefacten (0,1 + 0,2) wegpoetsen zonder de precisie van de stap te raken. */
function afronden(v: number): number {
  return Math.round(v * 1e6) / 1e6
}

// ── De batch ────────────────────────────────────────────────────────────────

/**
 * De grenzen van alle zichtbare knoppen plus het oordeel over de huidige stand.
 *
 * Per knop: `gedekt` (bracket + bisectie + vangrail) en daarna `ruim`, dat alleen aan de
 * gedekte kant van `gedekt` zoekt. Een knop die niet in `ctx.bereik` staat wordt niet
 * gesolved. Elke knop en elk predicaat zit in zijn eigen try/catch: een kern-fout of het
 * runbudget maakt díe grens `null`, nooit de hele batch. `runs` telt de kernel-runs.
 *
 * Wat de uitkomst per knop betekent voor de schaal (`zoneVanWaarde`, lab-grenzen-types):
 *  - `heel: 'gedekt'`   — alles gedekt én ruim (hele band groen);
 *  - `heel: 'ongedekt'` — niets gedekt (hele band rood);
 *  - `gedekt` gezet, `ruim` gezet — rood tot gedekt, oranje tot ruim, groen erna;
 *  - `gedekt` gezet, `ruim: null` — rood tot gedekt, oranje tot het eind (nergens ruim
 *    binnen bereik, of ruim niet bepaalbaar — liever oranje dan een groen dat niet klopt);
 *  - alles gedekt maar niet overal ruim — `gedekt` op de rand van het bereik (rood-segment
 *    leeg) met `ruim` als grens, zodat de band niet groen kleurt waar hij oranje hoort.
 *
 * `deps.solve` is uitsluitend voor pure tests (een predicaat op de KernelInput in plaats
 * van de motor); productie en de worker laten 'm weg.
 */
export function computeLabGrenzen(ctx: LabGrenzenContext, deps?: { solve?: LabSolve }): LabGrenzenResultaat {
  const solve = deps?.solve ?? solveFire
  const budget = ctx.maxRuns ?? LAB_GRENZEN_MAX_RUNS
  const perpetual = ctx.eindVorm === 'perpetual'
  let runs = 0

  /** HET predicaat: gedekt op stopleeftijd S, op déze stand (met optioneel opgerekte eindleeftijd). */
  const gedektOp = (stand: LabGrenzenWaarden, S: number, eindOprek: number | null): boolean => {
    if (runs >= budget) throw new RunbudgetOp()
    runs += 1
    const input = bouwInput(ctx, stand, eindOprek)
    return !SHORTFALL.has(solve({ ...input, stopAnker: { soort: 'leeftijd', leeftijd: S } }).status)
  }
  const gedektBij = (stand: LabGrenzenWaarden): boolean => gedektOp(stand, stand.stop, null)
  const ruimBij = (stand: LabGrenzenWaarden): boolean => {
    if (perpetual) return gedektBij(stand)
    if (ctx.planAnkerVast) {
      const eind = ctx.profile.fire_end_age ?? PLAN_EIND_DEFAULT
      const planStop = ctx.planStopAge ?? stand.stop
      const oprek = Math.min(MAX_AGE, eind + LAB_RUIM_MARGE * (eind - planStop))
      return gedektOp(stand, stand.stop, oprek)
    }
    // solved: S ≥ vrij + marge × (vrij − nu) ⟺ vrij ≤ S′ — `nu` is de kernel-startleeftijd,
    // dezelfde grootheid als de klem van `resolveVastAnker`.
    const sAccent = (stand.stop + LAB_RUIM_MARGE * nuLeeftijd()) / (1 + LAB_RUIM_MARGE)
    return gedektOp(stand, sAccent, null)
  }
  // De startleeftijd hangt alleen aan het profiel (date_of_birth), niet aan de stand:
  // één adapter-build volstaat voor de hele batch.
  let nuCache: number | null = null
  const nuLeeftijd = (): number => {
    if (nuCache == null) nuCache = bouwInput(ctx, ctx.waarden, null).startLeeftijd
    return nuCache
  }

  // Het oordeel over de HUIDIGE stand — hetzelfde predicaat als elke grens.
  let huidig: LabGrenzenResultaat['huidig'] = null
  try {
    const gedekt = gedektBij(ctx.waarden)
    // `ruim` impliceert `gedekt`: zonder dekking is er geen marge te meten (bespaart een run).
    const ruim = gedekt && (perpetual ? true : ruimBij(ctx.waarden))
    huidig = { gedekt, ruim }
  } catch {
    huidig = null
  }

  const grenzen: Partial<Record<HefboomKey, HefboomGrenzen>> = {}
  for (const knop of HEFBOOM_KEYS) {
    const bereik = ctx.bereik[knop]
    if (bereik == null) continue
    const richting = HEFBOOM_RICHTING[knop]
    const standMet = (v: number): LabGrenzenWaarden => ({ ...ctx.waarden, [knop]: v })
    const uit: HefboomGrenzen = { gedekt: null, ruim: null, heel: null }

    // 1. gedekt
    let gedektUitkomst: BisectieUitkomst | null = null
    try {
      gedektUitkomst = bisecteerGrens({ ...bereik, richting }, (v) => gedektBij(standMet(v)))
      uit.gedekt = gedektUitkomst.grens
      uit.heel = gedektUitkomst.heel
    } catch {
      gedektUitkomst = null
    }

    // 2. ruim — alleen aan de gedekte kant van gedekt; overslaan zonder gedekte kant.
    if (gedektUitkomst != null && gedektUitkomst.heel !== 'ongedekt' && !(gedektUitkomst.grens == null && gedektUitkomst.heel == null)) {
      if (perpetual) {
        // Geen eindleeftijd om op te rekken: ruim ≡ gedekt (oranje band leeg).
        uit.ruim = uit.gedekt
      } else {
        try {
          const heelGedekt = gedektUitkomst.heel === 'gedekt'
          const rand = richting === 'stijgend' ? bereik.min : bereik.max
          const vanaf = heelGedekt ? rand : (gedektUitkomst.grens as number)
          const sub: BisectieSpec =
            richting === 'stijgend'
              ? { min: vanaf, max: bereik.max, stap: bereik.stap, richting }
              : { min: bereik.min, max: vanaf, stap: bereik.stap, richting }
          const r = bisecteerGrens(sub, (v) => ruimBij(standMet(v)))
          if (r.heel === 'gedekt') {
            // Alles aan de gedekte kant is óók ruim: oranje band leeg.
            uit.ruim = heelGedekt ? null : vanaf
          } else if (heelGedekt) {
            // Alles gedekt, maar niet overal ruim: leg de gedekt-grens op de rand zodat de
            // band niet als geheel groen kleurt (het rood-segment is dan leeg).
            uit.gedekt = rand
            uit.heel = null
            uit.ruim = r.grens // null ⇒ nergens ruim (of niet bepaalbaar) ⇒ oranje tot het eind
          } else {
            uit.ruim = r.grens
          }
        } catch {
          uit.ruim = null
        }
      }
    }

    grenzen[knop] = uit
  }

  return { grenzen, huidig, runs }
}

// ── KernelInput per iteratie ────────────────────────────────────────────────

/**
 * De KernelInput van déze stand: profielrij-patches voor de twee planparameters (uitgave
 * na pensioen, nalatenschap) en de opgerekte eindleeftijd, slider-events voor verdienen en
 * uitgeven op de DB-gebeurtenissen — exact `haalbare-uitgave.ts#inputMet` en
 * `use-horizon-fire-sim#resolveScenarioContext`, zonder tweede assemblageweg.
 */
function bouwInput(ctx: LabGrenzenContext, stand: LabGrenzenWaarden, eindOprek: number | null): KernelInput {
  let profile: ConvergentieRawProfileRow = ctx.profile
  if (stand.uitgaveNaPensioen != null && Number.isFinite(stand.uitgaveNaPensioen)) {
    profile = {
      ...profile,
      retirement_expense_method: 'custom_amount',
      retirement_expense_custom_amount: stand.uitgaveNaPensioen,
    }
  }
  if (stand.nalatenschap != null && Number.isFinite(stand.nalatenschap)) {
    profile = patchNalatenschap(profile, stand.nalatenschap)
  }
  if (eindOprek != null) {
    profile = { ...profile, fire_end_age: eindOprek }
  }

  let events: WhatIfEvent[] = [...ctx.lifeEvents]
  events = applySliderEvent(events, 'extra_inleg', buildSliderEvent('extra_inleg', stand.verdienen, ctx.baseline, ctx.currentAge))
  events = applySliderEvent(events, 'savings', buildSliderEvent('savings', stand.uitgeven, ctx.baseline, ctx.currentAge))

  return buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile(profile),
    assets: ctx.assets,
    debts: ctx.debts,
    lifeEvents: events,
    aowRows: ctx.aowRows,
  })
}
