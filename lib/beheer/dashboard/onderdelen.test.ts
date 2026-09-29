import { describe, expect, it } from 'vitest'
import { JOB_LIST } from '@/lib/job-catalog'
import type { DashboardFeiten } from './feiten'
import { FIXTURE_NU, foutenFeit, foutsoort, gezondeFeiten, gezondeStanden, metStand, run, stand } from './fixture'
import { bouwOnderdelen, bouwOordeel, type OnderdeelRij } from './onderdelen'
import { bouwAandacht } from './signalen'
import { bronOk, isZonderMeting, statusToon } from './status'

// Geteld uit de catalogus: een nieuwe taak breekt deze tests dan niet.
const BEWAAKT = JOB_LIST.filter((j) => j.maxAgeHours != null).length
const ONBEWAAKT = JOB_LIST.length - BEWAAKT

function rij(feiten: DashboardFeiten, id: string): OnderdeelRij {
  const gevonden = bouwOnderdelen(feiten).find((r) => r.id === id)
  if (!gevonden) throw new Error(`geen onderdeel ${id}`)
  return gevonden
}

function metTaakStand(nieuw: ReturnType<typeof stand>, deel = {}): DashboardFeiten {
  const feiten = gezondeFeiten()
  if (feiten.taken.soort !== 'ok') throw new Error()
  return {
    ...feiten,
    taken: bronOk({ ...feiten.taken.data, standen: metStand(gezondeStanden(), nieuw), ...deel }),
  }
}

describe('bouwOnderdelen — een platform zonder afwijkingen', () => {
  const rijen = bouwOnderdelen(gezondeFeiten())

  it('toont alle negen onderdelen, allemaal gezond', () => {
    expect(rijen.map((r) => r.id).sort()).toEqual(
      ['ai', 'fouten', 'koppelingen', 'krant', 'mail', 'meldingen', 'platform', 'taken', 'vitals'].sort(),
    )
    expect(rijen.map((r) => r.status)).toEqual(Array(9).fill('gezond'))
  })

  it('elke regel noemt zijn norm en zijn doorklik', () => {
    for (const r of rijen) {
      expect(r.norm.length, r.id).toBeGreaterThan(20)
      expect(r.href, r.id).toMatch(/^\/beheer/)
      expect(r.linkLabel.length, r.id).toBeGreaterThan(0)
    }
  })

  it('een gezonde regel draagt geen ernst', () => {
    expect(rijen.every((r) => r.ernst === null)).toBe(true)
  })
})

describe('een ontbrekende meting is nooit gezond', () => {
  const zonderBronnen: DashboardFeiten = {
    ...gezondeFeiten(),
    platform: { soort: 'fout' },
    taken: { soort: 'fout' },
    fouten: { soort: 'fout' },
    koppelingen: { soort: 'fout' },
    mail: { soort: 'fout' },
    vitals: { soort: 'fout' },
    meldingen: { soort: 'fout' },
    krant: { soort: 'fout' },
    ai: { status: 'unknown', sinceAt: null, failureCount: 0, lastSuccessAt: null },
  }

  it('elke onleesbare bron geeft "meting mislukt"', () => {
    const rijen = bouwOnderdelen(zonderBronnen)
    expect(rijen).toHaveLength(9)
    expect(new Set(rijen.map((r) => r.status))).toEqual(new Set(['meting-mislukt']))
  })

  it('geen van die regels beweert iets over het onderdeel', () => {
    for (const r of bouwOnderdelen(zonderBronnen)) {
      expect(r.meting).toBe('De bron kon niet worden gelezen.')
      expect(r.ernst).toBeNull()
    }
  })

  it('isZonderMeting herkent precies de drie toestanden zonder geldige meting', () => {
    expect(isZonderMeting('geen-gegevens')).toBe(true)
    expect(isZonderMeting('verouderd')).toBe(true)
    expect(isZonderMeting('meting-mislukt')).toBe(true)
    expect(isZonderMeting('gezond')).toBe(false)
    expect(isZonderMeting('afwijkend')).toBe(false)
    expect(isZonderMeting('nvt')).toBe(false)
  })
})

