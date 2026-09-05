import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Asset } from '@/lib/asset-data'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import {
  buildConvergentieAdapterProfile,
  type ConvergentieRawProfileRow,
} from './convergentie-router'
import { buildKernelInputFromApp, deriveEigenHuisIds } from './adapter'
import { solveFire, type SolverStatus } from './solver'
import { buildKernelSlotMeta, kernelToUnifiedResult } from './bridge'

/**
 * ADR 0129 F2 — de status-compat van de bridge tijdens de tussentoestand.
 *
 * DE REGRESSIE DIE DIT VASTPINT (live 3–5 sep 2026). F2 liet de adapter voor een
 * pensioen-rij de eind-vorm als selector sturen (`'Vermogen opeten'` + anker `aow`).
 * De solver zet `pension_shortfall` uitsluitend bij interne code `'pensioen'`, dus
 * een tekort landde voortaan op `anchor_shortfall`. Het statusblok op /toekomst
 * matcht letterlijk op `kernelStatus === 'pension_shortfall'` en er bestond géén
 * blok voor `anchor_shortfall`. Gevolg: een pensioen-gebruiker met een tekort-
 * lening zag de grafiek die wél tekenen, maar las er niets meer over.
 *
 * Wat pijnlijk was: dezelfde commit hield `stop_now_shortfall` juist WÉL in stand
 * met precies deze motivering ("een statusblok matcht daar letterlijk op") — en
 * paste die gedachte niet toe op `pension_shortfall`.
 *
 * DE INVARIANT, anker-onafhankelijk geformuleerd: elke status die de bridge voor
 * een via de app bereikbaar anker kan uitzenden, heeft een blok in horizon-client.
 * De bron-grendel onderaan bewaakt dat mechanisch, zodat een volgende hernoeming
 * hier omvalt in plaats van in productie.
 *
 * F4 generaliseert de UI naar `anchor_shortfall` en haalt deze mapping weer weg.
 */

/**
 * Dicht bij de AOW (67 als fallback): een 42-jarige met ×0,05 vermogen haalt onder
 * het aow-anker gewoon `reached_at`, want 25 jaar salaris tot de AOW redt het plan —
 * dat is de F2-bevinding dat `reached_at` onder een vast anker wél bereikbaar is.
 * Een 64-jarige heeft nog drie jaar opbouw en trekt met ×0,05 wél een tekort-lening.
 */
const PINNED_AGE = 64
const fx = buildCompleetHorizonFixture(PINNED_AGE)

const basisProfiel: ConvergentieRawProfileRow = {
  ...buildCompleetKernelProfileBase(PINNED_AGE),
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  housing_strategy_config: { mode: 'include_full' },
}

/** Arm genoeg dat élk vast anker vanaf 64 een tekort-lening trekt. */
const armeAssets: Asset[] = fx.assets.map(
  (a) => ({ ...a, current_value: a.current_value * 0.05 }) as Asset,
)

function bridgedStatus(over: Partial<ConvergentieRawProfileRow>): {
  solver: SolverStatus
  bridge: SolverStatus
} {
  const input = buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile({ ...basisProfiel, ...over }),
    assets: armeAssets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
  })
  const solve = solveFire(input)
  const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(
    armeAssets,
    fx.debts,
    deriveEigenHuisIds(armeAssets),
  )
  const unified = kernelToUnifiedResult(solve, {
    input,
    yearlyExpenses: 30_000,
    assetSlotMeta,
    debtSlotMeta,
  })
  return { solver: solve.status, bridge: unified.kernelStatus }
}

