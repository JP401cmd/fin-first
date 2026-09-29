import { LadenTeken } from './status-teken'

/**
 * Laadtoestand per sectie. De maten benaderen de gevulde sectie, zodat de
 * pagina niet verspringt als de cijfers binnenkomen. Scherpe hoeken, geen
 * spinner naast het skelet. De pulserende vlakken respecteren
 * `prefers-reduced-motion`.
 */

function Blok({ className }: { className: string }) {
  return <div aria-hidden className={`bg-[var(--subtle)] motion-safe:animate-pulse ${className}`} />
}

export function SectieSkelet({ wat, rijen = 3 }: { wat: string; rijen?: number }) {
  return (
    <div className="mb-12" data-testid="sectie-laden">
      <div className="mb-4 flex items-center gap-3">
        <LadenTeken wat={wat} />
        <div className="h-px flex-1 bg-[var(--border-ed)]" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rijen }, (_, i) => (
          <div key={i} className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <Blok className="h-3 w-24" />
            <Blok className="mt-3 h-4 w-2/3" />
            <Blok className="mt-2 h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function KerncijfersSkelet() {
  return (
    <div className="mb-12" data-testid="kerncijfers-laden">
      <div className="mb-4 flex items-center gap-3">
        <LadenTeken wat="Verloop" />
        <div className="h-px flex-1 bg-[var(--border-ed)]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <Blok className="h-3 w-28" />
            <Blok className="mt-3 h-7 w-20" />
            <Blok className="mt-3 h-16 w-full" />
            <Blok className="mt-3 h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
