'use client'

import { WIDGET_CATALOG, WIDGET_HREFS, type WidgetModule } from '@/lib/widget-catalog'
import {
  WIDGET_CLASSIFICATION,
  WIDGET_REVIEW_LOG,
  runWidgetAudit,
  getAuditSummary,
  type WidgetClassification,
  type ReviewDecision,
} from '@/lib/widget-audit'
import {
  CheckCircle2,
  AlertTriangle,
  Eye,
  Lightbulb,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Trash2,
  Pencil,
  Check,
} from 'lucide-react'

// ── Module styling ──────────────────────────────────────────────
const MODULE_DOT: Record<WidgetModule, string> = {
  kern: 'bg-amber-500',
  wil: 'bg-teal-500',
  horizon: 'bg-purple-500',
  cross: 'bg-neutral-400',
}

const MODULE_LABEL: Record<WidgetModule, string> = {
  kern: 'Overzicht',
  wil: 'Tips & acties',
  horizon: 'Toekomst',
  cross: 'Cross',
}

// ── Classification badge ────────────────────────────────────────
function ClassificationBadge({ classification }: { classification: WidgetClassification }) {
  switch (classification) {
    case 'observation':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
          <Eye className="h-3 w-3" />
          Observatie
        </span>
      )
    case 'insight':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          <Lightbulb className="h-3 w-3" />
          Insight
        </span>
      )
    case 'needs_review':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
          <HelpCircle className="h-3 w-3" />
          Review
        </span>
      )
  }
}

// ── Decision badge ──────────────────────────────────────────────
function DecisionBadge({ decision }: { decision: ReviewDecision }) {
  switch (decision) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      )
    case 'keep':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
          <Check className="h-3 w-3" />
          Behouden
        </span>
      )
    case 'remove':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
          <Trash2 className="h-3 w-3" />
          Verwijderen
        </span>
      )
    case 'modify':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700">
          <Pencil className="h-3 w-3" />
          Aanpassen
        </span>
      )
  }
}

