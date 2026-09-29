import { describe, expect, it } from 'vitest'
import { AI_HEALTH_FAILURE_THRESHOLD } from '@/lib/ai/ai-health'
import { JOB_LIST } from '@/lib/job-catalog'
import type { DashboardFeiten, KoppelingenFeit, TakenFeit } from './feiten'
import { TAAK_GEVOLG } from './feiten'
import {
  FIXTURE_NU,
  foutenFeit,
  foutsoort,
  gezondeFeiten,
  gezondeStanden,
  metStand,
  run,
  stand,
  voorval,
} from './fixture'
import {
  MAX_ONDERDELEN,
  bouwAandacht,
  mislukteMetingen,
  opsomming,
  sorteerAandacht,
  taakProbleem,
  vensterTekst,
  type AandachtItem,
} from './signalen'
import { bronOk } from './status'

const NU = new Date(FIXTURE_NU)

/** De uitkomst zoals de bereikbaarheidsmeting hem vastlegt (`summarizeProbes`). */
const MEETUITKOMST = {
  probed: 14,
  ok: 4,
  failed: 2,
  rateLimited: 0,
  failures: { kraken: { code: 'timeout' }, bitvavo: { code: 'http_error' } },
}

function takenVan(feiten: DashboardFeiten): TakenFeit {
  if (feiten.taken.soort !== 'ok') throw new Error('fixture zonder taken')
  return feiten.taken.data
}

function koppelingenVan(feiten: DashboardFeiten): KoppelingenFeit {
  if (feiten.koppelingen.soort !== 'ok') throw new Error('fixture zonder koppelingen')
  return feiten.koppelingen.data
}

function metTaken(deel: Partial<TakenFeit>): DashboardFeiten {
  const feiten = gezondeFeiten()
  return { ...feiten, taken: bronOk({ ...takenVan(feiten), ...deel }) }
}

const ids = (items: AandachtItem[]) => items.map((i) => i.id)
const item = (items: AandachtItem[], id: string) => {
  const gevonden = items.find((i) => i.id === id)
  if (!gevonden) throw new Error(`geen signaal ${id}; wel: ${ids(items).join(', ')}`)
  return gevonden
}

describe('bouwAandacht — een platform zonder afwijkingen', () => {
  it('geeft een lege lijst', () => {
    expect(bouwAandacht(gezondeFeiten())).toEqual([])
  })
})

describe('platform', () => {
  it('onderhoudsmodus aan is een signaal met iedereen als impact', () => {
    const feiten = gezondeFeiten()
    if (feiten.platform.soort !== 'ok') throw new Error()
    feiten.platform.data.status = {
      ...feiten.platform.data.status,
      maintenance: { enabled: true, message: 'Even geduld' },
    }
    const s = item(bouwAandacht(feiten), 'platform-onderhoud')
    expect(s.ernst).toBe('hoog')
    expect(s.impact.soort).toBe('iedereen')
    expect(s.sinds).toBe('2026-09-02T08:00:00.000Z')
  })

  it('een actieve aankondiging is geen signaal', () => {
    const feiten = gezondeFeiten()
    if (feiten.platform.soort !== 'ok') throw new Error()
    feiten.platform.data.status = {
      ...feiten.platform.data.status,
      announcement: { enabled: true, title: 'Nieuw', body: 'Tekst', level: 'info' },
    }
    expect(bouwAandacht(feiten)).toEqual([])
  })
})

