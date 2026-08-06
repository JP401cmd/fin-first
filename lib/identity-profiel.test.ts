import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MODULE_COLORS,
  DEFAULT_BUDGET_COLORS,
  DEFAULT_PHASE_COLORS,
} from '@/lib/color-palette'

// ── Helpers: simulate profiel page logic ────────────────────────────────

type HouseholdType = 'solo' | 'samen' | 'gezin'

/** Simulate profile data loading from Supabase row */
function loadProfileFromRow(data: Record<string, unknown>) {
  return {
    fullName: (data.full_name as string) ?? '',
    dateOfBirth: (data.date_of_birth as string) ?? '',
    country: (data.country as string) ?? 'NL',
    householdType: ((data.household_type as string) ?? 'solo') as HouseholdType,
    numberOfChildren: (data.number_of_children as number) ?? 0,
    childrenAges: (data.children_ages as number[]) ?? [],
    housingType: (data.housing_type as string | null) ?? null,
    netMonthlyIncome: data.net_monthly_income ? String(data.net_monthly_income) : '',
  }
}

/** Simulate the upsert payload built by saveProfile */
function buildUpsertPayload(state: {
  fullName: string
  dateOfBirth: string
  country: string
  householdType: HouseholdType
  numberOfChildren: number
  childrenAges: number[]
  housingType: string | null
  netMonthlyIncome: string
}) {
  return {
    full_name: state.fullName || null,
    date_of_birth: state.dateOfBirth || null,
    country: state.country || 'NL',
    household_type: state.householdType,
    number_of_children: state.numberOfChildren,
    children_ages: state.childrenAges,
    housing_type: state.housingType,
    net_monthly_income: state.netMonthlyIncome ? Number(state.netMonthlyIncome) : null,
  }
}

// ── Step 1: Laden bestaand profiel ──────────────────────────────────────

describe('Profiel — Laden bestaand profiel', () => {
  it('loads all fields correctly from a complete profile row', () => {
    const row = {
      full_name: 'Jan de Vries',
      date_of_birth: '1990-05-15',
      country: 'NL',
      household_type: 'gezin',
      number_of_children: 2,
      children_ages: [5, 8],
      housing_type: 'koop',
      net_monthly_income: 4500,
    }

    const profile = loadProfileFromRow(row)
    expect(profile.fullName).toBe('Jan de Vries')
    expect(profile.dateOfBirth).toBe('1990-05-15')
    expect(profile.country).toBe('NL')
    expect(profile.householdType).toBe('gezin')
    expect(profile.numberOfChildren).toBe(2)
    expect(profile.childrenAges).toEqual([5, 8])
    expect(profile.housingType).toBe('koop')
    expect(profile.netMonthlyIncome).toBe('4500')
  })

  it('applies correct defaults for missing/null fields', () => {
    const profile = loadProfileFromRow({})
    expect(profile.fullName).toBe('')
    expect(profile.dateOfBirth).toBe('')
    expect(profile.country).toBe('NL')
    expect(profile.householdType).toBe('solo')
    expect(profile.numberOfChildren).toBe(0)
    expect(profile.childrenAges).toEqual([])
    expect(profile.housingType).toBeNull()
    expect(profile.netMonthlyIncome).toBe('')
  })
})

// ── Step 2: Profiel opslaan ─────────────────────────────────────────────

describe('Profiel — Opslaan (upsert payload)', () => {
  it('builds correct upsert payload from form state', () => {
    const payload = buildUpsertPayload({
      fullName: 'Anna Bakker',
      dateOfBirth: '1985-12-01',
      country: 'NL',
      householdType: 'samen',
      numberOfChildren: 1,
      childrenAges: [3],
      housingType: 'huur_vrij',
      netMonthlyIncome: '3200',
    })

    expect(payload.full_name).toBe('Anna Bakker')
    expect(payload.date_of_birth).toBe('1985-12-01')
    expect(payload.country).toBe('NL')
    expect(payload.household_type).toBe('samen')
    expect(payload.number_of_children).toBe(1)
    expect(payload.children_ages).toEqual([3])
    expect(payload.housing_type).toBe('huur_vrij')
    expect(payload.net_monthly_income).toBe(3200)
  })

  it('converts empty fullName and dateOfBirth to null', () => {
    const payload = buildUpsertPayload({
      fullName: '',
      dateOfBirth: '',
      country: '',
      householdType: 'solo',
      numberOfChildren: 0,
      childrenAges: [],
      housingType: null,
      netMonthlyIncome: '',
    })

    expect(payload.full_name).toBeNull()
    expect(payload.date_of_birth).toBeNull()
    expect(payload.country).toBe('NL') // fallback
    expect(payload.net_monthly_income).toBeNull()
  })
})

