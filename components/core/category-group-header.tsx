import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { BudgetIcon } from '@/components/app/budget-shared'
import { MaskedAmount } from '@/components/app/masked-amount'

/**
 * Categorie-kop boven elke groep items op de bezittingen- en schulden-
 * overzichten (`/core/assets`, `/core/debts`). Eén gedeelde component zodat de
 * twee bijna-identieke koppen niet uit elkaar kunnen lopen.
 *
 * Affordance ("onderstreping + chevron"): icoon + label + chevron vormen samen
 * de link naar de categoriepagina. Bij hover onderstreept het label en kleurt
 * het — met de chevron — kern-groen; de chevron schuift een fractie mee. Het
 * totaalbedrag staat bewust BUITEN de link (informatief, niet klikbaar) en
 * wordt via `MaskedAmount` getoond zodat het de privacy-mask volgt.
 */
interface CategoryGroupHeaderProps {
  /** Doel-route, bv. `/core/assets/savings` of `/core/debts/mortgage`. */
  href: string
  /** Zichtbaar categorie-label, bv. ASSET_TYPE_LABELS[type]. */
  label: string
  /** BudgetIcon-naam voor het categorie-icoon. */
  iconName: string
  /** Accentkleur van het icoon (categorie-kleur). */
  iconColor: string
  /** Som van de groep; getoond rechts van de link. */
  total: number
}

export function CategoryGroupHeader({
  href,
  label,
  iconName,
  iconColor,
  total,
}: CategoryGroupHeaderProps) {
  return (
    <div className="flex items-center gap-2 pt-2 pb-2.5">
      <Link
        href={href}
        className="group inline-flex items-center gap-1.5 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-500"
      >
        <span style={{ color: iconColor }}>
          <BudgetIcon name={iconName} className="h-4 w-4" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] underline-offset-4 transition-colors group-hover:text-kern-600 group-hover:underline">
          {label}
        </span>
        <ChevronRight
          className="h-3.5 w-3.5 text-[var(--ink-4)] transition-all group-hover:translate-x-0.5 group-hover:text-kern-600"
          aria-hidden
        />
      </Link>
      <span className="text-[var(--ink-3)]">
        <MaskedAmount value={total} tone="kern" className="text-xs" />
      </span>
    </div>
  )
}