describe('platform en AI', () => {
  it('onderhoudsmodus aan: afwijkend', () => {
    const feiten = gezondeFeiten()
    if (feiten.platform.soort !== 'ok') throw new Error()
    feiten.platform.data.status = {
      ...feiten.platform.data.status,
      maintenance: { enabled: true, message: '' },
    }
    expect(rij(feiten, 'platform')).toMatchObject({ status: 'afwijkend', ernst: 'hoog' })
    expect(rij(feiten, 'platform').meting).toContain('onderhoudsmodus aan')
  })

  it('AI-standen vertalen naar de toestand van de regel', () => {
    const met = (status: DashboardFeiten['ai']['status']) => ({
      ...gezondeFeiten(),
      ai: { status, sinceAt: null, failureCount: 2, lastSuccessAt: null },
    })
    expect(rij(met('ok'), 'ai').status).toBe('gezond')
    expect(rij(met('idle'), 'ai').status).toBe('geen-gegevens')
    expect(rij(met('attention'), 'ai')).toMatchObject({ status: 'afwijkend', ernst: 'laag' })
    expect(rij(met('hapering'), 'ai')).toMatchObject({ status: 'afwijkend', ernst: 'hoog' })
    expect(rij(met('storing'), 'ai')).toMatchObject({ status: 'afwijkend', ernst: 'kritiek' })
    expect(rij(met('unknown'), 'ai').status).toBe('meting-mislukt')
  })

  it('AI bewust uit: de regel is niet van toepassing, geen storing', () => {
    const feiten = {
      ...gezondeFeiten(),
      ai: { status: 'storing' as const, sinceAt: null, failureCount: 4, lastSuccessAt: null },
    }
    if (feiten.platform.soort !== 'ok') throw new Error()
    feiten.platform.data.status = { ...feiten.platform.data.status, killSwitches: { ai: false } }
    expect(rij(feiten, 'ai').status).toBe('nvt')
    expect(rij(feiten, 'platform').status).toBe('afwijkend')
  })
})

describe('achtergrondtaken', () => {
  it('telt alleen bewaakte taken in de noemer', () => {
    const r = rij(gezondeFeiten(), 'taken')
    expect(r.meting).toBe(`${BEWAAKT} van ${BEWAAKT} bewaakte taken actueel`)
    expect(ONBEWAAKT).toBeGreaterThan(1)
    expect(r.details).toContain(`${ONBEWAAKT} taken worden bewust niet bewaakt`)
  })

  it('een achterstallige taak: afwijkend, hoog, met de taak in de details', () => {
    const feiten = metTaakStand(stand('snapshots', 'overdue', run('snapshots', 'success', '2026-07-31T07:00:00.000Z')))
    const r = rij(feiten, 'taken')
    expect(r).toMatchObject({ status: 'afwijkend', ernst: 'hoog' })
    expect(r.meting).toBe(`${BEWAAKT - 1} van ${BEWAAKT} bewaakte taken actueel · 1 met een afwijking`)
    expect(r.details).toContain('Maandsnapshots: loopt achter')
  })

  it('alleen een deels geslaagde taak: afwijkend, middel', () => {
    const feiten = metTaakStand(stand('news-ingest', 'ok', run('news-ingest', 'partial', FIXTURE_NU)))
    expect(rij(feiten, 'taken')).toMatchObject({ status: 'afwijkend', ernst: 'middel' })
  })

  it('een taak die niet te lezen is, maakt de regel "meting mislukt" en niet gezond', () => {
    const feiten = metTaakStand(stand('snapshots', 'unknown', null))
    const r = rij(feiten, 'taken')
    expect(r.status).toBe('meting-mislukt')
    expect(r.details).toContain('Maandsnapshots: uitvoeringen niet te lezen')
  })

  it('een afwijking wint van een leesfout', () => {
    const feiten = gezondeFeiten()
    if (feiten.taken.soort !== 'ok') throw new Error()
    let standen = metStand(gezondeStanden(), stand('snapshots', 'unknown', null))
    standen = metStand(standen, stand('retention', 'never', null))
    feiten.taken.data.standen = standen
    expect(rij(feiten, 'taken').status).toBe('afwijkend')
  })

  it('zonder CRON_SECRET is de regel afwijkend, ook als nog geen taak achterloopt', () => {
    const feiten = gezondeFeiten()
    if (feiten.taken.soort !== 'ok') throw new Error()
    feiten.taken.data.cronSecret = false
    expect(rij(feiten, 'taken')).toMatchObject({ status: 'afwijkend', ernst: 'kritiek' })
  })

  it('buiten productie is de sleutel niet beoordeeld: de regel volgt alleen de uitvoeringen', () => {
    const feiten = gezondeFeiten()
    if (feiten.taken.soort !== 'ok') throw new Error()
    feiten.taken.data.cronSecret = false
    const r = rij({ ...feiten, omgeving: 'development' }, 'taken')
    expect(r.status).toBe('gezond')
    expect(r.details.join(' ')).toContain('CRON_SECRET) is op deze omgeving niet beoordeeld')
    expect(r.details.join(' ')).not.toContain('ontbreekt')
  })

  it('de bereikbaarheidsmeting telt als actueel zolang ze draait, ook tijdens een storing bij een dienst', () => {
    const feiten = metTaakStand(
      stand(
        'integraties-health',
        'overdue',
        run('integraties-health', 'error', FIXTURE_NU, { summary: { probed: 14, ok: 5, failed: 1, failures: { kraken: {} } } }),
        '2026-09-25T18:57:00.000Z',
      ),
    )
    const r = rij(feiten, 'taken')
    expect(r.meting).toBe(`${BEWAAKT} van ${BEWAAKT} bewaakte taken actueel`)
    expect(r.status).toBe('gezond')
  })
})

