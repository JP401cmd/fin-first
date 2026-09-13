import { describe, it, expect } from 'vitest'
import {
  buildTipTerugNotifications,
  tipTerugLookbackStart,
  retractStaleTipTerug,
  type TipTerugRow,
} from './tip-terug'

const TODAY = '2026-09-13'

const row = (over: Partial<TipTerugRow> = {}): TipTerugRow => ({
  id: 'rec-1',
  title: 'Zeg je tweede streamingdienst op',
  status: 'postponed',
  postponed_until: '2026-09-12',
  ...over,
})

describe('buildTipTerugNotifications', () => {
  it('maakt één bericht per tip waarvan de termijn verstreken is', () => {
    const out = buildTipTerugNotifications(
      [row({ id: 'a' }), row({ id: 'b', postponed_until: '2026-09-01' })],
      TODAY,
    )
    expect(out.map((n) => n.id)).toEqual([
      'postponed_tip_a_2026-09-12',
      'postponed_tip_b_2026-09-01',
    ])
    expect(out[0]).toMatchObject({
      type: 'postponed_tip',
      actionUrl: '/overzicht/tips',
    })
    expect(out[0].description).toContain('Zeg je tweede streamingdienst op')
    expect(out[0].aiContext).toContain('Zeg je tweede streamingdienst op')
  })

  it('telt de termijn als verstreken op de dag zelf (datum-semantiek, gelijk aan de tips-pagina)', () => {
    expect(buildTipTerugNotifications([row({ postponed_until: TODAY })], TODAY)).toHaveLength(1)
  })

  it('negeert tips waarvan de wachttijd nog loopt', () => {
    expect(buildTipTerugNotifications([row({ postponed_until: '2026-09-14' })], TODAY)).toEqual([])
  })

  it('negeert andere statussen en een ontbrekende termijn', () => {
    expect(
      buildTipTerugNotifications(
        [
          row({ id: 'p', status: 'pending' }),
          row({ id: 'a', status: 'accepted' }),
          row({ id: 'n', postponed_until: null }),
        ],
        TODAY,
      ),
    ).toEqual([])
  })

  it('geeft een nieuw bericht wanneer dezelfde tip opnieuw uitgesteld en verlopen is', () => {
    const eerste = buildTipTerugNotifications([row({ postponed_until: '2026-08-20' })], TODAY)
    const tweede = buildTipTerugNotifications([row({ postponed_until: '2026-09-12' })], TODAY)
    expect(eerste[0].id).not.toBe(tweede[0].id)
  })

  it('slaat termijnen over die langer dan 30 dagen geleden verliepen', () => {
    expect(tipTerugLookbackStart(TODAY)).toBe('2026-08-14')
    const out = buildTipTerugNotifications(
      [row({ id: 'grens', postponed_until: '2026-08-14' }), row({ id: 'oud', postponed_until: '2026-08-13' })],
      TODAY,
    )
    expect(out.map((n) => n.id)).toEqual(['postponed_tip_grens_2026-08-14'])
  })

  it('kapt niet af: elke geldige tip telt mee (de set is ook de geldigheidsset voor intrekken)', () => {
    const rows = Array.from({ length: 15 }, (_, i) => row({ id: `r${i}` }))
    expect(buildTipTerugNotifications(rows, TODAY)).toHaveLength(15)
  })

  it('valt terug op een neutrale titel als de tip er geen heeft', () => {
    const [n] = buildTipTerugNotifications([row({ title: '  ' })], TODAY)
    expect(n.description).toContain('Een tip van Fin')
  })
})

describe('retractStaleTipTerug', () => {
  const bericht = (id: string, type = 'postponed_tip') => ({ id, type })

  it('trekt een bericht in zodra de tip geaccepteerd of genegeerd is', () => {
    const geldig = new Set(
      buildTipTerugNotifications([row({ id: 'b', postponed_until: '2026-09-10' })], TODAY).map((n) => n.id),
    )
    const historie = [bericht('postponed_tip_a_2026-09-12'), bericht('postponed_tip_b_2026-09-10')]
    expect(retractStaleTipTerug(historie, geldig).map((n) => n.id)).toEqual(['postponed_tip_b_2026-09-10'])
  })

  it('trekt het oude bericht in als de tip opnieuw is uitgesteld met een termijn die nog loopt', () => {
    const geldig = new Set(
      buildTipTerugNotifications([row({ id: 'a', postponed_until: '2026-09-27' })], TODAY).map((n) => n.id),
    )
    expect(retractStaleTipTerug([bericht('postponed_tip_a_2026-09-12')], geldig)).toEqual([])
  })

  it('laat andere meldingstypen staan, ook met een lege geldigheidsset', () => {
    const historie = [bericht('milestone_x', 'milestone'), bericht('budget_y', 'budget')]
    expect(retractStaleTipTerug(historie, new Set())).toEqual(historie)
  })
})
