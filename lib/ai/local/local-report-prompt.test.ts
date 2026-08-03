import { describe, it, expect } from 'vitest'
import {
  LOCAL_REPORT_DNA,
  LOCAL_REPORT_MAX_CHARS,
  buildLocalReportSystemPrompt,
  renderReportFigures,
  reportFigureAllowlist,
  resolveLocalReportIntro,
  shapeReportIntro,
  type ReportIntroFigures,
} from './local-report-prompt'

const figures: ReportIntroFigures = {
  periodeNaam: 'Maart 2026',
  nettoVermogen: 85000,
  groeiPct: 3.4,
  totaalInkomen: 4200,
  totaalUitgaven: 2900,
  totaalGespaard: 1300,
  spaarquotePct: 31,
  firePct: 12.5,
  actiesVoltooid: 2,
  vrijheidsdagenGewonnen: 14.5,
}

describe('LOCAL_REPORT_DNA', () => {
  it('draagt de verbatim cijfer-regel uit de chat-DNA', () => {
    expect(LOCAL_REPORT_DNA).toContain(
      'Verzin NOOIT zelf cijfers, percentages of rekenregels',
    )
  })

  it('bevat geen chat-specifieke vormregels (die slopen de redactionele vorm)', () => {
    expect(LOCAL_REPORT_DNA).not.toContain('max 120 woorden')
    expect(LOCAL_REPORT_DNA).not.toContain('**vet**')
  })

  it('blijft binnen het gecondenseerde budget (~500 tokens, chars/4)', () => {
    expect(Math.ceil(LOCAL_REPORT_DNA.length / 4)).toBeLessThanOrEqual(500)
  })
})

describe('renderReportFigures', () => {
  it('zet de kerncijfers in NL-notatie neer', () => {
    const block = renderReportFigures(figures)
    expect(block).toContain('FINANCIEEL OVERZICHT')
    expect(block).toContain('€85.000')
    expect(block).toContain('+3,4%')
    expect(block).toContain('spaarquote: 31%')
    expect(block).toContain('vrijheidsdagen gewonnen: 14,5')
  })

  it('benoemt ontbrekende cijfers als onbekend i.p.v. ze weg te laten', () => {
    const block = renderReportFigures({ ...figures, nettoVermogen: null, firePct: null })
    expect(block).toContain('Netto vermogen aan het eind: onbekend')
    expect(block).toContain('(FIRE): onbekend')
  })

  it('systeemprompt = DNA + overzicht', () => {
    const prompt = buildLocalReportSystemPrompt(figures)
    expect(prompt.startsWith(LOCAL_REPORT_DNA)).toBe(true)
    expect(prompt).toContain('FINANCIEEL OVERZICHT')
  })
})

describe('shapeReportIntro', () => {
  it('strip <think>-preambles en markdown-fences', () => {
    const raw = '<think>even nadenken</think>```\nJe vermogen groeide gestaag.\n```'
    expect(shapeReportIntro(raw)).toBe('Je vermogen groeide gestaag.')
  })

  it('knipt een leidende meta-openingsregel weg', () => {
    const raw = 'Natuurlijk! Hier is de inleiding:\nJe kocht deze maand tijd vrij.'
    expect(shapeReportIntro(raw)).toBe('Je kocht deze maand tijd vrij.')
  })

  it('strip kopjes, bullets en vet-markering', () => {
    const raw = '## Inleiding\n- **Je vermogen** groeide.\n- Je hield vol.'
    expect(shapeReportIntro(raw)).toBe('Je vermogen groeide. Je hield vol.')
  })

  it('kapt af op vier zinnen', () => {
    const raw = 'Een. Twee. Drie. Vier. Vijf. Zes.'
    expect(shapeReportIntro(raw)).toBe('Een. Twee. Drie. Vier.')
  })

  it('kapt hard af op de tekenlimiet', () => {
    const long = `${'A'.repeat(700)}.`
    const out = shapeReportIntro(long)
    expect(out).not.toBeNull()
    expect(out!.length).toBeLessThanOrEqual(LOCAL_REPORT_MAX_CHARS + 1)
  })

  it('splitst niet op een duizendpunt binnen een bedrag', () => {
    const raw = 'Je vermogen staat op €85.000 en dat is winst.'
    expect(shapeReportIntro(raw)).toBe('Je vermogen staat op €85.000 en dat is winst.')
  })

  it('levert null bij lege uitvoer', () => {
    expect(shapeReportIntro('   \n  ')).toBeNull()
  })
})

describe('resolveLocalReportIntro — cijfer-guardrail', () => {
  it('laat een inleiding met correcte cijfers door', () => {
    const raw = 'Je vermogen staat op €85.000, een plus van 3,4%. Je kocht 14,5 dagen vrijheid terug.'
    const res = resolveLocalReportIntro(raw, figures)
    expect(res.reason).toBe('ok')
    expect(res.intro).toContain('€85.000')
  })

  it('VERWERPT een inleiding met een verzonnen bedrag', () => {
    const raw = 'Je vermogen groeide naar €120.000 deze maand — knap gedaan.'
    const res = resolveLocalReportIntro(raw, figures)
    expect(res.intro).toBeNull()
    expect(res.reason).toBe('cijfer-mismatch')
    expect(res.offending).toEqual([120000])
  })

  it('VERWERPT een zelf doorgerekend percentage', () => {
    // 1300/4200 = 30,95% → het model rekent zelf en komt op 41%: niet meegegeven.
    const raw = 'Je spaarde 41% van je inkomen weg.'
    const res = resolveLocalReportIntro(raw, figures)
    expect(res.intro).toBeNull()
    expect(res.reason).toBe('cijfer-mismatch')
  })

  it('laat cijferloze proza door', () => {
    const res = resolveLocalReportIntro('Je zette een stevige stap richting vrijheid.', figures)
    expect(res.reason).toBe('ok')
  })

  it('allowlist bevat alleen de meegegeven, bekende cijfers', () => {
    expect(reportFigureAllowlist({ ...figures, nettoVermogen: null })).not.toContain(85000)
    expect(reportFigureAllowlist(figures)).toContain(85000)
  })
})
