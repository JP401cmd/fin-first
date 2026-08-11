import { describe, it, expect } from 'vitest'
import type { JobCatalogEntry } from '@/lib/job-catalog'
import { emptySweepState, runSweep, type SweepInput, type SweepState } from './sweep'

/**
 * Drempels, ontdubbeling en de payloadregel van de meldingen-sweep (ADR 0102).
 * Alles hier is puur: geen client, geen klok, geen netwerk.
 */

const NOW = new Date('2026-08-11T12:00:00.000Z')
const BASE = 'https://trifinity.app'

const JOBS: JobCatalogEntry[] = [
  {
    key: 'retention',
    label: 'AVG-bewaartermijnen',
    schedule: 'Dagelijks 03:45',
    path: '/api/cron/retention',
    description: '',
    maxAgeHours: 26,
  },
  {
    key: 'snapshots',
    label: 'Maandsnapshots',
    schedule: 'Maandelijks',
    path: '/api/snapshots/cron',
    description: '',
    maxAgeHours: 768,
  },
  {
    key: 'alerts-sweep',
    label: 'Meldingen-sweep',
    schedule: 'Elk kwartier',
    path: '/api/cron/alerts-sweep',
    description: '',
    maxAgeHours: null,
  },
]

/** Verse taken: alles net geslaagd, dus geen stilte-signaal in de weg. */
function freshSuccess(now: Date) {
  const recent = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  return { retention: recent, snapshots: recent } as const
}

function input(over: Partial<SweepInput> = {}): SweepInput {
  return {
    now: NOW,
    errorRows: [],
    failedRuns: [],
    lastSuccessByJob: freshSuccess(NOW),
    state: { ...emptySweepState(), errorWatermark: '2026-08-11T11:00:00.000Z' },
    jobs: JOBS,
    baseUrl: BASE,
    ...over,
  }
}

function errorRow(message: string, minutesAgo: number, context = 'onRequestError:route') {
  return {
    context,
    message,
    created_at: new Date(NOW.getTime() - minutesAgo * 60 * 1000).toISOString(),
  }
}

describe('sweep — eerste run (bootstrap)', () => {
  it('meldt de bestaande foutgeschiedenis NIET, maar zet wel het watermerk', () => {
    const res = runSweep(
      input({
        state: emptySweepState(),
        errorRows: [errorRow('oude fout', 5000)],
      }),
    )
    expect(res.notifications).toHaveLength(0)
    expect(res.summary.bootstrapped).toBe(true)
    expect(res.state.errorWatermark).toBe(errorRow('oude fout', 5000).created_at)
  })

  it('zonder rijen valt het watermerk terug op nu', () => {
    const res = runSweep(input({ state: emptySweepState() }))
    expect(res.state.errorWatermark).toBe(NOW.toISOString())
  })
})

