import Link from 'next/link'

export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 pt-36 pb-24 text-center">
      {/* Subtle radial glow */}
      <div className="pointer-events-none absolute top-[15%] left-1/2 h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(212,168,67,0.05)_0%,rgba(60,200,200,0.04)_40%,rgba(139,92,184,0.03)_70%,transparent_100%)]" />

      <p className="mb-6 text-xs font-medium tracking-widest uppercase text-zinc-400 animate-[fade-up_0.8s_0.2s_both]">
        Vermogensbeheer, AI-coaching &amp; vrijheidsplanning in een app
      </p>

      <h1 className="text-4xl font-bold leading-tight tracking-tight max-w-[780px] mb-6 md:text-5xl lg:text-6xl animate-[fade-up_0.8s_0.35s_both]">
        Je denkt dat je{' '}
        <span className="text-amber-600">vrij</span>{' '}
        bent
      </h1>

      <p className="text-lg text-zinc-500 max-w-[520px] leading-relaxed mb-8 animate-[fade-up_0.8s_0.5s_both]">
        Maar als je morgen stopt met werken en vermogen opbouwen - hoe lang werkt jouw vermogen dan voor jouw manier van leven?
      </p>

      <div className="flex gap-4 animate-[fade-up_0.8s_0.65s_both] flex-col items-center sm:flex-row">
        <Link
          href="/signup"
          className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
        >
          Bereken je vrijheid
        </Link>
        <a
          href="#fragmentatie"
          className="rounded-lg border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          Lees verder
        </a>
      </div>

      {/* Feature badges */}
      <div className="mt-8 flex flex-wrap justify-center gap-3 animate-[fade-up_0.8s_0.8s_both]">
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Box 3 optimalisatie
        </span>
        <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
          AI-coaching
        </span>
        <span className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700">
          FIRE-tracking
        </span>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-9 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-[fade-up_0.8s_1s_both]">
        <span className="text-[10px] tracking-widest uppercase text-zinc-300">Scroll</span>
        <div className="w-px h-9 bg-gradient-to-b from-zinc-300 to-transparent animate-[scroll-pulse_2s_ease-in-out_infinite]" />
      </div>
    </section>
  )
}
