'use client'

import Link from 'next/link'
import { TrendingUp, Lightbulb, Calendar } from 'lucide-react'

/**
 * AtomicCards — drie compacte categoriseerde cards onder /overzicht hero,
 * conform mockup. Toont per card een dot + UPPERCASE label + body-tekst.
 *
 * Categorieën (altijd 3 zichtbaar voor consistente layout):
 *  - Observation (WAT VALT OP) — feit over je vermogen/uitgaven/score.
 *    Bron: Will-briefing recommendations[0] (algoritmische analyse + AI-
 *    template). Bij ontbreken: lege placeholder met dimmed-state.
 *  - Tip (EEN TIP) — concrete suggestie voor optimalisatie.
 *    Bron: Will-briefing recommendations[1] (laagste-score-hefboom +
 *    actie-koppeling). Bij ontbreken: lege placeholder met dimmed-state.
 *  - Upcoming (KOMENDE MAAND) — wat staat eraan te komen.
 *    Bron: recurring_transactions met komende afschrijving + life_events
 *    binnen 30 dagen. Bij ontbreken: lege placeholder met dimmed-state.
 *
 * Briefing-data herkomst: deze drie cards zijn de canonical "atomic"-
 * presentatie van de wekelijkse briefing (Cleo-stijl) zoals beschreven in
 * het navigatie-redesign-plan §6.2. De volledige briefing-tekst is
 * beschikbaar via /overzicht/briefing of de "Toon alle briefings →"-link
 * in de Will-coach. AI-laag genereert teksten op basis van rauwe
 * Will-recommendations + temporal-context; geen statische fallback-zinnen.
 *
 * Stijl matcht mockup-dutchet: kleine ronde dot per categorie + label-kicker
 * + zin-met-vetgedrukte-CTA. Optioneel href maakt de hele card klikbaar.
 */
export type AtomicCardEntry = {
  text: string
  href?: string
}

export function AtomicCards({
  observation,
  tip,
  upcoming,
}: {
  observation?: AtomicCardEntry | null
  tip?: AtomicCardEntry | null
  upcoming?: AtomicCardEntry | null
}) {
  // We renderen ALTIJD 3 kaarten — ook bij ontbrekende data — zodat de
  // categorieën consistent zichtbaar blijven en de gebruiker leert welke
  // soorten insight TriFinity levert. Lege categorieën krijgen een
  // dimmed placeholder met uitleg over wat er straks komt.
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-6">
      <AtomicCard
        entry={observation ?? null}
        label="Wat valt op"
        placeholder="Nog onvoldoende data — vul je hefbomen aan."
        dotColor="bg-emerald-500"
        Icon={TrendingUp}
      />
      <AtomicCard
        entry={tip ?? null}
        label="Een tip"
        placeholder="Geen tips deze week. Check terug na de volgende briefing."
        dotColor="bg-violet-500"
        Icon={Lightbulb}
      />
      <AtomicCard
        entry={upcoming ?? null}
        label="Komende maand"
        placeholder="Geen afschrijvingen gepland deze maand."
        dotColor="bg-sky-500"
        Icon={Calendar}
      />
    </div>
  )
}

function AtomicCard({
  entry,
  label,
  placeholder,
  dotColor,
  Icon,
}: {
  entry: AtomicCardEntry | null
  label: string
  placeholder: string
  dotColor: string
  Icon: typeof TrendingUp
}) {
  // Lege staat: dimmed dot + placeholder-tekst zodat de gebruiker leert welke
  // categorie hier hoort. Niet klikbaar — wachten op briefing-data.
  const isEmpty = entry == null
  const dotClass = isEmpty ? 'bg-[var(--ink-4)]' : dotColor
  const text = entry?.text ?? placeholder
  const textColor = isEmpty ? 'text-[var(--ink-3)] italic' : 'text-[var(--ink-2)]'

  const inner = (
    <>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          {label}
        </span>
        <Icon className="w-3.5 h-3.5 text-[var(--ink-4)] ml-auto" aria-hidden="true" />
      </div>
      <p className={`text-sm leading-snug ${textColor}`}>{text}</p>
    </>
  )

  if (entry?.href) {
    return (
      <Link
        href={entry.href}
        className="border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 hover:border-[var(--ink-3)] hover:shadow-sm transition-all block"
      >
        {inner}
      </Link>
    )
  }
  return (
    <article className="border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4">
      {inner}
    </article>
  )
}