describe('sweep — S1 nieuwe fouten', () => {
  it('meldt één gebundelde melding met aantal, context-tag en deeplink', () => {
    const res = runSweep(
      input({
        errorRows: [errorRow('Budget 1 niet gevonden', 10), errorRow('Netwerk weg', 5)],
      }),
    )
    expect(res.notifications).toHaveLength(1)
    const n = res.notifications[0]
    expect(n.body).toContain('2 nieuwe fouttypes')
    expect(n.body).toContain('2 voorvallen')
    expect(n.body).toContain('onrequesterror:route')
    expect(n.click).toBe(`${BASE}/beheer/errors`)
  })

  it('50× dezelfde fout in één venster -> precies één melding', () => {
    const rows = Array.from({ length: 50 }, (_, i) => errorRow(`Budget ${i} niet gevonden`, 10))
    const res = runSweep(input({ errorRows: rows }))
    expect(res.notifications).toHaveLength(1)
    expect(res.notifications[0].body).toContain('1 nieuw fouttype')
    expect(res.notifications[0].body).toContain('50 voorvallen')
  })

  it('50× verspreid over vier vensters -> nog steeds één melding', () => {
    let state: SweepState = { ...emptySweepState(), errorWatermark: '2026-08-11T10:00:00.000Z' }
    let total = 0
    for (let window = 0; window < 4; window++) {
      const rows = Array.from({ length: 13 }, (_, i) =>
        errorRow(`Budget ${i} niet gevonden`, 40 - window * 10),
      )
      const res = runSweep(input({ state, errorRows: rows }))
      total += res.notifications.length
      state = res.state
    }
    expect(total).toBe(1)
  })

  it('meldt opnieuw bij 10× volume-escalatie van een al gemeld fouttype', () => {
    const first = runSweep(input({ errorRows: [errorRow('Netwerk weg', 20)] }))
    expect(first.notifications).toHaveLength(1)

    const burst = Array.from({ length: 12 }, () => errorRow('Netwerk weg', 5))
    const second = runSweep(input({ state: first.state, errorRows: burst }))
    expect(second.notifications).toHaveLength(1)
    expect(second.notifications[0].title).toContain('escaleert')
    expect(second.summary.escalations).toBe(1)
  })

  it('dezelfde fout opnieuw binnen 24u zonder escalatie -> geen melding', () => {
    const first = runSweep(input({ errorRows: [errorRow('Netwerk weg', 20)] }))
    const second = runSweep(input({ state: first.state, errorRows: [errorRow('Netwerk weg', 5)] }))
    expect(second.notifications).toHaveLength(0)
  })

  it('een fout die na 24 uur stilte terugkomt telt weer als nieuw', () => {
    const first = runSweep(input({ errorRows: [errorRow('Netwerk weg', 20)] }))
    const later = new Date(NOW.getTime() + 25 * 60 * 60 * 1000)
    const second = runSweep(
      input({
        now: later,
        lastSuccessByJob: freshSuccess(later),
        state: first.state,
        errorRows: [
          {
            context: 'onRequestError:route',
            message: 'Netwerk weg',
            created_at: new Date(later.getTime() - 60_000).toISOString(),
          },
        ],
      }),
    )
    expect(second.notifications).toHaveLength(1)
    expect(second.notifications[0].title).toContain('Nieuwe fouten')
  })

  it('begrenst het aantal onthouden fouttypes (state blijft klein)', () => {
    // Puur alfabetische, unieke tokens: die ontsnappen bewust aan de maskers
    // (zie fingerprint.test.ts), dus dit levert écht 600 losse fingerprints op.
    const token = (i: number) =>
      `${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`
    const rows = Array.from({ length: 600 }, (_, i) => errorRow(`fout soort ${token(i)}q`, 5))

    // Bewijs dat de invoer de cap daadwerkelijk overschrijdt.
    const distinct = new Set(rows.map((r) => `${r.context}|${r.message}`))
    expect(distinct.size).toBe(600)

    const res = runSweep(input({ errorRows: rows }))
    expect(Object.keys(res.state.fingerprints)).toHaveLength(500)
    // en nog steeds ÉÉN gebundelde melding, geen 600.
    expect(res.notifications).toHaveLength(1)
    expect(res.notifications[0].body).toContain('600 nieuwe fouttypes')
  })

  it('ruimt fingerprints op die een week niet meer voorkwamen', () => {
    const first = runSweep(input({ errorRows: [errorRow('Netwerk weg', 20)] }))
    expect(Object.keys(first.state.fingerprints)).toHaveLength(1)
    const muchLater = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000)
    const second = runSweep(
      input({ now: muchLater, lastSuccessByJob: freshSuccess(muchLater), state: first.state }),
    )
    expect(Object.keys(second.state.fingerprints)).toHaveLength(0)
  })
})

describe('sweep — S2a gefaalde taken', () => {
  it('meldt een gefaalde taak met label en deeplink', () => {
    const res = runSweep(
      input({
        failedRuns: [{ job: 'retention', created_at: '2026-08-11T03:45:00.000Z' }],
      }),
    )
    expect(res.notifications).toHaveLength(1)
    expect(res.notifications[0].body).toContain('AVG-bewaartermijnen')
    expect(res.notifications[0].click).toBe(`${BASE}/beheer/jobs`)
    expect(res.state.jobAlerts.retention).toBe(NOW.toISOString())
  })

  it('deelt de throttle-sleutel met de cron-mail: geen tweede alarm binnen 24u', () => {
    const res = runSweep(
      input({
        // Stempel gezet door lib/cron-alert.ts bij het versturen van de mail.
        state: {
          ...emptySweepState(),
          errorWatermark: '2026-08-11T11:00:00.000Z',
          jobAlerts: { retention: '2026-08-11T03:46:00.000Z' },
        },
        failedRuns: [{ job: 'retention', created_at: '2026-08-11T03:45:00.000Z' }],
      }),
    )
    expect(res.notifications).toHaveLength(0)
  })

  it('bundelt meerdere gefaalde taken in één melding', () => {
    const res = runSweep(
      input({
        failedRuns: [
          { job: 'retention', created_at: '2026-08-11T03:45:00.000Z' },
          { job: 'snapshots', created_at: '2026-08-11T02:00:00.000Z' },
        ],
      }),
    )
    expect(res.notifications).toHaveLength(1)
    expect(res.summary.failed_jobs).toBe(2)
  })
})

describe('sweep — stiltevenster bij een dagelijkse cadans', () => {
  const alertAgo = (hours: number) =>
    new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString()

  function withJobAlert(hoursAgo: number) {
    return runSweep(
      input({
        state: {
          ...emptySweepState(),
          errorWatermark: '2026-08-11T11:00:00.000Z',
          jobAlerts: { retention: alertAgo(hoursAgo) },
        },
        failedRuns: [{ job: 'retention', created_at: alertAgo(hoursAgo) }],
      }),
    )
  }

  it('een alarm van 17 uur geleden houdt stand: mail (02:00) en sweep (19:00) samen één alarm', () => {
    // Grootste afstand binnen één etmaal tussen een taak en de sweep:
    // maandsnapshots draaien om 02:00, de sweep om 19:00.
    expect(withJobAlert(17).notifications).toHaveLength(0)
  })

  it('een alarm van 21 uur geleden blokkeert niet meer — de sweep valt niet op zijn eigen rand', () => {
    // Met een venster van 24u zou de dagelijkse ronde van morgen precies op de
    // grens vallen en bij een paar seconden cron-jitter stilletjes overslaan.
    expect(withJobAlert(21).notifications).toHaveLength(1)
  })
})

