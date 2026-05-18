import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Toekomst — TriFinity',
  description: 'Tijdas, doelen, gebeurtenissen en toekomst-voorkeuren — keuzes maken voor later.',
}

/**
 * /toekomst — canonieke toekomst-pagina (Fase 1 stap 3 skeleton).
 *
 * Vervangt /horizon in de nieuwe navigatie-architectuur. Wordt in komende
 * stappen progressief gevuld met vier tabs:
 *  - Tijdas: vandaag → eindleeftijd (Eindstrategie), met fase-bar
 *  - Doelen: lijst met status-flags (Wealthfolio-stijl)
 *  - Gebeurtenissen: levensgebeurtenissen + 3 levensstrategieën
 *  - Toekomst voorkeuren: regels op tijdas + algemene aannames
 */
export default function ToekomstPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3">
          Nieuwe navigatie · in opbouw
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-stone-900">
          Toekomst
        </h1>
        <p className="mt-4 text-stone-600 max-w-2xl leading-relaxed">
          Waar ga je heen? Tijdas tot je gekozen eindleeftijd, je doelen,
          levensgebeurtenissen en de regels die bepalen hoe alles tot stand komt.
        </p>
      </header>

      <section className="border border-amber-200 bg-amber-50 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <div className="mt-1 w-2 h-2 rounded-full bg-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <h2 className="font-semibold text-amber-900 mb-1">Skeleton-pagina</h2>
            <p className="text-sm text-amber-900 leading-relaxed mb-4">
              De inhoud wordt verhuisd vanuit <code className="bg-amber-100 px-1.5 py-0.5 rounded">/horizon</code>
              + sub-routes (<code className="bg-amber-100 px-1.5 py-0.5 rounded">whatif</code>,
              <code className="bg-amber-100 px-1.5 py-0.5 rounded">strategie</code>,
              <code className="bg-amber-100 px-1.5 py-0.5 rounded">uitgaven-na-pensioen</code>).
            </p>
            <Link
              href="/horizon"
              className="inline-flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-stone-800 transition"
            >
              Naar bestaande /horizon →
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <article className="border border-stone-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-stone-900 mb-2">Tab 1: Tijdas (hoofd)</h3>
          <ul className="text-sm text-stone-600 space-y-1">
            <li>• Opbouw + overgang + onttrekken (fase-bar)</li>
            <li>• Confidence-band P10-P90</li>
            <li>• Drag & drop events op de lijn</li>
            <li>• Risk Lab inline</li>
          </ul>
        </article>
        <article className="border border-stone-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-stone-900 mb-2">Tab 2: Doelen</h3>
          <ul className="text-sm text-stone-600 space-y-1">
            <li>• Status-flags (on-track / at-risk / off-track)</li>
            <li>• Detail-pane met edit + acties van Will</li>
            <li>• Scenario-bibliotheek voor toevoegen</li>
          </ul>
        </article>
        <article className="border border-stone-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-stone-900 mb-2">Tab 3: Gebeurtenissen</h3>
          <ul className="text-sm text-stone-600 space-y-1">
            <li>• Levensgebeurtenissen (kind, erfenis, werk, ...)</li>
            <li>• 3 levensstrategieën: AOW · Pensioen · Huis</li>
            <li>• Strategieën als pane, events als sheet</li>
          </ul>
        </article>
        <article className="border border-stone-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-stone-900 mb-2">Tab 4: Toekomst voorkeuren</h3>
          <ul className="text-sm text-stone-600 space-y-1">
            <li>• Eindstrategie (eindleeftijd + eindsaldo)</li>
            <li>• Onttrekkingsstrategie + volgorde</li>
            <li>• Verdeling bij toename / onttrekking bij afname</li>
            <li>• Inflatie (rendement → bij bezittingen-groep)</li>
          </ul>
        </article>
      </section>
    </main>
  )
}
