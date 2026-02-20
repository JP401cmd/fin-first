import type { ReportData } from '@/lib/report-data'

export function ReportMasthead({ data }: { data: ReportData }) {
  const generatedDate = new Date(data.generatedAt).toLocaleDateString('nl-NL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="report-masthead border-b-2 border-[var(--ink)] pb-4 mb-8">
      <p className="text-center font-inter text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] mb-2">
        Het Financieel Overzicht
      </p>
      <h1 className="text-center font-playfair text-4xl font-bold tracking-tight text-[var(--ink)] md:text-5xl" style={{ letterSpacing: '-0.03em' }}>
        {data.reportName}
      </h1>
      <div className="mt-3 flex items-center justify-center gap-2 text-[13px] font-source-serif italic text-[var(--ink-3)]">
        {data.displayName && <span>{data.displayName}</span>}
        {data.displayName && <span>&middot;</span>}
        <span>{generatedDate}</span>
      </div>
    </div>
  )
}