describe('Fin & AI', () => {
  const aiSoort = foutsoort({ signature: 'a1a1a1a1a1a1a1a1', context: 'ai:chat', voorbeeld: 'refused: tegoed op' })
  const gewoneSoort = foutsoort({ signature: 'b2b2b2b2b2b2b2b2', context: 'client:render' })

  function metAi(status: DashboardFeiten['ai']['status'], failureCount: number): DashboardFeiten {
    return {
      ...gezondeFeiten(),
      ai: { status, sinceAt: '2026-09-28T08:00:00.000Z', failureCount, lastSuccessAt: '2026-09-27T08:00:00.000Z' },
      fouten: bronOk(
        foutenFeit(
          [aiSoort, gewoneSoort],
          [
            voorval(aiSoort.signature, '2026-09-28T08:00:00.000Z', 1, 'ai:chat'),
            voorval(gewoneSoort.signature, '2026-09-28T09:00:00.000Z', 2),
          ],
        ),
      ),
    }
  }

  it('storing is kritiek en staat bovenaan', () => {
    const items = bouwAandacht(metAi('storing', 3))
    expect(items[0].id).toBe('ai-gezondheid')
    expect(items[0].ernst).toBe('kritiek')
    expect(items[0].sinds).toBe('2026-09-28T08:00:00.000Z')
  })

  it('hapering is hoog', () => {
    expect(item(bouwAandacht(metAi('hapering', 2)), 'ai-gezondheid').ernst).toBe('hoog')
  })

  it('noemt de drempel waarop het signaal rust', () => {
    expect(item(bouwAandacht(metAi('storing', 2)), 'ai-gezondheid').grond).toContain(
      String(AI_HEALTH_FAILURE_THRESHOLD),
    )
  })

  it('één mislukte aanroep is nog geen patroon en geeft geen signaal', () => {
    expect(ids(bouwAandacht(metAi('attention', 1)))).not.toContain('ai-gezondheid')
  })

  it('bundelt: AI-foutsoorten staan onder de storing en niet nog eens bij de open foutsoorten', () => {
    const items = bouwAandacht(metAi('storing', 3))
    const ai = item(items, 'ai-gezondheid')
    expect(ai.onderdelen.join(' ')).toContain('tegoed op')
    expect(ai.samenloop).toContain('1 open foutsoort')

    const open = item(items, 'fouten-open')
    expect(open.titel).toBe('1 foutsoort staat open')
    expect(open.onderdelen.join(' ')).not.toContain('tegoed op')
  })

  it('zonder storing tellen AI-foutsoorten gewoon mee als open foutsoort', () => {
    const open = item(bouwAandacht(metAi('ok', 0)), 'fouten-open')
    expect(open.titel).toBe('2 foutsoorten staan open')
  })

  it('AI bewust uit: één signaal voor de schakelaar, geen tweede voor de storing die eruit volgt', () => {
    const feiten = metAi('storing', 5)
    if (feiten.platform.soort !== 'ok') throw new Error()
    feiten.platform.data.status = { ...feiten.platform.data.status, killSwitches: { ai: false } }
    const items = bouwAandacht(feiten)
    expect(ids(items)).toContain('platform-ai-uit')
    expect(ids(items)).not.toContain('ai-gezondheid')
    expect(item(items, 'platform-ai-uit').samenloop).toContain('vallen samen')
    // De AI-foutsoort blijft ook dan uit de lijst van open foutsoorten.
    expect(item(items, 'fouten-open').titel).toBe('1 foutsoort staat open')
  })

  it('AI bewust uit zonder storing: de open AI-foutsoort verdwijnt niet, hij staat onder de schakelaar', () => {
    // De bundeling haalt AI-foutsoorten uit "fouten-open". Zonder deze regel
    // stonden ze dan nergens meer in de lijst.
    for (const status of ['ok', 'attention'] as const) {
      const feiten = metAi(status, status === 'ok' ? 0 : 1)
      if (feiten.platform.soort !== 'ok') throw new Error()
      feiten.platform.data.status = { ...feiten.platform.data.status, killSwitches: { ai: false } }
      const items = bouwAandacht(feiten)
      const schakelaar = item(items, 'platform-ai-uit')
      expect(schakelaar.onderdelen.join(' ')).toContain('tegoed op')
      expect(schakelaar.samenloop).toContain('1 open AI-foutsoort valt onder deze regel')
      expect(schakelaar.acties.map((a) => a.label)).toContain('AI-foutmeldingen')
      expect(item(items, 'fouten-open').onderdelen.join(' ')).not.toContain('tegoed op')
    }
  })

  it('een taak die niet alles opleverde tijdens een AI-storing: eigen regel, met de samenloop erbij', () => {
    const feiten = metAi('storing', 3)
    const standen = metStand(gezondeStanden(), stand('news-ingest', 'ok', run('news-ingest', 'partial', FIXTURE_NU)))
    const items = bouwAandacht({ ...feiten, taken: bronOk({ ...takenVan(feiten), standen }) })
    const taak = item(items, 'taak-deels-news-ingest')
    expect(taak.samenloop).toContain('Valt samen met de AI-storing')
    // Een waarneming, geen oorzaak.
    expect(taak.samenloop).toContain('legt de taak niet vast')
    expect(ids(items)).toContain('ai-gezondheid')
  })

  it('zonder AI-storing draagt een deels geslaagde taak geen samenloop', () => {
    const standen = metStand(gezondeStanden(), stand('news-ingest', 'ok', run('news-ingest', 'partial', FIXTURE_NU)))
    expect(item(bouwAandacht(metTaken({ standen })), 'taak-deels-news-ingest').samenloop).toBeNull()
  })
})

describe('taakProbleem', () => {
  const goed = run('snapshots', 'success', '2026-09-28T02:00:00.000Z')

  it('achterstallig en nooit komen uit de actualiteit van de taak', () => {
    expect(taakProbleem(stand('snapshots', 'overdue', goed), NU)).toBe('achterstallig')
    expect(taakProbleem(stand('snapshots', 'never', null), NU)).toBe('nooit')
  })

  it('een actuele taak met een geslaagde laatste run heeft geen probleem', () => {
    expect(taakProbleem(stand('snapshots', 'ok', goed), NU)).toBeNull()
  })

  it('een leesfout is geen probleem van de taak', () => {
    expect(taakProbleem(stand('snapshots', 'unknown', null), NU)).toBeNull()
  })

  it('een mislukte laatste run binnen het venster is "mislukt"', () => {
    expect(taakProbleem(stand('retention', 'ok', run('retention', 'error', FIXTURE_NU)), NU)).toBe('mislukt')
  })

  it('partial en geslaagd-met-fouttekst zijn allebei "deels"', () => {
    expect(taakProbleem(stand('news-ingest', 'ok', run('news-ingest', 'partial', FIXTURE_NU)), NU)).toBe('deels')
    expect(
      taakProbleem(
        stand('holdings-prices', 'ok', run('holdings-prices', 'success', FIXTURE_NU, { error: 'deeltaak faalde' })),
        NU,
      ),
    ).toBe('deels')
  })

  it('een niet-bewaakte taak die faalde is ook "mislukt"', () => {
    expect(taakProbleem(stand('alerts-sweep', 'unmonitored', run('alerts-sweep', 'error', FIXTURE_NU)), NU)).toBe(
      'mislukt',
    )
  })
})

describe('taakProbleem — de bereikbaarheidsmeting is een meting, geen gewone taak', () => {
  const meting = (status: 'success' | 'error', wanneer: string, summary: unknown = MEETUITKOMST) =>
    run('integraties-health', status, wanneer, { summary })

  it('status error MET een meetuitkomst is geen gefaalde taak: dat telt onder Koppelingen', () => {
    expect(taakProbleem(stand('integraties-health', 'ok', meting('error', FIXTURE_NU)), NU)).toBeNull()
  })

  it('status error ZONDER meetuitkomst is wel een gefaalde taak: er is dan niets gemeten', () => {
    expect(taakProbleem(stand('integraties-health', 'ok', meting('error', FIXTURE_NU, null)), NU)).toBe('mislukt')
    expect(
      taakProbleem(stand('integraties-health', 'ok', meting('error', FIXTURE_NU, { iets: 'anders' })), NU),
    ).toBe('mislukt')
  })

  it('een storing die dagen duurt, maakt de meting niet achterstallig zolang ze elke dag draait', () => {
    // De taakbewaking noemt haar "overdue": de laatste GESLAAGDE uitvoering is
    // van drie dagen terug, want elke meting met een onbereikbare dienst eindigt
    // op error. De meting zelf is van vandaag.
    const s = stand('integraties-health', 'overdue', meting('error', FIXTURE_NU), '2026-09-26T18:57:00.000Z')
    expect(taakProbleem(s, NU)).toBeNull()
  })

  it('een meting die echt niet meer draait, loopt achter, wat haar laatste uitkomst ook was', () => {
    const oud = '2026-09-25T18:57:00.000Z'
    expect(taakProbleem(stand('integraties-health', 'overdue', meting('error', oud), null), NU)).toBe('achterstallig')
    expect(taakProbleem(stand('integraties-health', 'overdue', meting('success', oud)), NU)).toBe('achterstallig')
  })

  it('precies op de rand van het venster is de meting nog vers', () => {
    // Venster 23 uur plus 3 uur marge.
    const rand = new Date(NU.getTime() - 26 * 3_600_000).toISOString()
    const net_erover = new Date(NU.getTime() - 26 * 3_600_000 - 60_000).toISOString()
    expect(taakProbleem(stand('integraties-health', 'overdue', meting('error', rand), null), NU)).toBeNull()
    expect(taakProbleem(stand('integraties-health', 'overdue', meting('error', net_erover), null), NU)).toBe(
      'achterstallig',
    )
  })
})