describe('bridge — het aow-anker spreekt tijdens F2 de taal die de UI verstaat', () => {
  it('pensioen-gebruiker met tekort: solver zegt anchor_shortfall, bridge vertaalt naar pension_shortfall', () => {
    // Beide rijvormen die live bestaan ná de backfill: het anker in de nieuwe kolom,
    // én de legacy-vorm waarin de oude kolom nog 'pensioen' draagt (tegenspraak-regel D2).
    for (const rij of [
      { fire_stop_anchor: 'aow' } as const,
      { fire_end_strategy: 'pensioen' } as const,
    ]) {
      const { solver, bridge } = bridgedStatus(rij)
      expect(solver).toBe('anchor_shortfall')
      expect(bridge).toBe('pension_shortfall')
    }
  })

  it('nu-anker houdt stop_now_shortfall (ongewijzigd, ADR 0127-blok leest die naam)', () => {
    const { bridge } = bridgedStatus({ fire_stop_anchor: 'now' })
    expect(bridge).toBe('stop_now_shortfall')
  })

  it('leeftijd-anker blijft anchor_shortfall — daar is geen legacy-consument voor', () => {
    // Bewust NIET terugvertalen: dit anker bestond vóór F2 niet, dus er is geen oud
    // blok dat erop wacht. F3b bouwt het generieke blok; tot dan is dit anker
    // uitsluitend via de API bereikbaar.
    const { bridge } = bridgedStatus({ fire_stop_anchor: 'age', fire_stop_age: 65 })
    expect(bridge).toBe('anchor_shortfall')
  })

  it('K1 — een aow-plan dat zijn LEGACY-doel niet haalt is een tekort, geen onbereikbaarheid', () => {
    // Geen tekort-lening (J blijft ≥ 0), wel gap < 0 op de eindleeftijd. Vóór K1 viel
    // dit via de M6-schijnbereik-tak op `unreachable_within_horizon` → bridge
    // `fireReachable = false` → hero zonder stopleeftijd en lege scenariokaarten.
    const { solver, bridge } = bridgedStatus({
      fire_stop_anchor: 'aow',
      fire_end_strategy: 'legacy',
      fire_legacy_amount: 50_000_000,
    })
    expect(solver).toBe('anchor_shortfall')
    expect(bridge).toBe('pension_shortfall')
  })
})

describe('bron-grendel — elke TEKORT-status die de bridge voor een live anker uitzendt heeft een UI-blok', () => {
  // Alleen tekort-statussen hebben een eigen blok nodig: `reached_now`/`reached_at`
  // worden door de hero-leeftijd gedragen en hoeven niet apart gemeld te worden.
  // Een tekort daarentegen is precies de melding die een gebruiker níét mag missen.
  const src = readFileSync(
    resolve(process.cwd(), 'components/app/horizon/horizon-client.tsx'),
    'utf8',
  )
  const uiStatussen = new Set(
    [...src.matchAll(/kernelStatus\s*===\s*'([a-z_]+)'/g)].map((m) => m[1]),
  )
  const isTekort = (s: SolverStatus) => s.endsWith('_shortfall')

  // F3b — het `age`-anker: sinds het generieke `anchor_shortfall`-blok in horizon-client
  // (ADR 0129 D3) is dit een gewone rij in de matrix; de UI schrijft het anker nu ook
  // (Voorkeuren, strategie-modal, "Maak dit mijn plan").
  it.each([
    ['aow (pensioen-gebruiker)', { fire_stop_anchor: 'aow' } as const],
    ['aow via legacy-kolom', { fire_end_strategy: 'pensioen' } as const],
    ['nu', { fire_stop_anchor: 'now' } as const],
    ['age (F3b)', { fire_stop_anchor: 'age', fire_stop_age: 65 } as const],
  ])('%s: het scenario trekt een tekort én dat tekort heeft een blok in horizon-client', (_naam, rij) => {
    const { bridge } = bridgedStatus(rij)
    // Eerst bewijzen dat het scenario überhaupt een tekort is — anders toetst de
    // grendel niets (de fout waarmee deze test zelf begon).
    expect(isTekort(bridge), `scenario levert '${bridge}', geen tekort — fixture te rijk`).toBe(true)
    expect(
      uiStatussen.has(bridge),
      `bridge zendt '${bridge}' uit maar horizon-client.tsx matcht er nergens op — ` +
        `een gebruiker met een tekort ziet dan niets. UI kent: ${[...uiStatussen].join(', ')}`,
    ).toBe(true)
  })
})
