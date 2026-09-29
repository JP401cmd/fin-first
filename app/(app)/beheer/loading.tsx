// Rendert binnen BeheerLayout (BeheerContainer + BeheerNav) → geen eigen
// max-width/padding-wrapper; alleen een inhoud-skelet.
//
// Dit skelet geldt voor het dashboard (app/(app)/beheer/page.tsx) én voor elk
// onderliggend beheerscherm zonder eigen loading.tsx. Het is daarom bewust
// neutraal: een kop en een paar blokken, zonder tekst die alleen bij het
// dashboard hoort. De secties van het dashboard tonen daarna elk hun eigen
// laadtoestand (Suspense), met naam.
//
// F-03: bewust GEEN canonieke PageSkeletonList/Detail/Form hier — die dragen een
// eigen `px-4 py-5 sm:px-6`-wrapper, maar BeheerContainer levert die padding al;
// nesten zou dubbel inspringen (layout-shift bij data-aankomst). Scherpe hoeken
// (geen `rounded`), conform de krant-stijl.
export default function BeheerLoading() {
  return (
    <div role="status">
      <span className="sr-only">Beheer wordt geladen</span>
      <div aria-hidden>
        <div className="space-y-3">
          <div className="h-8 w-2/3 max-w-xl bg-[var(--subtle)] motion-safe:animate-pulse" />
          <div className="h-4 w-full max-w-2xl bg-[var(--subtle)] motion-safe:animate-pulse" />
        </div>

        <div className="mt-8 space-y-3">
          {[1, 2, 3].map((blok) => (
            <div key={blok} className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
              <div className="h-3 w-24 bg-[var(--subtle)] motion-safe:animate-pulse" />
              <div className="mt-3 h-4 w-2/3 bg-[var(--subtle)] motion-safe:animate-pulse" />
              <div className="mt-2 h-3 w-full bg-[var(--subtle)] motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
