import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'

export default function HoldingNotFound() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center justify-center px-6 py-20" data-testid="holding-not-found-page">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-kern-100 dark:bg-kern-900/50">
          <AlertTriangle className="h-8 w-8 text-kern-600 dark:text-kern-400" />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100" data-testid="holding-not-found-title">
          Holding niet gevonden
        </h1>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400" data-testid="holding-not-found-message">
          Deze holding bestaat niet, is verwijderd, of het opgegeven ID is ongeldig.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/core/assets/holdings"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-kern-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-kern-700 transition-colors"
            data-testid="back-to-holdings-link"
          >
            <ArrowLeft className="h-4 w-4" />
            Naar holdings overzicht
          </Link>
          <Link
            href="/will"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-6 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          >
            Naar De Wil
          </Link>
        </div>
      </div>
    </div>
  )
}
