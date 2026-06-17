import type { SupabaseClient } from '@supabase/supabase-js'
import { section, formatCurrency, formatFreedomTime, formatPercentage } from './formatter'
import { calculateFreedomTime } from '@/lib/format'
import { computeBox1Tax, marginalRateAt } from '@/lib/box1-tax'
import { loadPerspectiveBox3 } from '@/lib/household-tax'
import { computeJaarruimte, resolvePensionFactorA } from '@/lib/jaarruimte'
import { getTaxDeadlines } from '@/lib/tax-calendar'
import { hasBox2Relevance } from '@/lib/box2-relevance'

const TAX_YEAR = 2026 as const

/**
 * Zet een belastingbedrag om naar vrijheidstijd (jaar/maanden) op basis van de
 * dagelijkse uitgaven. Eén "vrijheidsdag" = de uitgaven die één dag dekken.
 * Bij ontbrekende dag-uitgaven → null (we tonen dan geen tijd-equivalent).
 *
 * Gebruikt de canonieke `calculateFreedomTime` uit lib/format.ts (jaar/365 +
 * maand/30 breakdown) i.p.v. een eigen 30/360-terugconversie, zodat de AI
 * exact dezelfde vrijheidstijd noemt als de schermen.
 */
function amountAsFreedomTime(amount: number, dailyExpenses: number): { years: number; months: number } | null {
  if (dailyExpenses <= 0 || amount <= 0) return null
  const bd = calculateFreedomTime(amount, dailyExpenses)
  // Restdagen (< 1 maand) ronden we naar de dichtstbijzijnde maand zodat een
  // klein bedrag niet als "0 maanden vrijheid" verdwijnt.
  const months = bd.months + (bd.days >= 15 ? 1 : 0)
  return { years: bd.years, months }
}

/** Formatteer een bedrag inclusief vrijheidstijd-equivalent (indien berekenbaar). */
function withFreedom(amount: number, dailyExpenses: number): string {
  const ft = amountAsFreedomTime(amount, dailyExpenses)
  const base = formatCurrency(amount)
  if (!ft || (ft.years === 0 && ft.months === 0)) return base
  return `${base} (${formatFreedomTime(ft.years, ft.months)} vrijheid)`
}

/**
 * Schat het bruto jaarinkomen uit het netto maandinkomen via netto/(1−marginaal).
 * Het marginale tarief hangt zelf van het bruto af, dus we itereren een paar keer
 * (fixed-point) tot het stabiliseert. Faal-zacht: 0 in → 0 uit.
 */
function estimateGrossYearly(netMonthlyIncome: number): number {
  const netYearly = Math.max(0, netMonthlyIncome) * 12
  if (netYearly <= 0) return 0
  // Startschatting: gebruik een redelijk middentarief om te beginnen.
  let gross = netYearly / (1 - 0.37)
  for (let i = 0; i < 6; i++) {
    const marginal = marginalRateAt(Math.round(gross), TAX_YEAR)
    const denom = 1 - marginal
    if (denom <= 0.05) break // bescherm tegen deling door (bijna) nul
    const next = netYearly / denom
    if (Math.abs(next - gross) < 1) {
      gross = next
      break
    }
    gross = next
  }
  return Math.round(gross)
}

/**
 * Bouw de "== FISCALE SITUATIE ==" context-sectie voor Will.
 *
 * Aggregeert een indicatieve fiscale schatting over Box 1 / 2 / 3, jaarruimte
 * en eerstvolgende deadlines. PII-veilig: alleen bedragen en feiten, nooit
 * namen of geboortedatum. Faal-zacht: elke sub-load zit in een eigen try/catch;
 * bij een fout levert die sub-load niets en blijft de rest van de sectie staan.
 * Bij een totale mislukking → lege string (nooit een throw).
 */
