import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor de ON-DEVICE briefing-redactie.
 *
 * Kern van het ontwerp — en dus van deze suite: ZEVEN LOSSE PLATTE-TEKST-CALLS
 * in plaats van één JSON-call. Daardoor is elke fout LOKAAL: een mislukt,
 * afgekapt of door de nummer-guard afgekeurd briefje kost precies dat ene
 * briefje en laat de rest staan. De guard zelf is elders getest
 * (lib/briefing/nummer-guard via redactie.test.ts); hier bewijzen we dat de
 * resolver 'm toepast en dat een afkeuring stil degradeert.
 */

const generate = vi.fn()
const loadModelSession = vi.fn()
const disposeSession = vi.fn()

vi.mock('./litert-runtime', () => ({
  loadModelSession: (...args: unknown[]) => loadModelSession(...args),
  disposeSession: (...args: unknown[]) => disposeSession(...args),
}))

import {
  buildLocalBriefingSystem,
  buildLocalEntryPrompt,
  buildLocalHeadlinePrompt,
  normalizeLocalText,
  redactBriefingLocally,
  LOCAL_HEADLINE_MAX_LENGTH,
  type LocalBriefingProgress,
} from './local-briefing-resolver'
import { LOCAL_BRIEFING_DNA } from './local-briefing-prompt'
import type { BriefingEntry } from '@/lib/types/briefing'

function entry(id: string, text: string): BriefingEntry {
  return { id, category: 'observation', text }
}

/**
 * Is dit de kopzin-call? Let op: de kopzin-prompt bevat álle brontesten, dus
 * discrimineren op een bedrag uit een briefje zou óók de kop matchen.
 */
function isKopzin(msgs: { content: string }[]): boolean {
  return msgs[1].content.startsWith('Schrijf één kopzin')
}

const TWEE: BriefingEntry[] = [
  entry('a', 'Je vermogen groeide met €1.234 deze maand.'),
  entry('b', 'Je spaarquote staat op 31%.'),
]

beforeEach(() => {
  vi.clearAllMocks()
  loadModelSession.mockResolvedValue({ generate })
  generate.mockResolvedValue('ok')
})

describe('promptassemblage', () => {
  it('systeemprompt is de DNA-stem, met de directives eronder', () => {
    expect(buildLocalBriefingSystem()).toBe(LOCAL_BRIEFING_DNA)
    const met = buildLocalBriefingSystem('== RICHTLIJNEN ==\n- Wees warm')
    expect(met.startsWith(LOCAL_BRIEFING_DNA)).toBe(true)
    expect(met).toContain('- Wees warm')
  })

  it('een leeg directives-blok voegt niets toe (geen lege kop in de prompt)', () => {
    expect(buildLocalBriefingSystem('   ')).toBe(LOCAL_BRIEFING_DNA)
  })

  it('de briefje-opdracht somt de letterlijk te bewaren tekenreeksen op', () => {
    const p = buildLocalEntryPrompt(TWEE[0])
    expect(p).toContain('Je vermogen groeide met €1.234 deze maand.')
    // Dit is de goedkoopste verdediging tegen "€1.234" → "1234 euro": de guard
    // meet exact op deze tekenreeksen.
    expect(p).toContain('1.234')
    expect(p).toMatch(/letterlijk in je antwoord/i)
  })

  it('zonder getallen in de bron blijft die regel weg', () => {
    const p = buildLocalEntryPrompt(entry('c', 'Je hebt je eerste doel behaald.'))
    expect(p).not.toMatch(/letterlijk in je antwoord/i)
  })

  it('de kopzin-opdracht toont alle briefjes', () => {
    const p = buildLocalHeadlinePrompt(TWEE)
    expect(p).toContain('Je vermogen groeide met €1.234 deze maand.')
    expect(p).toContain('Je spaarquote staat op 31%.')
  })
})

describe('normalizeLocalText — de bekende lokale faalmodi', () => {
  it('strippt een <think>-preamble', () => {
    expect(normalizeLocalText('<think>even denken</think>De tekst.')).toBe('De tekst.')
  })

  it('strippt een markdown-fence', () => {
    expect(normalizeLocalText('```\nDe tekst.\n```')).toBe('De tekst.')
  })

  it('strippt omringende aanhalingstekens en vouwt witruimte samen', () => {
    expect(normalizeLocalText('  "De   tekst."  ')).toBe('De tekst.')
  })

  it('strippt een beleefde aanloop', () => {
    expect(normalizeLocalText('Hier is de herschreven tekst:\nDe tekst.')).toBe('De tekst.')
  })

  it('laat een gewone zin mét dubbele punt intact', () => {
    expect(normalizeLocalText('Mooi nieuws: je vermogen groeide.')).toBe(
      'Mooi nieuws: je vermogen groeide.',
    )
  })

  it('lege/ontbrekende invoer → lege string', () => {
    expect(normalizeLocalText(null)).toBe('')
    expect(normalizeLocalText('   ')).toBe('')
  })
})

