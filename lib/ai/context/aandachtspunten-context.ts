import type { SupabaseClient } from '@supabase/supabase-js'
import { section, formatCurrency, formatFreedomTime } from './formatter'
import { calculateFreedomTime, carryFreedomUnits } from '@/lib/format'
import { collectAandachtspunten } from '@/lib/aandachtspunten-loader'
import type { AandachtspuntDomain } from '@/lib/aandachtspunten'

/** Nederlandse labels per domein voor de context-render. */
const DOMAIN_LABEL: Record<AandachtspuntDomain, string> = {
  tax: 'belasting',
  budget: 'budget',
  debt: 'schuld',
  asset: 'vermogen',
}

/**
 * Zet een aantal vrijheidsdagen om naar een jaar/maanden-string via de gedeelde
 * formatter. Gebruikt de canonieke `calculateFreedomTime` breakdown (jaar/365 +
 * maand/30) i.p.v. een eigen 30/360-terugconversie: dagen-in → euro-onafhankelijk
 * door een dagtarief van €1 te gebruiken (amount = aantal dagen). Onder een halve
 * maand restdagen → afronden, anders null bij 0.
 */
function freedomDaysToString(freedomDays: number): string | null {
  if (!Number.isFinite(freedomDays) || freedomDays <= 0) return null
  const bd = calculateFreedomTime(freedomDays, 1)
  // Zelfde carry als in tax-context.ts: de ≥15-dagen-afronding kan de maandteller
  // zelf op 12 zetten, ook al levert calculateFreedomTime er sinds H3/M37 nooit
  // meer een. Eén huis voor de regel (lib/format.ts#carryFreedomUnits).
  const rolled = carryFreedomUnits(bd.years, bd.months + (bd.days >= 15 ? 1 : 0), 0)
  if (rolled.years === 0 && rolled.months === 0) return null
  return formatFreedomTime(rolled.years, rolled.months)
}

/**
 * Bouw de "== AANDACHTSPUNTEN (kansen) ==" context-sectie voor Fin.
 *
 * Voedt zich met dezelfde generieke aandachtspunten-laag die de UI gebruikt om
 * "voeg toe als actie" aan te bieden (collectAandachtspunten → belasting + budget
 * + schulden). Fin MAG deze kansen benoemen en aanmoedigen, maar voegt ze NOOIT
 * automatisch als actie toe — dat is een bewuste, deterministische gebruikersactie.
 *
 * Faal-zacht: één try/catch → '' bij elke fout (nooit een throw richting de
 * context-builder). Lege laag → lege string (geen kale sectie-header).
 */
export async function buildAandachtspuntenContext(supabase: SupabaseClient): Promise<string> {
  try {
    const aandachtspunten = await collectAandachtspunten(supabase)
    if (aandachtspunten.length === 0) return ''

    const lines: string[] = []
    for (const a of aandachtspunten) {
      const parts: string[] = [`- ${a.title} (${DOMAIN_LABEL[a.domain]})`]
      if (a.savings > 0) {
        parts.push(`bespaart ~${formatCurrency(a.savings)}/jaar`)
      }
      const ft = freedomDaysToString(a.freedomDays)
      if (ft) {
        parts.push(`${ft} vrijheid`)
      }
      if (a.deadline) {
        parts.push(`deadline: ${a.deadline}`)
      }
      lines.push(parts.join(' — '))
    }

    lines.push('')
    lines.push(
      'De gebruiker kan elk aandachtspunt ZELF als actie toevoegen in de app ' +
        '(deterministisch, los van jou). Jij mag deze kansen benoemen en aanmoedigen, ' +
        'maar voeg ze NOOIT automatisch als actie toe.',
    )

    return section('AANDACHTSPUNTEN (kansen)', lines.join('\n'))
  } catch {
    // Faal-zacht: nooit een throw richting de context-builder.
    return ''
  }
}
