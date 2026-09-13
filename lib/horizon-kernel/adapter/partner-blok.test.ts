/**
 * TPR-07 — het partnerblok als ÉÉN helper. Toetst:
 *  - de RPC-rij → `KernelAdapterProfile`-mapping (incl. kolom-hernoeming en NUMERIC-als-string);
 *  - de privacy-/geschiktheidspoorten: geen profiel, toekomst verborgen, geen geboortedatum → null;
 *  - dat een al-gemapt adapter-profiel ongewijzigd doorreist (de huishoud-router-route);
 *  - dat optionele velden alleen als sleutel verschijnen wanneer ze zijn meegegeven.
 */

import { describe, it, expect } from 'vitest'
import type { KernelAdapterProfile } from './params'
import {
  buildKernelPartnerBlok,
  memberProfileToKernelAdapterProfile,
  type KernelMemberProfileRow,
} from './partner-blok'

const RPC_ROW: KernelMemberProfileRow = {
  date_of_birth: '1984-05-01',
  net_monthly_income: '3200.50',
  estimated_monthly_expenses: 2100,
  expected_return: '0.06',
  inflation_rate: 0.02,
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: null,
  retirement_expense_method: 'current_expenses',
  retirement_expense_custom_amount: '18000',
  future_hidden: false,
}

describe('memberProfileToKernelAdapterProfile — RPC-rij → adapter-profiel', () => {
  it('mapt 1:1 met kolom-hernoeming en cast NUMERIC-strings naar getallen', () => {
    const p = memberProfileToKernelAdapterProfile(RPC_ROW)
    expect(p).toEqual({
      date_of_birth: '1984-05-01',
      net_monthly_income: 3200.5,
      estimated_monthly_expenses: 2100,
      expected_return: 0.06,
      inflation_rate: 0.02,
      fire_end_strategy: 'deplete',
      fire_end_age: 90,
      fire_legacy_amount: null,
      retirement_expense_method: 'current_expenses',
      retirement_custom_amount: 18000,
    })
  })

  it('null-profiel → alle velden null (neutrale doorgifte, geen throw)', () => {
    const p = memberProfileToKernelAdapterProfile(null)
    expect(p.date_of_birth).toBeNull()
    expect(p.net_monthly_income).toBeNull()
    expect(p.retirement_custom_amount).toBeNull()
  })
})

describe('buildKernelPartnerBlok — poorten', () => {
  it('geen profiel → null (solo-run)', () => {
    expect(buildKernelPartnerBlok({ profile: null })).toBeNull()
    expect(buildKernelPartnerBlok({ profile: undefined })).toBeNull()
  })

  it('toekomst verborgen (future_hidden) → null, ook als er velden staan', () => {
    expect(buildKernelPartnerBlok({ profile: { ...RPC_ROW, future_hidden: true } })).toBeNull()
  })

  it('geen geboortedatum → null (zonder tijdas kan de PT-laag niet bouwen)', () => {
    expect(buildKernelPartnerBlok({ profile: { ...RPC_ROW, date_of_birth: null } })).toBeNull()
    const mapped: KernelAdapterProfile = { date_of_birth: null, net_monthly_income: 3000 }
    expect(buildKernelPartnerBlok({ profile: mapped })).toBeNull()
  })
})

describe('buildKernelPartnerBlok — samenstelling', () => {
  it('RPC-rij → blok met gemapt profiel; optionele velden ontbreken als sleutel', () => {
    const blok = buildKernelPartnerBlok({ profile: RPC_ROW })
    expect(blok).not.toBeNull()
    expect(blok!.profile).toEqual(memberProfileToKernelAdapterProfile(RPC_ROW))
    expect(Object.keys(blok!)).toEqual(['profile'])
  })

  it('al-gemapt adapter-profiel reist ongewijzigd door (referentie behouden) + aowRows/lifeEvents mee', () => {
    const mapped: KernelAdapterProfile = { date_of_birth: '1980-01-01', net_monthly_income: 4000 }
    const aowRows = [] as const
    const lifeEvents = [] as const
    const blok = buildKernelPartnerBlok({ profile: mapped, aowRows, lifeEvents })
    expect(blok!.profile).toBe(mapped)
    expect(blok!.aowRows).toBe(aowRows)
    expect(blok!.lifeEvents).toBe(lifeEvents)
    expect(Object.keys(blok!).sort()).toEqual(['aowRows', 'lifeEvents', 'profile'])
  })
})
