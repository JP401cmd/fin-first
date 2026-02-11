import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50 py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <Link href="/" className="text-lg font-bold text-zinc-900">
            TriFinity
          </Link>
          <p className="text-sm text-zinc-500">
            Jouw financiële vrijheids-navigator
          </p>
        </div>

        <div className="mt-8 border-t border-zinc-200 pt-8 text-center text-sm text-zinc-400">
          &copy; {new Date().getFullYear()} TriFinity. Alle rechten voorbehouden.
        </div>
      </div>
    </footer>
  )
}
