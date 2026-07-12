import Link from 'next/link'
import { Kicker, EditorialHeadline } from '@/components/editorial'

export default function AppNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center px-6 py-20">
      <Kicker>404 — niet gevonden</Kicker>
      <EditorialHeadline emphasis="meer" className="mt-4 text-[var(--ink)]">
        Deze pagina bestaat niet meer
      </EditorialHeadline>
      <p
        className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-[var(--ink-2)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        De pagina die je zoekt is verplaatst of bestaat niet. Geen zorgen — je
        gegevens zijn veilig. Keer terug naar je Overzicht en pak de draad weer
        op.
      </p>
      <div className="mt-8">
        <Link
          href="/overzicht"
          className="inline-flex min-h-11 items-center justify-center bg-[var(--ink)] px-5 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
        >
          Naar Overzicht
        </Link>
      </div>
    </div>
  )
}
