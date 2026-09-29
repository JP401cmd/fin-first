import { describe, expect, it } from 'vitest'
import type { ReleaseNote } from '@/lib/release-notes'
import { EFFECT_VENSTER_DAGEN, bouwIngrepen, markeringenPerDag, meetEffect, type AuditRij, type Ingreep } from './ingrepen'
import { telPerDag } from './reeksen'

const NU = new Date('2026-09-29T10:00:00Z')

function release(version: string, date: string, title = 'Titel'): ReleaseNote {
  return { version, date, title, sections: [] }
}

function actie(id: string, action: string, created_at: string, target_label: string | null = null): AuditRij {
  return { id, action, target_label, created_at }
}

describe('bouwIngrepen', () => {
  const releases = [release('0.92.19', '2026-09-29'), release('0.92.12', '2026-09-27'), release('0.90.0', '2026-09-19')]
  const audit = [
    actie('1', 'config.update', '2026-09-28T09:00:00Z', 'platform_status'),
    actie('2', 'user.activity', '2026-09-28T10:00:00Z', 'Jan Jansen'),
    actie('3', 'subscription.update', '2026-09-27T12:00:00Z', 'Jan Jansen'),
    actie('4', 'news-feedback.read', '2026-09-27T13:00:00Z'),
  ]

  it('inzage is geen ingreep', () => {
    const ingrepen = bouwIngrepen(releases, audit, '2026-09-01')
    expect(ingrepen.map((i) => i.id)).not.toContain('actie-2')
    expect(ingrepen.map((i) => i.id)).not.toContain('actie-4')
    expect(ingrepen.filter((i) => i.soort === 'beheeractie')).toHaveLength(2)
  })

  it('toont het doel alleen als het een instelling is, nooit een naam', () => {
    const ingrepen = bouwIngrepen(releases, audit, '2026-09-01')
    expect(ingrepen.find((i) => i.id === 'actie-1')?.toelichting).toBe('platform_status')
    expect(ingrepen.find((i) => i.id === 'actie-3')?.toelichting).toBeNull()
    expect(JSON.stringify(ingrepen)).not.toContain('Jan Jansen')
  })

  it('toont de versie in de weergavevorm en linkt een actie naar de gefilterde audit-trail', () => {
    const ingrepen = bouwIngrepen(releases, audit, '2026-09-01')
    expect(ingrepen.find((i) => i.id === 'release-0.92.19')?.titel).toBe('Versie 0.92.019')
    expect(ingrepen.find((i) => i.id === 'actie-1')?.href).toBe('/beheer/audit?actie=config.update')
  })

  it('neemt de grensdag mee en laat alles daarvoor weg', () => {
    const ingrepen = bouwIngrepen(releases, audit, '2026-09-27')
    expect(ingrepen.map((i) => i.id)).toEqual(['release-0.92.19', 'actie-1', 'release-0.92.12', 'actie-3'])
  })

  it('sorteert nieuwste eerst; binnen één dag de release boven de beheeracties', () => {
    const zelfdeDag = bouwIngrepen(
      [release('0.92.12', '2026-09-27')],
      [actie('a', 'config.update', '2026-09-27T08:00:00Z'), actie('b', 'config.update', '2026-09-27T16:00:00Z')],
      '2026-09-01',
    )
    expect(zelfdeDag.map((i) => i.id)).toEqual(['release-0.92.12', 'actie-b', 'actie-a'])
  })

  it('een beheeractie vlak na middernacht hoort bij de Amsterdamse dag', () => {
    const [i] = bouwIngrepen([], [actie('n', 'config.update', '2026-09-27T22:30:00Z')], '2026-09-01')
    expect(i.dag).toBe('2026-09-28')
  })

  it('een actie met een onleesbaar tijdstempel valt weg', () => {
    expect(bouwIngrepen([], [actie('x', 'config.update', 'kapot')], '2026-09-01')).toEqual([])
  })
})

describe('markeringenPerDag', () => {
  it('bundelt per dag en houdt releases en beheeracties uit elkaar', () => {
    const ingrepen = bouwIngrepen(
      [release('0.92.12', '2026-09-27'), release('0.92.13', '2026-09-27')],
      [actie('a', 'config.update', '2026-09-27T08:00:00Z'), actie('b', 'config.update', '2026-09-25T08:00:00Z')],
      '2026-09-01',
    )
    expect(markeringenPerDag(ingrepen)).toEqual([
      { dag: '2026-09-25', releases: [], beheeracties: 1 },
      { dag: '2026-09-27', releases: ['Versie 0.92.013', 'Versie 0.92.012'], beheeracties: 1 },
    ])
  })
})