describe('achtergrondtaken', () => {
  it('een achterstallige taak: hoog, met de laatste geslaagde uitvoering als begin', () => {
    const standen = metStand(
      gezondeStanden(),
      stand('snapshots', 'overdue', run('snapshots', 'success', '2026-07-31T07:08:51.000Z')),
    )
    const items = bouwAandacht(metTaken({ standen }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'taak-achterstallig-snapshots',
      ernst: 'hoog',
      titel: 'Maandsnapshots loopt achter',
      sinds: '2026-07-31T07:08:51.000Z',
      sindsLabel: 'laatste geslaagde uitvoering',
    })
    expect(items[0].impact).toEqual(TAAK_GEVOLG.snapshots)
    expect(items[0].grond).toContain('32 dagen')
    expect(items[0].acties[0].href).toBe('/beheer/jobs#taak-snapshots')
  })

  it('twee taken op hetzelfde cron-pad met hetzelfde probleem: één regel', () => {
    const oud = '2026-09-25T18:57:00.000Z'
    let standen = gezondeStanden()
    standen = metStand(standen, stand('holdings-prices', 'overdue', run('holdings-prices', 'success', oud)))
    standen = metStand(standen, stand('integraties-health', 'overdue', run('integraties-health', 'success', oud)))
    const items = bouwAandacht(metTaken({ standen }))
    expect(items).toHaveLength(1)
    expect(items[0].titel).toBe('Prijsverversing en Integraties liveness lopen achter')
    // De zwaarste impact van de gebundelde taken telt.
    expect(items[0].impact).toEqual(TAAK_GEVOLG['holdings-prices'])
    expect(items[0].acties).toHaveLength(2)
  })

  it('twee taken op hetzelfde pad met een VERSCHILLEND probleem blijven twee regels', () => {
    let standen = gezondeStanden()
    standen = metStand(
      standen,
      stand('krant-editie', 'overdue', run('krant-editie', 'success', '2026-09-01T06:00:00.000Z')),
    )
    standen = metStand(
      standen,
      stand('krant-weekmeting', 'ok', run('krant-weekmeting', 'partial', '2026-09-29T06:00:00.000Z')),
    )
    expect(ids(bouwAandacht(metTaken({ standen }))).sort()).toEqual([
      'taak-achterstallig-krant-editie',
      'taak-deels-krant-weekmeting',
    ])
  })

  it('een deels geslaagde taak noemt wat verloren ging', () => {
    const standen = metStand(
      gezondeStanden(),
      stand(
        'news-ingest',
        'ok',
        run('news-ingest', 'partial', '2026-09-29T05:25:00.000Z', {
          summary: { verlies: ['duiding: 4 artikelen niet geduid', 'categorisatie: geen model'] },
        }),
      ),
    )
    const [s] = bouwAandacht(metTaken({ standen }))
    expect(s.ernst).toBe('middel')
    expect(s.titel).toBe('Nieuws-ingest leverde niet alles op')
    expect(s.onderdelen).toEqual(['duiding: 4 artikelen niet geduid', 'categorisatie: geen model'])
    expect(s.acties.map((a) => a.href)).toContain('/beheer/nieuws')
  })

  it('een mislukte run toont zijn fouttekst, ingekort', () => {
    const standen = metStand(
      gezondeStanden(),
      stand('retention', 'ok', run('retention', 'error', '2026-09-29T04:22:00.000Z', { error: 'x'.repeat(400) })),
    )
    const [s] = bouwAandacht(metTaken({ standen }))
    expect(s.titel).toBe('AVG-bewaartermijnen: laatste uitvoering mislukt')
    expect(s.onderdelen[0]).toHaveLength(160)
  })

  it('zonder CRON_SECRET vallen alle stille taken onder die ene oorzaak', () => {
    let standen = gezondeStanden()
    standen = metStand(standen, stand('snapshots', 'overdue', run('snapshots', 'success', '2026-07-31T07:00:00.000Z')))
    standen = metStand(standen, stand('retention', 'never', null))
    standen = metStand(standen, stand('news-ingest', 'ok', run('news-ingest', 'partial', FIXTURE_NU)))
    const items = bouwAandacht(metTaken({ standen, cronSecret: false }))

    expect(ids(items)).toEqual(['taken-cron-secret', 'taak-deels-news-ingest'])
    const bundel = item(items, 'taken-cron-secret')
    expect(bundel.ernst).toBe('kritiek')
    expect(bundel.onderdelen).toEqual(['Maandsnapshots', 'AVG-bewaartermijnen'])
    expect(bundel.samenloop).toContain('2 stille taken')
  })

  it('zonder CRON_SECRET en zonder stille taken is er nog steeds één signaal', () => {
    const items = bouwAandacht(metTaken({ cronSecret: false }))
    expect(ids(items)).toEqual(['taken-cron-secret'])
    expect(items[0].impact.soort).toBe('onbekend')
  })

  it('een taak die wél liep en faalde, valt niet onder de ontbrekende CRON_SECRET', () => {
    // Achterstallig (geen geslaagde uitvoering binnen het venster), maar de
    // laatste uitvoering is van vandaag: de taak is aantoonbaar gestart.
    let standen = gezondeStanden()
    standen = metStand(
      standen,
      stand('news-ingest', 'overdue', run('news-ingest', 'error', FIXTURE_NU, { error: 'boom' }), '2026-09-20T05:25:00.000Z'),
    )
    standen = metStand(standen, stand('snapshots', 'overdue', run('snapshots', 'success', '2026-07-31T07:00:00.000Z')))
    const items = bouwAandacht(metTaken({ standen, cronSecret: false }))
    expect(ids(items).sort()).toEqual(['taak-achterstallig-news-ingest', 'taken-cron-secret'])
    expect(item(items, 'taken-cron-secret').onderdelen).toEqual(['Maandsnapshots'])
  })

  it('buiten productie zegt een ontbrekende CRON_SECRET niets: de taken staan er zelf', () => {
    const standen = metStand(
      gezondeStanden(),
      stand('snapshots', 'overdue', run('snapshots', 'success', '2026-07-31T07:00:00.000Z')),
    )
    for (const omgeving of ['development', 'preview'] as const) {
      const items = bouwAandacht({ ...metTaken({ standen, cronSecret: false }), omgeving })
      expect(ids(items)).toEqual(['taak-achterstallig-snapshots'])
    }
  })

  it('elke taak uit de catalogus heeft een benoemd gevolg', () => {
    for (const job of JOB_LIST) expect(TAAK_GEVOLG[job.key].toelichting.length).toBeGreaterThan(10)
  })
})

