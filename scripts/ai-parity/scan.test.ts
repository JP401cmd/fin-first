import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { classifyBaseline } from './scan.mjs'

/**
 * De parity-checker hasht de bron CRLF→LF genormaliseerd, maar de baselines in
 * parity-manifest.json werden met de hand op de RAUWE bytes gegenereerd. Op een
 * Windows-checkout kreeg elk CRLF-bestand daardoor een baseline die de checker
 * per constructie nooit kan reproduceren: permanente drift die niets met de
 * inhoud te maken heeft. Gemeten op 7 sep 2026: 4 van de 16 baselines.
 *
 * `classifyBaseline` maakt dat onderscheid expliciet, zodat een rebaseline
 * alléén het representatie-probleem mag opruimen en echte inhoudelijke drift
 * met rust laat — anders maakt het opruimen van 4 valse positieven de 5 echte
 * drifts stil, en dat is precies de fout die deze functie moet voorkomen.
 */

const sha = (t: string) => createHash('sha256').update(t).digest('hex')

const BRON = 'export const X = 1\nexport const Y = 2\n'
const BRON_CRLF = BRON.replace(/\n/g, '\r\n')

describe('classifyBaseline', () => {
  it('noemt een baseline die de LF-hash van de bron is: in-sync', () => {
    expect(classifyBaseline({ stored: sha(BRON), headContent: BRON })).toBe('in-sync')
  })

  it('herkent een baseline die op rauwe CRLF-bytes is gegenereerd als representatie-artefact', () => {
    expect(classifyBaseline({ stored: sha(BRON_CRLF), headContent: BRON })).toBe('crlf-artefact')
  })

  it('noemt een baseline die bij geen van beide representaties past: drift', () => {
    expect(classifyBaseline({ stored: sha('iets heel anders\n'), headContent: BRON })).toBe('drift')
  })

  it('behandelt een ontbrekende of lege baseline als drift, niet als in-sync', () => {
    expect(classifyBaseline({ stored: '', headContent: BRON })).toBe('drift')
    expect(classifyBaseline({ stored: undefined, headContent: BRON })).toBe('drift')
  })

  it('behandelt een ontbrekende bron als drift — een baseline is dan niet te bevestigen', () => {
    expect(classifyBaseline({ stored: sha(BRON), headContent: null })).toBe('drift')
  })

  it('normaliseert de bron zelf ook, zodat een CRLF-checkout dezelfde uitkomst geeft', () => {
    // Draait het script op een boom waar de bron CRLF is, dan moet een LF-baseline
    // nog steeds in-sync heten: de checker normaliseert immers ook.
    expect(classifyBaseline({ stored: sha(BRON), headContent: BRON_CRLF })).toBe('in-sync')
  })
})
