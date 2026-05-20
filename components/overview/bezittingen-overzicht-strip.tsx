import { formatCurrency } from '@/lib/format'
import { CategoryCard } from '@/components/core/category-card'

/**
 * BezittingenOverzichtStrip — overzichtsstrook bovenaan /overzicht/bezittingen.
 *
 * Sinds de feedback "hergebruik de categoriekaarten" delegeert deze strip
 * de visuele rendering naar `<CategoryCard>` (de exacte component die ook
 * op /core wordt gebruikt). Hier bouwen we alleen de hefboom-specifieke
 * groepering (cash + investment + eigen_huis + pensioen) en de bovenliggende
 * "Totaal vermogen"-header. De kaartopmaak zelf (accent-streep, sparkline-
 * achtergrond, hover-lift, scherpe hoeken) komt 1-op-1 uit /core.
 */

// Tegel-href = anchor naar de eerste asset-group in dezelfde bundle op
// /overzicht/bezittingen. Klik → smooth-scroll naar die sectie, en alles
// daaronder (inclusief de andere bundle-types) blijft zichtbaar.
//
// Voor "Pensioen + overig" linken we naar retirement; de 6 andere
// bundle-types (levensverzekering, vehicle, physical, deelneming,
// vordering, other) staan eronder in AssetsPage's groep-volgorde.
const CATEGORIES = [
  {
    key: 'cash' as const,
    label: 'Cash + spaargeld',
    iconName: 'Wallet',
    href: '/overzicht/bezittingen#asset-group-cash',
  },
  {
    key: 'investment' as const,
    label: 'Beleggen',
    iconName: 'LineChart',
    href: '/overzicht/bezittingen#asset-group-investment',
  },
  {
    key: 'eigen_huis' as const,
    label: 'Eigen huis',
    iconName: 'Home',
    href: '/overzicht/bezittingen#asset-group-eigen_huis',
  },
  {
    key: 'pensioen' as const,
    label: 'Pensioen + overig',
    iconName: 'Hourglass',
    href: '/overzicht/bezittingen#asset-group-retirement',
  },
]

type Counts = Partial<Record<'cash' | 'investment' | 'eigen_huis' | 'pensioen', number>>

export function BezittingenOverzichtStrip({
  cashTotal,
  investmentTotal,
  housingTotal,
  pensioenTotal,
  counts,
}: {
  cashTotal: number
  investmentTotal: number
  /** Net van eigen huis: woning-waarde minus hypotheek. */
  housingTotal: number
  pensioenTotal: number
  /** Optionele item-tellingen per categorie — drijft de meta-regel van de kaart. */
  counts?: Counts
}) {
  const totals: Record<'cash' | 'investment' | 'eigen_huis' | 'pensioen', number> = {
    cash: cashTotal,
    investment: investmentTotal,
    eigen_huis: housingTotal,
    pensioen: pensioenTotal,
  }
  const grandTotal = cashTotal + investmentTotal + housingTotal + pensioenTotal

  if (grandTotal <= 0) {
    return null
  }

  return (
    <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
      <header className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Bezittingen — overzicht
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Vier categorieën, één totaal
          </h2>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Totaal vermogen
          </div>
          <div className="font-serif font-semibold text-[var(--ink)] tabular-nums">
            {formatCurrency(Math.round(grandTotal))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
        {CATEGORIES.map(({ key, label, iconName, href }, idx) => {
          const value = totals[key]
          const pct = grandTotal > 0 ? Math.round((value / grandTotal) * 100) : 0
          const count = counts?.[key] ?? 0
          // Speciale meta-tekst voor de Pensioen + overig-tegel zodat de
          // gebruiker weet dat hier meer dan alleen pensioen-instrumenten
          // in zitten (auto, inboedel, deelneming, vordering, overig).
          const baseEmpty =
            key === 'pensioen' ? 'Pensioen en overige bezittingen' : 'Nog geen bezittingen'
          const meta =
            value > 0
              ? count > 0
                ? `${count} item${count === 1 ? '' : 's'} · ${pct}% van totaal`
                : `${pct}% van totaal`
              : baseEmpty
          return (
            <CategoryCard
              key={key}
              iconName={iconName}
              label={label}
              total={value}
              count={count}
              meta={meta}
              href={href}
              variant="asset"
              staggerIndex={idx}
            />
          )
        })}
      </div>
    </section>
  )
}
