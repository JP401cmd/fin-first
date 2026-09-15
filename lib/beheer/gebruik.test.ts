import { describe, it, expect } from 'vitest'
import {
  checkinMaandenUitSleutels,
  duidFeatureVisits,
  groepeerAiAanroepen,
  telling,
  type GebruikersActiviteit,
} from './gebruik'

describe('groepeerAiAanroepen', () => {
  it('telt per functie, meest gebruikte eerst, gelijkspel alfabetisch', () => {
    expect(
      groepeerAiAanroepen([{ feature: 'chat' }, { feature: 'briefing' }, { feature: 'chat' }, { feature: 'aanbeveling' }, { feature: null }]),
    ).toEqual([
      { feature: 'chat', aanroepen: 2 },
      { feature: 'aanbeveling', aanroepen: 1 },
      { feature: 'briefing', aanroepen: 1 },
      { feature: 'onbekend', aanroepen: 1 },
    ])
  })

  it('lege invoer → lege lijst', () => {
    expect(groepeerAiAanroepen([])).toEqual([])
  })
})

describe('duidFeatureVisits', () => {
  it('scheidt afgeronde app-setups van gidsstappen en negeert meldingmarkers', () => {
    expect(
      duidFeatureVisits([
        'budgetteren_setup_completed',
        'crypto_holdings_setup_completed',
        'guide_tips',
        'guide_nieuws',
        'horizon_exit_notice_dismissed',
      ]),
    ).toEqual({ appsIngericht: ['budgetteren', 'crypto_holdings'], gidsStappenBekeken: 2 })
  })
})

describe('checkinMaandenUitSleutels', () => {
  const uid = '11111111-2222-3333-4444-555555555555'

  it('haalt alleen maanden uit de eigen snapshot-sleutels, nieuwste eerst, ontdubbeld', () => {
    expect(
      checkinMaandenUitSleutels(
        [
          `checkin_snapshot_${uid}_2026-07`,
          `checkin_snapshot_${uid}_2026-09`,
          `checkin_snapshot_${uid}_2026-09`,
          `checkin_snapshot_99999999-2222-3333-4444-555555555555_2026-08`,
          `checkin_snapshot_${uid}_rommel`,
        ],
        uid,
      ),
    ).toEqual(['2026-09', '2026-07'])
  })
})

describe('telling', () => {
  it('geeft null bij een fout, nooit een misleidende 0', () => {
    expect(telling({ count: null, error: { message: 'relation does not exist' } })).toBeNull()
    expect(telling({ count: 7, error: null })).toBe(7)
    expect(telling({ count: null, error: null })).toBe(0)
  })
})

describe('GebruikersActiviteit — contract zonder inhoud', () => {
  it('bevat geen veld dat een bedrag, naam of omschrijving kan dragen', () => {
    // Compile-borging: dit object moet het volledige type vullen. Voegt iemand
    // een veld toe, dan dwingt de compiler deze test mee te bewegen — en dan
    // hoort de veldnaam langs de verboden-lijst hieronder.
    const voorbeeld: GebruikersActiviteit = {
      actieveDagen30: 3,
      laatsteActieveDag: '2026-09-14',
      aiAanroepen30: 4,
      aiPerFunctie: [{ feature: 'chat', aanroepen: 4 }],
      aiPerFunctieSteekproef: false,
      appsIngericht: ['budgetteren'],
      gidsStappenBekeken: 2,
      aantallen: { bezittingen: 1, schulden: 0, transacties: 12, laatsteTransactieToegevoegd: null },
      bank: { koppelingen: 0, laatsteSync: null, laatsteSyncStatus: null },
      checkinMaanden: [],
      meldingen: 0,
    }
    const sleutels: string[] = []
    const loop = (o: unknown) => {
      if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o)) {
          sleutels.push(k)
          loop(v)
        }
      }
    }
    loop(voorbeeld)
    const verboden = /value|amount|bedrag|saldo|balance|total|netWorth|vermogen|name|naam|description|omschrijving|iban|title|content|reflect/i
    expect(sleutels.filter((k) => verboden.test(k))).toEqual([])
  })
})
