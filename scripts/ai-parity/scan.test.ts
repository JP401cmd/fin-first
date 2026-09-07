import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { carryDriftSince, classifyBaseline, driftGraceVerdict } from './scan.mjs'

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

/**
 * De harde ondergrens (eigenaarsbesluit 7 sep 2026, variant B).
 *
 * `parity:check` was tot dan een pure staleness-poort: `inSync` zit ín de
 * vergeleken signatuur, dus een gecommitte parity.json met `inSync: false` liet
 * de pre-push-hook gewoon slagen. Er was app-breed geen enkele poort die op
 * ECHTE prompt-drift faalde. Deze twee functies vormen samen die poort — de
 * stempel die de termijn bewaart, en de weging die hem afdwingt.
 */
type Bron = { file: string; inSync: boolean; driftSince?: string }
type Artefact = { id: string; label?: string; sources: Bron[] }

const DAG = 86_400_000
const NU = new Date('2026-09-21T12:00:00.000Z')
const dagenGeleden = (n: number) => new Date(NU.getTime() - n * DAG).toISOString()

const rapport = (sources: Bron[]) => ({
  artefacts: [{ id: 'briefing', label: 'Lokale briefing-DNA', sources }],
})

describe('carryDriftSince', () => {
  it('stempelt nieuwe drift met het huidige moment', () => {
    const artefacts: Artefact[] = [{ id: 'chat', sources: [{ file: 'a.ts', inSync: false }] }]
    carryDriftSince(artefacts, null, '2026-09-07T10:00:00.000Z')
    expect(artefacts[0].sources[0].driftSince).toBe('2026-09-07T10:00:00.000Z')
  })

  it('draagt een bestaande stempel over — anders zet elke scan de klok terug', () => {
    // Dit is de kern: zonder overdragen blijft drift eeuwig "0 dagen oud" en is
    // de ondergrens decoratie in plaats van een poort.
    const committed = rapport([{ file: 'a.ts', inSync: false, driftSince: '2026-08-01T00:00:00.000Z' }])
    const artefacts: Artefact[] = [{ id: 'briefing', sources: [{ file: 'a.ts', inSync: false }] }]
    carryDriftSince(artefacts, committed, '2026-09-21T00:00:00.000Z')
    expect(artefacts[0].sources[0].driftSince).toBe('2026-08-01T00:00:00.000Z')
  })

  it('laat de stempel vallen zodra de bron weer in sync is', () => {
    const committed = rapport([{ file: 'a.ts', inSync: false, driftSince: '2026-08-01T00:00:00.000Z' }])
    const artefacts: Artefact[] = [
      { id: 'briefing', sources: [{ file: 'a.ts', inSync: true, driftSince: 'oud' }] },
    ]
    carryDriftSince(artefacts, committed, '2026-09-21T00:00:00.000Z')
    expect(artefacts[0].sources[0].driftSince).toBeUndefined()
  })

  it('matcht per artefact én bestand, niet alleen op bestandsnaam', () => {
    // base.ts staat onder meerdere artefacten; een stempel van het ene artefact
    // mag de termijn van het andere niet overnemen.
    const committed = {
      artefacts: [
        {
          id: 'briefing',
          sources: [{ file: 'lib/ai/dna/base.ts', inSync: false, driftSince: '2026-08-01T00:00:00.000Z' }],
        },
      ],
    }
    const artefacts: Artefact[] = [
      { id: 'nieuws', sources: [{ file: 'lib/ai/dna/base.ts', inSync: false }] },
    ]
    carryDriftSince(artefacts, committed, '2026-09-21T00:00:00.000Z')
    expect(artefacts[0].sources[0].driftSince).toBe('2026-09-21T00:00:00.000Z')
  })
})

describe('driftGraceVerdict', () => {
  it('waarschuwt over verse drift zonder te blokkeren', () => {
    const v = driftGraceVerdict({ report: rapport([{ file: 'a.ts', inSync: false, driftSince: dagenGeleden(3) }]), now: NU })
    expect(v.warn.map((d) => d.file)).toEqual(['a.ts'])
    expect(v.block).toEqual([])
  })

  it('BLOKKEERT drift die langer dan de coulance staat — de poort bijt', () => {
    const v = driftGraceVerdict({ report: rapport([{ file: 'a.ts', inSync: false, driftSince: dagenGeleden(20) }]), now: NU })
    expect(v.block.map((d) => d.file)).toEqual(['a.ts'])
    expect(v.block[0].dagen).toBe(20)
    expect(v.warn).toEqual([])
  })

  it('blokkeert precies één dag ná de coulance, niet erop', () => {
    const op = driftGraceVerdict({ report: rapport([{ file: 'a.ts', inSync: false, driftSince: dagenGeleden(14) }]), now: NU })
    expect(op.block).toEqual([])
    const na = driftGraceVerdict({ report: rapport([{ file: 'a.ts', inSync: false, driftSince: dagenGeleden(15) }]), now: NU })
    expect(na.block).toHaveLength(1)
  })

  it('negeert bronnen die in sync zijn', () => {
    const v = driftGraceVerdict({ report: rapport([{ file: 'a.ts', inSync: true }]), now: NU })
    expect(v.warn).toEqual([])
    expect(v.block).toEqual([])
  })

  it('waarschuwt maar blokkeert niet bij een ontbrekende of onleesbare stempel', () => {
    // Een push blokkeren op een veld dat de pusher niet kan zetten is een poort
    // zonder uitgang; de eerstvolgende scan stempelt hem alsnog.
    const leeg = driftGraceVerdict({ report: rapport([{ file: 'a.ts', inSync: false }]), now: NU })
    expect(leeg.warn).toHaveLength(1)
    expect(leeg.block).toEqual([])
    const kapot = driftGraceVerdict({ report: rapport([{ file: 'a.ts', inSync: false, driftSince: 'geen datum' }]), now: NU })
    expect(kapot.block).toEqual([])
  })

  it('degradeert netjes op een ontbrekend of vormloos rapport', () => {
    expect(driftGraceVerdict({ report: null, now: NU }).block).toEqual([])
    expect(driftGraceVerdict({ report: { artefacts: 'nee' }, now: NU }).warn).toEqual([])
    expect(driftGraceVerdict().block).toEqual([])
  })
})