describe('foutmeldingen', () => {
  const terug = foutsoort({
    signature: 'c3c3c3c3c3c3c3c3',
    voorbeeld: 'Saldo kon niet laden',
    teruggekomen: true,
    teruggekomenSinds: '2026-09-27T09:00:00.000Z',
    recent: 2,
  })
  const nieuwA = foutsoort({
    signature: 'd4d4d4d4d4d4d4d4',
    voorbeeld: 'Onbekende categorie',
    eerstGezien: '2026-09-20T09:00:00.000Z',
    recent: 5,
  })
  const nieuwB = foutsoort({
    signature: 'e5e5e5e5e5e5e5e5',
    voorbeeld: 'Grafiek zonder data',
    eerstGezien: '2026-09-26T09:00:00.000Z',
    recent: 1,
  })
  const afgehandeld = foutsoort({ signature: 'f6f6f6f6f6f6f6f6', open: false })

  function metFouten(voorvallen = [
    voorval(terug.signature, '2026-09-27T09:00:00.000Z', 1),
    voorval(terug.signature, '2026-09-28T09:00:00.000Z', null),
    voorval(nieuwA.signature, '2026-09-28T09:00:00.000Z', 1),
    voorval(nieuwA.signature, '2026-09-28T10:00:00.000Z', 2),
    voorval(nieuwB.signature, '2026-09-10T09:00:00.000Z', 3),
  ]): DashboardFeiten {
    return {
      ...gezondeFeiten(),
      fouten: bronOk(foutenFeit([terug, nieuwA, nieuwB, afgehandeld], voorvallen)),
    }
  }

  it('scheidt teruggekomen soorten (hoog) van nooit beoordeelde (middel)', () => {
    const items = bouwAandacht(metFouten())
    expect(ids(items)).toEqual(['fouten-teruggekomen', 'fouten-open'])
    expect(item(items, 'fouten-teruggekomen').ernst).toBe('hoog')
    expect(item(items, 'fouten-open').ernst).toBe('middel')
    expect(item(items, 'fouten-open').titel).toBe('2 foutsoorten staan open')
  })

  it('een afgehandelde soort telt nergens mee', () => {
    const tekst = JSON.stringify(bouwAandacht(metFouten()))
    expect(tekst).not.toContain(afgehandeld.signature)
  })

  it('gebruikersimpact is een ondergrens zodra een voorval geen gebruiker draagt', () => {
    const s = item(bouwAandacht(metFouten()), 'fouten-teruggekomen')
    expect(s.impact).toMatchObject({ soort: 'aantal', aantal: 1, eenheid: 'gebruikers', ondergrens: true })
    expect(s.impact.toelichting).toContain('1 voorval draagt geen gebruiker')
  })

  it('telt een gebruiker één keer over alle soorten van het signaal, en alleen recente voorvallen', () => {
    // u1 en u2 recent op soort A; u3 op soort B is van 10 sep en valt buiten 7 dagen.
    const s = item(bouwAandacht(metFouten()), 'fouten-open')
    expect(s.impact).toMatchObject({ soort: 'aantal', aantal: 2, ondergrens: false })
  })

  it('alleen voorvallen zonder gebruiker: impact onbekend, geen nul gebruikers', () => {
    const s = item(
      bouwAandacht(metFouten([voorval(nieuwA.signature, '2026-09-28T09:00:00.000Z', null)])),
      'fouten-open',
    )
    expect(s.impact.soort).toBe('onbekend')
  })

  it('geen recente voorvallen: geen directe impact', () => {
    const s = item(
      bouwAandacht(metFouten([voorval(nieuwA.signature, '2026-08-01T09:00:00.000Z', 1)])),
      'fouten-open',
    )
    expect(s.impact.soort).toBe('geen-direct')
  })

  it('"sinds" is de oudste open soort resp. de eerste terugkeer', () => {
    const items = bouwAandacht(metFouten())
    expect(item(items, 'fouten-open').sinds).toBe('2026-09-20T09:00:00.000Z')
    expect(item(items, 'fouten-teruggekomen').sinds).toBe('2026-09-27T09:00:00.000Z')
  })

  it('zet de drukste soort bovenaan in de onderdelen', () => {
    expect(item(bouwAandacht(metFouten()), 'fouten-open').onderdelen[0]).toContain('Onbekende categorie')
  })

  it('één teruggekomen soort linkt rechtstreeks naar die soort', () => {
    expect(item(bouwAandacht(metFouten()), 'fouten-teruggekomen').acties[0].href).toBe(
      `/beheer/errors?soort=${terug.signature}`,
    )
  })

  it('meldt een afgekapt leesvenster als kanttekening, bij open en bij teruggekomen', () => {
    const feiten = metFouten()
    if (feiten.fouten.soort !== 'ok') throw new Error()
    feiten.fouten.data.afgekapt = true
    const items = bouwAandacht(feiten)
    expect(item(items, 'fouten-open').samenloop).toContain('1.000 regels')
    expect(item(items, 'fouten-teruggekomen').samenloop).toContain('1.000 regels')
  })

  it('een afgekapt venster dat de laatste 7 dagen WEL dekt, maakt de telling geen ondergrens', () => {
    // Het venster begint op 10 sep; de laatste 7 dagen beginnen op 23 sep.
    const feiten = metFouten()
    if (feiten.fouten.soort !== 'ok') throw new Error()
    feiten.fouten.data.afgekapt = true
    const s = item(bouwAandacht(feiten), 'fouten-open')
    expect(s.impact).toMatchObject({ soort: 'aantal', aantal: 2, ondergrens: false })
    expect(s.onderdelen[0]).not.toContain('minstens')
  })

  it('een afgekapt venster dat de laatste 7 dagen NIET dekt: elk aantal is een ondergrens', () => {
    // Een foutvloed: de laatste 1000 regels beslaan alleen 27 en 28 sep.
    const feiten = metFouten([
      voorval(nieuwA.signature, '2026-09-28T10:00:00.000Z', 2),
      voorval(nieuwA.signature, '2026-09-28T09:00:00.000Z', 1),
      voorval(terug.signature, '2026-09-27T09:00:00.000Z', 1),
    ])
    if (feiten.fouten.soort !== 'ok') throw new Error()
    feiten.fouten.data.afgekapt = true
    const items = bouwAandacht(feiten)

    const open = item(items, 'fouten-open')
    // Elk voorval draagt een gebruiker, en toch is het een ondergrens.
    expect(open.impact).toMatchObject({ soort: 'aantal', aantal: 2, ondergrens: true })
    expect(open.impact.toelichting).toContain('Het leesvenster begint op 27 sep')
    expect(open.onderdelen[0]).toContain('minstens 5×')

    const teruggekomen = item(items, 'fouten-teruggekomen')
    expect(teruggekomen.impact).toMatchObject({ ondergrens: true })
  })

  it('een onvolledig venster zonder gelezen voorvallen: impact onbekend, niet "geen effect"', () => {
    const feiten = metFouten([voorval(terug.signature, '2026-09-28T09:00:00.000Z', 1)])
    if (feiten.fouten.soort !== 'ok') throw new Error()
    feiten.fouten.data.afgekapt = true
    // Voor de open soorten is in het venster niets gelezen; dat is geen nul.
    expect(item(bouwAandacht(feiten), 'fouten-open').impact.soort).toBe('onbekend')
  })

  it(`somt hoogstens ${MAX_ONDERDELEN} soorten op en zegt hoeveel er meer zijn`, () => {
    const veel = Array.from({ length: 7 }, (_, i) =>
      foutsoort({ signature: `${i}`.repeat(16), voorbeeld: `Fout ${i}`, recent: i }),
    )
    const feiten = { ...gezondeFeiten(), fouten: bronOk(foutenFeit(veel, [])) }
    const s = item(bouwAandacht(feiten), 'fouten-open')
    expect(s.onderdelen).toHaveLength(MAX_ONDERDELEN + 1)
    expect(s.onderdelen[MAX_ONDERDELEN]).toBe('en 3 meer')
  })
})

