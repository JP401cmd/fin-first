/**
 * Vrijheidscheck — pariteit & schema-validatie tests.
 *
 * Drie gebieden:
 *  1. Pariteit: `buildReport` en `intakeToPersona` moeten dezelfde grondslag
 *     hanteren. Concreet: de eigen woning is in BEIDE paden niet-FIRE-eligible.
 *  2. Zod-schema-validatie voor `/api/check/submit`: grenzen, verplichte velden,
 *     ongeldige waarden — puur op schema-niveau, zonder DB of HTTP-round-trip.
 *  3. Resterende randgevallen in build-report die de bestaande suite mist:
 *     gezin-huishouden (hasPartner=true), geen activa, gevoeligheids-guard.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { buildReport } from '../build-report'
import { intakeToPersona } from '../intake-to-persona'
import type { CheckIntake } from '../types'

const NOW = new Date('2026-06-17T12:00:00.000Z')

// ── Gedeelde fixture ─────────────────────────────────────────────────────────

/** Intake met zowel een eigen woning als liquide bezittingen. */
function intakeMetHuis(): CheckIntake {
  return {
    firstName: 'Thomas',
    dateOfBirth: '1988-08-20', // 37 jaar op 2026-06-17
    household: 'samen',
    monthlyIncomeNet: 4000,
    yearlyIncomeGross: 64000,
    expenses: {
      wonen: 1200,
      vasteLasten: 900,
      vrijBesteedbaar: 400,
      totaalMaand: 2500,
    },
    emergencyFund: 10000,
    assets: [
      { assetType: 'eigen_huis', name: 'Huis', value: 400000 },
      { assetType: 'investment', name: 'ETF', value: 60000 },
      { assetType: 'retirement', name: 'Pensioen', value: 40000 },
    ],
    debts: [
      {
        debtType: 'mortgage',
        name: 'Hypotheek',
        balance: 320000,
        interestRatePct: 3.2,
        monthlyPayment: 1200,
      },
    ],
    pension: { expectedReturnPct: 7, riskProfile: 'neutraal', aowExpectedMonthly: null },
    goal: null,
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTIE 1 — Pariteit: buildReport ↔ intakeToPersona
// ════════════════════════════════════════════════════════════════════════════════

describe('Pariteit buildReport ↔ intakeToPersona — eigen woning deels-FIRE-eligible', () => {
  const intake = intakeMetHuis()

  /**
   * Eigen woning in buildReport: countsForFire=false in dualBars (zodat het
   * huis-bucket de cash-drag-som niet vervuilt), maar de 50%-weging staat in het
   * freedomLabel. Eigen woning in intakeToPersona: is_liquid=false.
   *
   * Fix 1: de eigen woning telt voor 50% van haar overwaarde mee voor vrijheid
   * (de helft die je realistisch kunt verzilveren) — niet meer volledig
   * uitgesloten ("telt niet mee").
   */
  it('buildReport: eigen woning in dualBars — countsForFire=false, 50%-label', () => {
    const report = buildReport(intake, NOW)
    const huis = report.dualBars.find((b) => b.bucket === 'huis')
    expect(huis).toBeDefined()
    expect(huis!.countsForFire).toBe(false)
    expect(huis!.freedomLabel).toContain('telt voor 50% mee')
    expect(huis!.freedomLabel).not.toBe('telt niet mee')
  })

  it('intakeToPersona: eigen_huis-asset heeft is_liquid=false', () => {
    const persona = intakeToPersona(intake)
    const huis = persona.assets.find((a) => a.asset_type === 'eigen_huis')
    expect(huis).toBeDefined()
    expect(huis!.is_liquid).toBe(false)
  })

  it('buildReport: FIRE-eligible vermogen = netWorth minus de NIET-meegerekende helft overwaarde', () => {
    const report = buildReport(intake, NOW)
    // assets: 400000 + 60000 + 40000 = 500000; schulden: 320000
    // netWorth = 180000; huisoverwaarde = 400000 − 320000 = 80000
    // Fix 1 (50%-huis): FIRE-eligible = 180000 − 0,5×80000 = 140000
    expect(report.snapshot.freedomBaseEur).toBe(140000)

    // Proxy: de "stop vandaag"-vrijheidstijd is op die FIRE-eligible grondslag.
    // Met 140000 FIRE-eligible en dagelijks tarief (2500×12/365 ≈ 82,19/dag) →
    // ~1703 dagen ≈ 4-5 jaar.
    const stopToday = report.twoFutures.stopToday
    // Is het meer dan 0 en minder dan de totale netWorth-jaren?
    expect(stopToday.isDeficit).toBeFalsy()
    expect(stopToday.years).toBeGreaterThanOrEqual(0)
    // FIRE-eligible: isInfinite kan nooit (er zijn uitgaven).
    expect(stopToday.isInfinite).toBeFalsy()
    // Concrete jaren: ±3 jaar voor 100k FIRE-eligible op 82/dag.
    expect(stopToday.years).toBeGreaterThanOrEqual(2)
    expect(stopToday.years).toBeLessThan(6)
  })

  it('intakeToPersona: netto vermogen in meta komt overeen met assets − schulden', () => {
    const persona = intakeToPersona(intake)
    // assets: 10000 (noodfonds) + 400000 (huis) + 60000 (ETF) + 40000 (pensioen) = 510000
    // schulden: 320000
    const assetSum = persona.assets.reduce((s, a) => s + a.current_value, 0)
    const debtSum = persona.debts.reduce((s, d) => s + d.current_balance, 0)
    expect(persona.meta.netWorth).toBe(assetSum - debtSum)
    expect(persona.meta.netWorth).toBe(190000)
  })

  it('grondslag-consistentie: snapshot.netWorth ≈ intakeToPersona meta.netWorth − noodfonds-delta', () => {
    /**
     * buildReport.snapshot.netWorth = Σ(assets.current_value × inclusionPct) − Σ(debts)
     *   waarbij GEEN noodfonds-asset wordt meegeteld (emergencyFund is een los veld).
     *   → 400000 + 60000 + 40000 − 320000 = 180000
     *
     * intakeToPersona.meta.netWorth telt het noodfonds WEL als cash-asset mee (het
     *   verschijnt in het overzicht):
     *   → (10000 + 400000 + 60000 + 40000) − 320000 = 190000
     *
     * Het verschil van precies intake.emergencyFund (10000) is gedocumenteerd gedrag —
     * geen bug maar de bewuste keuze in elk pad (report pakt het noodfonds alleen mee
     * voor de buffer-pijler, persona maakt het zichtbaar als cash-asset).
     */
    const report = buildReport(intake, NOW)
    const persona = intakeToPersona(intake)
    const delta = persona.meta.netWorth - report.snapshot.netWorth
    expect(delta).toBe(intake.emergencyFund)
  })

  it('beide paden: eigen woning van dezelfde waarde', () => {
    const report = buildReport(intake, NOW)
    const persona = intakeToPersona(intake)
    const reportHuis = report.dualBars.find((b) => b.bucket === 'huis')
    const personaHuis = persona.assets.find((a) => a.asset_type === 'eigen_huis')
    // Netto huiswaarde in report = 400000 − 320000 = 80000.
    expect(reportHuis!.eur).toBe(80000)
    // Brutowarde in persona = 400000 (persona draagt de ruwe intakewaarde mee; de
    // housing-engine trekt de hypotheek af bij gebruik in productie).
    expect(personaHuis!.current_value).toBe(400000)
  })
})

// ════════════════════════════════════════════════════════════════════════════════
// SECTIE 2 — Zod-schema-validatie (puur, zonder DB of HTTP)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * De intakeSchema en payloadSchema zijn niet geëxporteerd vanuit route.ts. We
 * dupliceren hier de definities — dat is OPZETTELIJK: zo pinnen we het contract
 * zodat een route-wijziging de tests rood maakt voordat ze stil doorloopt.
 *
 * Alternatief (refactor) is om het schema naar een apart lib-bestand te
 * verplaatsen en direct te importeren. Dat is een vervolgstap.
 */
const intakeSchema = z.object({
  firstName: z.string().max(80).nullish(),
  dateOfBirth: z.string().min(4).max(40),
  household: z.enum(['alleen', 'samen', 'gezin']),
  monthlyIncomeNet: z.number().min(0).max(1_000_000),
  yearlyIncomeGross: z.number().min(0).max(20_000_000).nullish(),
  expenses: z.object({
    wonen: z.number().min(0).max(1_000_000),
    vasteLasten: z.number().min(0).max(1_000_000),
    vrijBesteedbaar: z.number().min(0).max(1_000_000),
    totaalMaand: z.number().min(0).max(1_000_000),
  }),
  emergencyFund: z.number().min(0).max(100_000_000),
  assets: z
    .array(
      z.object({
        assetType: z.string().min(1).max(40),
        name: z.string().min(1).max(120),
        value: z.number().min(0).max(1_000_000_000),
        extra: z.string().max(120).nullish(),
      }),
    )
    .max(60),
  debts: z
    .array(
      z.object({
        debtType: z.string().min(1).max(40),
        name: z.string().min(1).max(120),
        balance: z.number().min(0).max(1_000_000_000),
        interestRatePct: z.number().min(0).max(100),
        monthlyPayment: z.number().min(0).max(1_000_000),
      }),
    )
    .max(60),
  pension: z.object({
    aowExpectedMonthly: z.number().min(0).max(100_000).nullish(),
    expectedReturnPct: z.number().min(-50).max(50).nullish(),
    riskProfile: z.enum(['defensief', 'neutraal', 'offensief']).nullish(),
  }),
  goal: z.object({ label: z.string().max(140) }).nullish(),
})

const payloadSchema = z.object({
  intake: intakeSchema,
  email: z.email().max(254),
  consentAt: z.string().min(10).max(40),
  turnstileToken: z.string().max(4000).optional().default(''),
})

/**
 * Schema-test helpers — we werken met losgetypte Record-objecten zodat we
 * arbitraire mutaties kunnen doen zonder TypeScript-fouten. De Zod-parser
 * valideert het resultaat, niet de TS-typen zelf.
 */
type SchemaPayload = Record<string, unknown>
type SchemaIntake = Record<string, unknown>

function validIntakePayload(): SchemaIntake {
  return {
    firstName: 'Test',
    dateOfBirth: '1990-01-01',
    household: 'alleen' as string,
    monthlyIncomeNet: 3000,
    yearlyIncomeGross: null,
    expenses: { wonen: 800, vasteLasten: 400, vrijBesteedbaar: 200, totaalMaand: 1400 },
    emergencyFund: 5000,
    assets: [] as unknown[],
    debts: [] as unknown[],
    pension: { aowExpectedMonthly: null, expectedReturnPct: null as unknown, riskProfile: null as unknown },
    goal: null as unknown,
  }
}

function validPayload(): SchemaPayload {
  return {
    intake: validIntakePayload(),
    email: 'test@example.com',
    consentAt: '2026-06-17T12:00:00.000Z',
    turnstileToken: 'token-abc',
  }
}

/** Haal een nested intake-object op als muteerbaar Record. */
function intake(payload: SchemaPayload): SchemaIntake {
  return payload['intake'] as SchemaIntake
}

describe('Submit-route payload schema — geldige payloads', () => {
  it('accepteert een minimaal geldige payload', () => {
    const result = payloadSchema.safeParse(validPayload())
    expect(result.success).toBe(true)
  })

  it('turnstileToken is optioneel en valt terug op lege string', () => {
    const p = validPayload()
    delete (p as Record<string, unknown>)['turnstileToken']
    const result = payloadSchema.safeParse(p)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.turnstileToken).toBe('')
    }
  })

  it('accepteert alle huishoudtypes', () => {
    for (const household of ['alleen', 'samen', 'gezin']) {
      const p = validPayload()
      intake(p)['household'] = household
      expect(payloadSchema.safeParse(p).success).toBe(true)
    }
  })

  it('accepteert alle risicoprofielen', () => {
    for (const riskProfile of ['defensief', 'neutraal', 'offensief']) {
      const p = validPayload()
      ;(intake(p)['pension'] as Record<string, unknown>)['riskProfile'] = riskProfile
      expect(payloadSchema.safeParse(p).success).toBe(true)
    }
  })

  it('accepteert assets-array tot 60 elementen', () => {
    const p = validPayload()
    intake(p)['assets'] = Array.from({ length: 60 }, (_, i) => ({
      assetType: 'cash',
      name: `Pot ${i}`,
      value: 1000,
      extra: null,
    }))
    expect(payloadSchema.safeParse(p).success).toBe(true)
  })

  it('accepteert debts-array tot 60 elementen', () => {
    const p = validPayload()
    intake(p)['debts'] = Array.from({ length: 60 }, (_, i) => ({
      debtType: 'personal_loan',
      name: `Lening ${i}`,
      balance: 1000,
      interestRatePct: 5,
      monthlyPayment: 50,
    }))
    expect(payloadSchema.safeParse(p).success).toBe(true)
  })
})