describe('foutmeldingen', () => {
  it('een leeg logboek is "geen gegevens", geen gezond', () => {
    const feiten = { ...gezondeFeiten(), fouten: bronOk(foutenFeit([], [])) }
    const r = rij(feiten, 'fouten')
    expect(r.status).toBe('geen-gegevens')
    expect(r.details[0]).toContain('stille logger')
  })

  it('alles afgehandeld is gezond', () => {
    expect(rij(gezondeFeiten(), 'fouten').status).toBe('gezond')
  })

  it('open soorten: middel; een teruggekomen soort maakt het hoog', () => {
    const open = { ...gezondeFeiten(), fouten: bronOk(foutenFeit([foutsoort({ signature: '1'.repeat(16) })])) }
    expect(rij(open, 'fouten')).toMatchObject({ status: 'afwijkend', ernst: 'middel' })

    const terug = {
      ...gezondeFeiten(),
      fouten: bronOk(
        foutenFeit([
          foutsoort({ signature: '1'.repeat(16) }),
          foutsoort({ signature: '2'.repeat(16), teruggekomen: true }),
        ]),
      ),
    }
    const r = rij(terug, 'fouten')
    expect(r.ernst).toBe('hoog')
    expect(r.meting).toContain('2 open van 2 soorten, waarvan 1 teruggekomen')
  })
})

