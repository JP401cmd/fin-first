import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { SwapInSimple } from '@/components/app/swap-in-simple'
import { Box3Heffingsvrij } from './box3-heffingsvrij'
import { join } from 'node:path'
import { calculateBox3, type Box3Result } from '@/lib/box3-data'
import { formatCurrency } from '@/lib/format'
import { readSourceLF } from '@/lib/test-utils/read-source'
import type { Asset } from '@/lib/asset-data'

/**
 * BEL-9 (besluit 6 sep 2026) — katern 3.3 stond hard in `HideInSimple`,
 * terwijl 3.1 (de forfaitaire opbouw-staaf, het rekenmodel) er juist búiten
 * staat. De beginner kreeg dus het model en niet het gevolg. In Eenvoudig
 * staat er nu één zin, in Volledig de bestaande gauge + tekst.
 *
 * Fixtures draaien tegen de ECHTE motor (`calculateBox3`) — een handgeschreven
 * `Box3Result` zou aan het type voldoen en tóch een onmogelijke combinatie van
 * forfait, tarief en voet kunnen dragen, waarmee de assertie niets meer over
 * de werkelijkheid zegt.
 */

const DAILY_EXPENSES = 100
const YEAR = 2026 as const

function asset(id: string, type: string, value: number): Asset {
  return { id, asset_type: type, current_value: value, is_active: true } as unknown as Asset
}

/** Ruim boven de voet → `voetVolBenut` = true → de marginale kostzin. */
const bovenDeVoet: Box3Result = calculateBox3({
  assets: [asset('a1', 'savings', 400_000)],
  debts: [],
  hasPartner: false,
  dailyExpenses: DAILY_EXPENSES,
  year: YEAR,
})

/** Onder de voet → er is nog onbelaste ruimte → de ruimte-zin. */
const onderDeVoet: Box3Result = calculateBox3({
  assets: [asset('a2', 'savings', 10_000)],
  debts: [],
  hasPartner: false,
  dailyExpenses: DAILY_EXPENSES,
  year: YEAR,
})

const fc = (v: number) => formatCurrency(v)

/** Exact de swap zoals box3-detail.tsx 'm bouwt. */
function renderKatern(result: Box3Result, mode: 'simple' | 'full') {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <SwapInSimple simple={<Box3Heffingsvrij result={result} fc={fc} sentenceOnly />}>
        <Box3Heffingsvrij result={result} fc={fc} />
      </SwapInSimple>
    </DisplayModeProvider>,
  )
}

describe('Box3Heffingsvrij — Eenvoudig toont de gevolg-zin', () => {
  it('boven de voet: de kostzin per € 1.000, zonder gauge', () => {
    const { container } = renderKatern(bovenDeVoet, 'simple')
    const tekst = container.textContent ?? ''
    expect(tekst).toContain('extra Box 3-vermogen kost')
    expect(tekst).toContain(fc(1000))
    // De gauge (svg) hoort er in Eenvoudig niet te staan.
    expect(container.querySelector('svg')).toBeNull()
    // Alleen de zin: de toelichtende buurzin blijft Volledig.
    expect(tekst).not.toContain('Je benut de hele onbelaste voet')
  })

  it('boven de voet: het bedrag komt uit de motor, niet uit een eigen som', () => {
    const { container } = renderKatern(bovenDeVoet, 'simple')
    const verwacht = Math.round(
      1000 * bovenDeVoet.effectiefRendement * bovenDeVoet.params.tarief,
    )
    expect(container.textContent).toContain(fc(verwacht))
  })

  it('onder de voet: géén marginale claim, maar de resterende ruimte', () => {
    const { container } = renderKatern(onderDeVoet, 'simple')
    const tekst = container.textContent ?? ''
    // De voetVolBenut-gate is load-bearing: "elke € 1.000 kost je …" is voor
    // wie onder de vrijstelling zit gewoon onwaar.
    expect(tekst).not.toContain('extra Box 3-vermogen kost')
    expect(tekst).toContain('onbelaste ruimte tot de voet')
    expect(tekst).toContain(
      fc(onderDeVoet.heffingsvrijVermogen - onderDeVoet.rendementsgrondslag),
    )
  })
})

describe('Box3Heffingsvrij — Volledig blijft ongewijzigd', () => {
  it('boven de voet: gauge + beide zinnen', () => {
    const { container } = renderKatern(bovenDeVoet, 'full')
    const tekst = container.textContent ?? ''
    expect(container.querySelector('svg')).not.toBeNull()
    expect(tekst).toContain('Je benut de hele onbelaste voet')
    expect(tekst).toContain('extra Box 3-vermogen kost')
    expect(tekst).toContain('voet benut')
  })

  it('onder de voet: gauge + ruimte-zin + toelichting', () => {
    const { container } = renderKatern(onderDeVoet, 'full')
    const tekst = container.textContent ?? ''
    expect(container.querySelector('svg')).not.toBeNull()
    expect(tekst).toContain('onbelaste ruimte tot de voet')
    expect(tekst).toContain('Tot dit bedrag betaal je geen Box 3-belasting')
  })
})

/**
 * Call-site-grendel. `box3-detail.tsx` is een client-component die zijn Box
 * 3-view zelf ophaalt en is niet zonder netwerk-mock te renderen; deze
 * bron-scan bewaakt dat 3.3 daadwerkelijk geswapt wordt en niet stilletjes
 * terugvalt op `HideInSimple` (dan is de beginner de gevolg-zin weer kwijt).
 */
describe('Box 3-detail — 3.3 swapt in plaats van te verdwijnen', () => {
  const bron = readSourceLF(
    join(process.cwd(), 'components', 'overview', 'box3-detail.tsx'),
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('Box3Heffingsvrij hangt aan SwapInSimple met sentenceOnly', () => {
    expect(bron).toMatch(/<SwapInSimple simple=\{<Box3Heffingsvrij[^>]*sentenceOnly/)
  })

  it('Box3Heffingsvrij staat niet (meer) in HideInSimple', () => {
    expect(bron).not.toMatch(
      /<HideInSimple>\s*<Box3Heffingsvrij[\s\S]*?<\/HideInSimple>/,
    )
  })
})
