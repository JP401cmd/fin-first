export function NewspaperFooter() {
  return (
    <footer className="mt-12">
      <div className="h-px bg-[var(--ink)]" />
      <div className="mt-[3px] h-[2px] bg-[var(--ink)]" />
      <div className="flex flex-col items-center gap-4 py-6 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
        <p className="font-source-serif text-sm italic leading-relaxed text-[var(--ink-3)]">
          &ldquo;Geld is opgeslagen tijd &mdash; elke euro vertegenwoordigt een stukje levenstijd.&rdquo;
        </p>
      </div>
    </footer>
  )
}