describe('koppelingen', () => {
  function metKoppelingen(deel: Partial<KoppelingenFeit>, feiten = gezondeFeiten()): DashboardFeiten {
    return { ...feiten, koppelingen: bronOk({ ...koppelingenVan(feiten), ...deel }) }
  }
  const uitval = {
    gemetenOp: FIXTURE_NU,
    gemeten: 6,
    bereikbaar: 4,
    onbereikbaar: ['bitvavo', 'kraken'],
    begrensd: 0,
    nietMeetbaar: 8,
  }

  it('een verse meting met uitval geeft één signaal, met de diensten als onderdelen', () => {
    const items = bouwAandacht(metKoppelingen({ probe: uitval }))
    expect(ids(items)).toEqual(['koppelingen-onbereikbaar'])
    expect(items[0].onderdelen).toEqual(['bitvavo', 'kraken'])
    expect(items[0].impact.soort).toBe('onbekend')
  })

  it('één incident, één regel: de meting met status error staat niet óók als gefaalde taak in de lijst', () => {
    const feiten = metTaken({
      standen: metStand(
        gezondeStanden(),
        stand(
          'integraties-health',
          'ok',
          run('integraties-health', 'error', FIXTURE_NU, { summary: MEETUITKOMST }),
          '2026-09-28T18:57:00.000Z',
        ),
      ),
    })
    const items = bouwAandacht(metKoppelingen({ probe: uitval }, feiten))
    expect(ids(items)).toEqual(['koppelingen-onbereikbaar'])
    expect(items[0].sinds).toBe('2026-09-28T18:57:00.000Z')
  })

  it('een storing die langer dan een dag duurt, blijft in de lijst staan', () => {
    // De laatste meting ZONDER uitval is van vier dagen terug. De taakbewaking
    // noemt de taak daarom "overdue", maar de meting draait elke dag en vindt
    // elke dag dezelfde onbereikbare diensten. Dat signaal mag niet wegvallen,
    // en er hoort geen vals signaal "de meting loopt achter" voor in de plaats.
    const feiten = metTaken({
      standen: metStand(
        gezondeStanden(),
        stand(
          'integraties-health',
          'overdue',
          run('integraties-health', 'error', FIXTURE_NU, { summary: MEETUITKOMST }),
          '2026-09-25T18:57:00.000Z',
        ),
      ),
    })
    const items = bouwAandacht(metKoppelingen({ probe: uitval }, feiten))
    expect(ids(items)).toEqual(['koppelingen-onbereikbaar'])
    expect(items[0]).toMatchObject({ sinds: '2026-09-25T18:57:00.000Z', sindsLabel: 'laatste meting zonder uitval' })
  })

  it('een VEROUDERDE meting beweert niets over bereikbaarheid', () => {
    const feiten = metTaken({
      standen: metStand(
        gezondeStanden(),
        stand('integraties-health', 'overdue', run('integraties-health', 'error', '2026-09-01T18:57:00.000Z'), null),
      ),
    })
    const items = bouwAandacht(metKoppelingen({ probe: uitval }, feiten))
    expect(ids(items)).not.toContain('koppelingen-onbereikbaar')
    expect(ids(items)).toContain('taak-achterstallig-integraties-health')
    // De regel zegt wat er aan de hand is: de meting draait niet. Niet dat ze
    // "steeds met een fout eindigt".
    const taak = item(items, 'taak-achterstallig-integraties-health')
    expect(taak.waarom).toBe('De meting is niet op haar geplande moment uitgevoerd.')
    expect(taak).toMatchObject({ sinds: '2026-09-01T18:57:00.000Z', sindsLabel: 'laatste meting' })
  })

  it('koppelingen met een synchronisatiefout tellen in koppelingen, niet in gebruikers', () => {
    const tellingen = {
      ...koppelingenVan(gezondeFeiten()).tellingen,
      exchange_connections: { total: 4, withError: 2, syncfoutGemeten: true, syncfoutLeesfout: false },
      wallet_addresses: { total: 1, withError: 1, syncfoutGemeten: true, syncfoutLeesfout: false },
    }
    const s = item(bouwAandacht(metKoppelingen({ tellingen })), 'koppelingen-syncfout')
    expect(s.titel).toBe('3 koppelingen hebben een synchronisatiefout')
    expect(s.impact).toMatchObject({ soort: 'aantal', aantal: 3, eenheid: 'koppelingen' })
    expect(s.onderdelen).toEqual(['Exchanges: 2 van 4', 'Wallets: 1 van 1'])
  })

  it('een tabel die geen fout per koppeling vastlegt, kan geen signaal geven', () => {
    const tellingen = {
      ...koppelingenVan(gezondeFeiten()).tellingen,
      // withError 0 betekent hier "niet gemeten"; ook een ander getal mag niet meetellen.
      bank_connections: { total: 20, withError: 9, syncfoutGemeten: false, syncfoutLeesfout: false },
    }
    expect(bouwAandacht(metKoppelingen({ tellingen }))).toEqual([])
  })

  const bank = (deel: { mislukt: number; gebruikersLaatsteMislukt: number; afgekapt?: boolean }) =>
    bronOk({ dagen: 7, pogingen: 12, gebruikers: 6, afgekapt: false, ...deel })

  it('een mislukte laatste banksynchronisatie telt gebruikers', () => {
    const banksync = bank({ mislukt: 5, gebruikersLaatsteMislukt: 2 })
    const s = item(bouwAandacht(metKoppelingen({ banksync })), 'koppelingen-banksync')
    expect(s.impact).toMatchObject({ soort: 'aantal', aantal: 2, eenheid: 'gebruikers', ondergrens: false })
  })

  it('een afgekapte lezing van het banklogboek maakt de aantallen tot ondergrens', () => {
    const banksync = bank({ mislukt: 5, gebruikersLaatsteMislukt: 2, afgekapt: true })
    const s = item(bouwAandacht(metKoppelingen({ banksync })), 'koppelingen-banksync')
    expect(s.impact).toMatchObject({ aantal: 2, ondergrens: true })
    expect(s.waarom).toContain('Minstens 5 van de gelezen 12')
    expect(s.impact.toelichting).toContain('bovengrens')
  })

  it('mislukte synchronisaties die daarna weer slaagden, geven geen signaal', () => {
    const banksync = bank({ mislukt: 5, gebruikersLaatsteMislukt: 0 })
    expect(bouwAandacht(metKoppelingen({ banksync }))).toEqual([])
  })

  it('een telling die niet te lezen was, is een mislukte meting en geen nul', () => {
    const gezond = koppelingenVan(gezondeFeiten()).tellingen
    const onleesbaar = { ...gezond, exchange_connections: null }
    expect(mislukteMetingen(metKoppelingen({ tellingen: onleesbaar }))).toEqual(['Exchanges: aantal koppelingen'])
    expect(ids(bouwAandacht(metKoppelingen({ tellingen: onleesbaar })))).toEqual(['meting-mislukt'])

    const fouttelling = {
      ...gezond,
      broker_connections: { total: 2, withError: 0, syncfoutGemeten: false, syncfoutLeesfout: true },
    }
    expect(mislukteMetingen(metKoppelingen({ tellingen: fouttelling }))).toEqual([
      'Brokers: koppelingen met een fout',
    ])
  })

  it('een tabel zonder foutkolom is geen mislukte meting', () => {
    // bank_connections legt de fout niet vast; dat is bekend en geen leesfout.
    expect(mislukteMetingen(gezondeFeiten())).toEqual([])
  })
})