export async function buildTaxContext(supabase: SupabaseClient): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return ''

    // Profiel: netto maandinkomen voor bruto-schatting + factor A (persistente
    // pensioenaangroei) voor de jaarruimte. PII (naam/geboortedatum) bewust NIET
    // geselecteerd — deze sectie blijft feiten/bedragen-only.
    let netMonthlyIncome = 0
    let factorA = 0
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('net_monthly_income, pension_factor_a, pension_factor_a_source')
        .eq('id', user.id)
        .single()
      netMonthlyIncome = Number(profile?.net_monthly_income ?? 0)
      factorA = resolvePensionFactorA({
        pension_factor_a: profile?.pension_factor_a,
        pension_factor_a_source: profile?.pension_factor_a_source,
      }).factorA
    } catch {
      netMonthlyIncome = 0
      factorA = 0
    }

    const grossYearly = estimateGrossYearly(netMonthlyIncome)

    // Box 3 eerst — levert ook de perspectief-correcte dag-uitgaven die we voor
    // de vrijheidstijd-conversie van álle bedragen hergebruiken.
    let box3Lines: string[] = []
    let dailyExpenses = 0
    try {
      const box3 = await loadPerspectiveBox3(supabase, 'personal', TAX_YEAR)
      const r = box3.personal
      dailyExpenses = box3.dailyExpenses || 0
      if (r.tax > 0 || r.rendementsgrondslag > 0) {
        box3Lines = [
          'Box 3 (vermogen — spaargeld, beleggingen, schulden):',
          `- Belasting: ${withFreedom(r.tax, dailyExpenses)}`,
          `- Rendementsgrondslag: ${formatCurrency(r.rendementsgrondslag)}`,
          `- Heffingsvrij vermogen benut: ${formatCurrency(r.heffingsvrijVermogen)}`,
        ]
      }
    } catch {
      box3Lines = []
    }

    // Box 1 — schat de heffing over het bruto inkomen.
    let box1Lines: string[] = []
    let marginalRate = 0
    try {
      if (grossYearly > 0) {
        const box1 = computeBox1Tax({
          grossYearlyIncome: grossYearly,
          year: TAX_YEAR,
          dailyExpenses: dailyExpenses > 0 ? dailyExpenses : undefined,
        })
        marginalRate = box1.marginalRate
        box1Lines = [
          'Box 1 (inkomen uit werk en woning):',
          `- Geschat bruto jaarinkomen: ${formatCurrency(grossYearly)} (afgeleid uit netto maandinkomen)`,
          `- Belasting: ${withFreedom(box1.tax, dailyExpenses)}`,
          `- Effectief tarief: ${formatPercentage(box1.effectiveRate * 100)}`,
          `- Marginaal tarief: ${formatPercentage(box1.marginalRate * 100)} (over je volgende verdiende euro)`,
        ]
      }
    } catch {
      box1Lines = []
    }

    // Box 2 — alleen een ja/nee op aanmerkelijk belang.
    let box2Line: string | null = null
    try {
      const relevant = await hasBox2Relevance(supabase, user.id)
      box2Line = `Box 2 (aanmerkelijk belang in een BV): ${relevant ? 'ja — DGA/AB-positie aanwezig' : 'nee'}`
    } catch {
      box2Line = null
    }

    // Jaarruimte — onbenutte pensioen-aftrekruimte + geschatte besparing.
    let jaarruimteLines: string[] = []
    try {
      if (grossYearly > 0) {
        const jr = computeJaarruimte(grossYearly, factorA, TAX_YEAR)
        if (jr.hasData && jr.jaarruimte > 0) {
          // Besparing ≈ onbenutte ruimte × marginaal tarief (aftrek in Box 1).
          const besparing = marginalRate > 0
            ? Math.round(jr.jaarruimte * marginalRate)
            : 0
          jaarruimteLines = [
            'Jaarruimte (aftrekbare lijfrente-/pensioeninleg):',
            `- Onbenutte ruimte ${TAX_YEAR}: ${formatCurrency(jr.jaarruimte)}`,
            besparing > 0
              ? `- Geschatte belastingbesparing bij volledige benutting: ${withFreedom(besparing, dailyExpenses)}`
              : null,
          ].filter(Boolean) as string[]
        }
      }
    } catch {
      jaarruimteLines = []
    }

    // Deadlines — eerstvolgende 2-3 fiscale momenten vanaf nu (runtime-datum).
    let deadlineLines: string[] = []
    try {
      const deadlines = getTaxDeadlines(new Date()).slice(0, 3)
      if (deadlines.length > 0) {
        deadlineLines = [
          'Eerstvolgende fiscale deadlines:',
          ...deadlines.map(
            (d) => `- ${d.label} — ${d.date} (over ${d.daysUntil} ${d.daysUntil === 1 ? 'dag' : 'dagen'})`,
          ),
        ]
      }
    } catch {
      deadlineLines = []
    }

    const blocks: string[] = []
    if (box1Lines.length) blocks.push(box1Lines.join('\n'))
    if (box3Lines.length) blocks.push(box3Lines.join('\n'))
    if (box2Line) blocks.push(box2Line)
    if (jaarruimteLines.length) blocks.push(jaarruimteLines.join('\n'))
    if (deadlineLines.length) blocks.push(deadlineLines.join('\n'))

    // Geen enkele sub-load leverde data → lever geen lege sectie-header.
    if (blocks.length === 0) return ''

    blocks.push(
      'Let op: dit is een indicatieve schatting (o.a. bruto afgeleid uit netto, tarieven 2026 zijn deels indicatief). ' +
        'Will geeft GEEN bindend belastingadvies — verwijs voor de aangifte of definitieve keuzes naar een belastingadviseur of de Belastingdienst.',
    )

    return section('FISCALE SITUATIE', blocks.join('\n\n'))
  } catch {
    // Faal-zacht: nooit een throw richting de context-builder.
    return ''
  }
}
