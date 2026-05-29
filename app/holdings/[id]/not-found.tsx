import Link from 'next/link'

export default function HoldingNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-zinc-900">404</h1>
        <p className="mt-4 text-lg text-zinc-600">
          Holding niet gevonden.
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          Deze holding bestaat niet, is verwijderd, of het opgegeven ID is ongeldig.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/overzicht"
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            Naar Overzicht
          </Link>
          <Link
            href="/core/assets/holdings"
            className="inline-flex items-center justify-center rounded-lg border border-amber-300 bg-white px-6 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors"
          >
            Naar holdings
          </Link>
        </div>
      </div>
    </div>
  )
}