describe('sweep — S2b uitgebleven taken', () => {
  it('meldt een taak die zijn maxAgeHours overschrijdt', () => {
    const res = runSweep(
      input({
        lastSuccessByJob: {
          retention: '2026-08-08T03:45:00.000Z', // > 26 uur geleden
          snapshots: new Date(NOW.getTime() - 3600_000).toISOString(),
        },
      }),
    )
    expect(res.notifications).toHaveLength(1)
    expect(res.notifications[0].title).toContain('stil')
    expect(res.notifications[0].body).toContain('AVG-bewaartermijnen')
    expect(res.summary.stale_jobs).toBe(1)
  })

  it('een taak die nooit slaagde is ook stil', () => {
    const res = runSweep(
      input({
        lastSuccessByJob: { retention: null, snapshots: null },
      }),
    )
    expect(res.summary.stale_jobs).toBe(2)
    expect(res.notifications[0].body).toContain('nooit')
  })

  it('bewaakt de sweep zichzelf NIET (maxAgeHours null)', () => {
    const res = runSweep(input({ lastSuccessByJob: { retention: null, snapshots: null } }))
    expect(res.notifications[0].body).not.toContain('Meldingen-sweep')
  })

  it('meldt niet nogmaals binnen 24 uur', () => {
    const first = runSweep(input({ lastSuccessByJob: { retention: null, snapshots: null } }))
    const second = runSweep(
      input({ state: first.state, lastSuccessByJob: { retention: null, snapshots: null } }),
    )
    expect(second.notifications).toHaveLength(0)
  })

  it('een net geslaagde taak is niet stil', () => {
    const res = runSweep(input())
    expect(res.notifications).toHaveLength(0)
  })
})

describe('sweep — payloadregel (AVG)', () => {
  it('meldingen dragen nooit message, stack of url', () => {
    const res = runSweep(
      input({
        errorRows: [
          {
            context: 'gebruiker jan@example.com op NL91ABNA0417164300',
            message: 'Saldo van jan@example.com is -1234,56 op rekening NL91ABNA0417164300',
            created_at: new Date(NOW.getTime() - 60_000).toISOString(),
          },
        ],
        failedRuns: [{ job: 'retention', created_at: '2026-08-11T03:45:00.000Z' }],
        lastSuccessByJob: { retention: null, snapshots: null },
      }),
    )
    // LET OP — hoofdletterongevoelig én met scheidingstekens weggestript.
    // Een eerdere versie van deze test vergeleek hoofdlettergevoelig tegen een
    // saneerfunctie die juist lowercase't; hij slaagde toen terwijl het
    // e-mailadres als `jan-example.com` gewoon in de melding stond.
    const payload = JSON.stringify(res.notifications).toLowerCase()
    const squashed = payload.replace(/[^a-z0-9]/g, '')
    expect(payload).not.toContain('example.com')
    expect(squashed).not.toContain('janexamplecom')
    expect(squashed).not.toContain('nl91abna')
    expect(payload).not.toContain('1234,56')
    expect(payload).not.toContain('saldo')
    // De client-aangeleverde context haalt de allowlist niet -> 'onbekend'.
    expect(payload).toContain('onbekend')

    // en de state evenmin (app_settings is voor elke ingelogde gebruiker leesbaar)
    const stateBlob = JSON.stringify(res.state).toLowerCase().replace(/[^a-z0-9]/g, '')
    expect(stateBlob).not.toContain('janexamplecom')
    expect(stateBlob).not.toContain('nl91abna')
  })

  it('een door de client verzonnen context-tag bereikt de melding nooit', () => {
    const res = runSweep(
      input({
        errorRows: [
          {
            // Precies wat een gebruiker via POST /api/log-error kan insturen.
            context: 'Jan Pieter Smit, Dorpsstraat 12 Utrecht',
            message: 'iets ging mis',
            created_at: new Date(NOW.getTime() - 60_000).toISOString(),
          },
        ],
      }),
    )
    const payload = JSON.stringify(res.notifications).toLowerCase()
    expect(payload).not.toContain('dorpsstraat')
    expect(payload).not.toContain('jan')
    expect(payload).toContain('onbekend')
  })

  it('onze eigen tags blijven wel zichtbaar (anders is de melding waardeloos)', () => {
    const res = runSweep(
      input({
        errorRows: [
          {
            context: 'onRequestError:route',
            message: 'iets ging mis',
            created_at: new Date(NOW.getTime() - 60_000).toISOString(),
          },
        ],
      }),
    )
    expect(res.notifications[0].body).toContain('onrequesterror:route')
  })
})

describe('sweep — rust', () => {
  it('zonder signalen geen enkele melding', () => {
    const res = runSweep(input())
    expect(res.notifications).toHaveLength(0)
    expect(res.summary.notifications).toBe(0)
  })
})
