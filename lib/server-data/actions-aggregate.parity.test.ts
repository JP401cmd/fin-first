import { describe, it, expect } from 'vitest'
import { computeActionsKpiFromRows } from './actions-aggregate'

// ── Parity: oude JS-reductie over (gecapte) actie-rijen == aggregaat-consumptie ──
// Bewijst tegelijk de STILLE-AFKAP-bug: op een >1000-rijen-fixture wijkt de oude
// code (afgekapt op 1000 rijen, zoals PostgREST max_rows deed) AF van de volledige
// waarheid, terwijl het SQL-aggregaat (dat niet kan afkappen) het volledige
// (juiste) getal geeft.
//
// Bewuste gehele bedragen ⇒ float-sommen zijn exact, dus de vergelijking is
// byte-identiek (niet slechts "dicht bij").

type Row = { status: string; freedom_days_impact: number }

// ── Oude JS-reducties (letterlijk uit de dashboard-loader, vóór de refactor) ──
const oldTotalFreedomDaysWon = (rows: Row[]) =>
  rows.filter(r => r.status === 'completed').reduce((s, a) => s + (Number(a.freedom_days_impact) || 0), 0)
const oldCompletedCount = (rows: Row[]) => rows.filter(r => r.status === 'completed').length
const oldTotalCount = (rows: Row[]) => rows.length // fetch = .in('status', ['open','postponed','completed'])
const oldCompletionRatio = (rows: Row[]) =>
  oldTotalCount(rows) > 0 ? Math.round((oldCompletedCount(rows) / oldTotalCount(rows)) * 100) : 0

function buildFixture(): Row[] {
  const rows: Row[] = []
  // 1500 completed acties à 2 vrijheidsdagen → totaal >1000 rijen én >1000 completed.
  for (let i = 0; i < 1500; i++) rows.push({ status: 'completed', freedom_days_impact: 2 })
  // 400 open + 100 postponed → tellen mee in de noemer (totalCount), niet in de som.
  for (let i = 0; i < 400; i++) rows.push({ status: 'open', freedom_days_impact: 5 })
  for (let i = 0; i < 100; i++) rows.push({ status: 'postponed', freedom_days_impact: 5 })
  // 50 rejected → tellen NERGENS mee (RPC-where sluit ze uit).
  for (let i = 0; i < 50; i++) rows.push({ status: 'rejected', freedom_days_impact: 99 })
  return rows
}

describe('actions-KPI-aggregaat parity (oud JS ↔ nieuw aggregaat)', () => {
  const fixture = buildFixture()
  // Het aggregaat filtert 'rejected' eruit (zoals de SQL-where + de oude .in()-fetch).
  const counted = fixture.filter(r => r.status !== 'rejected')

  it('fixture bevat >1000 completed acties (afkap-conditie)', () => {
    expect(fixture.filter(r => r.status === 'completed').length).toBeGreaterThan(1000)
  })

  it('totalFreedomDaysWon / counts / completionRatio — byte-identiek aan de oude reductie', () => {
    const kpi = computeActionsKpiFromRows(fixture)
    expect(kpi.totalFreedomDaysWon).toBe(oldTotalFreedomDaysWon(counted)) // 1500 × 2 = 3000
    expect(kpi.completedCount).toBe(oldCompletedCount(counted)) // 1500
    expect(kpi.totalCount).toBe(oldTotalCount(counted)) // 2000 (excl. rejected)
    const ratio = kpi.totalCount > 0 ? Math.round((kpi.completedCount / kpi.totalCount) * 100) : 0
    expect(ratio).toBe(oldCompletionRatio(counted)) // round(1500/2000) = 75
  })

  it('rejected-acties tellen NERGENS mee (som noch noemer)', () => {
    const kpi = computeActionsKpiFromRows(fixture)
    expect(kpi.totalFreedomDaysWon).toBe(3000) // 50×99 rejected niet meegeteld
    expect(kpi.totalCount).toBe(2000) // 50 rejected niet meegeteld
  })

  it('REGRESSIE-GETUIGE: oude code afgekapt op 1000 rijen wijkt af; aggregaat geeft de volle waarheid', () => {
    // PostgREST kapte elk antwoord op max_rows=1000 → oude reductie zag maar 1000 rijen.
    // Fixture-volgorde: de eerste 1000 rijen zijn allemaal completed (van de 1500).
    const capped = fixture.slice(0, 1000)
    // De afgekapte som (1000 × 2 = 2000) is STRIKT kleiner dan de volledige waarheid (3000)...
    expect(oldTotalFreedomDaysWon(capped)).toBeLessThan(oldTotalFreedomDaysWon(counted))
    expect(oldTotalFreedomDaysWon(capped)).toBe(2000)
    // ...terwijl het aggregaat (dat niet kan afkappen) exact de volledige waarheid geeft.
    expect(computeActionsKpiFromRows(fixture).totalFreedomDaysWon).toBe(3000)
    // Ook de completionRatio verschilt: afgekapt zag 1000/1000 = 100%, waarheid = 75%.
    expect(oldCompletionRatio(capped)).toBe(100)
    const kpi = computeActionsKpiFromRows(fixture)
    expect(Math.round((kpi.completedCount / kpi.totalCount) * 100)).toBe(75)
  })

  it('≤1000 acties: aggregaat byte-identiek aan de oude reductie (geen gedragswijziging voor de meerderheid)', () => {
    const small: Row[] = [
      ...Array.from({ length: 30 }, () => ({ status: 'completed', freedom_days_impact: 1.5 })),
      ...Array.from({ length: 10 }, () => ({ status: 'open', freedom_days_impact: 4 })),
      ...Array.from({ length: 5 }, () => ({ status: 'postponed', freedom_days_impact: 4 })),
      ...Array.from({ length: 3 }, () => ({ status: 'rejected', freedom_days_impact: 9 })),
    ]
    const smallCounted = small.filter(r => r.status !== 'rejected')
    const kpi = computeActionsKpiFromRows(small)
    expect(kpi.totalFreedomDaysWon).toBe(oldTotalFreedomDaysWon(smallCounted)) // 30 × 1.5 = 45
    expect(kpi.completedCount).toBe(oldCompletedCount(smallCounted))
    expect(kpi.totalCount).toBe(oldTotalCount(smallCounted))
  })
})