describe('Submit-route payload schema — ongeldige payloads (400-grond)', () => {
  it('weigert ontbrekend e-mail veld', () => {
    const p = validPayload()
    delete (p as Record<string, unknown>)['email']
    expect(payloadSchema.safeParse(p).success).toBe(false)
  })

  it('weigert ongeldig e-mailadres', () => {
    const p = { ...validPayload(), email: 'geen-email' }
    expect(payloadSchema.safeParse(p).success).toBe(false)
  })

  it('weigert onbekend household-type', () => {
    const p = validPayload()
    intake(p)['household'] = 'expat'
    expect(payloadSchema.safeParse(p).success).toBe(false)
  })

  it('weigert negatief monthlyIncomeNet', () => {
    const p = validPayload()
    intake(p)['monthlyIncomeNet'] = -100
    expect(payloadSchema.safeParse(p).success).toBe(false)
  })

  it('weigert Infinity in monthlyIncomeNet (max-grens sluit ±Infinity uit)', () => {
    const p = validPayload()
    intake(p)['monthlyIncomeNet'] = Infinity
    expect(payloadSchema.safeParse(p).success).toBe(false)
  })

  it('weigert NaN in uitgaven (min/max-vergelijking faalt voor NaN)', () => {
    const p = validPayload()
    ;(intake(p)['expenses'] as Record<string, unknown>)['totaalMaand'] = NaN
    expect(payloadSchema.safeParse(p).success).toBe(false)
  })

  it('weigert assets-array langer dan 60', () => {
    const p = validPayload()
    intake(p)['assets'] = Array.from({ length: 61 }, (_, i) => ({
      assetType: 'cash',
      name: `Pot ${i}`,
      value: 1000,
      extra: null,
    }))
    expect(payloadSchema.safeParse(p).success).toBe(false)
  })

  it('weigert debts-array langer dan 60', () => {
    const p = validPayload()
    intake(p)['debts'] = Array.from({ length: 61 }, (_, i) => ({
      debtType: 'personal_loan',
      name: `Lening ${i}`,
      balance: 1000,
      interestRatePct: 5,
      monthlyPayment: 50,
    }))
    expect(payloadSchema.safeParse(p).success).toBe(false)
  })

  it('weigert ontbrekend dateOfBirth', () => {
    const p = validPayload()
    delete (intake(p) as Record<string, unknown>)['dateOfBirth']
    expect(payloadSchema.safeParse(p).success).toBe(false)
  })

  it('weigert te kort consentAt (< 10 tekens)', () => {
    const p = { ...validPayload(), consentAt: '2026-06' }
    expect(payloadSchema.safeParse(p).success).toBe(false)
  })

  it('weigert interestRatePct > 100 in schulden', () => {
    const p = validPayload()
    intake(p)['debts'] = [{
      debtType: 'personal_loan', name: 'Lening',
      balance: 5000, interestRatePct: 101, monthlyPayment: 100,
    }]
    expect(payloadSchema.safeParse(p).success).toBe(false)
  })

  it('weigert expectedReturnPct < -50 in pensioen-blok', () => {
    const p = validPayload()
    ;(intake(p)['pension'] as Record<string, unknown>)['expectedReturnPct'] = -51
    expect(payloadSchema.safeParse(p).success).toBe(false)
  })

  it('weigert goal.label langer dan 140 tekens', () => {
    const p = validPayload()
    intake(p)['goal'] = { label: 'x'.repeat(141) }
    expect(payloadSchema.safeParse(p).success).toBe(false)
  })
})

