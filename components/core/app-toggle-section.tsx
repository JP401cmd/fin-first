'use client'

/**
 * `AppToggleSection` — generieke toggle-strip die in detail-sheets staat
 * en alle registry-apps voor één entiteit (asset of debt) kan in/uit-
 * schakelen.
 *
 * Waarom hier en niet in de detail-modal van `assets-client.tsx`?
 * - De `<DebtDetailSheet>` is een lichte read-only sheet zonder edit-form
 *   (anders dan `<AssetForm>` voor assets). Een toggle-section is precies
 *   het juiste niveau van friction: meer dan een quick-toggle op de kaart,
 *   minder dan een complete edit-flow.
 * - Generiek werkt op `findDeepenings(type, kind)` zodat we toekomstige
 *   apps automatisch oppikken zonder per-detail-sheet code aan te passen.
 *
 * UX-skill discipline:
 * - Switch-elementen zijn `<button role="switch">` met `aria-checked`,
 *   minimaal 44×44px touch target. Geen native checkbox die het krant-
 *   visueel doorbreekt.
 * - Optimistic update via `useState` op de current item-prop, met revert-
 *   pad bij API-fout. Toggle is idempotent (boolean) — past binnen de
 *   "optimistic UI voor idempotente acties" regel uit de UX-skill.
 * - Feedback: lichte toast voor succes/fout via `useToast` — niet inline
 *   in de sheet (de sheet zou anders te druk worden).
 * - "Wat zie je dan?" copy: één regel die uitlegt wat de app doet zodra
 *   hij aanstaat. Bewaart krant-toon, vermijdt marketing-taal.
 */

import { useState, useTransition } from 'react'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { useToast } from '@/components/app/toast-provider'
import {
  findDeepenings,
  type DeepeningEntry,
} from './category-deepening-registry'

// ── Types ────────────────────────────────────────────────────

type Item = Asset | Debt