// ── Main page ───────────────────────────────────────────────────
export default function WidgetAuditPage() {
  const summary = getAuditSummary()
  const violations = runWidgetAudit()

  // Build enriched widget list
  const widgets = WIDGET_CATALOG.map(w => ({
    id: w.id,
    name: w.name,
    description: w.description,
    module: w.module,
    classification: WIDGET_CLASSIFICATION[w.id] as WidgetClassification | undefined,
    href: WIDGET_HREFS[w.id],
    review: WIDGET_REVIEW_LOG[w.id] ?? null,
    violation: violations.find(v => v.widgetId === w.id),
  }))

  // Group by classification
  const observations = widgets.filter(w => w.classification === 'observation')
  const insights = widgets.filter(w => w.classification === 'insight')
  const needsReview = widgets.filter(w => w.classification === 'needs_review')
  const unclassified = widgets.filter(w => !w.classification)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-[var(--ink)]">Widget Audit</h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Classificatie en review-status van alle {summary.catalogSize} widgets.
          Elk widget moet als <em>observatie</em> of <em>insight</em> geclassificeerd zijn,
          of expliciet gemarkeerd voor review met een vastgelegde beslissing.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Observaties"
          value={summary.observations}
          icon={<Eye className="h-4 w-4 text-blue-500" />}
          accent="border-blue-200 bg-blue-50/50"
        />
        <SummaryCard
          label="Insights"
          value={summary.insights}
          icon={<Lightbulb className="h-4 w-4 text-amber-500" />}
          accent="border-amber-200 bg-amber-50/50"
        />
        <SummaryCard
          label="In Review"
          value={summary.needsReview}
          icon={<HelpCircle className="h-4 w-4 text-red-500" />}
          accent="border-red-200 bg-red-50/50"
        />
        <SummaryCard
          label="Audit"
          value={summary.passing ? 'Pass' : `${summary.violations.length} issue${summary.violations.length !== 1 ? 's' : ''}`}
          icon={summary.passing
            ? <ShieldCheck className="h-4 w-4 text-emerald-500" />
            : <ShieldAlert className="h-4 w-4 text-red-500" />
          }
          accent={summary.passing ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}
        />
      </div>

      {/* Violations banner */}
      {violations.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-sm font-semibold text-red-800">
              {violations.length} audit-{violations.length === 1 ? 'overtreding' : 'overtredingen'}
            </span>
          </div>
          <ul className="space-y-1">
            {violations.map(v => (
              <li key={`${v.widgetId}-${v.issue}`} className="text-sm text-red-700">
                <span className="font-mono text-xs">{v.widgetId}</span>
                {' — '}
                {v.issue === 'unclassified' && 'Niet geclassificeerd (voeg toe aan WIDGET_CLASSIFICATION)'}
                {v.issue === 'insight_missing_href' && 'Insight-widget zonder href (voeg toe aan WIDGET_HREFS)'}
                {v.issue === 'needs_review_pending' && 'Gemarkeerd voor review maar nog geen beslissing genomen'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* All clear banner */}
      {violations.length === 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-800">
              Alle {summary.catalogSize} widgets zijn geclassificeerd en voldoen aan de audit-regels.
            </span>
          </div>
          <p className="mt-1 text-xs text-emerald-700">
            {summary.observations} observaties, {summary.insights} insights, {summary.needsReview} in review.
            Geen widgets zonder classificatie of ontbrekende acties.
          </p>
        </div>
      )}

      {/* Needs Review section (always shown, even if empty) */}
      <section>
        <SectionHeader
          title="Widgets in Review"
          count={needsReview.length}
          icon={<HelpCircle className="h-4 w-4 text-red-500" />}
          description="Widgets die noch als waardevolle observatie noch als actie-gekoppeld insight classificeren. Elke moet een beslissing krijgen: behouden, verwijderen, of aanpassen."
        />
        {needsReview.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border-md)] bg-[var(--subtle)] px-4 py-6 text-center">
            <p className="text-sm text-[var(--ink-3)]">
              Geen widgets gemarkeerd voor review.
            </p>
            <p className="mt-1 text-xs text-[var(--ink-4)]">
              Wijzig een widget in <code className="font-mono text-[10px]">WIDGET_CLASSIFICATION</code> naar{' '}
              <code className="font-mono text-[10px]">&apos;needs_review&apos;</code> en voeg een entry toe
              in <code className="font-mono text-[10px]">WIDGET_REVIEW_LOG</code>.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {needsReview.map(w => (
              <WidgetReviewRow key={w.id} widget={w} />
            ))}
          </div>
        )}
      </section>

      {/* Unclassified section */}
      {unclassified.length > 0 && (
        <section>
          <SectionHeader
            title="Niet-geclassificeerd"
            count={unclassified.length}
            icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
            description="Widgets die nog geen classificatie hebben. Voeg ze toe aan WIDGET_CLASSIFICATION."
          />
          <div className="space-y-2">
            {unclassified.map(w => (
              <WidgetRow key={w.id} widget={w} />
            ))}
          </div>
        </section>
      )}

      {/* Observations */}
      <section>
        <SectionHeader
          title="Observaties"
          count={observations.length}
          icon={<Eye className="h-4 w-4 text-blue-500" />}
          description="Pure metric-weergaven: netto vermogen, trends, voortgangsbalken. Legitiem zonder verplichte actie."
        />
        <div className="space-y-1">
          {observations.map(w => (
            <WidgetRow key={w.id} widget={w} />
          ))}
        </div>
      </section>

      {/* Insights */}
      <section>
        <SectionHeader
          title="Insights"
          count={insights.length}
          icon={<Lightbulb className="h-4 w-4 text-amber-500" />}
          description="Actionable widgets die de gebruiker naar een relevante pagina leiden. Moeten een href of onClick hebben."
        />
        <div className="space-y-1">
          {insights.map(w => (
            <WidgetRow key={w.id} widget={w} />
          ))}
        </div>
      </section>

      {/* How-to guide */}
      <section className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-4">
        <h3 className="text-sm font-semibold text-[var(--ink-2)] mb-2">Hoe een widget markeren voor review</h3>
        <ol className="list-decimal list-inside space-y-1.5 text-sm text-[var(--ink-3)]">
          <li>
            Wijzig de classificatie in <code className="font-mono text-[10px] bg-[var(--paper)] px-1 rounded">lib/widget-audit.ts</code>
            {' → '}<code className="font-mono text-[10px] bg-[var(--paper)] px-1 rounded">WIDGET_CLASSIFICATION</code> naar{' '}
            <code className="font-mono text-[10px] bg-[var(--paper)] px-1 rounded">&apos;needs_review&apos;</code>
          </li>
          <li>
            Voeg een entry toe in <code className="font-mono text-[10px] bg-[var(--paper)] px-1 rounded">WIDGET_REVIEW_LOG</code> met{' '}
            <code className="font-mono text-[10px] bg-[var(--paper)] px-1 rounded">decision: &apos;pending&apos;</code> en een rationale
          </li>
          <li>
            Na review: update de decision naar <code className="font-mono text-[10px] bg-[var(--paper)] px-1 rounded">&apos;keep&apos;</code>,{' '}
            <code className="font-mono text-[10px] bg-[var(--paper)] px-1 rounded">&apos;remove&apos;</code>, of{' '}
            <code className="font-mono text-[10px] bg-[var(--paper)] px-1 rounded">&apos;modify&apos;</code>
          </li>
          <li>
            Alleen widgets met decision <code className="font-mono text-[10px] bg-[var(--paper)] px-1 rounded">&apos;remove&apos;</code> mogen
            uit de catalog verwijderd worden (<code className="font-mono text-[10px] bg-[var(--paper)] px-1 rounded">canRemoveWidget()</code> guard)
          </li>
        </ol>
      </section>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  accent: string
}) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${accent}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">{label}</span>
      </div>
      <span className="text-lg font-semibold font-mono tabular-nums text-[var(--ink)]">{value}</span>
    </div>
  )
}

