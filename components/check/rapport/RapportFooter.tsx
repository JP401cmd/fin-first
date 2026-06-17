/** Footer — Wft-disclaimer + AVG-regel. Statische server-render. */
export function RapportFooter({
  disclaimers,
}: {
  disclaimers: { wft: string; avg: string }
}) {
  return (
    <footer>
      <div className="wrap">
        <div className="disc">
          <p>{disclaimers.wft}</p>
          <p className="avg-line">
            trifinity<span className="logo-dot">.</span> — Kern · Wil · Horizon ·{' '}
            {disclaimers.avg}
          </p>
        </div>
      </div>
    </footer>
  )
}
