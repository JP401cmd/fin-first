'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

// ── AppLinkGate — koppelscherm bij nul gekoppelde items ──────
//
// Zusje van `<AppSetupGate>`: die draait éénmalig (setup nog niet voltooid),
// dit scherm verschijnt wanneer de setup wél voltooid is maar er geen enkel
// item meer aan de app gekoppeld is (bv. alle bezittingen ontkoppeld of
// verwijderd). In plaats van een doodlopende empty-state krijgt de
// gebruiker hier direct de keuze welke bezittingen/hypotheken hij aan de
// app koppelt.
//
// Synchronisatie: opslaan POST't per geselecteerd item naar het bestaande
// per-item toggle-endpoint (`/api/assets/toggle-holdings`,
// `/api/debts/toggle-hypotheekplanner`, …) — precies dezelfde vlag die op
// de bezitting/schuld zelf aan- en uit te zetten is. Geen tweede
// registratie-pad, geen eigen kolom.
//
// Datapad (ADR 0058): de kandidatenlijst komt als prop uit de server-loader
// van de host-pagina (of de bestaande tab-fetch) — dit component leest zelf
// niets uit Supabase.

export interface AppLinkCandidate {
  id: string
  name: string
  /** Huidige waarde/saldo in EUR — getoond in mono, gemaskeerd via privacy-mode. */
  value: number
}

export interface AppLinkGateProps {
  /** Uppercase eyebrow boven de titel, bv. "Bezittingen koppelen". */
  kicker: string
  /** Hero-titel, sentence case, bv. "Koppel je crypto-bezittingen". */
  title: string
  /** Intro-zin die uitlegt wat koppelen doet (serif italic). */
  intro: string
  /** Enkelvoud van het item, bv. "bezitting" of "hypotheek" — voor knop/copy. */
  itemNoun: string
  /** Icoon per rij (Lucide) — bv. Coins, TrendingUp, Home. */
  icon: LucideIcon
  /** Koppelbare items. Leeg → voeg-eerst-toe-state met CTA. */
  candidates: AppLinkCandidate[]
  /** Per-item toggle-endpoint; ontvangt `{ id, enabled: true }` per selectie. */
  endpoint: string
  /** Copy voor de lege-kandidaten-state (geen items van dit type). */
  emptyCopy: string
  /** Label van de CTA in de lege-kandidaten-state. */
  emptyCtaLabel: string
  /**
   * Doel van de lege-CTA. Zonder waarde valt hij terug op het huidige pad
   * zonder query (= de items-tab van de categorie-pagina).
   */
  emptyCtaHref?: string
  /**
   * Na succesvol koppelen. Host-tabs met een eigen client-fetch geven hier
   * hun refetch door; props-gedreven tabs kunnen dit weglaten — de
   * `router.refresh()` die dit component zelf doet, ververst hun bundel.
   */
  onLinked?: () => void
}

/**
 * Volledige tab-vulling: hero-band + selectielijst + sticky-vrije footer,
 * in dezelfde editorial discipline als `<AppSetupGate>` (paper-blok met
 * ink-borders, kicker/serif-hiërarchie, min-h-11 touch-targets).
 */