describe('meetEffect', () => {
  const ingreep = (dag: string, id = `i-${dag}`): Ingreep => ({
    id,
    soort: 'release',
    dag,
    moment: null,
    titel: 'Versie',
    toelichting: null,
    href: '/beheer/releases',
  })

  // Eén voorval per dag in de week vóór 15 sep, twee per dag in de week erna.
  const momenten = [
    ...['08', '09', '10', '11', '12', '13', '14'].map((d) => `2026-09-${d}T09:00:00Z`),
    // De dag van de ingreep zelf: mag nergens meetellen.
    ...Array.from({ length: 50 }, () => '2026-09-15T09:00:00Z'),
    ...['16', '17', '18', '19', '20', '21', '22'].flatMap((d) => [`2026-09-${d}T09:00:00Z`, `2026-09-${d}T10:00:00Z`]),
  ]
  const reeks = telPerDag(momenten, { nu: NU, dagen: 40 })

  it('de standaardperiode is een week', () => {
    expect(EFFECT_VENSTER_DAGEN).toBe(7)
  })

  it('vergelijkt de week ervoor met de week erna; de dag van de ingreep telt nergens mee', () => {
    const e = meetEffect(ingreep('2026-09-15'), reeks, [], { nu: NU })
    expect(e.voor).toEqual({ van: '2026-09-08', tot: '2026-09-14', aantal: 7 })
    expect(e.na).toEqual({ van: '2026-09-16', tot: '2026-09-22', aantal: 14 })
    expect(e.verschil).toBe(7)
    expect(e.vergelijkbaar).toBe(true)
    expect(e.dagenNaVoorbij).toBe(7)
  })

  it('een periode erna die nog loopt heeft geen totaal en geen verschil', () => {
    // Ingreep op 25 sep: 26, 27 en 28 sep zijn voorbij; vandaag (29) loopt nog.
    const e = meetEffect(ingreep('2026-09-25'), reeks, [], { nu: NU })
    expect(e.dagenNaVoorbij).toBe(3)
    expect(e.na.aantal).toBeNull()
    expect(e.verschil).toBeNull()
    expect(e.vergelijkbaar).toBe(false)
    expect(e.voor.aantal).not.toBeNull()
  })

  it('de periode erna is af zodra haar laatste dag gisteren was', () => {
    const e = meetEffect(ingreep('2026-09-21'), reeks, [], { nu: NU })
    expect(e.na.tot).toBe('2026-09-28')
    expect(e.dagenNaVoorbij).toBe(7)
    expect(e.vergelijkbaar).toBe(true)
  })

  it('eindigt de periode erna op vandaag, dan is zij nog niet af', () => {
    const e = meetEffect(ingreep('2026-09-22'), reeks, [], { nu: NU })
    expect(e.na.tot).toBe('2026-09-29')
    expect(e.dagenNaVoorbij).toBe(6)
    expect(e.vergelijkbaar).toBe(false)
  })

  it('een ingreep van vandaag heeft nog geen enkele dag erna', () => {
    const e = meetEffect(ingreep('2026-09-29'), reeks, [], { nu: NU })
    expect(e.dagenNaVoorbij).toBe(0)
    expect(e.vergelijkbaar).toBe(false)
  })

  it('een niet-gemeten dag in de week ervoor maakt de vergelijking onmogelijk', () => {
    const afgekapt = telPerDag(momenten, { nu: NU, dagen: 40, afgekaptVanaf: '2026-09-10T09:00:00Z' })
    const e = meetEffect(ingreep('2026-09-15'), afgekapt, [], { nu: NU })
    expect(e.voor.aantal).toBeNull()
    expect(e.na.aantal).toBe(14)
    expect(e.vergelijkbaar).toBe(false)
    expect(e.verschil).toBeNull()
  })

  it('een week buiten de reeks is onbekend, geen nul', () => {
    const kort = telPerDag(momenten, { nu: NU, dagen: 10 })
    expect(meetEffect(ingreep('2026-09-15'), kort, [], { nu: NU }).voor.aantal).toBeNull()
  })

  it('telt andere ingrepen binnen beide weken en op dezelfde dag als samenloop', () => {
    const alle = [
      ingreep('2026-09-15', 'zelf'),
      ingreep('2026-09-15', 'zelfde-dag'),
      ingreep('2026-09-08', 'eerste-dag-ervoor'),
      ingreep('2026-09-22', 'laatste-dag-erna'),
      ingreep('2026-09-07', 'net-ervoor'),
      ingreep('2026-09-23', 'net-erna'),
    ]
    expect(meetEffect(alle[0], reeks, alle, { nu: NU }).samenloop).toBe(3)
  })

  it('zonder andere ingrepen is de samenloop nul', () => {
    const zelf = ingreep('2026-09-15')
    expect(meetEffect(zelf, reeks, [zelf], { nu: NU }).samenloop).toBe(0)
  })
})
