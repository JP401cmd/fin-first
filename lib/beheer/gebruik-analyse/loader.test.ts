import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { STANDAARD_WAARDESTROMEN } from '@/lib/waardestromen'
import { bouwRpcConfig, laadGebruikAnalyse, naarViewModel, parseIntern, parsePeriode } from './loader'
import type { GebruikAnalyseRuw } from './schema'

const STROMEN = STANDAARD_WAARDESTROMEN.stromen

function ruw(overschrijf: Partial<GebruikAnalyseRuw> = {}): GebruikAnalyseRuw {
  const weken = ['2026-W37', '2026-W38']
  return {
    k: 5,
    venster_dagen: 90,
    band: { van_dagen_geleden: 30, tot_dagen_geleden: 89 },
    intern: false,
    gemeten_sinds_week: '2026-W38',
    modules_gemeten_sinds_week: '2026-W38',
    kerncijfers: { segment_totaal: 22, laatst_actief: [
        { wanneer: 'vandaag', gebruikers: 0 },
        { wanneer: '1_6', gebruikers: 0 },
        { wanneer: '7_29', gebruikers: 6 },
        { wanneer: '30_89', gebruikers: 6 },
        { wanneer: '90_plus', gebruikers: 5 },
        { wanneer: 'nooit', gebruikers: 5 },
      ], actief_venster: 6, nieuw_venster: 0 },
    weektrend: weken.map((week) => ({ week, actief: null, nieuw: 0 })),
    stromen: STROMEN.map((s) => ({ id: s.id, gebruikers: null, weken: weken.map((week) => ({ week, actief: null })) })),
    dominant: {
      totaal: 6,
      verdeling: [...STROMEN.map((s) => ({ stroom: s.id, gebruikers: s.id === 'toekomst' ? 5 : 0 })), { stroom: null, gebruikers: null }],
    },
    overlap: { totaal: 6, verdeling: [0, 1, 2, 3, 4, 5].map((a) => ({ aantal_stromen: a, gebruikers: a === 1 ? 5 : a === 2 ? null : 0 })) },
    ritme: STROMEN.map((s) => ({
      id: s.id,
      ritme_dagen: s.id === 'toekomst' || s.id === 'fin' ? null : 7,
      geschikt: 8,
      terug: s.id === 'toekomst' || s.id === 'fin' ? null : 5,
      niet_terug: s.id === 'toekomst' || s.id === 'fin' ? null : null,
      mediaan_dagen: 6.5,
      gaten_gebruikers: s.id === 'budget' ? null : 5,
    })),
    samen: { modules: [{ module: 'toekomst', gebruikers: 5 }], paren: [{ a: 'overzicht', b: 'toekomst', gebruikers: null }] },
    cohorten: [
      {
        maand: '2026-08', aangemeld: 9, onboarding_afgerond: 6, dekking: 'geen', gemeten: 0,
        eerste_dag: 0, tweede_dag: 0, week2_5_noemer: 0, week2_5: 0, maand2_noemer: 0, maand2: 0,
      },
    ],
    eerste_ervaring: {
      totaal: 22,
      onboarding_afgerond: 9,
      rondleiding: [
        { uitkomst: 'voltooid', gebruikers: null },
        { uitkomst: 'overgeslagen', gebruikers: null },
        { uitkomst: 'onderbroken', gebruikers: 0 },
        { uitkomst: 'tegoed', gebruikers: null },
        { uitkomst: 'geen', gebruikers: 17 },
      ],
      gids: [
        { stand: 'niet_gestart', gebruikers: 15 },
        { stand: 'afgesloten', gebruikers: null },
        { stand: '0_stappen', gebruikers: 6 },
        { stand: '1_3_stappen', gebruikers: 0 },
        { stand: '4_plus_stappen', gebruikers: 0 },
      ],
      uitgesteld: [{ veld: 'income', gebruikers: null }],
      briefing_mail_aan: null,
      checkin_minstens_een: null,
      home_screen: [{ waarde: 'overzicht', gebruikers: 22 }],
      display_mode: [{ waarde: 'simple', gebruikers: 17 }, { waarde: 'full', gebruikers: 5 }],
    },
    ...overschrijf,
  }
}