function SectionHeader({
  title,
  count,
  icon,
  description,
}: {
  title: string
  count: number
  icon: React.ReactNode
  description: string
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
        <span className="rounded-full bg-[var(--subtle)] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--ink-3)]">
          {count}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-[var(--ink-4)] ml-6">{description}</p>
    </div>
  )
}

interface WidgetRowData {
  id: string
  name: string
  description: string
  module: WidgetModule
  classification?: WidgetClassification
  href?: string
  violation?: { issue: string }
}

function WidgetRow({ widget }: { widget: WidgetRowData }) {
  return (
    <div className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
      widget.violation ? 'bg-red-50 border border-red-200' : 'hover:bg-[var(--subtle)]'
    }`}>
      {/* Module dot */}
      <div className={`h-2 w-2 rounded-full shrink-0 ${MODULE_DOT[widget.module]}`} />

      {/* Name + description */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--ink)]">{widget.name}</span>
          <span className="text-[10px] font-mono text-[var(--ink-4)]">{widget.id}</span>
        </div>
        <p className="text-xs text-[var(--ink-3)] truncate">{widget.description}</p>
      </div>

      {/* Module label */}
      <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-4)] shrink-0">
        {MODULE_LABEL[widget.module]}
      </span>

      {/* Classification badge */}
      {widget.classification && <ClassificationBadge classification={widget.classification} />}

      {/* Href link */}
      {widget.href && (
        <span className="shrink-0 text-[10px] font-mono text-[var(--ink-4)] flex items-center gap-0.5">
          <ExternalLink className="h-3 w-3" />
          {widget.href}
        </span>
      )}

      {/* Violation marker */}
      {widget.violation && (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
      )}
    </div>
  )
}

function WidgetReviewRow({ widget }: { widget: WidgetRowData & { review: { decision: ReviewDecision; rationale: string; reviewedAt: string | null } | null } }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${
      widget.review?.decision === 'pending' || !widget.review
        ? 'border-orange-200 bg-orange-50/50'
        : widget.review.decision === 'remove'
        ? 'border-red-200 bg-red-50/50'
        : widget.review.decision === 'keep'
        ? 'border-emerald-200 bg-emerald-50/50'
        : 'border-purple-200 bg-purple-50/50'
    }`}>
      <div className="flex items-center gap-3">
        {/* Module dot */}
        <div className={`h-2 w-2 rounded-full shrink-0 ${MODULE_DOT[widget.module]}`} />

        {/* Name */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--ink)]">{widget.name}</span>
            <span className="text-[10px] font-mono text-[var(--ink-4)]">{widget.id}</span>
          </div>
          <p className="text-xs text-[var(--ink-3)]">{widget.description}</p>
        </div>

        {/* Decision badge */}
        {widget.review ? (
          <DecisionBadge decision={widget.review.decision} />
        ) : (
          <DecisionBadge decision="pending" />
        )}
      </div>

      {/* Rationale */}
      {widget.review?.rationale && (
        <div className="mt-2 ml-5 border-l-2 border-[var(--border-md)] pl-3">
          <p className="text-xs text-[var(--ink-2)] italic">{widget.review.rationale}</p>
          {widget.review.reviewedAt && (
            <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
              Beoordeeld op {widget.review.reviewedAt}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