describe('e-mail, webprestaties, meldingen, krant', () => {
  it('een mislukte e-mail is een signaal; de grond zegt dat er geen drempel is', () => {
    const feiten = {
      ...gezondeFeiten(),
      mail: bronOk({ ingericht: true, dagen: 7, verzonden: 4, mislukt: 1, overgeslagen: 0, laatstePoging: null }),
    }
    const s = item(bouwAandacht(feiten), 'mail-mislukt')
    expect(s.titel).toBe('1 e-mail is niet verzonden')
    expect(s.grond).toContain('geen drempel')
  })

  it('geen provider ingericht hoort bij inplannen, niet bij nu', () => {
    const feiten = {
      ...gezondeFeiten(),
      mail: bronOk({ ingericht: false, dagen: 7, verzonden: 0, mislukt: 0, overgeslagen: 3, laatstePoging: null }),
    }
    expect(item(bouwAandacht(feiten), 'mail-niet-ingericht').baan).toBe('inplannen')
    // Buiten productie zegt de inrichting van deze server niets over productie.
    expect(ids(bouwAandacht({ ...feiten, omgeving: 'development' }))).not.toContain('mail-niet-ingericht')
  })

  it('een p75 in de categorie slecht is een signaal, met grens en aantal metingen', () => {
    const feiten = gezondeFeiten()
    if (feiten.vitals.soort !== 'ok') throw new Error()
    feiten.vitals.data.metrics[0] = { metric: 'LCP', p75: 4300, metingen: 812 }
    const s = item(bouwAandacht(feiten), 'prestaties-slecht')
    expect(s.titel).toBe('LCP valt in de categorie slecht')
    expect(s.onderdelen[0]).toContain('4.300 ms')
    expect(s.onderdelen[0]).toContain('grens 4.000 ms')
    expect(s.onderdelen[0]).toContain('812 metingen')
  })

  it('precies op de grens is nog geen slecht; "aandacht" geeft geen signaal', () => {
    const feiten = gezondeFeiten()
    if (feiten.vitals.soort !== 'ok') throw new Error()
    feiten.vitals.data.metrics[0] = { metric: 'LCP', p75: 4000, metingen: 812 }
    expect(bouwAandacht(feiten)).toEqual([])
  })

  it('een maat zonder metingen kan niet slecht zijn', () => {
    const feiten = gezondeFeiten()
    if (feiten.vitals.soort !== 'ok') throw new Error()
    feiten.vitals.data.metrics[0] = { metric: 'LCP', p75: 9000, metingen: 0 }
    expect(bouwAandacht(feiten)).toEqual([])
  })

  it('vastgelopen meldingen zijn een signaal; wachtende niet', () => {
    const wachtend = {
      ...gezondeFeiten(),
      meldingen: bronOk({ dagen: 7, nieuw: 3, wachtend: 2, vastgelopen: 0, maxPogingen: 5 }),
    }
    expect(bouwAandacht(wachtend)).toEqual([])

    const vast = {
      ...gezondeFeiten(),
      meldingen: bronOk({ dagen: 7, nieuw: 3, wachtend: 0, vastgelopen: 2, maxPogingen: 5 }),
    }
    const s = item(bouwAandacht(vast), 'meldingen-vastgelopen')
    expect(s.impact).toMatchObject({ aantal: 2, eenheid: 'meldingen' })
    expect(s.grond).toContain('5 pogingen')
  })

  it('open rekenhulp-meldingen zijn werk voor nu; het feedbackarchief is inplannen', () => {
    const feiten = { ...gezondeFeiten(), inbakken: { errors: 0, feedback: 3, calculator_reports: 2 } }
    const items = bouwAandacht(feiten)
    expect(item(items, 'inbak-rekenhulp').baan).toBe('nu')
    expect(item(items, 'inbak-feedback').baan).toBe('inplannen')
  })

  it('een teller die ontbreekt (null) geeft geen signaal over de inbak zelf', () => {
    const feiten = { ...gezondeFeiten(), inbakken: { errors: null, feedback: null, calculator_reports: null } }
    expect(ids(bouwAandacht(feiten))).toEqual(['meting-mislukt'])
  })

  it('alleen een onleesbare nieuwsbron is een signaal; "niets nieuws" of een storing bij de bron niet', () => {
    const letOp = {
      ...gezondeFeiten(),
      krant: bronOk({
        bronnen: {
          gecontroleerdOp: FIXTURE_NU,
          totaal: 12,
          nietGoed: [{ label: 'CBS', klasse: 'let-op' as const, oorzaak: 'opgehaald, niets gevonden' }],
        },
        wachtrij: 0,
      }),
    }
    expect(bouwAandacht(letOp)).toEqual([])

    const kapot = {
      ...gezondeFeiten(),
      krant: bronOk({
        bronnen: {
          gecontroleerdOp: FIXTURE_NU,
          totaal: 12,
          nietGoed: [
            { label: 'CBS', klasse: 'let-op' as const, oorzaak: 'opgehaald, niets gevonden' },
            { label: 'AFM', klasse: 'fout' as const, oorzaak: 'HTTP-fout' },
          ],
        },
        wachtrij: 0,
      }),
    }
    const s = item(bouwAandacht(kapot), 'krant-bronnen')
    expect(s.titel).toBe('1 nieuwsbron is niet te lezen')
    expect(s.waarom).toContain('10 van de 12')
    expect(s.onderdelen).toEqual(['AFM: HTTP-fout'])
  })

  it('een oude ophaalronde beweert niets over de bronnen: alleen de achterstallige taak staat in de lijst', () => {
    const standen = metStand(
      gezondeStanden(),
      stand('news-ingest', 'overdue', run('news-ingest', 'success', '2026-09-26T05:25:00.000Z')),
    )
    const feiten: DashboardFeiten = {
      ...metTaken({ standen }),
      krant: bronOk({
        bronnen: {
          gecontroleerdOp: '2026-09-26T05:25:00.000Z',
          totaal: 12,
          nietGoed: [{ label: 'AFM', klasse: 'fout' as const, oorzaak: 'HTTP-fout' }],
        },
        wachtrij: 0,
      }),
    }
    expect(ids(bouwAandacht(feiten))).toEqual(['taak-achterstallig-news-ingest'])
  })
})

