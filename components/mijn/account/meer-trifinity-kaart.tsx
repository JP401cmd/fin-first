import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/**
 * De kaart "Meer TriFinity" op /mijn/account (Krant 2D fase 1). Alleen voor
 * een Krant-account — `AccountClient` beslist dat via `useNavSurface().isKrant`
 * (dezelfde lezing als de rest van de Krant-grens). Hij wijst naar
 * /krant/meer; daar staat wat het volledige TriFinity laat zien, en de knop.
 *
 * Bewust alleen een link, geen actie: de keuze valt op /krant/meer, mét de
 * uitleg ervoor.
 */
export function MeerTriFinityKaart() {
  return (
    <section aria-labelledby="meer-trifinity-heading" className="space-y-3">
      <header>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">Je product</div>
        <h2 id="meer-trifinity-heading" className="mt-1 font-serif text-xl text-[var(--ink)] sm:text-2xl">
          Meer TriFinity
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
          Je leest nu de Krant. Het volledige TriFinity zet je eigen cijfers ernaast: je vermogen, je budget, box 3 en
          een plan in de tijd.
        </p>
      </header>
      <Link
        href="/krant/meer"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--ink)] underline underline-offset-4 hover:text-[var(--ink-2)]"
      >
        Bekijk wat het volledige TriFinity laat zien
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  )
}