// ── Vroegste-inkomen via min(date) i.p.v. scan over de gecapte 12-mnd-slice ──
// De loader leidt uit `earliestIncomeDateD` een extrapolatie-deler af:
//   incomeMonths = max(1, min(12, monthsBetween(earliest, now)))
//   extrapolatedIncome = incomeMonths < 12 ? (last12Income / incomeMonths) * 12 : last12Income
// De oude scan las de vroegste datum uit de (op max_rows=1000 gecapte, ONGESORTEERDE)
// 12-maands-fetch → kon een te RECENTE "vroegste" datum zien → deler te klein →
// OVER-extrapolatie. Een `order(date asc).limit(1)`-query geeft de échte vroegste
// datum (nooit afkap-gevoelig). Deze test karakteriseert dat verschil op de
// deler-formule (de enige plek waar de datum landt).
function incomeMonths(earliest: string, now: Date): number {
  const ed = new Date(earliest)
  return Math.max(1, Math.min(12,
    (now.getFullYear() - ed.getFullYear()) * 12 + (now.getMonth() - ed.getMonth())))
}
function extrapolate(last12Income: number, earliest: string, now: Date): number {
  const m = incomeMonths(earliest, now)
  return m < 12 ? (last12Income / m) * 12 : last12Income
}

describe('vroegste-inkomen: min(date) corrigeert de extrapolatie-deler', () => {
  const NOW = new Date('2026-07-15T12:00:00Z')
  const last12Income = 33000 // som over het venster (los van welke datum de vroegste is)

  it('inkomen ouder dan/aan de rand van 12 mnd: geen (over-)extrapolatie', () => {
    // Échte vroegste positieve tx = 11 maanden geleden → deler ≈ 11, minimale opschaling.
    const trueEarliest = '2025-08-20'
    // Gecapte scan zag alleen recente rijen → "vroegste" = 2 maanden geleden → deler 2.
    const cappedScanEarliest = '2026-05-20'
    const correct = extrapolate(last12Income, trueEarliest, NOW)
    const buggy = extrapolate(last12Income, cappedScanEarliest, NOW)
    // De oude (afgekapte) scan blaast het inkomen fors op; de min(date)-fix niet.
    expect(buggy).toBeGreaterThan(correct)
    expect(incomeMonths(trueEarliest, NOW)).toBe(11)
    expect(incomeMonths(cappedScanEarliest, NOW)).toBe(2)
    expect(correct).toBeCloseTo((33000 / 11) * 12, 6)
  })

  it('nieuwe gebruiker (<12 mnd historie): min(date) == scan → identieke deler', () => {
    // Wanneer de vroegste positieve tx binnen de cap zichtbaar is, zijn oude en
    // nieuwe datum gelijk → byte-identieke extrapolatie (geen gedragswijziging).
    const earliest = '2026-04-01' // 3 maanden geleden
    expect(extrapolate(last12Income, earliest, NOW)).toBe((33000 / 3) * 12)
  })
})