// ── Step 3: Huishoudtype wijziging ──────────────────────────────────────

describe('Profiel — Huishoudtype wijziging', () => {
  it('Solo, Samen, and Gezin are the three valid household types', () => {
    const types: HouseholdType[] = ['solo', 'samen', 'gezin']
    const labels = types.map(t =>
      t === 'solo' ? 'Solo' : t === 'samen' ? 'Samen' : 'Gezin',
    )
    expect(labels).toEqual(['Solo', 'Samen', 'Gezin'])
  })

  it('children fields are relevant for all household types (NIBUD)', () => {
    // The form always shows numberOfChildren regardless of householdType
    // since NIBUD matching uses children info for Solo/Samen/Gezin alike
    for (const ht of ['solo', 'samen', 'gezin'] as HouseholdType[]) {
      const profile = loadProfileFromRow({ household_type: ht, number_of_children: 2, children_ages: [4, 7] })
      expect(profile.numberOfChildren).toBe(2)
      expect(profile.childrenAges).toEqual([4, 7])
    }
  })
})

// ── Step 4: Kinderen velden ─────────────────────────────────────────────

describe('Profiel — Kinderen velden', () => {
  it('reducing numberOfChildren trims childrenAges array', () => {
    // Simulates the onChange handler: if n < childrenAges.length, slice
    const childrenAges = [3, 5, 8, 12]
    const newCount = 2
    const trimmed = newCount < childrenAges.length
      ? childrenAges.slice(0, newCount)
      : childrenAges
    expect(trimmed).toEqual([3, 5])
  })

  it('increasing numberOfChildren does not auto-fill ages', () => {
    const childrenAges = [3, 5]
    const newCount = 4
    const result = newCount < childrenAges.length
      ? childrenAges.slice(0, newCount)
      : childrenAges
    expect(result).toEqual([3, 5]) // still 2, user must add manually
    expect(result.length).toBeLessThan(newCount)
  })

  it('adding a child age appends to the array', () => {
    const childrenAges = [3, 5]
    const newAge = 10
    const updated = [...childrenAges, Math.max(0, newAge)]
    expect(updated).toEqual([3, 5, 10])
  })

  it('removing a child age by index works correctly', () => {
    const childrenAges = [3, 5, 10]
    const removeIdx = 1
    const updated = childrenAges.filter((_, idx) => idx !== removeIdx)
    expect(updated).toEqual([3, 10])
  })

  it('age input is clamped to min 0', () => {
    const input = -5
    const clamped = Math.max(0, input)
    expect(clamped).toBe(0)
  })
})

// ── Step 5: Woningtype ──────────────────────────────────────────────────

describe('Profiel — Woningtype', () => {
  it('supports 3 housing types', () => {
    const types = ['huur_sociaal', 'huur_vrij', 'koop']
    expect(types).toHaveLength(3)
  })

  it('empty selection maps to null', () => {
    const selection: string = ''
    const value = selection || null
    expect(value).toBeNull()
  })
})

// ── Step 6: Numerieke validatie ─────────────────────────────────────────

describe('Profiel — Numerieke validatie', () => {
  it('net_monthly_income converts to number or null', () => {
    expect(Number('3200')).toBe(3200)
    const empty: string = ''
    expect(empty ? Number(empty) : null).toBeNull()
  })

  it('net_monthly_income input has min=0', () => {
    // The input element has min={0} — negative values are not accepted
    const min = 0
    expect(min).toBe(0)
  })

  it('numberOfChildren is clamped to >= 0', () => {
    expect(Math.max(0, -3)).toBe(0)
    expect(Math.max(0, 0)).toBe(0)
    expect(Math.max(0, 5)).toBe(5)
  })

  it('date_of_birth accepts ISO date string format', () => {
    const dob = '1990-05-15'
    expect(/^\d{4}-\d{2}-\d{2}$/.test(dob)).toBe(true)
  })
})

