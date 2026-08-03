import { describe, it, expect } from 'vitest'
import { componentBody, stripComments } from './page-source'

/**
 * De helpers uit page-source.ts dragen de asserties van de streaming-bron-tests
 * (/overzicht/cashflow en /overzicht/cashflow/vaste-lasten). Hun eigenschappen
 * staan hier vastgepind, één keer, i.p.v. per consument — want een helper die
 * stil te ruim wordt, maakt geen enkele test rood.
 */

describe('componentBody — scoping van de await-telling', () => {
  it('telt alleen binnen de functie, niet in wat erachter staat', () => {
    // Zonder accolade-matching (slice tot EOF) zou dit er twee zien en zou een
    // "precies één await"-assertie stil verwateren zodra iemand een helper
    // onder de component zet.
    const synthetic = [
      'export default async function OverzichtCashflowPage() {',
      '  const perspective = await getServerPerspective()',
      '  return <div>{perspective}</div>',
      '}',
      '',
      'async function helperDieErAchterStaat(supabase) {',
      '  return await loadDashboardData(supabase)',
      '}',
    ].join('\n')

    const body = componentBody(synthetic, 'export default async function OverzichtCashflowPage')

    expect(body.match(/\bawait\b/g) ?? []).toHaveLength(1)
    expect(body).not.toContain('loadDashboardData')
  })

  it('telt geneste blokken mee tot de matchende sluit-accolade', () => {
    const synthetic = [
      'export default async function Page() {',
      '  if (true) { const x = await a() }',
      '  return null',
      '}',
      'const na = await b()',
    ].join('\n')

    const body = componentBody(synthetic, 'export default async function Page')

    expect(body).toContain('await a()')
    expect(body).not.toContain('await b()')
  })

  it('faalt luid wanneer de declaratie niet bestaat', () => {
    expect(() => componentBody('const x = 1', 'export default async function Weg')).toThrow()
  })
})

describe('stripComments', () => {
  it('haalt blok- en regelcommentaar weg zodat proza niet meetelt', () => {
    const src = ['/* await loadDashboardData() in proza */', 'const a = 1 ', '// await ook hier'].join('\n')

    const stripped = stripComments(src)

    expect(stripped).not.toContain('loadDashboardData')
    expect(stripped.match(/\bawait\b/g) ?? []).toHaveLength(0)
    expect(stripped).toContain('const a = 1')
  })
})