describe('koppelingen', () => {
  it('noemt wat niet gemeten wordt', () => {
    expect(rij(gezondeFeiten(), 'koppelingen').details.join(' ')).toContain(
      'Bankkoppelingen: 20 koppelingen; een fout per koppeling wordt niet vastgelegd',
    )
  })

  it('telt alleen koppelingen waarvan de fout gemeten wordt in de noemer', () => {
    expect(rij(gezondeFeiten(), 'koppelingen').meting).toContain('0 van 7 koppelingen met een fout')
  })

  it('een verouderde bereikbaarheidsmeting maakt de regel verouderd, niet gezond', () => {
    const feiten = metTaakStand(
      stand('integraties-health', 'overdue', run('integraties-health', 'success', '2026-09-01T18:57:00.000Z')),
    )
    const r = rij(feiten, 'koppelingen')
    expect(r.status).toBe('verouderd')
    expect(r.details[0]).toContain('verouderd')
  })

  it('nog nooit gemeten: geen gegevens', () => {
    const feiten = gezondeFeiten()
    if (feiten.koppelingen.soort !== 'ok') throw new Error()
    feiten.koppelingen.data.probe = null
    expect(rij(feiten, 'koppelingen').status).toBe('geen-gegevens')
  })

  it('een storing die dagen duurt: afwijkend op de meting van vandaag, niet "verouderd"', () => {
    // De taakbewaking zegt overdue (geen GESLAAGDE uitvoering sinds 25 sep),
    // maar de meting draaide vandaag en vond een onbereikbare dienst.
    const feiten = metTaakStand(
      stand(
        'integraties-health',
        'overdue',
        run('integraties-health', 'error', FIXTURE_NU, { summary: { probed: 14, ok: 5, failed: 1, failures: { kraken: {} } } }),
        '2026-09-25T18:57:00.000Z',
      ),
    )
    if (feiten.koppelingen.soort !== 'ok') throw new Error()
    feiten.koppelingen.data.probe = {
      gemetenOp: FIXTURE_NU,
      gemeten: 6,
      bereikbaar: 5,
      onbereikbaar: ['kraken'],
      begrensd: 0,
      nietMeetbaar: 8,
    }
    const r = rij(feiten, 'koppelingen')
    expect(r).toMatchObject({ status: 'afwijkend', ernst: 'hoog', actueelOp: FIXTURE_NU })
    expect(r.meting).toContain('5 van 6 meetbare diensten bereikbaar')
    expect(r.details.join(' ')).not.toContain('verouderd')
  })

  it('een telling die niet te lezen was, eindigt nooit als gezond', () => {
    const feiten = gezondeFeiten()
    if (feiten.koppelingen.soort !== 'ok') throw new Error()
    feiten.koppelingen.data.tellingen = { ...feiten.koppelingen.data.tellingen, exchange_connections: null }
    const r = rij(feiten, 'koppelingen')
    expect(r.status).toBe('meting-mislukt')
    expect(r.details.join(' ')).toContain('Exchanges: het aantal koppelingen was niet te lezen')
  })

  it('een fouttelling die niet te lezen was, heet niet "wordt niet vastgelegd"', () => {
    const feiten = gezondeFeiten()
    if (feiten.koppelingen.soort !== 'ok') throw new Error()
    feiten.koppelingen.data.tellingen = {
      ...feiten.koppelingen.data.tellingen,
      broker_connections: { total: 2, withError: 0, syncfoutGemeten: false, syncfoutLeesfout: true },
    }
    const r = rij(feiten, 'koppelingen')
    expect(r.status).toBe('meting-mislukt')
    const details = r.details.join(' ')
    expect(details).toContain('Brokers: 2 koppelingen; hoeveel er een fout dragen, was niet te lezen')
    expect(details).not.toContain('Brokers: 2 koppelingen; een fout per koppeling wordt niet vastgelegd')
    // De tabel zonder foutkolom houdt haar eigen, juiste uitleg.
    expect(details).toContain('Bankkoppelingen: 20 koppelingen; een fout per koppeling wordt niet vastgelegd')
  })

  it('zonder één leesbare fouttelling staat er geen "0 van 0"', () => {
    const feiten = gezondeFeiten()
    if (feiten.koppelingen.soort !== 'ok') throw new Error()
    feiten.koppelingen.data.tellingen = {
      exchange_connections: null,
      broker_connections: null,
      wallet_addresses: null,
      bank_connections: null,
    }
    const r = rij(feiten, 'koppelingen')
    expect(r.meting).toContain('koppelingen met een fout: niet te lezen')
    expect(r.meting).not.toContain('0 van 0')
  })

  it('een afwijking uit een verse bron wint van een verouderde meting', () => {
    const feiten = metTaakStand(
      stand('integraties-health', 'overdue', run('integraties-health', 'success', '2026-09-01T18:57:00.000Z')),
    )
    if (feiten.koppelingen.soort !== 'ok') throw new Error()
    feiten.koppelingen.data.banksync = bronOk({
      dagen: 7,
      pogingen: 4,
      mislukt: 2,
      gebruikers: 3,
      gebruikersLaatsteMislukt: 1,
      afgekapt: false,
    })
    expect(rij(feiten, 'koppelingen')).toMatchObject({ status: 'afwijkend', ernst: 'hoog' })
  })

  it('een onleesbaar synchronisatielogboek maakt de regel "meting mislukt"', () => {
    const feiten = gezondeFeiten()
    if (feiten.koppelingen.soort !== 'ok') throw new Error()
    feiten.koppelingen.data.banksync = { soort: 'fout' }
    expect(rij(feiten, 'koppelingen').status).toBe('meting-mislukt')
  })
})