function service(rpc: { data?: unknown; error?: { code: string; message: string } | null }, configValue: unknown = null) {
  // De doorstroom-RPC staat in deze tests "nog niet uitgerold"; de analyse-RPC krijgt `rpc`.
  const rpcFn = vi.fn((naam: string) =>
    Promise.resolve(
      naam === 'admin_gebruik_doorstroom'
        ? { data: null, error: { code: 'PGRST202', message: 'x' } }
        : { data: rpc.data ?? null, error: rpc.error ?? null },
    ),
  )
  const maybeSingle = vi.fn().mockResolvedValue({ data: configValue == null ? null : { value: configValue }, error: null })
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }))
  return { client: { rpc: rpcFn, from } as unknown as SupabaseClient, rpcFn }
}

describe('filters', () => {
  it('periode valt terug op band 30 bij onzin', () => {
    expect(parsePeriode('30')).toBe(30)
    expect(parsePeriode(['365'])).toBe(365)
    expect(parsePeriode('7')).toBe(30)
    expect(parsePeriode(undefined)).toBe(30)
  })
  it('intern alleen met een expliciete 1/true', () => {
    expect(parseIntern('1')).toBe(true)
    expect(parseIntern('ja')).toBe(false)
    expect(parseIntern(undefined)).toBe(false)
  })
})

describe('bouwRpcConfig', () => {
  it('stuurt ids, modules en ritme — geen namen', () => {
    const cfg = bouwRpcConfig(STROMEN)
    expect(cfg.dominant_min_dagen).toBe(3)
    expect(cfg.stromen.map((s) => [s.id, s.ritme_dagen])).toEqual([
      ['vermogen', 30],
      ['budget', 7],
      ['toekomst', null],
      ['grip', 7],
      ['fin', null],
    ])
    expect(JSON.stringify(cfg)).not.toContain('naam')
  })
})