describe('inplannen', () => {
  it('open punten op de fiscale jaar-checklist', () => {
    const feiten = { ...gezondeFeiten(), fiscaal: { doeljaar: 2027, open: 4, driftOpen: 1 } }
    const items = bouwAandacht(feiten)
    expect(item(items, 'fiscaal-checklist')).toMatchObject({ baan: 'inplannen', ernst: 'laag' })
    expect(item(items, 'fiscaal-checklist').titel).toContain('2027')
    expect(item(items, 'fiscaal-drift').baan).toBe('inplannen')
  })

  it('schema-drift en een ontbrekend meldkanaal', () => {
    const items = bouwAandacht(
      metTaken({
        pushKanaal: false,
        drift: {
          unknownCrons: [{ path: '/api/cron/onbekend', schedule: '0 1 * * *' }],
          unscheduledJobs: [JOB_LIST[0]],
        },
      }),
    )
    expect(ids(items).sort()).toEqual(['taken-drift', 'taken-push'])
    expect(items.every((i) => i.baan === 'inplannen')).toBe(true)
    expect(item(items, 'taken-drift').onderdelen).toHaveLength(2)
  })

  it('buiten productie is het meldkanaal niet beoordeeld; schema-drift is geen omgevingsinstelling en blijft', () => {
    const feiten = metTaken({
      pushKanaal: false,
      drift: { unknownCrons: [{ path: '/api/cron/onbekend', schedule: '0 1 * * *' }], unscheduledJobs: [] },
    })
    expect(ids(bouwAandacht({ ...feiten, omgeving: 'development' }))).toEqual(['taken-drift'])
  })
})