describe('e-mail', () => {
  const mail = (deel: object) => ({
    ...gezondeFeiten(),
    mail: bronOk({ ingericht: true, dagen: 7, verzonden: 0, mislukt: 0, overgeslagen: 0, laatstePoging: null, ...deel }),
  })

  it('ingericht maar geen pogingen: geen gegevens', () => {
    expect(rij(mail({}), 'mail').status).toBe('geen-gegevens')
  })

  it('niet ingericht: niet van toepassing, met de overgeslagen pogingen erbij', () => {
    const r = rij(mail({ ingericht: false, overgeslagen: 3 }), 'mail')
    expect(r.status).toBe('nvt')
    expect(r.meting).toContain('Geen provider ingericht')
    expect(r.meting).toContain('3 overgeslagen')
  })

  it('een mislukte verzending is afwijkend, ook zonder provider', () => {
    expect(rij(mail({ ingericht: false, mislukt: 1 }), 'mail').status).toBe('afwijkend')
  })

  it('alleen verzonden: gezond', () => {
    expect(rij(mail({ verzonden: 4 }), 'mail').status).toBe('gezond')
  })

  it('alleen overgeslagen pogingen bewijzen niet dat verzenden werkt', () => {
    const r = rij(mail({ overgeslagen: 2 }), 'mail')
    expect(r.status).toBe('geen-gegevens')
    expect(r.details.join(' ')).toContain('alle pogingen zijn overgeslagen')
  })

  it('buiten productie is de inrichting van de provider niet beoordeeld', () => {
    const r = rij({ ...mail({ ingericht: false, overgeslagen: 1 }), omgeving: 'development' }, 'mail')
    expect(r.status).toBe('geen-gegevens')
    expect(r.meting).not.toContain('Geen provider ingericht')
    expect(r.details.join(' ')).toContain('op deze omgeving niet beoordeeld')
  })
})

describe('webprestaties', () => {
  function vitals(lcp: number, metingen = 800): DashboardFeiten {
    const feiten = gezondeFeiten()
    if (feiten.vitals.soort !== 'ok') throw new Error()
    feiten.vitals.data.metrics[0] = { metric: 'LCP', p75: lcp, metingen }
    return feiten
  }

  it('volgt de officiële grenzen op beide randen', () => {
    expect(rij(vitals(2500), 'vitals').status).toBe('gezond')
    expect(rij(vitals(2501), 'vitals')).toMatchObject({ status: 'afwijkend', ernst: 'laag' })
    expect(rij(vitals(4000), 'vitals')).toMatchObject({ status: 'afwijkend', ernst: 'laag' })
    expect(rij(vitals(4001), 'vitals')).toMatchObject({ status: 'afwijkend', ernst: 'hoog' })
  })

  it('zonder metingen: geen gegevens', () => {
    const feiten = gezondeFeiten()
    if (feiten.vitals.soort !== 'ok') throw new Error()
    feiten.vitals.data.metrics = feiten.vitals.data.metrics.map((m) => ({ ...m, metingen: 0 }))
    expect(rij(feiten, 'vitals').status).toBe('geen-gegevens')
  })

  it('nog niet uitgerold: niet van toepassing', () => {
    expect(rij({ ...gezondeFeiten(), vitals: { soort: 'niet-uitgerold' } }, 'vitals').status).toBe('nvt')
  })

  it('toont de drie kernmaten met het aantal metingen', () => {
    const r = rij(gezondeFeiten(), 'vitals')
    expect(r.meting).toContain('LCP 1.900 ms')
    expect(r.meting).toContain('INP 120 ms')
    expect(r.meting).toContain('CLS 0,04')
    expect(r.meting).toContain('800 metingen')
  })
})