describe('redactBriefingLocally — zeven losse calls', () => {
  it('doet één call per briefje plus één voor de kopzin', async () => {
    generate.mockResolvedValue('Een nette zin zonder getallen.')
    await redactBriefingLocally(TWEE)
    expect(generate).toHaveBeenCalledTimes(3) // 2 briefjes + 1 kop
  })

  it('neemt een herschrijving over die alle bron-getallen letterlijk bevat', async () => {
    generate.mockImplementation((msgs: { content: string }[]) => {
      if (isKopzin(msgs)) return Promise.resolve('Een rustige week.')
      const user = msgs[1].content
      if (user.includes('€1.234')) return Promise.resolve('Er kwam €1.234 bij deze maand.')
      return Promise.resolve('Je spaarquote staat op 31%. Mooi.')
    })
    const res = await redactBriefingLocally(TWEE)
    expect(res.texts).toEqual([
      { id: 'a', text: 'Er kwam €1.234 bij deze maand.' },
      { id: 'b', text: 'Je spaarquote staat op 31%. Mooi.' },
    ])
    expect(res.headline).toBe('Een rustige week.')
    expect(res.totaal).toBe(2)
    expect(res.fouten).toBe(0)
  })

  it('keurt één briefje af zonder de rest mee te slepen (fout blijft lokaal)', async () => {
    generate.mockImplementation((msgs: { content: string }[]) => {
      if (isKopzin(msgs)) return Promise.resolve('Een rustige week.')
      const user = msgs[1].content
      // Het klassieke 2B-gedrag: "€1.234" beleefd genormaliseerd → guard weigert.
      if (user.includes('€1.234')) return Promise.resolve('Er kwam 1234 euro bij.')
      return Promise.resolve('Je spaarquote staat op 31%. Mooi.')
    })
    const res = await redactBriefingLocally(TWEE)
    expect(res.texts).toEqual([{ id: 'b', text: 'Je spaarquote staat op 31%. Mooi.' }])
    // Afkeuring is géén fout: het originele briefje blijft gewoon staan.
    expect(res.fouten).toBe(0)
  })

  it('weigert een verzonnen getal', async () => {
    generate.mockResolvedValue('Er kwam €1.234 bij, een rendement van 9,9%.')
    const res = await redactBriefingLocally([TWEE[0]])
    expect(res.texts).toEqual([])
  })

  it('herstelt na een runtime-fout: dispose + één retry', async () => {
    let calls = 0
    generate.mockImplementation(() => {
      calls++
      if (calls === 1) return Promise.reject(new Error('device lost'))
      return Promise.resolve('Er kwam €1.234 bij deze maand.')
    })
    const res = await redactBriefingLocally([TWEE[0]])
    expect(disposeSession).toHaveBeenCalledTimes(1)
    expect(res.texts).toEqual([{ id: 'a', text: 'Er kwam €1.234 bij deze maand.' }])
    expect(res.fouten).toBe(0)
  })

  it('faalt een briefje definitief, dan telt het als fout en gaat de rest door', async () => {
    generate.mockImplementation((msgs: { content: string }[]) => {
      if (isKopzin(msgs)) return Promise.resolve('Een rustige week.')
      if (msgs[1].content.includes('€1.234')) return Promise.reject(new Error('stuk'))
      return Promise.resolve('Je spaarquote staat op 31%.')
    })
    const res = await redactBriefingLocally(TWEE)
    expect(res.fouten).toBe(1)
    expect(res.texts).toEqual([{ id: 'b', text: 'Je spaarquote staat op 31%.' }])
    expect(res.headline).toBe('Een rustige week.')
  })

  it('een mislukte kopzin laat de briefjes ongemoeid', async () => {
    generate.mockImplementation((msgs: { content: string }[]) =>
      isKopzin(msgs)
        ? Promise.reject(new Error('stuk'))
        : Promise.resolve('Je spaarquote staat op 31%.'),
    )
    const res = await redactBriefingLocally([TWEE[1]])
    expect(res.headline).toBeNull()
    expect(res.texts).toHaveLength(1)
  })

  it('een te lange kopzin wordt niet meegestuurd', async () => {
    generate.mockImplementation((msgs: { content: string }[]) =>
      Promise.resolve(
        isKopzin(msgs) ? 'x'.repeat(LOCAL_HEADLINE_MAX_LENGTH + 1) : 'Je spaarquote staat op 31%.',
      ),
    )
    const res = await redactBriefingLocally([TWEE[1]])
    expect(res.headline).toBeNull()
  })

  it('werpt wanneer het model niet geladen kan worden (eerlijke melding i.p.v. "0 van 6")', async () => {
    loadModelSession.mockRejectedValue(new Error('geen WebGPU'))
    await expect(redactBriefingLocally(TWEE)).rejects.toThrow('geen WebGPU')
    expect(generate).not.toHaveBeenCalled()
  })

  it('lege invoer doet geen enkele call', async () => {
    const res = await redactBriefingLocally([])
    expect(loadModelSession).not.toHaveBeenCalled()
    expect(res).toEqual({ headline: null, texts: [], totaal: 0, fouten: 0 })
  })

  it('meldt voortgang per fase, inclusief de trage eerste modelload', async () => {
    const fasen: LocalBriefingProgress[] = []
    await redactBriefingLocally(TWEE, { onProgress: (p) => fasen.push(p) })
    expect(fasen[0]).toEqual({ fase: 'model-laden', gedaan: 0, van: 1 })
    expect(fasen.some((p) => p.fase === 'briefjes')).toBe(true)
    expect(fasen.at(-1)).toEqual({ fase: 'kopzin', gedaan: 1, van: 1 })
  })

  it('geeft het directives-blok door als systeemprompt van elke call', async () => {
    await redactBriefingLocally([TWEE[0]], { directivesBlock: '== RICHTLIJNEN ==\n- Vier winst' })
    for (const call of generate.mock.calls) {
      expect(call[0][0].role).toBe('system')
      expect(call[0][0].content).toContain('- Vier winst')
    }
  })
})