interface AppToggleSectionProps {
  /** Huidige item — gebruikt voor type-detect en `isItemTracked` check. */
  item: Item
  /** Asset of debt — bepaalt welke registry-entries we ophalen. */
  kind: 'asset' | 'debt'
  /**
   * Optionele callback nadat een toggle succesvol is geland. Caller kan hier
   * `router.refresh()` of een lokale reload triggeren zodat de UI elders
   * (categorie-tabs, kaarten) de nieuwe status oppikt.
   */
  onToggled?: () => void
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Detecteer het juiste type-veld voor een item. Assets hebben `asset_type`,
 * schulden `debt_type`. We castten via narrow-checks zodat TypeScript blij
 * is zonder `any`.
 */
function getItemType(item: Item, kind: 'asset' | 'debt'): string {
  if (kind === 'asset' && 'asset_type' in item) return item.asset_type
  if (kind === 'debt' && 'debt_type' in item) return item.debt_type
  return ''
}

// ── Component ────────────────────────────────────────────────

export function AppToggleSection({ item, kind, onToggled }: AppToggleSectionProps) {
  const type = getItemType(item, kind)
  const entries = findDeepenings(type as never, kind)

  // Geen apps voor deze categorie → niets renderen. De sheet blijft schoon.
  if (entries.length === 0) return null

  return (
    <section className="border-y border-[var(--border-ed)] py-4">
      <header className="mb-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Apps
        </p>
        <p className="mt-0.5 font-serif italic text-[12px] leading-snug text-[var(--ink-3)]">
          Schakel apps in om verdiepende inzichten op deze {kind === 'debt' ? 'lening' : 'bezitting'} te krijgen.
        </p>
      </header>

      <ul className="divide-y divide-[var(--border-ed)]">
        {entries.map((entry) => (
          <AppToggleRow
            key={`${entry.type}-${entry.label}`}
            item={item}
            entry={entry}
            onToggled={onToggled}
          />
        ))}
      </ul>
    </section>
  )
}

// ── Row ──────────────────────────────────────────────────────

interface AppToggleRowProps {
  item: Item
  entry: DeepeningEntry
  onToggled?: () => void
}

/**
 * Eén rij = één app. Toont label + korte uitleg + switch.
 *
 * State-flow:
 *  1. User klikt → `optimistic` flipt direct, `pending` start.
 *  2. fetch naar `entry.toggleEndpoint` → bij succes blijft `optimistic`
 *     staan (we vertrouwen het server-resultaat).
 *  3. Bij fout: revert `optimistic` naar oorspronkelijke waarde + toast.
 *
 * `useTransition` zou hier overkill zijn — we hebben geen suspense-grens
 * te beschermen. Simpele `pending` boolean voor de disabled-state volstaat.
 */
function AppToggleRow({ item, entry, onToggled }: AppToggleRowProps) {
  const { addToast } = useToast()
  const initialEnabled = entry.isItemTracked ? entry.isItemTracked(item) : false
  const [enabled, setEnabled] = useState(initialEnabled)
  const [pending, setPending] = useState(false)
  // `useTransition` houden we beschikbaar voor het scenario waarin we ook
  // andere route-segments willen revalideren — hier nog niet nodig.
  const [, startTransition] = useTransition()

  async function handleToggle() {
    if (pending) return
    if (!entry.toggleEndpoint) {
      // Defensieve guard: registry-entry zonder toggle-endpoint betekent
      // dat de app puur via een andere flow wordt geactiveerd. Niet onze
      // verantwoordelijkheid — we slaan stilzwijgend over.
      return
    }
    const next = !enabled
    setEnabled(next)
    setPending(true)

    try {
      const res = await fetch(entry.toggleEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, enabled: next }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error ?? 'Onbekende fout')
      }
      addToast({
        type: 'success',
        title: next
          ? `${entry.label} ingeschakeld`
          : `${entry.label} uitgeschakeld`,
        message: next
          ? 'Bekijk het tabblad voor je verdiepende inzichten.'
          : 'Je kunt het later weer aanzetten.',
      })
      // Caller mag hier router.refresh draaien. We gebruiken transition
      // zodat een eventuele server-render niet blokkerend voor de UI is.
      startTransition(() => {
        onToggled?.()
      })
    } catch (err) {
      // Revert: gebruiker krijgt zijn oorspronkelijke staat terug en weet
      // direct dat de actie niet is geland.
      setEnabled(!next)
      addToast({
        type: 'error',
        title: 'Wijziging niet opgeslagen',
        message:
          err instanceof Error
            ? err.message
            : 'Probeer het opnieuw — controleer je internetverbinding als het probleem blijft.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <li className="flex items-start gap-3 py-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-[var(--ink)]">{entry.label}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-[var(--ink-3)]">
          {entry.tipStripCopy}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${entry.label} ${enabled ? 'uitschakelen' : 'inschakelen'}`}
        disabled={pending}
        onClick={() => {
          void handleToggle()
        }}
        className={[
          // Touch-target 44×24 op kop — wij maken hem 44 hoog visueel via
          // een groter klik-gebied via padding (`-mx-1 px-1`) zodat een
          // duim altijd raakt, ook als de switch zelf 24px hoog is.
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-500',
          'disabled:cursor-not-allowed disabled:opacity-60',
          enabled ? 'bg-kern-600' : 'bg-[var(--border-md)]',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={[
            // Witte knop op de baan — schuift 20px naar rechts in de aan-
            // staat. Geen `rounded-full` op de baan zelf (krant-discipline:
            // scherpe hoeken). De knop is bewust wel `rounded-full` —
            // cirkelvormig elementen zijn de uitzondering uit CLAUDE.md.
            'absolute top-0.5 left-0.5 h-5 w-5 bg-white shadow-sm transition-transform rounded-full',
            enabled ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </li>
  )
}