describe('meldingen en krant', () => {
  it('meldingen zegt wat het niet kan zien', () => {
    expect(rij(gezondeFeiten(), 'meldingen').details[0]).toContain('werkqueue buiten de app')
  })

  it('een vastgelopen melding weegt zwaarder dan een open rekenhulp-melding', () => {
    const feiten = {
      ...gezondeFeiten(),
      meldingen: bronOk({ dagen: 7, nieuw: 1, wachtend: 0, vastgelopen: 1, maxPogingen: 5 }),
      inbakken: { errors: 0, feedback: 0, calculator_reports: 2 },
    }
    expect(rij(feiten, 'meldingen')).toMatchObject({ status: 'afwijkend', ernst: 'hoog' })
  })

  it('krant zonder ophaalronde: geen gegevens', () => {
    const feiten = { ...gezondeFeiten(), krant: bronOk({ bronnen: null, wachtrij: null }) }
    expect(rij(feiten, 'krant').status).toBe('geen-gegevens')
  })

  it('krant met een achterstallige ingest: verouderd, want de brongezondheid is van die ronde', () => {
    const feiten = metTaakStand(
      stand('news-ingest', 'overdue', run('news-ingest', 'success', '2026-09-20T05:00:00.000Z')),
    )
    expect(rij(feiten, 'krant').status).toBe('verouderd')
  })

  const krantMet = (nietGoed: { label: string; klasse: 'let-op' | 'fout' | 'onbekend'; oorzaak: string }[]) => ({
    ...gezondeFeiten(),
    krant: bronOk({ bronnen: { gecontroleerdOp: FIXTURE_NU, totaal: 12, nietGoed }, wachtrij: 3 }),
  })

  it('krant: een bron zonder nieuws is geen afwijking, volgens de eigen norm van de regel', () => {
    const r = rij(krantMet([{ label: 'CBS', klasse: 'let-op', oorzaak: 'opgehaald, niets gevonden' }]), 'krant')
    expect(r).toMatchObject({ status: 'gezond', ernst: null })
    expect(r.meting).toBe('11 van 12 bronnen leveren · 3 artikelen wachtten na die ronde op duiding')
    // De bron staat er wel bij, voor wie het wil weten.
    expect(r.details).toEqual(['CBS: opgehaald, niets gevonden'])
    expect(r.norm).toContain('telt niet als afwijking')
  })

  it('krant: een bron die niet te lezen was, is de afwijking', () => {
    const r = rij(
      krantMet([
        { label: 'CBS', klasse: 'let-op', oorzaak: 'opgehaald, niets gevonden' },
        { label: 'AFM', klasse: 'fout', oorzaak: 'HTTP-fout' },
      ]),
      'krant',
    )
    expect(r).toMatchObject({ status: 'afwijkend', ernst: 'middel' })
    expect(r.meting).toContain('1 niet te lezen')
  })

  it('lijst en tabel vellen hetzelfde oordeel over de nieuwsbronnen', () => {
    const alleenLetOp = krantMet([{ label: 'CBS', klasse: 'let-op', oorzaak: 'opgehaald, niets gevonden' }])
    expect(bouwAandacht(alleenLetOp)).toEqual([])
    expect(rij(alleenLetOp, 'krant').status).toBe('gezond')
  })
})

