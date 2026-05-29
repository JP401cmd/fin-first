import Link from 'next/link'
import { Calculator, Heart, GitFork, AlertCircle, User } from 'lucide-react'
import { RequirementsChips } from './requirements-chips'
import type { CustomCalculatorRow } from '@/lib/calculator/types'
import type { CalculatorRequirementCheck } from '@/lib/calculator/requirements'

/**
 * LibraryCard — kaart in de publieke bibliotheek-lijst.
 *
 * Pure presentatie, server-component. Toont titel + truncated beschrijving,
 * auteur ("Door Anoniem" als display_name null), like+duplicate count,
 * compacte vereisten-chip-rij (max 3) en — wanneer de gebruiker niet aan
 * alle vereisten voldoet — een subtiele indicator.
 *
 * De hele kaart is klikbaar via `<Link>` naar `/toekomst/bibliotheek/[id]`.
 * Like-action zelf zit op de detail-pagina (geen interactiviteit op de
 * card zelf om de server-component zuiver te houden — `isLiked` is alleen
 * een visuele hint via een gevulde Heart-icon).
 */

/** Knip lange beschrijvingen netjes af bij een hele letter, geen midden-van-woord. */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const slice = text.slice(0, maxLength)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > 40 ? lastSpace : maxLength
  return `${slice.slice(0, cut).trimEnd()}…`
}

export function LibraryCard({
  calculator,
  authorDisplayName,
  isLiked,
  requirements,
  userMeetsAll,
}: {
  calculator: CustomCalculatorRow
  authorDisplayName: string | null
  isLiked: boolean
  requirements: CalculatorRequirementCheck[]
  userMeetsAll: boolean
}) {
  const likeCount = calculator.like_count ?? 0
  const duplicateCount = calculator.duplicate_count ?? 0
  const description = calculator.description ?? calculator.definition.description ?? ''

  return (
    <Link
      href={`/toekomst/bibliotheek/${calculator.id}`}
      className={[
        'card-editorial group relative flex flex-col gap-3 p-4 sm:p-5',
        'transition-all hover:border-[var(--ink-3)] hover:shadow-[var(--s1)] hover:-translate-y-px',
        !userMeetsAll && 'opacity-95',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Open rekenhulp: ${calculator.name}`}
    >
      {/* Header */}
      <header className="flex items-start gap-3">
        <span
          className="inline-flex w-9 h-9 rounded-xl bg-violet-50 text-violet-700 items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <Calculator className="w-4.5 h-4.5" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-base text-[var(--ink)] leading-tight">
            {calculator.name}
          </h3>
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--ink-3)]">
            <User className="w-3 h-3" aria-hidden="true" />
            <span>
              Door {authorDisplayName ?? 'Anoniem'}
            </span>
          </p>
        </div>
        {!userMeetsAll && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 shrink-0"
            title="Je mist nog gegevens die deze rekenhulp gebruikt"
          >
            <AlertCircle className="w-3 h-3" aria-hidden="true" />
            <span className="sr-only">Ontbrekende gegevens</span>
            <span aria-hidden="true">mist data</span>
          </span>
        )}
      </header>

      {/* Beschrijving */}
      {description && (
        <p className="text-xs text-[var(--ink-2)] leading-snug">
          {truncate(description, 100)}
        </p>
      )}

      {/* Vereisten */}
      {requirements.length > 0 && (
        <RequirementsChips
          requirements={requirements.map((r) => ({
            kind: r.kind,
            label: r.label,
            detail: r.detail,
            deepLink: r.deepLink,
          }))}
          compact
        />
      )}

      {/* Footer: counters */}
      <footer className="mt-auto flex items-center justify-between gap-3 pt-2 border-t border-[var(--border-ed)]">
        <div className="flex items-center gap-3 text-[11px] text-[var(--ink-3)]">
          <span className="inline-flex items-center gap-1">
            <Heart
              className={[
                'w-3.5 h-3.5',
                isLiked ? 'fill-rose-500 text-rose-500' : 'text-[var(--ink-3)]',
              ].join(' ')}
              aria-hidden="true"
            />
            <span className="font-mono tabular-nums">{likeCount}</span>
            <span className="sr-only">likes</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <GitFork className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="font-mono tabular-nums">{duplicateCount}</span>
            <span className="sr-only">duplicaten</span>
          </span>
        </div>
        <span className="text-[11px] font-semibold text-violet-700 group-hover:underline">
          Bekijken →
        </span>
      </footer>
    </Link>
  )
}