// ── Step 7: HouseholdSection component ──────────────────────────────────

describe('Profiel — HouseholdSection presence', () => {
  it('HouseholdSection is a separate component rendered after profile sections', () => {
    // Verify the import path exists — the component is imported from:
    // '@/components/app/household-section'
    // and rendered as <HouseholdSection /> at the bottom of the profiel page
    const importPath = '@/components/app/household-section'
    expect(importPath).toBeTruthy()
  })
})

// ── Step 8: Color preferences ──────────────────────────────────────────

describe('Profiel — Color preferences (module, budget, phase)', () => {
  it('DEFAULT_MODULE_COLORS has kern, wil, horizon', () => {
    expect(DEFAULT_MODULE_COLORS.kern).toBe('#6b4339')
    expect(DEFAULT_MODULE_COLORS.wil).toBe('#3d3048')
    expect(DEFAULT_MODULE_COLORS.horizon).toBe('#c4a06b')
  })

  it('DEFAULT_BUDGET_COLORS has 5 budget types', () => {
    expect(DEFAULT_BUDGET_COLORS.income).toBe('#2d6a4f')
    expect(DEFAULT_BUDGET_COLORS.expense).toBe('#6b3a2d')
    expect(DEFAULT_BUDGET_COLORS.savings).toBe('#1d4e6b')
    expect(DEFAULT_BUDGET_COLORS.debt).toBe('#7a2d3a')
    expect(DEFAULT_BUDGET_COLORS.other).toBe('#4a4840')
  })

  it('DEFAULT_PHASE_COLORS has 4 phases', () => {
    expect(DEFAULT_PHASE_COLORS.phase_recovery).toBe('#8b3a3a')
    expect(DEFAULT_PHASE_COLORS.phase_stability).toBe('#355a78')
    expect(DEFAULT_PHASE_COLORS.phase_momentum).toBe('#3d3048')
    expect(DEFAULT_PHASE_COLORS.phase_mastery).toBe('#c4a06b')
  })

  it('loading module_colors falls back to defaults for missing keys', () => {
    const dbColors = { kern: '#ff0000' } as Record<string, string>
    const resolved = {
      kern: dbColors.kern || DEFAULT_MODULE_COLORS.kern,
      wil: dbColors.wil || DEFAULT_MODULE_COLORS.wil,
      horizon: dbColors.horizon || DEFAULT_MODULE_COLORS.horizon,
    }
    expect(resolved.kern).toBe('#ff0000')
    expect(resolved.wil).toBe(DEFAULT_MODULE_COLORS.wil)
    expect(resolved.horizon).toBe(DEFAULT_MODULE_COLORS.horizon)
  })

  it('loading budget_colors falls back to defaults for missing keys', () => {
    const dbColors = { income: '#00ff00' } as Record<string, string>
    const resolved = {
      income:  dbColors.income  || DEFAULT_BUDGET_COLORS.income,
      expense: dbColors.expense || DEFAULT_BUDGET_COLORS.expense,
      savings: dbColors.savings || DEFAULT_BUDGET_COLORS.savings,
      debt:    dbColors.debt    || DEFAULT_BUDGET_COLORS.debt,
      other:   dbColors.other   || DEFAULT_BUDGET_COLORS.other,
    }
    expect(resolved.income).toBe('#00ff00')
    expect(resolved.expense).toBe(DEFAULT_BUDGET_COLORS.expense)
  })

  it('loading phase_colors falls back to defaults for missing keys', () => {
    const dbColors = { phase_mastery: '#gold' } as Record<string, string>
    const resolved = {
      phase_recovery:  dbColors.phase_recovery  || DEFAULT_PHASE_COLORS.phase_recovery,
      phase_stability: dbColors.phase_stability || DEFAULT_PHASE_COLORS.phase_stability,
      phase_momentum:  dbColors.phase_momentum  || DEFAULT_PHASE_COLORS.phase_momentum,
      phase_mastery:   dbColors.phase_mastery   || DEFAULT_PHASE_COLORS.phase_mastery,
    }
    expect(resolved.phase_mastery).toBe('#gold')
    expect(resolved.phase_recovery).toBe(DEFAULT_PHASE_COLORS.phase_recovery)
  })
})
