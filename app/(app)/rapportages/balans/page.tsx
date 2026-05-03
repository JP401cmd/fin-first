'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Printer } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { BalansData, BalansCategory } from '@/app/api/report/balans/route'
import { eurToFreedomTime } from '@/components/app/freedom-time-label'

// ── Sub-components ───────────────────────────────────────────────────────────

/** Renders a balance category with sub-groups organized by type */
function BalansCategoryBlock({ category, sign }: { category: BalansCategory; sign?: 'negative' }) {
  if (category.items.length === 0) return null
  const neg = sign === 'negative'
  const hasSubGroups = category.subGroups.length > 1

  return (
    <div className="mb-4">
      {/* Category header */}
      <p className="mb-2 font-inter text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
        {category.label}
      </p>

      {hasSubGroups ? (
        // Multiple sub-groups: show type headers
        <div className="space-y-2">
          {category.subGroups.map(group => (
            <div key={group.label}>
              <p className="mb-0.5 font-inter text-[10px] font-semibold text-[var(--ink-3)]">
                {group.label}
              </p>
              <div className="space-y-px pl-2 border-l-2 border-[var(--border-ed)]">
                {group.items.map(item => (
                  <BalansItemRow key={item.id} item={item} neg={neg} />
                ))}
              </div>
              {group.items.length > 1 && (
                <div className="mt-0.5 flex justify-between pl-2 text-[var(--ink-3)]">
                  <span className="font-inter text-[10px] italic">Subtotaal {group.label.toLowerCase()}</span>
                  <span className={`font-dm-mono text-[10px] tabular-nums ${neg ? 'text-red-600' : 'text-[var(--ink-2)]'}`}>
                    {formatCurrency(group.subtotal)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        // Single group or flat list: no sub-headers needed
        <div className="space-y-px">
          {category.items.map(item => (
            <BalansItemRow key={item.id} item={item} neg={neg} />
          ))}
        </div>
      )}

      {/* Category subtotal */}
      <div className="mt-1.5 flex justify-between border-t border-dashed border-[var(--border-ed)] pt-1">
        <span className="font-inter text-[11px] font-medium text-[var(--ink-2)]">{category.label}</span>
        <span className={`font-dm-mono text-[12px] font-medium tabular-nums ${neg ? 'text-red-700' : 'text-[var(--ink)]'}`}>
          {formatCurrency(category.subtotal)}
        </span>
      </div>
    </div>
  )
}

function BalansItemRow({ item, neg }: { item: { id: string; name: string; value: number; inclusionPct: number; interestRate?: number }; neg: boolean }) {
  return (
    <div className="flex justify-between gap-2 py-px">
      <span className="truncate font-source-serif text-[13px] text-[var(--ink-2)]">
        {item.name}
        {item.inclusionPct < 100 && (
          <span className="ml-1 font-inter text-[10px] text-[var(--ink-4)]">({item.inclusionPct}%)</span>
        )}
        {item.interestRate != null && item.interestRate > 0 && (
          <span className="ml-1 font-dm-mono text-[10px] text-[var(--ink-4)]">{item.interestRate}%</span>
        )}
      </span>
      <span className={`shrink-0 font-dm-mono text-[13px] tabular-nums ${neg ? 'text-red-700' : 'text-[var(--ink)]'}`}>
        {formatCurrency(item.value)}
      </span>
    </div>
  )
}

function KengetalRow({ label, value, variant, tooltip }: {
  label: string
  value: string
  variant?: 'positive' | 'negative' | 'neutral'
  tooltip?: string
}) {
  const colorClass = variant === 'positive' ? 'text-kern-600'
    : variant === 'negative' ? 'text-red-600'
    : 'text-[var(--ink)]'

  return (
    <div className="flex justify-between py-0.5">
      <span className="font-inter text-[11px] text-[var(--ink-2)]">
        {label}
        {tooltip && <span className="ml-1 text-[9px] text-[var(--ink-4)]" title={tooltip}>ⓘ</span>}
      </span>
      <span className={`font-dm-mono text-[12px] tabular-nums ${colorClass}`}>
        {value}
      </span>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BalansPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

  const [data, setData] = useState<BalansData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchBalans() {
      try {
        const res = await fetch(`/api/report/balans?date=${date}`)
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Balans laden mislukt')
        }
        setData(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Balans laden mislukt')
      } finally {
        setLoading(false)
      }
    }
    fetchBalans()
  }, [date])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
          <p className="font-inter text-sm text-[var(--ink-3)]">Balans wordt opgesteld...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="font-playfair text-xl text-[var(--ink)]">Balans niet beschikbaar</p>
          <p className="mt-2 font-inter text-sm text-[var(--ink-3)]">{error || 'Geen data gevonden'}</p>
        </div>
      </div>
    )
  }

  const displayDate = new Date(data.date).toLocaleDateString('nl-NL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const generatedDate = new Date(data.generatedAt).toLocaleDateString('nl-NL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const freedom = data.dailyExpenseRate > 0 && data.eigenVermogen >= 100
    ? eurToFreedomTime(data.eigenVermogen, data.dailyExpenseRate)
    : null

  const solvVariant: 'positive' | 'negative' | 'neutral' =
    data.solvabiliteitsratio == null ? 'neutral'
    : data.solvabiliteitsratio >= 40 ? 'positive'
    : data.solvabiliteitsratio < 0 ? 'negative'
    : 'neutral'

  const totalAssetItems = data.vasteActiva.items.length + data.vlottendeActiva.items.length + data.liquideMiddelen.items.length
  const totalDebtItems = data.langVreemdVermogen.items.length + data.kortVreemdVermogen.items.length

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 md:px-8">
      {/* ── Toolbar ── */}
      <div data-print-hide className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push('/rapportages')}
          className="flex items-center gap-2 font-inter text-sm text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar rapportages
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-4 py-2 font-inter text-sm font-medium text-[var(--ink)] shadow-[var(--s0)] transition-all hover:shadow-[var(--s1)] hover:-translate-y-px"
        >
          <Printer className="h-4 w-4" />
          Afdrukken als PDF
        </button>
      </div>

      {/* ── Masthead ── */}
      {/* Editorial header — masthead-stijl met dubbele lijn */}
      <div
        className="pb-4 mb-8"
        style={{ borderBottom: '4px double var(--ink)' }}
      >
        {/* Kicker met dubbele streep */}
        <div className="inline-flex items-center justify-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)] mb-1 w-full">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Persoonlijke vermogensbalans
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
        </div>
        <h1
          className="text-center text-3xl font-bold tracking-tight text-[var(--ink)] md:text-[42px] md:leading-[1.1]"
          style={{ fontFamily: 'var(--font-playfair, serif)', letterSpacing: '-0.03em' }}
        >
          {displayDate}
        </h1>
        <div className="mt-3 flex items-center justify-center gap-2 text-[13px] font-source-serif italic text-[var(--ink-3)]">
          {data.displayName && <span>{data.displayName}</span>}
          {data.displayName && <span>&middot;</span>}
          <span>Peildatum {new Date(data.date).toLocaleDateString('nl-NL')}</span>
        </div>
      </div>

      {/* ── Dateline ── */}
      <div className="mb-6 flex items-center justify-between border-b border-[var(--border-ed)] pb-2">
        <span className="font-inter text-[11px] font-semibold uppercase tracking-[0.11em] text-[var(--ink-3)]">
          Balansstaat
        </span>
        <span className="font-source-serif text-[13px] italic text-[var(--ink-3)]">
          {totalAssetItems} bezittingen · {totalDebtItems} schulden
        </span>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          BALANS — Scontrovorm (twee kolommen)
          Links: ACTIVA (Debet) — wat je bezit
          Rechts: PASSIVA (Credit) — hoe het gefinancierd is
         ════════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] overflow-hidden">

        {/* Column headers */}
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="border-b-2 border-[var(--ink)] bg-[var(--subtle)]/40 px-5 py-2.5">
            <p className="font-inter text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink)]">
              Activa <span className="font-normal text-[var(--ink-3)]">(debet)</span>
            </p>
            <p className="mt-0.5 font-source-serif text-[11px] italic text-[var(--ink-3)]">Wat je bezit</p>
          </div>
          <div className="border-b-2 border-[var(--ink)] border-l-0 md:border-l border-[var(--border-ed)] bg-[var(--subtle)]/40 px-5 py-2.5">
            <p className="font-inter text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink)]">
              Passiva <span className="font-normal text-[var(--ink-3)]">(credit)</span>
            </p>
            <p className="mt-0.5 font-source-serif text-[11px] italic text-[var(--ink-3)]">Hoe het gefinancierd is</p>
          </div>
        </div>

        {/* Balance body — two columns */}
        <div className="grid grid-cols-1 md:grid-cols-2">

          {/* ── LEFT: ACTIVA ── */}
          <div className="border-r-0 md:border-r border-[var(--border-ed)] px-5 py-4">

            {/* I. Vaste activa */}
            <BalansCategoryBlock category={data.vasteActiva} />

            {/* II. Vlottende activa */}
            <BalansCategoryBlock category={data.vlottendeActiva} />

            {/* III. Liquide middelen (bank accounts) */}
            <BalansCategoryBlock category={data.liquideMiddelen} />

            {/* ═══ TOTAAL ACTIVA ═══ */}
            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2">
              <span className="font-inter text-sm font-bold text-[var(--ink)]">Totaal activa</span>
              <span className="font-dm-mono text-sm font-bold tabular-nums text-[var(--ink)]">
                {formatCurrency(data.totalActiva)}
              </span>
            </div>
          </div>

          {/* ── RIGHT: PASSIVA ── */}
          <div className="border-t md:border-t-0 border-[var(--border-ed)] px-5 py-4">

            {/* I. Eigen vermogen */}
            <div className="mb-4">
              <p className="mb-2 font-inter text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                Eigen vermogen
              </p>
              <div className="flex justify-between py-px">
                <span className="font-source-serif text-[13px] text-[var(--ink-2)]">
                  Netto vermogen
                </span>
                <span className={`font-dm-mono text-[13px] font-medium tabular-nums ${data.eigenVermogen >= 0 ? 'text-kern-700' : 'text-red-700'}`}>
                  {formatCurrency(data.eigenVermogen)}
                </span>
              </div>
              <p className="mt-0.5 font-inter text-[10px] italic text-[var(--ink-4)]">
                Activa {formatCurrency(data.totalActiva)} − schulden {formatCurrency(data.totalSchulden)}
              </p>
              <div className="mt-1.5 flex justify-between border-t border-dashed border-[var(--border-ed)] pt-1">
                <span className="font-inter text-[11px] font-medium text-[var(--ink-2)]">Eigen vermogen</span>
                <span className={`font-dm-mono text-[12px] font-medium tabular-nums ${data.eigenVermogen >= 0 ? 'text-kern-700' : 'text-red-700'}`}>
                  {formatCurrency(data.eigenVermogen)}
                </span>
              </div>
            </div>

            {/* II. Lang vreemd vermogen */}
            <BalansCategoryBlock category={data.langVreemdVermogen} sign="negative" />

            {/* III. Kort vreemd vermogen */}
            <BalansCategoryBlock category={data.kortVreemdVermogen} sign="negative" />

            {/* ═══ TOTAAL PASSIVA ═══ */}
            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2">
              <span className="font-inter text-sm font-bold text-[var(--ink)]">Totaal passiva</span>
              <span className="font-dm-mono text-sm font-bold tabular-nums text-[var(--ink)]">
                {formatCurrency(data.totalPassiva)}
              </span>
            </div>
          </div>
        </div>

        {/* Balance check bar */}
        <div className="border-t border-[var(--border-ed)] bg-[var(--subtle)]/30 px-5 py-2 text-center">
          <span className="font-inter text-[10px] text-[var(--ink-4)]">
            Activa {formatCurrency(data.totalActiva)} = Passiva {formatCurrency(data.totalPassiva)}
            {data.totalActiva === data.totalPassiva ? ' — in evenwicht' : ''}
          </span>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          KENGETALLEN — Financiële gezondheid
         ════════════════════════════════════════════════════════════════════════ */}
      <div className="mt-8 rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-5 font-mono text-sm">
        <div className="mb-3 text-center">
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
            Kengetallen
          </p>
          <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
            Financiële gezondheid op {new Date(data.date).toLocaleDateString('nl-NL')}
          </p>
        </div>

        <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
          Deze kengetallen geven inzicht in je financiële weerbaarheid.
          Hoe hoger de solvabiliteit en liquiditeit, hoe sterker je positie.
        </div>

        {/* Vermogenspositie */}
        <p className="mb-1 mt-2 font-sans text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">Vermogenspositie</p>
        <KengetalRow
          label="Eigen vermogen"
          value={formatCurrency(data.eigenVermogen)}
          variant={data.eigenVermogen >= 0 ? 'positive' : 'negative'}
        />
        <KengetalRow
          label="Totaal schulden"
          value={formatCurrency(data.totalSchulden)}
          variant={data.totalSchulden > 0 ? 'negative' : 'neutral'}
        />
        <KengetalRow
          label="Balanstotaal"
          value={formatCurrency(data.totalActiva)}
        />

        <div className="my-2 border-b border-dashed border-[var(--border-ed)]" />

        {/* Ratio's */}
        <p className="mb-1 font-sans text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">{"Ratio's"}</p>

        {data.solvabiliteitsratio != null && (
          <KengetalRow
            label="Solvabiliteitsratio"
            value={`${data.solvabiliteitsratio.toFixed(1)}%`}
            variant={solvVariant}
            tooltip="Eigen vermogen / Totaal activa"
          />
        )}

        {data.schuldgraad != null && (
          <KengetalRow
            label="Schuldgraad"
            value={`${data.schuldgraad.toFixed(2)}×`}
            variant={data.schuldgraad > 2 ? 'negative' : data.schuldgraad <= 1 ? 'positive' : 'neutral'}
            tooltip="Schulden / Eigen vermogen"
          />
        )}

        {data.liquiditeitsratio != null && (
          <KengetalRow
            label="Liquiditeitsratio (current ratio)"
            value={`${data.liquiditeitsratio.toFixed(2)}×`}
            variant={data.liquiditeitsratio >= 2 ? 'positive' : data.liquiditeitsratio >= 1 ? 'neutral' : 'negative'}
            tooltip="(Vlottende activa + liquide middelen) / Kort vreemd vermogen"
          />
        )}

        {/* Solvability bar */}
        {data.solvabiliteitsratio != null && (
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--border-ed)]">
                <div
                  className={`h-full rounded-full transition-all ${
                    data.solvabiliteitsratio >= 40 ? 'bg-kern-500' : data.solvabiliteitsratio >= 0 ? 'bg-horizon-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, data.solvabiliteitsratio))}%` }}
                />
              </div>
              <span className="shrink-0 font-inter text-[10px] text-[var(--ink-4)]">
                {data.solvabiliteitsratio >= 40 ? 'Gezond' : data.solvabiliteitsratio >= 25 ? 'Redelijk' : data.solvabiliteitsratio >= 0 ? 'Kwetsbaar' : 'Negatief'}
              </span>
            </div>
            <p className="mt-1 font-sans text-[10px] text-[var(--ink-4)]">
              {'< 25% kwetsbaar · 25–40% redelijk · > 40% financieel gezond'}
            </p>
          </div>
        )}

        {/* Formules */}
        <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
          <p><strong className="font-semibold text-[var(--ink-3)]">Solvabiliteit</strong> = Eigen vermogen ÷ Totaal activa × 100%</p>
          <p className="mt-0.5"><strong className="font-semibold text-[var(--ink-3)]">Schuldgraad</strong> = Totaal schulden ÷ Eigen vermogen</p>
          <p className="mt-0.5"><strong className="font-semibold text-[var(--ink-3)]">Liquiditeit</strong> = (Vlottende activa + Liquide middelen) ÷ Kort vreemd vermogen</p>
        </div>

        <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
          Berekend op basis van {totalAssetItems} activa en {totalDebtItems} schulden in TriFinity
        </p>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          VRIJHEIDSTIJD — TriFinity filosofie
         ════════════════════════════════════════════════════════════════════════ */}
      {freedom && (
        <div className="mt-8 text-center">
          <p className="font-inter text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)] mb-3">
            Geld is opgeslagen tijd
          </p>
          <div className="inline-block rounded-[var(--r-lg)] border border-[var(--hor-m)] bg-[var(--hor-l)] px-8 py-5">
            <p className="font-playfair text-4xl font-bold text-[var(--hor-t)]" style={{ letterSpacing: '-0.03em' }}>
              {freedom.formatted}
            </p>
            <p className="mt-1 font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--hor-t)]">
              vrijheid
            </p>
          </div>
          <p className="mt-3 font-source-serif text-[13px] italic text-[var(--ink-3)]">
            Je eigen vermogen van {formatCurrency(data.eigenVermogen)} vertegenwoordigt {freedom.formattedDagen} aan financiële vrijheid,
            gebaseerd op je dagelijkse uitgaven van {formatCurrency(Math.round(data.dailyExpenseRate))}/dag.
          </p>
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="mt-10 border-t-2 border-[var(--ink)] pt-4 text-center">
        <p className="font-playfair text-lg font-bold text-[var(--ink)]">
          <span>t</span><span className="text-kern-600">f.</span>
        </p>
        <p className="mt-1 font-source-serif text-[13px] italic text-[var(--ink-3)]">
          &ldquo;Geld is opgeslagen tijd&rdquo;
        </p>
        <p className="mt-2 font-inter text-[10px] text-[var(--ink-4)]">
          Gegenereerd door TriFinity &middot; {generatedDate}
        </p>
      </footer>
    </div>
  )
}
