import Link from 'next/link'

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 md:py-32">
      <div className="text-center">
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-zinc-900 md:text-5xl lg:text-6xl">
          Verdien je vrijheid.
          <br />
          <span className="text-zinc-500">Dag voor dag.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600">
          Geld is opgeslagen tijd. TriFinity vertaalt je financiën naar vrijheid
          — zodat je bewuste keuzes maakt over wat echt waarde geeft.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Start je reis
          </Link>
          <a
            href="#domeinen"
            className="rounded-lg border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Ontdek meer
          </a>
        </div>
      </div>
    </section>
  )
}
