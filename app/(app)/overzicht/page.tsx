import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Overzicht — TriFinity',
  description: 'Hoe sta je er voor: vier-hefbomen-kompas, gezondheidsscore en netto-vermogen-tijdslijn.',
}

/**
 * /overzicht — canonieke landingpagina (Fase 1 stap 3 skeleton).
 *
 * Vervangt /core in de nieuwe navigatie-architectuur. Wordt in komende
 * stappen progressief gevuld:
 *  - hero: financiële gezondheidsscore + vier-hefbomen-kompas
 *  - tijdslijn: netto vermogen vandaag → vrijheidsmoment (Tier-2 #9)
 *  - 3 cards: wat valt op / een tip / komende maand
 *  - verdiepingen: bezittingen / schulden / cashflow / belasting
 */
export default function OverzichtPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3">
          Nieuwe navigatie · in opbouw
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-stone-900">
          Overzicht
        </h1>
        <p className="mt-4 text-stone-600 max-w-2xl leading-relaxed">
          Hoe sta je er voor? Deze pagina wordt opgebouwd met je financiële
          gezondheidsscore, het vier-hefbomen-kompas, de netto-vermogen-tijdslijn
          en de wekelijkse briefing van Will.
        </p>
      </header>

      <section className="border border-amber-200 bg-amber-50 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <div className="mt-1 w-2 h-2 rounded-full bg-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <h2 className="font-semibold text-amber-900 mb-1">Skeleton-pagina</h2>
            <p className="text-sm text-amber-900 leading-relaxed mb-4">
              De inhoud wordt stap-voor-stap verhuisd vanuit <code className="bg-amber-100 px-1.5 py-0.5 rounded">/core</code>.
              Klik door naar de bestaande pagina, of bekijk welke onderdelen hier landen:
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/core"
                className="inline-flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-stone-800 transition"
              >
                Naar bestaande /core →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <article className="border border-stone-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-stone-900 mb-2">Hero (komt eraan)</h3>
          <ul className="text-sm text-stone-600 space-y-1">
            <li>• Financiële gezondheidsscore (0-100)</li>
            <li>• Vier-hefbomen-kompas (status per hefboom)</li>
            <li>• Netto-vermogen-tijdslijn tot vrijheidsmoment</li>
          </ul>
        </article>
        <article className="border border-stone-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-stone-900 mb-2">Cards (komt eraan)</h3>
          <ul className="text-sm text-stone-600 space-y-1">
            <li>• Wat valt op deze week</li>
            <li>• Een tip van Will</li>
            <li>• Komende maand</li>
          </ul>
        </article>
        <article className="border border-stone-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-stone-900 mb-2">Verdiepingen (komt eraan)</h3>
          <ul className="text-sm text-stone-600 space-y-1">
            <li>• /overzicht/bezittingen</li>
            <li>• /overzicht/schulden</li>
            <li>• /overzicht/cashflow</li>
            <li>• /overzicht/belasting</li>
          </ul>
        </article>
        <article className="border border-stone-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-stone-900 mb-2">Status van migratie</h3>
          <ul className="text-sm text-stone-600 space-y-1">
            <li>✓ Fase 1 stap 1: 8 orphans geschrapt</li>
            <li>✓ Fase 1 stap 2: dashboard-folder hersteld</li>
            <li>● Fase 1 stap 3: skeleton-routes (deze pagina)</li>
            <li>○ Fase 1 stap 4: content verhuizen</li>
          </ul>
        </article>
      </section>
    </main>
  )
}
