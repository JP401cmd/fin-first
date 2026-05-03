import React from 'react'

interface WillEditorialHeaderProps {
  totalPendingRecDays: number
  totalOpenActionDays: number
  goalProgress: number
  completedActionsCount: number
  doelenEnabled: boolean
}

interface WillKpiCellProps {
  kicker: string
  value: string
  unit: string
  actionLabel: string
  href?: string
  highlight?: boolean
  kickerMuted?: boolean
}

export function WillEditorialHeader({
  totalPendingRecDays,
  totalOpenActionDays,
  goalProgress,
  completedActionsCount,
  doelenEnabled,
}: WillEditorialHeaderProps) {
  const totaalDagen = totalPendingRecDays + totalOpenActionDays
  const subMeta = totaalDagen === 0
    ? 'Nog niets in de pijplijn — start met een voorstel.'
    : `in jouw pijplijn deze maand — ${totalPendingRecDays} te ontdekken, ${totalOpenActionDays} in uitvoering.`
  const gridColsClass = doelenEnabled ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'

  return (
    <header className="border-b border-[var(--border-ed)] px-5 sm:px-6 py-6 sm:py-8 space-y-3">
      <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
        <span aria-hidden className="inline-block h-px w-7 shrink-0" style={{ background: 'var(--module-active-500)' }} />
        Wil · Actiebord
      </div>

      <h1 className="font-bold leading-tight tracking-[-0.02em] text-[28px] sm:text-[36px] md:text-[44px]" style={{ fontFamily: 'var(--font-playfair, serif)' }}>
        Welk <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>werk</em> zet je in beweging?
      </h1>

      <p className="font-mono tabular-nums text-[36px] sm:text-[44px] font-bold leading-none mt-2">
        <span className="inline px-1" style={{ backgroundImage: 'linear-gradient(transparent 60%, var(--module-active-200) 60%)', color: 'var(--ink)' }}>
          +{totaalDagen} vrijheidsdagen
        </span>
      </p>

      <p className="italic text-[13px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
        {subMeta}
      </p>

      <div className={`mt-5 grid ${gridColsClass} border-t border-b border-[var(--ink)]`}>
        <WillKpiCell kicker="Te ontdekken" value={`+${totalPendingRecDays}`} unit="dagen" actionLabel="voorstellen wachten" href="#voorstellen" />
        <WillKpiCell kicker="In uitvoering" value={`+${totalOpenActionDays}`} unit="dagen" actionLabel="acties op het bord" href="#acties" highlight />
        {doelenEnabled && (
          <WillKpiCell kicker="Doelvoortgang" value={`${goalProgress}`} unit="%" actionLabel="gemiddelde voortgang" href="#doelen" />
        )}
        <WillKpiCell kicker="Afgerond" kickerMuted value={`${completedActionsCount}`} unit="" actionLabel="acties dit kwartaal" />
      </div>
    </header>
  )
}

export function WillKpiCell({
  kicker,
  value,
  unit,
  actionLabel,
  href,
  highlight = false,
  kickerMuted = false,
}: WillKpiCellProps) {
  const cellClass = 'p-3 sm:p-4 border-r border-[var(--rule-soft)] last:border-r-0 [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0 last:border-b-0 text-center'

  const valueNode = highlight ? (
    <span className="inline px-1" style={{ backgroundImage: 'linear-gradient(transparent 60%, var(--module-active-200) 60%)' }}>
      {value}
    </span>
  ) : (
    <span>{value}</span>
  )

  const inner = (
    <>
      <p className="text-[10px] uppercase tracking-[0.18em] font-mono font-semibold" style={{ color: kickerMuted ? 'var(--ink-3)' : 'var(--module-active-700)' }}>
        {kicker}
      </p>
      <p className="mt-1 sm:mt-1.5 text-[15px] sm:text-[20px] font-bold leading-none tracking-[-0.01em] tabular-nums" style={{ fontFamily: 'var(--font-playfair, serif)', color: 'var(--ink)' }}>
        {valueNode}
        {unit && (
          <span className="ml-1 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--ink-3)] not-italic align-baseline">
            {unit}
          </span>
        )}
      </p>
      <p className="mt-1 italic text-[10px] sm:text-[11px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
        {actionLabel}
      </p>
    </>
  )

  if (href) {
    return (
      <a href={href} className={`${cellClass} block transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]`}>
        {inner}
      </a>
    )
  }
  return <div className={cellClass}>{inner}</div>
}
