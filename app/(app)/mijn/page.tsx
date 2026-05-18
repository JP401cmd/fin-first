import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mijn — TriFinity',
  description: 'Profiel, partner, privacy, koppelingen, personalisatie en rapportages.',
}

/**
 * /mijn — canonieke profiel/instellingen-pagina (Fase 1 stap 3 skeleton).
 *
 * Vervangt /identity + /rapportages + delen uit /identity/instellingen.
 * Wordt in komende stappen progressief gevuld:
 *  - Profiel, Partner, Privacy
 *  - Koppelingen (PSD2, UPO)
 *  - Notificaties, Uiterlijk
 *  - Personalisatie (widgets-configurator voor Overzicht-hero)
 *  - Rapportages-index (4 types)
 *  - Geavanceerd (debug, exports)
 *
 * Vervangt het 2459-regel instellingen-monster door per-onderwerp kleine pagina's.
 */
export default function MijnPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3">
          Nieuwe navigatie · in opbouw
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-stone-900">
          Mijn
        </h1>
        <p className="mt-4 text-stone-600 max-w-2xl leading-relaxed">
          Profiel, partner, privacy, koppelingen, personalisatie en rapportages.
          Eén onderwerp per pagina — geen accordion-monster meer.
        </p>
      </header>

      <section className="border border-amber-200 bg-amber-50 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <div className="mt-1 w-2 h-2 rounded-full bg-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <h2 className="font-semibold text-amber-900 mb-1">Skeleton-pagina</h2>
            <p className="text-sm text-amber-900 leading-relaxed mb-4">
              Inhoud wordt verspreid verhuisd vanuit <code className="bg-amber-100 px-1.5 py-0.5 rounded">/identity</code> en
              <code className="bg-amber-100 px-1.5 py-0.5 rounded">/rapportages</code>. Het
              <code className="bg-amber-100 px-1.5 py-0.5 rounded">/identity/instellingen</code> monster (2459 regels)
              wordt ontmanteld.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/identity"
                className="inline-flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-stone-800 transition"
              >
                Naar bestaande /identity →
              </Link>
              <Link
                href="/rapportages"
                className="inline-flex items-center gap-2 bg-white border border-stone-300 text-stone-700 px-4 py-2 rounded-md text-sm font-semibold hover:bg-stone-50 transition"
              >
                Naar bestaande /rapportages →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <article className="border border-stone-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-stone-900 mb-2">Wie ben je</h3>
          <ul className="text-sm text-stone-600 space-y-1">
            <li>• Profiel (naam, geboortejaar)</li>
            <li>• Partner</li>
            <li>• Privacy &amp; delen</li>
          </ul>
        </article>
        <article className="border border-stone-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-stone-900 mb-2">Verbindingen</h3>
          <ul className="text-sm text-stone-600 space-y-1">
            <li>• Bank (PSD2)</li>
            <li>• Pensioen (UPO)</li>
            <li>• Brokerage</li>
          </ul>
        </article>
        <article className="border border-stone-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-stone-900 mb-2">Voorkeuren</h3>
          <ul className="text-sm text-stone-600 space-y-1">
            <li>• Notificaties</li>
            <li>• Uiterlijk (thema)</li>
            <li>• Personalisatie (widgets voor Overzicht)</li>
          </ul>
        </article>
        <article className="border border-stone-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-stone-900 mb-2">Tools</h3>
          <ul className="text-sm text-stone-600 space-y-1">
            <li>• Rapportages (balans, vermogen, budget, persoonlijk plan)</li>
            <li>• Geavanceerd (exports, debug)</li>
          </ul>
        </article>
      </section>
    </main>
  )
}
