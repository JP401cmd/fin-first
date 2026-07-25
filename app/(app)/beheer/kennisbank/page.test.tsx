import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Smoke-tests voor de gesplitste /beheer/kennisbank server-page (P2).
 *
 * De pagina is opgeknipt in een server-page (dit bestand — het nieuwe
 * PromptParityBlock) + `KennisbankClient` (pure move van de oude
 * client-logica, ongewijzigd). Deze suite borgt:
 *
 *  1. De split zelf werkt — de server-page rendert `<KennisbankClient />`
 *     zonder te crashen (gemockt, want de 956-regelige client heeft haar
 *     eigen data-fetching en is geen onderwerp van deze P1/C2c/P2-wijziging).
 *  2. Het NIEUWE PromptParityBlock-gedrag: de drie standen (nog nooit
 *     gescand / in sync / drift) renderen het juiste stoplicht en de juiste
 *     tekst, tegen `docs/ai-parity/parity.json`-achtige fixtures via de
 *     echte `selectParityFacts`-selector (geen losstaande dubbele aanname
 *     over de JSON-vorm).
 */

// De pagina importeert docs/ai-parity/parity.json STATISCH — per test een
// andere fixture inladen kan dus alleen via vi.doMock + vi.resetModules() +
// dynamic import (géén top-level vi.mock nodig).
async function renderPageWithParity(parity: unknown) {
  vi.resetModules()
  vi.doMock('@/docs/ai-parity/parity.json', () => ({ default: parity }))
  vi.doMock('./kennisbank-client', () => ({
    KennisbankClient: () => <div data-testid="kennisbank-client-stub" />,
  }))
  vi.doMock('@/lib/ai/local/litert-runtime', () => ({
    LOCAL_MODEL_TOKEN_BUDGET: 8192,
  }))
  const { default: BeheerKennisbankPage } = await import('./page')
  render(<BeheerKennisbankPage />)
}

describe('/beheer/kennisbank server-page — split + PromptParityBlock', () => {
  it('rendert de gemockte KennisbankClient (de split laat de body intact)', async () => {
    await renderPageWithParity({})
    expect(screen.getByTestId('kennisbank-client-stub')).toBeTruthy()
  })

  it('lege-staat: nog nooit gescand → neutrale melding, geen stoplicht', async () => {
    await renderPageWithParity({})
    expect(screen.getByText(/Nog geen parity-scan gedraaid/)).toBeTruthy()
    expect(screen.queryByText('In sync')).toBeNull()
    expect(screen.queryByText('Drift')).toBeNull()
  })

  it('in sync → groen "In sync"-stoplicht, geen drift-uitleg', async () => {
    await renderPageWithParity({
      generatedAt: '2026-07-24T22:21:28.487Z',
      manifestGeneratedAt: '2026-07-24T22:10:46.710Z',
      inSync: true,
      dnaSubBudget: 2000,
      dnaEstimatedTokens: 490,
      dnaTokenSource: 'live',
      sources: [
        { file: 'lib/ai/dna/base.ts', storedSha256: 'a', liveSha256: 'a', inSync: true },
        { file: 'lib/ai/dna/wil.ts', storedSha256: 'b', liveSha256: 'b', inSync: true },
      ],
    })

    expect(screen.getByText('In sync')).toBeTruthy()
    expect(screen.queryByText('Drift')).toBeNull()
    expect(screen.queryByText(/gewijzigd zonder dat de lokale DNA/)).toBeNull()
    expect(screen.getByText('base.ts')).toBeTruthy()
    expect(screen.getByText('490')).toBeTruthy()
  })

  it('drift → rood "Drift"-stoplicht + uitleg, per-bron gewijzigd-label', async () => {
    await renderPageWithParity({
      generatedAt: '2026-07-24T22:21:28.487Z',
      manifestGeneratedAt: '2026-07-20T10:00:00.000Z',
      inSync: false,
      dnaSubBudget: 2000,
      dnaEstimatedTokens: 490,
      dnaTokenSource: 'live',
      sources: [
        { file: 'lib/ai/dna/base.ts', storedSha256: 'a', liveSha256: 'a', inSync: true },
        { file: 'lib/ai/dna/wil.ts', storedSha256: 'b', liveSha256: 'CHANGED', inSync: false },
      ],
    })

    expect(screen.getByText('Drift')).toBeTruthy()
    expect(screen.queryByText('In sync')).toBeNull()
    expect(screen.getByText(/gewijzigd zonder dat de lokale DNA/)).toBeTruthy()
    expect(screen.getByText('gewijzigd')).toBeTruthy() // wil.ts-rij
    expect(screen.getByText('ongewijzigd')).toBeTruthy() // base.ts-rij
  })

  it('manifest-fallback tokenbron → waarschuwingstekst zichtbaar', async () => {
    await renderPageWithParity({
      generatedAt: '2026-07-24T22:21:28.487Z',
      manifestGeneratedAt: '2026-07-24T22:10:46.710Z',
      inSync: true,
      dnaSubBudget: 2000,
      dnaEstimatedTokens: 450,
      dnaTokenSource: 'manifest-fallback',
      sources: [],
    })

    expect(screen.getByText(/DNA-tekst niet gevonden/)).toBeTruthy()
  })
})
