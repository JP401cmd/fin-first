import type { SupabaseClient } from '@supabase/supabase-js'
import { section, formatCurrency, formatFreedomTime, formatPercentage } from './formatter'
import { calculateFreedomTime, carryFreedomUnits } from '@/lib/format'
import { computeBox1Tax } from '@/lib/box1-tax'
import { loadPerspectiveBox3 } from '@/lib/household-tax'
import { computeJaarruimte, resolvePensionFactorA, jaarruimteBesparing } from '@/lib/jaarruimte'
import { JAARRUIMTE_BOVENGRENS_SUFFIX } from '@/lib/jaarruimte-facts'
import {
  resolveBox1GrossIncome,
  resolveEigenWoningBox1Input,
  GEEN_EIGEN_WONING,
  type EigenWoningBox1Input,
} from '@/lib/box1-income'
import { JAARRUIMTE_AANDACHTSPUNT_ID } from '@/lib/aandachtspunten'
import { loadActionedAandachtspuntIds } from '@/lib/aandachtspunten-actions'
import { getTaxDeadlines } from '@/lib/tax-calendar'
import { hasBox2Relevance } from '@/lib/box2-relevance'
import { CURRENT_TAX_YEAR } from '@/lib/box3-data'

// Eén belastingjaar app-breed (lib/box3-data.ts). Hier stond een eigen
// `2026 as const` náást CURRENT_TAX_YEAR — bij de jaarwissel zou Fin dan een
// ander jaar citeren dan de schermen (4e, nazorg R2+R3).
const TAX_YEAR = CURRENT_TAX_YEAR

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

    // Profiel: factor A (persistente pensioenaangroei) voor de jaarruimte.
    // PII (naam/geboortedatum) bewust NIET geselecteerd — deze sectie blijft
    // feiten/bedragen-only.
    // NULL ≠ 0 (bevinding H23): een leeg `pension_factor_a` is "niet ingevuld",
    // niet "geen pensioenaangroei". Beide leveren `factorA: 0` — de motor rekent
    // dan zonder aftrek en de jaarruimte is een BOVENGRENS. `isKnown` reist
    // daarom mee naar de tekst; het scherm (jaarruimte-kaart) toont die
    // onzekerheid al, Fin herhaalde het bedrag als hard feit.
    let factorA = 0
    let factorAKnown = false
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('pension_factor_a, pension_factor_a_source')
        .eq('id', user.id)
        .single()
      const resolved = resolvePensionFactorA({
        pension_factor_a: profile?.pension_factor_a,
        pension_factor_a_source: profile?.pension_factor_a_source,
      })
      factorA = resolved.factorA
      factorAKnown = resolved.isKnown
    } catch {
      factorA = 0
      factorAKnown = false
    }

    // ── De VOLLEDIGE Box 1-invoer, uit dezelfde resolutielaag als de schermen ──
    //
    // Bevinding C8 (+ vervolg). `computeBox1Tax` is één motor, maar kreeg hier
    // een eigen invoer: bruto via de fixed-point-schatting op
    // `profiles.net_monthly_income` uit lib/jaarruimte-facts.ts, en
    // GEEN eigen woning. De belasting-hub (`loadFiscaleKansen`) en
    // /overzicht/belasting/box1 delen sinds 26-08-2026 `resolveBox1GrossIncome`
    // (handmatige override + schijfinversie op de cashflow-grondslag) én
    // `resolveEigenWoningBox1Input` (WOZ/hypotheekrente → forfait + Hillen).
    // Fin noemde daardoor een DERDE heffing: te hoog bij rente > forfait, te
    // laag bij een (bijna) afgeloste hypotheek. Nu consumeert deze context
    // dezelfde twee bronnen — consume, don't recompute.
    //
    // Bewust GEEN terugval op `estimateGrossYearly` bij een fout: dat zou de
    // derde afleiding via een achterdeur terugzetten. Faalt de resolutie, dan
    // blijft `grossYearly` 0 en valt het Box 1-blok (en de jaarruimte) weg —
    // bij twijfel niets beweren, zoals de rest van deze builder.
    //
    // Parallel: twee onafhankelijke reads. `resolveBox1GrossIncome` leunt op
    // `loadCashflowSettingsData` → `loadCoreData`, dat React-`cache()`-gewrapt
    // is en binnen dit request al door de kern-/horizon-builders in dezelfde
    // `Promise.all` van buildContext wordt getrokken — geen extra queries op
    // het AI-pad.
    let grossYearly = 0
    let eigenWoning: EigenWoningBox1Input = GEEN_EIGEN_WONING
    try {
      const [gross, ew] = await Promise.all([
        resolveBox1GrossIncome(supabase, user.id, TAX_YEAR),
        resolveEigenWoningBox1Input(supabase),
      ])
      grossYearly = gross.grossYearly
      eigenWoning = ew
    } catch {
      grossYearly = 0
      eigenWoning = GEEN_EIGEN_WONING
    }

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
          wozValue: eigenWoning.wozValue,
          hypotheekRente: eigenWoning.hypotheekRente,
          dailyExpenses: dailyExpenses > 0 ? dailyExpenses : undefined,
        })
        // De eigen woning maakt het verschil dat de gebruiker op het scherm
        // ziet. Noem het effect met het motorveld `eigenwoningBelastingEffect`
        // (heffing zónder − heffing mét, inclusief tariefsaanpassing) — nooit
        // |saldo| × marginaal, dat overschat het met ±36% (ADR 0106).
        const eigenWoningLine = eigenWoning.hasEigenWoning
          ? box1.eigenwoningBelastingEffect >= 0
            ? `- Eigen woning: verlaagt je Box 1-heffing met ${formatCurrency(box1.eigenwoningBelastingEffect)} (forfait ${formatCurrency(box1.eigenwoningforfait)} minus renteaftrek ${formatCurrency(box1.hypotheekrenteaftrek)})`
            : `- Eigen woning: verhoogt je Box 1-heffing met ${formatCurrency(-box1.eigenwoningBelastingEffect)} (forfait ${formatCurrency(box1.eigenwoningforfait)} boven renteaftrek ${formatCurrency(box1.hypotheekrenteaftrek)} — Wet Hillen bouwt af)`
          : null
        box1Lines = [
          'Box 1 (inkomen uit werk en woning):',
          `- Bruto jaarinkomen: ${formatCurrency(grossYearly)}`,
          eigenWoningLine,
          `- Belasting: ${withFreedom(box1.tax, dailyExpenses)}`,
          `- Effectief tarief: ${formatPercentage(box1.effectiveRate * 100)}`,
          `- Marginaal tarief: ${formatPercentage(box1.marginalRate * 100)} (over je volgende verdiende euro)`,
        ].filter(Boolean) as string[]
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
          // Zonder bekende factor A rekende de motor zónder pensioenaftrek: het
          // bedrag is de bovengrens. Zelfde kwalificatie-string als de lokale
          // Fin-paden (H23-vervolg) — de app spreekt overal dezelfde onzekerheid.
          const grens = factorAKnown ? '' : JAARRUIMTE_BOVENGRENS_SUFFIX
          jaarruimteLines = [
            'Jaarruimte (aftrekbare lijfrente-/pensioeninleg):',
            `- Onbenutte ruimte ${TAX_YEAR}: ${formatCurrency(jr.jaarruimte)}${grens}`,
            besparing > 0
              ? `- Geschatte belastingbesparing bij volledige benutting: ${withFreedom(besparing, dailyExpenses)}${grens}`
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
      'Let op: dit is een indicatieve schatting (bruto en eigen woning komen uit dezelfde bron als /overzicht/belasting, tarieven 2026 zijn deels indicatief). ' +
        'Fin geeft GEEN bindend belastingadvies — verwijs voor de aangifte of definitieve keuzes naar een belastingadviseur of de Belastingdienst.',
    )

    return section('FISCALE SITUATIE', blocks.join('\n\n'))
  } catch {
    // Faal-zacht: nooit een throw richting de context-builder.
    return ''
  }
}