describe('het moment van de meting', () => {
  it('alleen een telling bij het laden heet "bij het laden"', () => {
    const rijen = bouwOnderdelen(gezondeFeiten())
    const bijLaden = rijen.filter((r) => r.geteldBijLaden).map((r) => r.id)
    expect(bijLaden.sort()).toEqual(['meldingen', 'vitals'])
    // Wie een tijdstip uit de bron draagt, toont dat tijdstip.
    for (const r of rijen.filter((x) => !x.geteldBijLaden)) expect(r.actueelOp, r.id).not.toBeNull()
  })

  it('een bron zonder tijdstip beweert geen meting: leeg logboek, nooit gebruikte AI, geen ophaalronde, lege e-maillog', () => {
    const feiten: DashboardFeiten = {
      ...gezondeFeiten(),
      fouten: bronOk(foutenFeit([], [])),
      ai: { status: 'idle', sinceAt: null, failureCount: 0, lastSuccessAt: null },
      krant: bronOk({ bronnen: null, wachtrij: null }),
      mail: bronOk({ ingericht: true, dagen: 7, verzonden: 0, mislukt: 0, overgeslagen: 0, laatstePoging: null }),
    }
    for (const id of ['fouten', 'ai', 'krant', 'mail']) {
      expect(rij(feiten, id), id).toMatchObject({ actueelOp: null, geteldBijLaden: false })
    }
  })

  it('een onleesbare bron is niet "bij het laden" gemeten', () => {
    const feiten: DashboardFeiten = { ...gezondeFeiten(), meldingen: { soort: 'fout' }, vitals: { soort: 'fout' } }
    expect(rij(feiten, 'meldingen')).toMatchObject({ status: 'meting-mislukt', geteldBijLaden: false })
    expect(rij(feiten, 'vitals')).toMatchObject({ status: 'meting-mislukt', geteldBijLaden: false })
  })
})

describe('volgorde van de tabel', () => {
  it('afwijkend bovenaan, dan wat we niet zien, dan gezond', () => {
    const feiten: DashboardFeiten = {
      ...gezondeFeiten(),
      mail: { soort: 'fout' },
      fouten: bronOk(foutenFeit([foutsoort({ signature: '1'.repeat(16) })])),
    }
    const statussen = bouwOnderdelen(feiten).map((r) => r.status)
    expect(statussen[0]).toBe('afwijkend')
    expect(statussen[1]).toBe('meting-mislukt')
    expect(statussen.slice(2).every((s) => s === 'gezond')).toBe(true)
  })

  it('binnen afwijkend: de zwaarste ernst eerst', () => {
    const feiten: DashboardFeiten = {
      ...gezondeFeiten(),
      ai: { status: 'storing', sinceAt: null, failureCount: 3, lastSuccessAt: null },
      fouten: bronOk(foutenFeit([foutsoort({ signature: '1'.repeat(16) })])),
    }
    expect(
      bouwOnderdelen(feiten)
        .slice(0, 2)
        .map((r) => r.id),
    ).toEqual(['ai', 'fouten'])
  })
})