describe('metingen die mislukten', () => {
  it('een bron die niet te lezen was, levert geen signaal over zichzelf maar wel over de meting', () => {
    const feiten: DashboardFeiten = {
      ...gezondeFeiten(),
      fouten: { soort: 'fout' },
      mail: { soort: 'fout' },
      ai: { status: 'unknown', sinceAt: null, failureCount: 0, lastSuccessAt: null },
    }
    expect(mislukteMetingen(feiten)).toEqual(['Foutmeldingen', 'E-mail', 'Fin & AI'])
    const items = bouwAandacht(feiten)
    expect(ids(items)).toEqual(['meting-mislukt'])
    expect(items[0].titel).toBe('3 onderdelen konden niet worden gemeten')
    expect(items[0].onderdelen).toEqual(['Foutmeldingen', 'E-mail', 'Fin & AI'])
  })

  it('een taak waarvan de uitvoeringen niet te lezen zijn, telt mee', () => {
    const feiten = metTaken({ standen: metStand(gezondeStanden(), stand('snapshots', 'unknown', null)) })
    expect(mislukteMetingen(feiten)).toEqual(['Taak Maandsnapshots'])
  })

  it('"nog niet uitgerold" is geen mislukte meting', () => {
    const feiten: DashboardFeiten = { ...gezondeFeiten(), vitals: { soort: 'niet-uitgerold' } }
    expect(mislukteMetingen(feiten)).toEqual([])
    expect(bouwAandacht(feiten)).toEqual([])
  })
})

describe('sorteerAandacht', () => {
  const basis: AandachtItem = {
    id: 'x',
    baan: 'nu',
    ernst: 'middel',
    domein: 'technisch',
    titel: '',
    waarom: '',
    impact: { soort: 'onbekend', toelichting: '' },
    sinds: null,
    sindsLabel: 'sinds',
    grond: '',
    acties: [],
    onderdelen: [],
    samenloop: null,
  }
  const maak = (deel: Partial<AandachtItem>): AandachtItem => ({ ...basis, ...deel })

  it('nu gaat vóór inplannen, ook als inplannen zwaarder weegt', () => {
    const uit = sorteerAandacht([
      maak({ id: 'later', baan: 'inplannen', ernst: 'kritiek' }),
      maak({ id: 'nu', baan: 'nu', ernst: 'laag' }),
    ])
    expect(ids(uit)).toEqual(['nu', 'later'])
  })

  it('binnen een baan: ernst eerst', () => {
    const uit = sorteerAandacht([
      maak({ id: 'middel', ernst: 'middel' }),
      maak({ id: 'kritiek', ernst: 'kritiek' }),
      maak({ id: 'laag', ernst: 'laag' }),
      maak({ id: 'hoog', ernst: 'hoog' }),
    ])
    expect(ids(uit)).toEqual(['kritiek', 'hoog', 'middel', 'laag'])
  })

  it('bij gelijke ernst: grootste gebruikersimpact eerst', () => {
    const uit = sorteerAandacht([
      maak({ id: 'geen', impact: { soort: 'geen-direct', toelichting: '' } }),
      maak({ id: 'onbekend', impact: { soort: 'onbekend', toelichting: '' } }),
      maak({ id: 'drie', impact: { soort: 'aantal', aantal: 3, eenheid: 'gebruikers', ondergrens: false, toelichting: '' } }),
      maak({ id: 'iedereen', impact: { soort: 'iedereen', toelichting: '' } }),
      maak({ id: 'twaalf', impact: { soort: 'aantal', aantal: 12, eenheid: 'gebruikers', ondergrens: false, toelichting: '' } }),
    ])
    expect(ids(uit)).toEqual(['iedereen', 'twaalf', 'drie', 'onbekend', 'geen'])
  })

  it('getelde gebruikers gaan vóór een andere eenheid, hoe groot dat getal ook is', () => {
    const uit = sorteerAandacht([
      maak({ id: 'vijftig-mails', impact: { soort: 'aantal', aantal: 50, eenheid: 'e-mails', ondergrens: false, toelichting: '' } }),
      maak({ id: 'drie-gebruikers', impact: { soort: 'aantal', aantal: 3, eenheid: 'gebruikers', ondergrens: false, toelichting: '' } }),
      maak({ id: 'twee-koppelingen', impact: { soort: 'aantal', aantal: 2, eenheid: 'koppelingen', ondergrens: false, toelichting: '' } }),
      maak({ id: 'onbekend', impact: { soort: 'onbekend', toelichting: '' } }),
    ])
    expect(ids(uit)).toEqual(['drie-gebruikers', 'vijftig-mails', 'twee-koppelingen', 'onbekend'])
  })

  it('bij gelijke ernst en impact: wat het langst loopt eerst; zonder bekend begin achteraan', () => {
    const uit = sorteerAandacht([
      maak({ id: 'onbekend', sinds: null }),
      maak({ id: 'gisteren', sinds: '2026-09-28T09:00:00.000Z' }),
      maak({ id: 'vorige-maand', sinds: '2026-08-28T09:00:00.000Z' }),
    ])
    expect(ids(uit)).toEqual(['vorige-maand', 'gisteren', 'onbekend'])
  })

  it('laat de invoer ongemoeid', () => {
    const invoer = [maak({ id: 'b', ernst: 'laag' }), maak({ id: 'a', ernst: 'hoog' })]
    sorteerAandacht(invoer)
    expect(ids(invoer)).toEqual(['b', 'a'])
  })
})

describe('tekstfuncties', () => {
  it('opsomming', () => {
    expect(opsomming([])).toBe('')
    expect(opsomming(['A'])).toBe('A')
    expect(opsomming(['A', 'B'])).toBe('A en B')
    expect(opsomming(['A', 'B', 'C'])).toBe('A, B en C')
  })

  it('vensterTekst: uren tot twee dagen, daarna dagen', () => {
    expect(vensterTekst(26)).toBe('26 uur')
    expect(vensterTekst(47)).toBe('47 uur')
    expect(vensterTekst(48)).toBe('2 dagen')
    expect(vensterTekst(771)).toBe('32 dagen')
  })
})