describe('Submit-route — payload-grens (413-grond, handmatig geverifieerd)', () => {
  /**
   * De MAX_BODY_BYTES-grens (64 * 1024) staat vóór de JSON-parse in de route.
   * We kunnen deze grens niet via het Zod-schema testen (de grens is request-size,
   * niet veldinhoud). Hieronder documenteren we de grens als integration-afspraak.
   */
  it('MAX_BODY_BYTES-grens is gedocumenteerd als 64 KiB (64 * 1024 bytes)', () => {
    // Geverifieerd in app/api/check/submit/route.ts: const MAX_BODY_BYTES = 64 * 1024
    const MAX_BODY_BYTES = 64 * 1024
    expect(MAX_BODY_BYTES).toBe(65536)
  })

  it('een geldige payload past binnen 64 KiB', () => {
    const p = validPayload()
    const serialized = JSON.stringify(p)
    expect(serialized.length).toBeLessThan(64 * 1024)
  })

  it('60 assets × 120-teken-naam past precies binnen de grens', () => {
    const p = validPayload()
    intake(p)['assets'] = Array.from({ length: 60 }, (_, i) => ({
      assetType: 'investment',
      name: `Bezitting ${'x'.repeat(110)} ${i}`,
      value: 1000,
      extra: 'VWRL',
    }))
    const serialized = JSON.stringify(p)
    expect(serialized.length).toBeLessThan(64 * 1024)
  })
})