export function AppLinkGate({
  kicker,
  title,
  intro,
  itemNoun,
  icon: Icon,
  candidates,
  endpoint,
  emptyCopy,
  emptyCtaLabel,
  emptyCtaHref,
  onLinked,
}: AppLinkGateProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { masked } = useMaskedAmounts()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function save() {
    if (selectedIds.length === 0 || saving) return
    setSaving(true)
    setErrorMsg(null)
    let linkedCount = 0
    try {
      // Sequentieel i.p.v. parallel: het zijn er hooguit een handvol, en bij
      // een fout halverwege weet de gebruiker zeker dat de eerdere items wél
      // gekoppeld zijn (idempotent — opnieuw opslaan kan altijd).
      for (const id of selectedIds) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, enabled: true }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error ?? 'Koppelen mislukt')
        }
        linkedCount += 1
      }
      onLinked?.()
      // Server-bundel opnieuw laden zodat de app-tab met de gekoppelde
      // items rendert (props-gedreven hosts).
      router.refresh()
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Onbekende fout bij koppelen'
      if (linkedCount > 0) {
        // Deel-mislukking: de eerste items zíjn gekoppeld. De UI moet die
        // werkelijkheid volgen — meld de deelscore en ververs alsnog, anders
        // suggereert een blijvend koppelscherm dat er niets gebeurd is.
        setErrorMsg(
          `${linkedCount} van ${selectedIds.length} gekoppeld — daarna ging het mis: ${detail}`,
        )
        onLinked?.()
        router.refresh()
      } else {
        setErrorMsg(detail)
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Lege-kandidaten-state — er valt niets te koppelen ──────
  if (candidates.length === 0) {
    return (
      <div className="space-y-6">
        <section className="border-t border-b border-[var(--ink)] bg-[var(--paper)] px-4 py-5 sm:px-6 sm:py-7">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {kicker}
          </p>
          <h2
            className="mt-1 font-serif text-xl font-semibold text-[var(--ink)] sm:text-2xl"
            style={{ fontFamily: 'var(--font-playfair, serif)' }}
          >
            {title}
          </h2>
          <p className="mt-3 font-serif italic text-sm leading-relaxed text-[var(--ink-2)] sm:text-base">
            {emptyCopy}
          </p>
          <div className="mt-5">
            <Link
              href={emptyCtaHref ?? pathname ?? '.'}
              className="inline-flex min-h-11 items-center justify-center bg-[var(--ink)] px-5 text-sm font-medium leading-none text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
              style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
            >
              {emptyCtaLabel}
            </Link>
          </div>
        </section>
      </div>
    )
  }

  // ── Keuzescherm ────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Hero-band — zelfde paper-blok met ink-borders als AppSetupGate */}
      <section className="border-t border-b border-[var(--ink)] bg-[var(--paper)] px-4 py-5 sm:px-6 sm:py-7">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {kicker}
        </p>
        <h2
          className="mt-1 font-serif text-xl font-semibold text-[var(--ink)] sm:text-2xl"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          {title}
        </h2>
        <p className="mt-3 font-serif italic text-sm leading-relaxed text-[var(--ink-2)] sm:text-base">
          {intro}
        </p>
      </section>

      {/* Selectielijst — checkbox-rijen, spiegel van de setup-selector */}
      <ul className="space-y-2">
        {candidates.map((row) => {
          const selected = selectedIds.includes(row.id)
          return (
            <li key={row.id}>
              <label
                className={`flex min-h-11 cursor-pointer items-center gap-3 border px-3 py-2 transition-colors ${
                  selected
                    ? 'border-[var(--ink)] bg-[var(--paper)]'
                    : 'border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggle(row.id)}
                  className="h-4 w-4 accent-[var(--ink)]"
                />
                <Icon className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
                <span className="flex-1 text-sm text-[var(--ink)]">{row.name}</span>
                <span className="font-mono tabular-nums text-[12px] text-[var(--ink-3)]">
                  {formatMaskedCurrency(row.value, masked)}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {/* Fout-banner */}
      {errorMsg && (
        <div
          role="alert"
          className="border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700"
        >
          {errorMsg}
        </div>
      )}

      {/* Footer met Koppelen-knop */}
      <footer className="border-t border-[var(--border-ed)] pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-serif italic text-[12px] leading-snug text-[var(--ink-3)]">
            {selectedIds.length === 0
              ? `Kies minstens één ${itemNoun}.`
              : `Je keuze wordt op de ${itemNoun} zelf geregistreerd — daar kun je 'm later ook weer uitzetten.`}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={selectedIds.length === 0 || saving}
            className="inline-flex min-h-11 items-center justify-center bg-[var(--ink)] px-5 text-sm font-medium leading-none text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
          >
            {saving ? 'Bezig…' : 'Koppelen'}
          </button>
        </div>
      </footer>
    </div>
  )
}