describe('naarViewModel', () => {
  it('verdeling met kleine cellen: alle niet-nul cellen verborgen, nullen en totaal zichtbaar', () => {
    const vm = naarViewModel(ruw(), STROMEN)
    expect(vm.eersteErvaring.rondleiding.verdeling.map((r) => r.gebruikers.soort)).toEqual([
      'verborgen',
      'verborgen',
      'waarde',
      'verborgen',
      'verborgen',
    ])
    expect(vm.eersteErvaring.rondleiding.totaal).toEqual({ soort: 'waarde', n: 22 })
  })

  it('R1 (eindreview): met een zichtbare zuster-verdeling blijft het totaal publiek en toch niets exact', () => {
    // Segment 6, rondleiding [0, 0, 0, <5, 5], homescherm [6] volledig zichtbaar.
    const r = ruw()
    r.kerncijfers.segment_totaal = 6
    r.eerste_ervaring.totaal = 6
    r.eerste_ervaring.rondleiding = [
      { uitkomst: 'voltooid', gebruikers: 0 },
      { uitkomst: 'overgeslagen', gebruikers: 0 },
      { uitkomst: 'onderbroken', gebruikers: 0 },
      { uitkomst: 'tegoed', gebruikers: null },
      { uitkomst: 'geen', gebruikers: 5 },
    ]
    r.eerste_ervaring.home_screen = [{ waarde: 'overzicht', gebruikers: 6 }]
    const vm = naarViewModel(r, STROMEN)
    expect(vm.kerncijfers.segmentTotaal).toEqual({ soort: 'waarde', n: 6 })
    expect(vm.eersteErvaring.homeScreen.verdeling[0].gebruikers).toEqual({ soort: 'waarde', n: 6 })
    // 6 = tegoed + geen, met één van beide klein → (1,5) (2,4) (3,3) (4,2) (5,1): geen cel exact.
    expect(vm.eersteErvaring.rondleiding.verdeling.map((x) => x.gebruikers.soort)).toEqual([
      'waarde',
      'waarde',
      'waarde',
      'verborgen',
      'verborgen',
    ])
  })

  it('aanmeldingen per week vormen een verdeling van "nieuw in de periode"', () => {
    const r = ruw({
      kerncijfers: { segment_totaal: 22, laatst_actief: [
        { wanneer: 'vandaag', gebruikers: 0 },
        { wanneer: '1_6', gebruikers: 0 },
        { wanneer: '7_29', gebruikers: 6 },
        { wanneer: '30_89', gebruikers: 6 },
        { wanneer: '90_plus', gebruikers: 5 },
        { wanneer: 'nooit', gebruikers: 5 },
      ], actief_venster: 6, nieuw_venster: 9 },
      weektrend: [
        { week: '2026-W37', actief: null, nieuw: null },
        { week: '2026-W38', actief: null, nieuw: 7 },
      ],
    })
    const vm = naarViewModel(r, STROMEN)
    expect(vm.weektrend.map((w) => w.nieuw.soort)).toEqual(['verborgen', 'verborgen'])
    expect(vm.kerncijfers.nieuwVenster).toEqual({ soort: 'waarde', n: 9 })
  })

  it('cohortrij "eerder" (maand null) telt mee in de verdeling van het segmenttotaal', () => {
    const r = ruw()
    r.cohorten = [
      { ...r.cohorten[0], maand: null, aangemeld: null, onboarding_afgerond: 0 },
      { ...r.cohorten[0], maand: '2026-09', aangemeld: 20, onboarding_afgerond: 9 },
    ]
    const vm = naarViewModel(r, STROMEN)
    expect(vm.cohorten.map((h) => [h.maand, h.aangemeld.soort])).toEqual([
      [null, 'verborgen'],
      ['2026-09', 'verborgen'],
    ])
    // onboarding [0, 9] van 9: geen kleine cel → zichtbaar.
    expect(vm.cohorten.map((h) => h.onboardingAfgerond)).toEqual([
      { soort: 'waarde', n: 0 },
      { soort: 'waarde', n: 9 },
    ])
  })

  it('🟡2 complement: segment 22 met onboarding 18 → "4 zonder" zou exact zijn, dus 18 gaat dicht en de cohortkolom mee', () => {
    const r = ruw()
    r.eerste_ervaring.onboarding_afgerond = 18
    r.cohorten = [
      { ...r.cohorten[0], maand: null, aangemeld: 10, onboarding_afgerond: 9 },
      { ...r.cohorten[0], maand: '2026-09', aangemeld: 12, onboarding_afgerond: 9 },
    ]
    const vm = naarViewModel(r, STROMEN)
    expect(vm.eersteErvaring.onboardingAfgerond.soort).toBe('verborgen')
    // [9, 9] van 18 heeft zelf geen kleine cel, maar het totaal moest dicht → de som mag hem niet teruggeven.
    expect(vm.cohorten.map((h) => h.onboardingAfgerond.soort)).toEqual(['verborgen', 'verborgen'])
  })

  it('🟡2 complement: actief in de periode 20 van 22 → dicht, en overlap + Sankey sluiten mee', () => {
    const r = ruw({
      kerncijfers: { segment_totaal: 22, laatst_actief: [
        { wanneer: 'vandaag', gebruikers: 0 },
        { wanneer: '1_6', gebruikers: 0 },
        { wanneer: '7_29', gebruikers: 6 },
        { wanneer: '30_89', gebruikers: 6 },
        { wanneer: '90_plus', gebruikers: 5 },
        { wanneer: 'nooit', gebruikers: 5 },
      ], actief_venster: 20, nieuw_venster: 0 },
      overlap: { totaal: 20, verdeling: [0, 1, 2, 3, 4, 5].map((a) => ({ aantal_stromen: a, gebruikers: a === 1 ? 20 : 0 })) },
    })
    const sankey = {
      status: 'ok' as const,
      data: {
        dagenVerdeling: { totaal: { soort: 'waarde' as const, n: 20 }, verdeling: [{ aantal: 1, gebruikers: { soort: 'waarde' as const, n: 20 } }] },
        stappen: [{ stap: 1, totaal: { soort: 'waarde' as const, n: 20 }, knopen: [{ knoop: 'toekomst', gebruikers: { soort: 'waarde' as const, n: 20 } }] }],
        overgangen: [{ vanStap: 1, zichtbaar: true, cellen: [{ van: 'toekomst', naar: '_stopt', gebruikers: { soort: 'waarde' as const, n: 20 } }] }],
      },
    }
    const vm = naarViewModel(r, STROMEN, sankey)
    expect(vm.kerncijfers.actiefVenster.soort).toBe('verborgen')
    expect(vm.overlap.totaal.soort).toBe('verborgen')
    expect(vm.overlap.verdeling.find((o) => o.aantalStromen === 1)?.gebruikers.soort).toBe('verborgen')
    expect(vm.sankey.status === 'ok' && vm.sankey.data.stappen[0].totaal.soort).toBe('verborgen')
    expect(vm.sankey.status === 'ok' && vm.sankey.data.overgangen[0]).toEqual({ vanStap: 1, zichtbaar: false, cellen: [] })
  })

  it('🟡2 complement in de trechter: tweede dag 13 naast eerste dag 15 → "precies één dag" = 2, dus dicht', () => {
    const r = ruw()
    r.cohorten = [{ ...r.cohorten[0], maand: '2026-09', dekking: 'volledig', aangemeld: 22, gemeten: 20, eerste_dag: 15, tweede_dag: 13 }]
    const vm = naarViewModel(r, STROMEN)
    expect(vm.cohorten[0].eersteDag).toEqual({ soort: 'waarde', n: 15 }) // complement 5 ≥ k
    expect(vm.cohorten[0].tweedeDag.soort).toBe('verborgen') // 13 van 20 is prima, maar 15 − 13 = 2
    expect(vm.cohorten[0].gemeten.soort).toBe('verborgen') // 22 − 20 = 2 niet gemeten
  })

  it('🟡3 banden: laatst actief is een verdeling van het segment; een kleine groep sluit de recente som overal', () => {
    const r = ruw({ venster_dagen: 30, band: { van_dagen_geleden: 0, tot_dagen_geleden: 29 } })
    r.kerncijfers.segment_totaal = 22
    r.kerncijfers.actief_venster = 9
    r.kerncijfers.laatst_actief = [
      { wanneer: 'vandaag', gebruikers: null },
      { wanneer: '1_6', gebruikers: 5 },
      { wanneer: '7_29', gebruikers: 0 },
      { wanneer: '30_89', gebruikers: 6 },
      { wanneer: '90_plus', gebruikers: 7 },
      { wanneer: 'nooit', gebruikers: 0 },
    ]
    const vm = naarViewModel(r, STROMEN)
    expect(vm.band.label).toBe('Laatste 30 dagen')
    expect(vm.kerncijfers.laatstActief.verdeling.map((x) => x.gebruikers.soort)).toEqual([
      'verborgen',
      'verborgen',
      'waarde',
      'verborgen',
      'verborgen',
      'waarde',
    ])
    // actief in band 30 = vandaag + 1–6 + 7–29 → mag de verborgen som niet teruggeven.
    expect(vm.kerncijfers.actiefVenster.soort).toBe('verborgen')
    expect(vm.dominant.totaal.soort).toBe('verborgen')
  })

  it('🟡3 banden: band 30–89 met zichtbare laatst-actief-cel en een complement ≥ k blijft zichtbaar', () => {
    const r = ruw()
    r.kerncijfers.actief_venster = 12
    r.kerncijfers.laatst_actief = [
      { wanneer: 'vandaag', gebruikers: 0 },
      { wanneer: '1_6', gebruikers: 5 },
      { wanneer: '7_29', gebruikers: 0 },
      { wanneer: '30_89', gebruikers: 6 },
      { wanneer: '90_plus', gebruikers: 11 },
      { wanneer: 'nooit', gebruikers: 0 },
    ]
    const vm = naarViewModel(r, STROMEN)
    expect(vm.band.label).toBe('30–89 dagen geleden')
    expect(vm.kerncijfers.actiefVenster).toEqual({ soort: 'waarde', n: 12 })
  })

  it('security 🟡2: band 90 — "laatst actief 30–89" 5 naast "actief in band" 7 → 2 terugkeerders exact, dus actief dicht', () => {
    const r = ruw()
    r.kerncijfers.actief_venster = 7
    r.kerncijfers.laatst_actief = [
      { wanneer: 'vandaag', gebruikers: 0 },
      { wanneer: '1_6', gebruikers: 0 },
      { wanneer: '7_29', gebruikers: 6 },
      { wanneer: '30_89', gebruikers: 5 },
      { wanneer: '90_plus', gebruikers: 6 },
      { wanneer: 'nooit', gebruikers: 5 },
    ]
    const vm = naarViewModel(r, STROMEN)
    expect(vm.kerncijfers.laatstActief.verdeling.find((x) => x.wanneer === '30_89')?.gebruikers).toEqual({ soort: 'waarde', n: 5 })
    expect(vm.kerncijfers.actiefVenster.soort).toBe('verborgen')
    expect(vm.overlap.totaal.soort).toBe('verborgen') // cascade
  })

  it('security 🟡1: ritme-rij dicht als "geschikt" een klein complement heeft binnen de stroomgebruikers', () => {
    const r = ruw()
    // Vermogen: 10 gebruikers in de band, 8 geschikt → 2 met alleen recente dagen.
    r.stromen = r.stromen.map((s) => (s.id === 'vermogen' ? { ...s, gebruikers: 10 } : s))
    r.ritme = r.ritme.map((x) =>
      x.id === 'vermogen' ? { ...x, geschikt: 8, terug: 5, niet_terug: 3, gaten_gebruikers: 6, mediaan_dagen: 9 } : x,
    )
    const vm = naarViewModel(r, STROMEN)
    const v = vm.ritme.find((x) => x.id === 'vermogen')!
    expect(v.geschikt.soort).toBe('verborgen')
    expect(v.gatenGebruikers).toBeNull()
    expect(v.aandeelTerug).toBeNull()
    expect(v.mediaanDagen).toBe(9) // de mediaan verraadt geen aantal
  })

  it('🟡3 banden: een RPC-uitvoer met een andere band dan gevraagd → fout', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = service({ data: ruw({ band: { van_dagen_geleden: 0, tot_dagen_geleden: 29 } }) })
    expect((await laadGebruikAnalyse(client, { dagen: 90, intern: false })).status).toBe('fout')
    spy.mockRestore()
  })

  it('🟡1: gaten-aantal onder k (ook 0) wordt niet getoond', () => {
    const r = ruw()
    r.ritme[0].gaten_gebruikers = 0
    const vm = naarViewModel(r, STROMEN)
    expect(vm.ritme[0].gatenGebruikers).toBeNull()
    expect(vm.ritme[0].mediaanDagen).toBeNull()
  })

  it('stroom zonder ritme: geen terug/niet-terug en geen percentage; mediaan weg als < k gebruikers bijdragen', () => {
    const vm = naarViewModel(ruw(), STROMEN)
    const toekomst = vm.ritme.find((r) => r.id === 'toekomst')!
    expect(toekomst.terug).toBeNull()
    expect(toekomst.aandeelTerug).toBeNull()
    expect(toekomst.mediaanDagen).toBe(6.5)
    expect(vm.ritme.find((r) => r.id === 'budget')!.mediaanDagen).toBeNull()
  })

  it('ritmepaar [5, <5] van 8: beide verborgen, geen percentage', () => {
    const vm = naarViewModel(ruw(), STROMEN)
    const vermogen = vm.ritme.find((r) => r.id === 'vermogen')!
    expect(vermogen.terug?.soort).toBe('verborgen')
    expect(vermogen.nietTerug?.soort).toBe('verborgen')
    expect(vermogen.aandeelTerug).toBeNull()
  })

  it('kleur volgt de positie in de indeling', () => {
    const vm = naarViewModel(ruw(), STROMEN)
    expect(vm.stromen.map((s) => [s.id, s.kleurIndex])).toEqual([
      ['vermogen', 0],
      ['budget', 1],
      ['toekomst', 2],
      ['grip', 3],
      ['fin', 4],
    ])
  })

  it('het view-model bevat geen uuid, e-mailadres of losse datum', () => {
    const json = JSON.stringify(naarViewModel(ruw(), STROMEN))
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    expect(json).not.toMatch(/@/)
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})

describe('laadGebruikAnalyse', () => {
  it('ontbrekende functie → niet-uitgerold, nooit nullen', async () => {
    const { client } = service({ error: { code: 'PGRST202', message: 'x' } })
    expect(await laadGebruikAnalyse(client, { dagen: 30, intern: false })).toEqual({
      status: 'niet-uitgerold',
      vensterDagen: 30,
      intern: false,
    })
  })

  it('andere DB-fout → fout', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = service({ error: { code: '42501', message: 'nee' } })
    expect((await laadGebruikAnalyse(client, { dagen: 90, intern: true })).status).toBe('fout')
    spy.mockRestore()
  })

  it('andere k dan de TypeScript-laag → fout (de twee constanten controleren elkaar)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = service({ data: ruw({ k: 3 }) })
    expect((await laadGebruikAnalyse(client, { dagen: 90, intern: false })).status).toBe('fout')
    spy.mockRestore()
  })

  it('een vorm met een datum of id erin → fout', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = ruw() as unknown as Record<string, unknown>
    ;(r.weektrend as Array<Record<string, unknown>>)[0].week = '2026-09-15'
    const { client } = service({ data: r })
    expect((await laadGebruikAnalyse(client, { dagen: 90, intern: false })).status).toBe('fout')
    const r2 = ruw() as unknown as Record<string, unknown>
    ;(r2.kerncijfers as Record<string, unknown>).user_id = 'abc'
    const { client: c2 } = service({ data: r2 })
    expect((await laadGebruikAnalyse(c2, { dagen: 90, intern: false })).status).toBe('fout')
    spy.mockRestore()
  })

  it('bouwt op de opgeslagen indeling en geeft die door aan de RPC', async () => {
    const eigen = { stromen: [{ id: 'alles', naam: 'Alles', modules: ['overzicht', 'toekomst'] }] }
    const data = ruw({
      venster_dagen: 365,
      band: { van_dagen_geleden: 90, tot_dagen_geleden: 364 },
      stromen: [{ id: 'alles', gebruikers: 5, weken: [] }],
      ritme: [{ id: 'alles', ritme_dagen: null, geschikt: 5, terug: null, niet_terug: null, mediaan_dagen: null, gaten_gebruikers: 0 }],
      dominant: { totaal: 5, verdeling: [{ stroom: 'alles', gebruikers: 5 }, { stroom: null, gebruikers: 0 }] },
    })
    const { client, rpcFn } = service({ data }, JSON.stringify(eigen))
    const res = await laadGebruikAnalyse(client, { dagen: 365, intern: false })
    expect(rpcFn).toHaveBeenCalledWith('admin_gebruik_analyse', {
      p_dagen: 365,
      p_intern: false,
      p_config: { stromen: [{ id: 'alles', modules: ['overzicht', 'toekomst'], ritme_dagen: null }], dominant_min_dagen: 3 },
    })
    expect(res.status).toBe('ok')
    // Ontbrekende doorstroomfunctie laat de rest van de pagina staan.
    expect(res.status === 'ok' && res.data.sankey).toEqual({ status: 'niet-uitgerold' })
  })

  it('stroom-ids uit de database wijken af van de config → fout', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = service({ data: ruw() }, JSON.stringify({ stromen: [{ id: 'x', naam: 'X', modules: ['fin'] }] }))
    expect((await laadGebruikAnalyse(client, { dagen: 90, intern: false })).status).toBe('fout')
    spy.mockRestore()
  })
})