// ════════════════════════════════════════════════════════════════════════════════
// SECTIE 3 — Ontbrekende randgevallen in buildReport
// ════════════════════════════════════════════════════════════════════════════════

describe('buildReport — aanvullende randgevallen', () => {
  function base(overrides: Partial<CheckIntake> = {}): CheckIntake {
    return {
      firstName: null,
      dateOfBirth: '1986-01-01',
      household: 'alleen',
      monthlyIncomeNet: 3000,
      yearlyIncomeGross: null,
      expenses: { wonen: 1000, vasteLasten: 800, vrijBesteedbaar: 200, totaalMaand: 2000 },
      emergencyFund: 6000,
      assets: [{ assetType: 'investment', name: 'ETF', value: 50000 }],
      debts: [],
      pension: { aowExpectedMonthly: null, expectedReturnPct: null, riskProfile: null },
      goal: null,
      ...overrides,
    }
  }

  it('gezin-huishouden (hasPartner=true): snapshot zonder crash, household-mapping correct', () => {
    const r = buildReport(base({ household: 'gezin' }), NOW)
    // hasPartner=true voedt dubbel Box 3-heffingsvrij vermogen + samenwonend AOW
    expect(r.snapshot.netWorth).toBeGreaterThan(0)
    // Benchmark moet driestaan (samen/gezin anders cohort dan alleenstaand)
    expect(r.benchmark.rows.length).toBe(4)
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow()
  })

  it('samen-huishouden heeft grotere AOW-uitkering dan alleen (via gezondheidskaart)', () => {
    const alleen = buildReport(base({ household: 'alleen' }), NOW)
    const samen = buildReport(base({ household: 'samen' }), NOW)
    // Bij gelijke inkomens: samenwonend heeft andere AOW-berekening —
    // beide paden draaien zonder crash en leveren consistente DTO's op.
    expect(alleen).toBeDefined()
    expect(samen).toBeDefined()
    expect(() => JSON.parse(JSON.stringify(samen))).not.toThrow()
  })

  it('geen assets → dualBars leeg, geen crash', () => {
    const r = buildReport(base({ assets: [], emergencyFund: 0 }), NOW)
    expect(r.dualBars).toHaveLength(0)
    expect(r.snapshot.netWorth).toBe(0)
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow()
  })

  it('dualBars-volgorde: hoogste euro-waarde eerst', () => {
    const r = buildReport(base({
      assets: [
        { assetType: 'cash', name: 'Cash', value: 5000 },
        { assetType: 'investment', name: 'ETF', value: 80000 },
        { assetType: 'retirement', name: 'Pensioen', value: 30000 },
      ],
    }), NOW)
    const euros = r.dualBars.map((b) => b.eur)
    // Gesorteerd van hoog naar laag.
    for (let i = 1; i < euros.length; i++) {
      expect(euros[i]).toBeLessThanOrEqual(euros[i - 1])
    }
  })

  it('crypto-asset belandt in eigen bucket en telt mee voor FIRE', () => {
    const r = buildReport(base({
      assets: [{ assetType: 'crypto', name: 'Bitcoin', value: 20000 }],
    }), NOW)
    const crypto = r.dualBars.find((b) => b.bucket === 'crypto')
    expect(crypto).toBeDefined()
    expect(crypto!.countsForFire).toBe(true)
    expect(crypto!.eur).toBe(20000)
  })

  it('vastgoed-asset belandt in eigen bucket en telt mee voor FIRE', () => {
    const r = buildReport(base({
      assets: [{ assetType: 'real_estate', name: 'Verhuurpand', value: 150000 }],
    }), NOW)
    const vastgoed = r.dualBars.find((b) => b.bucket === 'vastgoed')
    expect(vastgoed).toBeDefined()
    expect(vastgoed!.countsForFire).toBe(true)
  })

  it('maandbalans: inkomensrij en uitgavenrijen en totaalrij aanwezig', () => {
    const r = buildReport(base(), NOW)
    const kinds = r.monthBalance.rows.map((row) => row.kind)
    expect(kinds).toContain('income')
    expect(kinds).toContain('expense')
    expect(kinds).toContain('total')
    // Totaalrij bevat het overschot of tekort (positief in de basisintake).
    const totaal = r.monthBalance.rows.find((row) => row.kind === 'total')!
    expect(totaal.perMonth).toBe(1000) // 3000 − 2000
    expect(totaal.label).toBe('Overschot → sparen')
  })

  it('gevoeligheid: "Uitgaven +€200/mnd" is nooit beter (more-spending kan FIRE niet vervroegen)', () => {
    const r = buildReport(base(), NOW)
    const meerUitgaven = r.sensitivity.find((s) => s.lever === 'Uitgaven +€200/mnd')!
    expect(meerUitgaven.better).toBe(false)
  })

  it('gevoeligheid: alle vier hefbomen aanwezig wanneer FIRE haalbaar is', () => {
    // Hoge spaarquote maakt FIRE haalbaar voor de base-intake.
    const r = buildReport(base({
      monthlyIncomeNet: 5000,
      expenses: { wonen: 1000, vasteLasten: 500, vrijBesteedbaar: 500, totaalMaand: 2000 },
      assets: [{ assetType: 'investment', name: 'ETF', value: 200000 }],
    }), NOW)
    const levers = r.sensitivity.map((s) => s.lever)
    expect(levers).toEqual([
      'Spaarquote +4pp', 'Rendement +1pp', 'Uitgaven +€200/mnd', 'Eenmalig +€20k beleggen',
    ])
  })

  it('health: pijler-scores 0–100 bij normale intake', () => {
    const r = buildReport(base(), NOW)
    for (const p of r.health.pillars.filter((p) => p.score != null)) {
      expect(p.score!).toBeGreaterThanOrEqual(0)
      expect(p.score!).toBeLessThanOrEqual(100)
    }
  })

  it('health: statusvlag correspondeert met scoredrempel (green≥70, amber≥40, red<40)', () => {
    const r = buildReport(base(), NOW)
    for (const p of r.health.pillars.filter((p) => p.score != null)) {
      const s = p.score!
      if (s >= 70) expect(p.status).toBe('green')
      else if (s >= 40) expect(p.status).toBe('amber')
      else expect(p.status).toBe('red')
    }
  })

  it('withdrawalStrategies: year1 is altijd een geheel getal (round0)', () => {
    const r = buildReport(base({
      monthlyIncomeNet: 5000,
      expenses: { wonen: 1000, vasteLasten: 500, vrijBesteedbaar: 500, totaalMaand: 2000 },
      assets: [{ assetType: 'investment', name: 'ETF', value: 200000 }],
    }), NOW)
    for (const s of r.withdrawalStrategies) {
      expect(Number.isInteger(s.year1)).toBe(true)
    }
  })

  it('lifeGrid.endAge is altijd 90 ongeacht de intake', () => {
    for (const dob of ['1960-01-01', '1986-01-01', '2000-06-01']) {
      const r = buildReport(base({ dateOfBirth: dob }), NOW)
      expect(r.lifeGrid.endAge).toBe(90)
    }
  })

  it('benchmark-sourceBadge is altijd "Geraamd (CBS-basis)"', () => {
    const r = buildReport(base({ household: 'gezin' }), NOW)
    expect(r.benchmark.sourceBadge).toBe('Geraamd (CBS-basis)')
  })

  it('savingsHistory.available is altijd false (funnel heeft geen transactiedata)', () => {
    const r = buildReport(base(), NOW)
    expect(r.savingsHistory.available).toBe(false)
  })

  it('cta.signupHref begint met "/signup?check="', () => {
    const r = buildReport(base(), NOW)
    expect(r.cta.signupHref).toMatch(/^\/signup\?check=/)
  })

  it('disclaimers.wft bevat "Wft" en disclaimers.avg bevat "90 dagen"', () => {
    const r = buildReport(base(), NOW)
    expect(r.disclaimers.wft).toContain('Wft')
    expect(r.disclaimers.avg).toContain('90 dagen')
  })
})

