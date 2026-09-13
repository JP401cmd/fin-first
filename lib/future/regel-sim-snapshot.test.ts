import { describe, expect, it } from 'vitest'
import type { HorizonFireSim } from '@/lib/fire-target-shared'
import {
  buildConvergentieAdapterProfile,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import {
  PROFIEL_KERNEL_KOLOMMEN,
  alleenKernelProfiel,
  buildClientRegelSimSnapshot,
  zonderServerOnlyKolommen,
} from './regel-sim-snapshot'

function shared(extra: Record<string, unknown> = {}) {
  return {
    rawContext: {
      profile: {
        id: 'u1',
        date_of_birth: '1984-01-01',
        fire_end_age: 90,
        full_name: 'Voor Naam',
        role: 'superadmin',
        onboarding_draft: { antwoorden: 'GEHEIM' },
        briefing_snapshot: { tekst: 'BRIEFING' },
      },
      assets: [
        {
          id: 'a1',
          asset_type: 'spaarrekening',
          current_value: 1000,
          account_number_encrypted: 'CIPHERTEXT',
          account_number_hash: 'BLINDINDEX',
        },
      ],
      debts: [{ id: 'd1', current_balance: 500 }],
      lifeEvents: [],
      yearlyExpenses: 24_000,
      ...extra,
    },
    fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    withdrawalStrategy: { strategy: 'fixed' },
    aowAgeInt: 68,
    aowAgeFractional: 67.25,
  } as unknown as HorizonFireSim
}

describe('buildClientRegelSimSnapshot (TPR-15)', () => {
  it('profiel: alleen de kernel-kolommen — geen naam, rol, onboarding-antwoorden of briefing', () => {
    const snap = buildClientRegelSimSnapshot(shared())
    expect(snap.rawContext.profile).toEqual({ date_of_birth: '1984-01-01', fire_end_age: 90 })
    expect(JSON.stringify(snap)).not.toMatch(/Voor Naam|superadmin|GEHEIM|BRIEFING/)
  })

  it('vangrail: *_encrypted en *_hash van bezittingen en schulden vallen weg, de rest blijft', () => {
    const snap = buildClientRegelSimSnapshot(shared())
    expect(snap.rawContext.assets[0]).toEqual({ id: 'a1', asset_type: 'spaarrekening', current_value: 1000 })
    expect(JSON.stringify(snap)).not.toMatch(/CIPHERTEXT|BLINDINDEX/)
  })

  it('laat het partnerblok weg', () => {
    const snap = buildClientRegelSimSnapshot(shared({ partner: { inkomen: 1 } }))
    expect('partner' in snap.rawContext).toBe(false)
  })

  it('muteert de server-context niet', () => {
    const bron = shared()
    buildClientRegelSimSnapshot(bron)
    expect((bron.rawContext.profile as unknown as Record<string, unknown>).full_name).toBe('Voor Naam')
  })

  it('draagt de weergavevelden één-op-één over', () => {
    const snap = buildClientRegelSimSnapshot(shared())
    expect(snap.aowAgeInt).toBe(68)
    expect(snap.aowFractional).toBe(67.25)
  })

  it('zonderServerOnlyKolommen matcht alleen het achtervoegsel', () => {
    expect(zonderServerOnlyKolommen({ hash_bucket: 1, encrypted_at: 2, x_hash: 3 })).toEqual({
      hash_bucket: 1,
      encrypted_at: 2,
    })
  })
})

describe('profiel-whitelist dekt precies wat de kernel leest', () => {
  it('elk veld dat buildConvergentieAdapterProfile leest, staat op de whitelist (Proxy-meting)', () => {
    const gelezen = new Set<string>()
    const spion = new Proxy({} as ConvergentieRawProfileRow, {
      get(_t, key) {
        if (typeof key === 'string') gelezen.add(key)
        return undefined
      },
    })
    buildConvergentieAdapterProfile(spion)
    const whitelist = new Set<string>(PROFIEL_KERNEL_KOLOMMEN)
    const ontbrekend = [...gelezen].filter((k) => !whitelist.has(k))
    expect(ontbrekend, `adapter leest velden die de client-snapshot weglaat: ${ontbrekend.join(', ')}`).toEqual([])
  })

  it('de whitelist verandert de adapter-invoer niet (volledige rij ≡ gefilterde rij)', () => {
    const vol: Record<string, unknown> = { id: 'u1', full_name: 'X', onboarding_draft: {} }
    PROFIEL_KERNEL_KOLOMMEN.forEach((k, i) => {
      vol[k] = `waarde-${i}`
    })
    const volRij = vol as unknown as ConvergentieRawProfileRow
    expect(buildConvergentieAdapterProfile(alleenKernelProfiel(volRij))).toEqual(buildConvergentieAdapterProfile(volRij))
  })
})
