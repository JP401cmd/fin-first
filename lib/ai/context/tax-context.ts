import type { SupabaseClient } from '@supabase/supabase-js'
import { section, formatCurrency, formatFreedomTime, formatPercentage } from './formatter'
import { calculateFreedomTime, carryFreedomUnits } from '@/lib/format'
import { computeBox1Tax } from '@/lib/box1-tax'
import { loadPerspectiveBox3 } from '@/lib/household-tax'
import { computeJaarruimte, resolvePensionFactorA, jaarruimteBesparing } from '@/lib/jaarruimte'
import { estimateGrossYearly } from '@/lib/jaarruimte-facts'
import { JAARRUIMTE_AANDACHTSPUNT_ID } from '@/lib/aandachtspunten'
import { loadActionedAandachtspuntIds } from '@/lib/aandachtspunten-actions'
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
  // klein bedrag niet als "0 maanden vrijheid" verdwijnt. Die afronding kan de
  // maandteller ZELF op 12 zetten (11 maanden + ≥15 restdagen) — ook al levert
  // calculateFreedomTime sinds H3/M37 nooit meer een 12. Daarom loopt ook deze
  // optelling door dezelfde canonieke carry: anders noemt Fin "10 jaar en 12
  // maanden" terwijl het scherm ernaast "11 jaar" toont.
  const rolled = carryFreedomUnits(bd.years, bd.months + (bd.days >= 15 ? 1 : 0), 0)
  return { years: rolled.years, months: rolled.months }
}

/** Formatteer een bedrag inclusief vrijheidstijd-equivalent (indien berekenbaar). */
function withFreedom(amount: number, dailyExpenses: number): string {
  const ft = amountAsFreedomTime(amount, dailyExpenses)
  const base = formatCurrency(amount)
  if (!ft || (ft.years === 0 && ft.months === 0)) return base
  return `${base} (${formatFreedomTime(ft.years, ft.months)} vrijheid)`
}

/**
 * Bouw de "== FISCALE SITUATIE ==" context-sectie voor Fin.
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

    const grossYearly = estimateGrossYearly(netMonthlyIncome, TAX_YEAR)

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
    try {
      if (grossYearly > 0) {
        const box1 = computeBox1Tax({
          grossYearlyIncome: grossYearly,
          year: TAX_YEAR,
          dailyExpenses: dailyExpenses > 0 ? dailyExpenses : undefined,
        })
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

    // Box 2 — alleen een ja/nee op aanmerkelijk belang. De uitkomst reist door
    // naar het deadlines-blok hieronder: zonder AB horen de Box 2-deadlines daar
    // niet te staan (bevinding L8 — dat sprak "Box 2: nee" in dezelfde payload
    // tegen). Faal-zacht: bij een query-fout blijft `false` → geen DGA-deadlines.
    let box2Relevant = false
    let box2Line: string | null = null
    try {
      box2Relevant = await hasBox2Relevance(supabase, user.id)
      box2Line = `Box 2 (aanmerkelijk belang in een BV): ${box2Relevant ? 'ja — DGA/AB-positie aanwezig' : 'nee'}`
    } catch {
      box2Line = null
    }

    // Jaarruimte — onbenutte pensioen-aftrekruimte + geschatte besparing.
    // ONDERDRUKKING: als de gebruiker de jaarruimte-kans al als actie heeft
    // (open of recent afgerond) laten we dit blok weg — anders blijft de AI
    // "benut je jaarruimte" tippen terwijl de aandachtspunten-context de kans al
    // correct verborg (drift tussen twee context-bronnen naar hetzelfde model).
    // Faal-zacht: bij een lege set (geen actie of query-fout) blijft het blok.
    let jaarruimteLines: string[] = []
    try {
      const actionedIds = await loadActionedAandachtspuntIds(supabase)
      const jaarruimteActioned = actionedIds.has(JAARRUIMTE_AANDACHTSPUNT_ID)
      if (grossYearly > 0 && !jaarruimteActioned) {
        const jr = computeJaarruimte(grossYearly, factorA, TAX_YEAR)
        if (jr.hasData && jr.jaarruimte > 0) {
          // Besparing = marginaal-correct Box 1-belastingverschil van de volledige
          // inleg (schijfovergangen + heffingskorting-afbouw) via de gedeelde
          // `jaarruimteBesparing`-helper (ADR 0040/0041) — één bron met de schermen,
          // niet de vlakke ruimte × marginaal.
          const besparing = jaarruimteBesparing(grossYearly, jr.jaarruimte, TAX_YEAR)
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
      const deadlines = getTaxDeadlines(new Date(), {
        hasAanmerkelijkBelang: box2Relevant,
      }).slice(0, 3)
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
        'Fin geeft GEEN bindend belastingadvies — verwijs voor de aangifte of definitieve keuzes naar een belastingadviseur of de Belastingdienst.',
    )

    return section('FISCALE SITUATIE', blocks.join('\n\n'))
  } catch {
    // Faal-zacht: nooit een throw richting de context-builder.
    return ''
  }
}