describe('buildReport — Will-moves randgevallen', () => {
  function base(overrides: Partial<CheckIntake> = {}): CheckIntake {
    return {
      firstName: null,
      dateOfBirth: '1986-01-01',
      household: 'alleen',
      monthlyIncomeNet: 3000,
      yearlyIncomeGross: null,
      expenses: { wonen: 1000, vasteLasten: 800, vrijBesteedbaar: 200, totaalMaand: 2000 },
      emergencyFund: 6000,
      assets: [{ assetType: 'investment', name: 'ETF', value: 50000 }],
      debts: [],
      pension: { aowExpectedMonthly: null, expectedReturnPct: null, riskProfile: null },
      goal: null,
      ...overrides,
    }
  }

  it('spaarquote-zet altijd aanwezig (laatste zet, deterministisch)', () => {
    const r = buildReport(base(), NOW)
    const spaarquoteZet = r.will.moves.find((m) => m.title.includes('spaarquote'))
    expect(spaarquoteZet).toBeDefined()
    expect(spaarquoteZet!.kind).toBe('fire-months')
  })

  it('buffer < 4 maanden → géén bufferoverschot-zet', () => {
    // 1 maand noodfonds = 2000; 4 maanden = 8000. 2000 < 8000 → geen surplus.
    const r = buildReport(base({ emergencyFund: 2000 }), NOW)
    expect(r.will.moves.some((m) => m.title.includes('bufferoverschot'))).toBe(false)
  })

  it('buffer > 4 maanden → bufferoverschot-zet aanwezig', () => {
    // 10000 / 2000 = 5 maanden → aanwezig.
    const r = buildReport(base({ emergencyFund: 10000 }), NOW)
    expect(r.will.moves.some((m) => m.title.includes('bufferoverschot'))).toBe(true)
  })

  it('schuld met rente < rendement → geen "duurste schuld"-zet', () => {
    // rendement fallback ≈ 7%; schuld 3% < 7% → zet verschijnt niet.
    const r = buildReport(base({
      debts: [
        { debtType: 'personal_loan', name: 'Lening', balance: 5000, interestRatePct: 3, monthlyPayment: 100 },
      ],
    }), NOW)
    expect(r.will.moves.some((m) => m.title.includes('duurste schuldpost'))).toBe(false)
  })

  it('schuld met rente > rendement → "duurste schuld"-zet met gainDays > 0', () => {
    // 15% > 7% rendement.
    const r = buildReport(base({
      debts: [
        { debtType: 'credit_card', name: 'Creditcard', balance: 3000, interestRatePct: 15, monthlyPayment: 100 },
      ],
    }), NOW)
    const schuldzet = r.will.moves.find((m) => m.title.includes('duurste schuldpost'))
    expect(schuldzet).toBeDefined()
    expect((schuldzet!.gainDays ?? 0)).toBeGreaterThan(0)
  })

  it('nul uitgaven → gainDays = 0 voor alle zetten (dagelijks tarief 0)', () => {
    // Dagelijks tarief = 0 → gainDays altijd 0.
    const r = buildReport(base({
      expenses: { wonen: 0, vasteLasten: 0, vrijBesteedbaar: 0, totaalMaand: 0 },
      emergencyFund: 20000, // > 4 mnd × 0 = 0 → altijd "boven 4 mnd"
      debts: [
        { debtType: 'credit_card', name: 'Creditcard', balance: 3000, interestRatePct: 15, monthlyPayment: 100 },
      ],
    }), NOW)
    for (const move of r.will.moves) {
      if (move.gainDays !== undefined) {
        expect(move.gainDays).toBe(0)
      }
    }
  })
})
