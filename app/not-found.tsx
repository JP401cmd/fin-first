import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-zinc-900">404</h1>
        <p className="mt-4 text-lg text-zinc-600">
          Deze pagina bestaat niet.
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          De pagina die je zoekt is niet gevonden of verplaatst.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            Naar startpagina
          </Link>
          <Link
            href="/overzicht"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-6 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Naar Overzicht
          </Link>
        </div>
      </div>
    </div>
  )
}