describe('bouwOordeel', () => {
  const oordeel = (feiten: DashboardFeiten) => bouwOordeel(bouwAandacht(feiten), bouwOnderdelen(feiten))

  it('geen signalen en alles gemeten: zonder afwijkingen', () => {
    const o = oordeel(gezondeFeiten())
    expect(o).toMatchObject({ nu: 0, dringend: 0, zonderMeting: 0, toon: 'positive' })
    expect(`${o.zin.voor} ${o.zin.oordeel}${o.zin.na}`).toBe('Het platform draait zonder afwijkingen')
  })

  it('geen signalen maar wel een ontbrekende meting: geen groen oordeel', () => {
    const o = oordeel({ ...gezondeFeiten(), krant: bronOk({ bronnen: null, wachtrij: null }) })
    expect(o.nu).toBe(0)
    expect(o.zonderMeting).toBe(1)
    expect(o.toon).toBe('warning')
    expect(o.zin.na).toBe(', maar 1 onderdeel heeft geen actuele meting')
  })

  it('telt signalen en noemt hoeveel er dringend zijn', () => {
    const feiten: DashboardFeiten = {
      ...gezondeFeiten(),
      ai: { status: 'storing', sinceAt: FIXTURE_NU, failureCount: 3, lastSuccessAt: null },
      inbakken: { errors: 0, feedback: 0, calculator_reports: 1 },
    }
    const o = oordeel(feiten)
    expect(o).toMatchObject({ nu: 2, dringend: 1, toon: 'negative' })
    expect(o.zin.oordeel).toBe('2 zaken die nu aandacht vragen')
    expect(o.zin.na).toBe(', waarvan 1 dringend')
  })

  it('één signaal staat in het enkelvoud', () => {
    const o = oordeel({ ...gezondeFeiten(), inbakken: { errors: 0, feedback: 0, calculator_reports: 1 } })
    expect(o.zin.oordeel).toBe('1 zaak die nu aandacht vraagt')
    expect(o.toon).toBe('warning')
    expect(o.zin.na).toBe('')
  })

  it('werk om in te plannen telt niet als "nu"', () => {
    const o = oordeel({ ...gezondeFeiten(), fiscaal: { doeljaar: 2027, open: 3, driftOpen: 0 } })
    expect(o).toMatchObject({ nu: 0, inplannen: 1, toon: 'positive' })
  })

  it('een afwijking zonder signaal: de kop zegt niet "zonder afwijkingen"', () => {
    // Eén mislukte AI-aanroep: te weinig voor een signaal, wel een afwijkende regel.
    const o = oordeel({
      ...gezondeFeiten(),
      ai: { status: 'attention', sinceAt: FIXTURE_NU, failureCount: 1, lastSuccessAt: null },
    })
    expect(o).toMatchObject({ nu: 0, toon: 'warning', afwijkendZonderSignaal: ['Fin & AI'] })
    expect(`${o.zin.voor} ${o.zin.oordeel}${o.zin.na}`).toBe(
      'Het platform vraagt geen ingrijpen, maar Fin & AI wijkt af van de norm',
    )
  })

  it('meerdere afwijkingen zonder signaal worden geteld, met de ontbrekende meting erbij', () => {
    const feiten = gezondeFeiten()
    if (feiten.vitals.soort !== 'ok') throw new Error()
    feiten.vitals.data.metrics[0] = { metric: 'LCP', p75: 3000, metingen: 800 }
    const o = oordeel({
      ...feiten,
      ai: { status: 'attention', sinceAt: FIXTURE_NU, failureCount: 1, lastSuccessAt: null },
      krant: bronOk({ bronnen: null, wachtrij: null }),
    })
    expect(o.afwijkendZonderSignaal.sort()).toEqual(['Fin & AI', 'Webprestaties'])
    expect(o.zin.na).toBe(', maar 2 onderdelen wijken af van de norm en 1 onderdeel heeft geen actuele meting')
  })

  it('de kop en de tabel spreken elkaar nooit tegen: groen betekent dat geen enkele regel afwijkt', () => {
    const gevallen: DashboardFeiten[] = [
      gezondeFeiten(),
      { ...gezondeFeiten(), ai: { status: 'attention', sinceAt: null, failureCount: 1, lastSuccessAt: null } },
      { ...gezondeFeiten(), ai: { status: 'storing', sinceAt: null, failureCount: 3, lastSuccessAt: null } },
      { ...gezondeFeiten(), mail: { soort: 'fout' } },
    ]
    for (const feiten of gevallen) {
      const o = oordeel(feiten)
      const rijen = bouwOnderdelen(feiten)
      if (o.toon === 'positive') {
        expect(rijen.filter((r) => r.status === 'afwijkend' || isZonderMeting(r.status))).toEqual([])
      }
    }
  })
})

describe('statusToon', () => {
  it('afwijkend is rood bij kritiek en hoog, oranje bij middel en laag', () => {
    expect(statusToon('afwijkend', 'kritiek')).toBe('negative')
    expect(statusToon('afwijkend', 'hoog')).toBe('negative')
    expect(statusToon('afwijkend', 'middel')).toBe('warning')
    expect(statusToon('afwijkend', 'laag')).toBe('warning')
    expect(statusToon('afwijkend')).toBe('warning')
  })

  it('geen enkele toestand zonder meting is groen', () => {
    expect(statusToon('geen-gegevens')).toBe('neutral')
    expect(statusToon('verouderd')).toBe('warning')
    expect(statusToon('meting-mislukt')).toBe('warning')
    expect(statusToon('nvt')).toBe('neutral')
    expect(statusToon('gezond')).toBe('positive')
  })
})
