import { describe, it, expect } from 'vitest'
import {
  clampImpactScore,
  parseLocalNewsProse,
  parseLocalNewsScore,
} from './local-news-parse'

describe('clampImpactScore', () => {
  it('klemt op 1-5 en rondt af', () => {
    expect(clampImpactScore(0)).toBe(1)
    expect(clampImpactScore(7)).toBe(5)
    expect(clampImpactScore(4.5)).toBe(5)
    expect(clampImpactScore(3.2)).toBe(3)
  })

  it('valt terug op het midden bij onzin', () => {
    expect(clampImpactScore(null)).toBe(3)
    expect(clampImpactScore(Number.NaN)).toBe(3)
  })
})

describe('parseLocalNewsScore', () => {
  it('leest de canonieke één-regel-uitvoer', () => {
    const score = parseLocalNewsScore(
      'RELEVANT: ja · TYPE: direct · SCORE: 4 · RICHTING: negatief',
    )
    expect(score).toEqual({
      relevant: true,
      impactType: 'direct',
      impactScore: 4,
      impactDirection: 'negatief',
    })
  })

  it('leest dezelfde velden ook op losse regels', () => {
    // Een klein model kiest regelmatig zelf voor regels i.p.v. het ·-scheidingsteken.
    const score = parseLocalNewsScore(
      'RELEVANT: nee\nTYPE: relevant\nSCORE: 2\nRICHTING: neutraal',
    )
    expect(score?.relevant).toBe(false)
    expect(score?.impactScore).toBe(2)
  })

  it('negeert een <think>-preamble en losse ruis', () => {
    const score = parseLocalNewsScore(
      '<think>even nadenken</think>\nRELEVANT: ja · TYPE: relevant · SCORE: 3 · RICHTING: positief',
    )
    expect(score?.relevant).toBe(true)
    expect(score?.impactDirection).toBe('positief')
  })

  // ── FAIL-CLOSED ──────────────────────────────────────────────────────────
  it('WIJST DE SKELET-ECHO AF in plaats van "ja" te lezen', () => {
    // Regressie: een model dat de opdrachtregel letterlijk teruggeeft leverde
    // relevantRaw = "ja|nee", en /^ja\b/ matchte daarop ('|' is geen woordteken).
    // Elk artikel werd dan relevant verklaard — fail-OPEN op precies het veld dat
    // de hele selectie draagt.
    const score = parseLocalNewsScore(
      'RELEVANT: ja|nee · TYPE: direct|relevant · SCORE: 1-5 · RICHTING: positief|negatief|neutraal',
    )
    expect(score).toBeNull()
  })

  it('geeft null bij lege of onbegrepen uitvoer', () => {
    expect(parseLocalNewsScore('')).toBeNull()
    expect(parseLocalNewsScore('Ik denk dat dit wel interessant is.')).toBeNull()
  })

  it('degradeert naar "relevant" wanneer TYPE ontbreekt of onduidelijk is', () => {
    // "direct" belooft een concrete impact; die claim mag niet uit ruis ontstaan.
    const score = parseLocalNewsScore('RELEVANT: ja · SCORE: 4 · RICHTING: positief')
    expect(score?.impactType).toBe('relevant')
  })

  it('valt terug op score 3 wanneer SCORE ontbreekt', () => {
    const score = parseLocalNewsScore('RELEVANT: ja · TYPE: direct · RICHTING: positief')
    expect(score?.impactScore).toBe(3)
  })
})

describe('parseLocalNewsProse', () => {
  const OUTPUT = [
    'KOP: Rente stijgt naar 3,25 procent',
    'SAMENVATTING: De ECB verhoogt de rente. Spaarrekeningen volgen met een kleine vertraging.',
    'IMPACT: Met jouw spaarpot merk je dit als eerste.',
  ].join('\n')

  it('leest de drie velden', () => {
    const prose = parseLocalNewsProse(OUTPUT)
    expect(prose?.headline).toBe('Rente stijgt naar 3,25 procent')
    expect(prose?.summary).toContain('De ECB verhoogt de rente.')
    expect(prose?.personalImpact).toBe('Met jouw spaarpot merk je dit als eerste.')
  })

  it('leest de drie velden ook op ÉÉN regel', () => {
    // Zonder dit slikte de KOP de rest van de regel op — labels en al — en
    // landde die brij als hero-kop bovenaan de pagina.
    const prose = parseLocalNewsProse(
      'KOP: Rente omhoog SAMENVATTING: De ECB verhoogt de rente. IMPACT: Raakt je spaargeld.',
    )
    expect(prose?.headline).toBe('Rente omhoog')
    expect(prose?.summary).toBe('De ECB verhoogt de rente.')
    expect(prose?.personalImpact).toBe('Raakt je spaargeld.')
  })

  it('leest een samenvatting die over meerdere regels loopt', () => {
    const prose = parseLocalNewsProse(
      'KOP: Titel\nSAMENVATTING: Eerste zin.\nTweede zin op een nieuwe regel.\nIMPACT: Iets.',
    )
    expect(prose?.summary).toBe('Eerste zin. Tweede zin op een nieuwe regel.')
  })

  it('strips aanhalingstekens en markdown-nadruk', () => {
    const prose = parseLocalNewsProse('KOP: **Vette kop**\nSAMENVATTING: "Met quotes."\nIMPACT: Iets.')
    expect(prose?.headline).toBe('Vette kop')
    expect(prose?.summary).toBe('Met quotes.')
  })

  it('overleeft een ontbrekende IMPACT-regel (die mag vervallen)', () => {
    const prose = parseLocalNewsProse('KOP: Titel\nSAMENVATTING: Wat er gebeurt.')
    expect(prose?.personalImpact).toBeNull()
    expect(prose?.headline).toBe('Titel')
  })

  it('geeft null zonder kop of zonder samenvatting', () => {
    expect(parseLocalNewsProse('SAMENVATTING: Alleen dit.')).toBeNull()
    expect(parseLocalNewsProse('KOP: Alleen dit.')).toBeNull()
    expect(parseLocalNewsProse('')).toBeNull()
  })

  it('kapt buitensporig lange velden af', () => {
    const prose = parseLocalNewsProse(
      `KOP: ${'x'.repeat(500)}\nSAMENVATTING: ${'y'.repeat(900)}`,
    )
    expect(prose!.headline.length).toBeLessThanOrEqual(120)
    expect(prose!.summary.length).toBeLessThanOrEqual(400)
  })
})
