export function Footer() {
  return (
    <footer className="flex flex-col items-center gap-2 border-t border-zinc-200 px-6 py-8 sm:flex-row sm:justify-between md:px-12">
      <span className="text-sm text-zinc-400">
        &copy; {new Date().getFullYear()} TriFinity
      </span>
      <span className="text-sm text-zinc-400 italic">
        Geld is opgeslagen tijd
      </span>
    </footer>
  )
}
