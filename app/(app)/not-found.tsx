import { Kicker, EditorialHeadline, Button } from '@/components/editorial'

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
      <div className="mt-8 flex flex-wrap gap-3">
        <Button href="/overzicht" variant="primary">
          Naar Overzicht
        </Button>
        <Button href="/" variant="secondary">
          Naar startpagina
        </Button>
      </div>
    </div>
  )
}
