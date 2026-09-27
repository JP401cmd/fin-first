import type { JSX } from 'react'
import { TYPE_LABEL, type GroupedDraft } from '@/lib/budget-templates/template-draft'
import { formatCurrency } from '@/lib/format'

/**
 * Alleen-lezen weergave van een budgetplan-draft: per type (inkomen, uitgaven,
 * sparen, schulden) de hoofdbudgetten met hun deelbudgetten en bedragen.
 *
 * Eén gedeelde component (B-064) zodat de onboarding-preview niet de derde
 * kopie wordt naast de setup-gate en de plan-editor. De bedragen komen
 * uitsluitend uit de meegegeven draft (`buildTemplateDraft` → `groupForRender`)
 * — hier wordt niets verdeeld. Het bedrag op een hoofdbudget mét deelbudgetten
 * is de optelling van die deelbudgetten, net als in de plan-editor; een
 * hoofdbudget zonder deelbudgetten toont zijn eigen bedrag.
 *
 * De "archief"-sectie (Eigen rekening) valt weg: die post draagt geen bedrag en
 * staat in elk plan; de consumer mag dat in eigen woorden melden.
 *
 * Koppen: `h4` voor de secties — de component leeft in een overlay waarvan de
 * titel een `h3` is (BottomSheet).
 */
export interface TemplatePreviewListProps {
  grouped: GroupedDraft
  className?: string
}

export function TemplatePreviewList({ grouped, className }: TemplatePreviewListProps): JSX.Element {
  return (
    <div className={`space-y-5 ${className ?? ''}`}>
      {grouped.map(({ type, parents, childrenBy }) => {
        if (type === 'archive' || parents.length === 0) return null
        return (
          <section key={type} aria-label={TYPE_LABEL[type]}>
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">
              {TYPE_LABEL[type]}
            </h4>
            <ul className="space-y-2">
              {parents.map((parent) => {
                const kids = childrenBy[parent.id] ?? []
                const parentAmount =
                  kids.length > 0
                    ? kids.reduce((s, k) => s + (k.amount ?? 0), 0)
                    : (parent.amount ?? parent.defaultLimit ?? 0)
                return (
                  <li
                    key={parent.id}
                    className="border border-[var(--border-ed)]"
                    data-testid="template-preview-parent"
                  >
                    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1 text-sm font-medium text-[var(--ink)]">{parent.name}</span>
                      <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--ink-2)]">
                        {formatCurrency(parentAmount)}
                      </span>
                    </div>
                    {kids.length > 0 && (
                      <ul className="border-t border-[var(--border-ed)] bg-[var(--subtle)]/30">
                        {kids.map((child) => (
                          <li
                            key={child.id}
                            className="flex items-baseline justify-between gap-3 px-3 py-1.5 pl-6"
                          >
                            <span className="min-w-0 flex-1 text-xs text-[var(--ink-2)]">{child.name}</span>
                            <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink-3)]">
                              {formatCurrency(child.amount ?? 0)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
