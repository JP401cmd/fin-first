import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import type { NewsPreviewItem } from '@/lib/news-preview'
import { Newspaper } from 'lucide-react'

// ── Nieuws-widget (id `berichten`) ────────────────────────────────────
// Toont de laatste nieuws-editie. Consumeert het autoritatieve, device-
// onafhankelijke serverveld `data.newsPreview` (loader + /api/news) — géén
// localStorage meer. Consume, don't recompute: editienummer en -datum komen
// uit de bron, niet uit een client-side benadering.

// Categorie = tekstlabel (eigen systeem). De gekleurde stip encodeert de
// impactrichting via de semantische positief/negatief-tokens — die volgen
// de gebruikers-accentkleuren bewust NIET (CLAUDE.md), i.t.t. de vroegere
// kern-/wil-/horizon-module-accenten die hier ten onrechte werden gebruikt.
const IMPACT_DOT: Record<NewsPreviewItem['impactDirection'], string> = {
  positief: 'bg-positive',
  negatief: 'bg-negative',
  neutraal: 'bg-[var(--ink-4)]',
}

const IMPACT_LABEL: Record<NewsPreviewItem['impactDirection'], string> = {
  positief: 'Positieve impact',
  negatief: 'Negatieve impact',
  neutraal: 'Neutrale impact',
}

const CATEGORY_LABEL: Record<string, string> = {
  fiscaal: 'Fiscaal',
  rente: 'Rente',
  woningmarkt: 'Woningmarkt',
  beleggingen: 'Beleggingen',
  pensioen: 'Pensioen',
  macro: 'Macro',
}

function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? category
}

function formatDateline(generatedAt: string): string {
  const d = new Date(generatedAt)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })
}

function ImpactDot({ direction }: { direction: NewsPreviewItem['impactDirection'] }) {
  return (
    <span
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${IMPACT_DOT[direction]}`}
      role="img"
      aria-label={IMPACT_LABEL[direction]}
      title={IMPACT_LABEL[direction]}
    />
  )
}

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const BerichtenWidget = memo(function BerichtenWidget({ size, data, href }: Props) {
  const preview = data.newsPreview
  const news = preview?.items ?? []

  // ── Empty state: geen (verse) editie — link naar /nieuws ──
  if (!preview || news.length === 0) {
    return (
      <WidgetShell module="cross" size={size} kicker="Nieuws" href={href}>
        <WidgetEmpty icon={Newspaper} message="Bekijk je persoonlijke editie op de nieuwspagina" />
      </WidgetShell>
    )
  }

  const editionLabel = preview.editionNr != null ? `Editie ${preview.editionNr}` : null
  const dateline = formatDateline(preview.generatedAt)

  // ── Mini: aantal artikelen ──
  if (size === 'mini') {
    return (
      <WidgetShell module="cross" size="mini" kicker="Nieuws" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {preview.count} {preview.count === 1 ? 'artikel' : 'artikelen'}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter: editie + 1 kop + impactstip ──
  if (size === 'quarter') {
    const item = news[0]

    return (
      <WidgetShell module="cross" size={size} kicker="Nieuws" href={href}>
        {editionLabel && (
          <p className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-4)] mb-1.5">
            {editionLabel}
          </p>
        )}
        <div className="flex items-start gap-2">
          <span className="mt-1.5">
            <ImpactDot direction={item.impactDirection} />
          </span>
          <p className="text-xs text-[var(--ink-2)] leading-relaxed line-clamp-2">
            {item.headline}
          </p>
        </div>
        {news.length > 1 && (
          <p className="mt-1 text-[10px] text-[var(--ink-4)]">
            +{preview.count - 1} meer
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Half: editie + datum + 2 koppen met categoriebadge ──
  if (size === 'half') {
    const shown = news.slice(0, 2)

    return (
      <WidgetShell module="cross" size={size} kicker="Nieuws" href={href}>
        <div className="flex items-center gap-2 mb-2">
          {editionLabel && (
            <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-4)]">
              {editionLabel}
            </span>
          )}
          {editionLabel && dateline && <span className="text-[var(--ink-4)]">&middot;</span>}
          {dateline && (
            <span className="font-source-serif text-[11px] italic text-[var(--ink-4)]">
              {dateline}
            </span>
          )}
        </div>
        <ul className="space-y-1.5">
          {shown.map(item => (
            <li key={item.id} className="flex items-center gap-2">
              <ImpactDot direction={item.impactDirection} />
              <span className="flex-1 text-sm text-[var(--ink-2)] line-clamp-1">
                {item.headline}
              </span>
              <span className="shrink-0 text-[10px] font-medium text-[var(--ink-4)]">
                {categoryLabel(item.category)}
              </span>
            </li>
          ))}
        </ul>
        {preview.count > 2 && (
          <p className="mt-1 text-[11px] text-[var(--ink-4)]">+{preview.count - 2} meer</p>
        )}
      </WidgetShell>
    )
  }

  // ── Full: editie + datum + ondertitel + 4 koppen met categorie + samenvatting ──
  const shown = news.slice(0, 4)

  return (
    <WidgetShell module="cross" size={size} kicker="Nieuws" href={href}>
      <div className="flex items-center gap-2 mb-1">
        {editionLabel && (
          <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-4)]">
            {editionLabel}
          </span>
        )}
        {editionLabel && dateline && <span className="text-[var(--ink-4)]">&middot;</span>}
        {dateline && (
          <span className="font-source-serif text-[11px] italic text-[var(--ink-4)]">
            {dateline}
          </span>
        )}
      </div>
      <p className="font-source-serif text-[11px] italic text-[var(--ink-3)] mb-3">
        Persoonlijk financieel overzicht
      </p>

      <div className="space-y-3">
        {shown.map(item => (
          <div key={item.id}>
            <div className="flex items-center gap-2 mb-0.5">
              <ImpactDot direction={item.impactDirection} />
              <span className="text-sm font-medium text-[var(--ink)] line-clamp-1">
                {item.headline}
              </span>
              <span className="ml-auto shrink-0 text-[10px] font-medium text-[var(--ink-4)]">
                {categoryLabel(item.category)}
              </span>
            </div>
            <p className="pl-[14px] text-xs text-[var(--ink-3)] line-clamp-1 leading-relaxed">
              {item.summary}
            </p>
          </div>
        ))}
      </div>

      {preview.count > 4 && (
        <p className="mt-2 text-[11px] text-[var(--ink-4)]">+{preview.count - 4} meer</p>
      )}
    </WidgetShell>
  )
})
