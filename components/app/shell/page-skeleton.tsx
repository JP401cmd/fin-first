/**
 * SANDBOX / Fase 0 v3 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §4.6 (loading-strategie)
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * Skeleton-helpers voor het Suspense-pattern van de tray-of-three.
 * Wanneer een nieuwe pagina via `push()` of pathname-change arriveert, toont
 * MobileStackShell direct de TopBar + BottomBar uit stack-meta; alleen de
 * content laadt asynchroon. Deze skeletons vullen die content-gap zonder
 * layout-shift bij data-aankomst.
 *
 * Ontwerp-eisen (plan §4.6):
 *  - Achtergrond: bg-[var(--subtle)] voor blokken (krant-papier-look).
 *  - Pulse: 1.5s ease-in-out infinite, statisch onder prefers-reduced-motion.
 *  - GEEN rounded-* (krant-stijl, scherpe hoeken).
 *  - Skeleton-dimensies matchen final layout — geen "losse hoogtes" die later
 *    door echte content groter worden, want dan krijg je layout-shift.
 *
 * De animatie zit in een component-scoped <style> blok met @keyframes en een
 * @media-query voor reduced-motion. Bewust niet via Tailwind's `animate-pulse`
 * (default 2s + standaard cubic-bezier wijkt af van onze 1.5s ease-in-out
 * spec) en niet in globals.css (deze sandbox blijft self-contained tot Fase 4).
 */

import type { ReactNode } from 'react'

/** Pulse-class — bij reduced-motion valt animatie weg via @media-query. */
const PULSE_CLASS = 'shell-page-skeleton-pulse'

/** Achtergrond-token voor alle skeleton-blokken. */
const BLOCK_BG = 'bg-[var(--subtle)]'

// ── Shared building blocks ──────────────────────────────────────────

/**
 * Eén skeleton-blok. `width` als Tailwind class of inline style — beide werken;
 * we accepteren een className zodat varianten flexibel zijn (bv. `w-3/4`).
 *
 * Gebruik `aria-hidden` zodat screen-readers de skeleton niet als interactieve
 * inhoud aankondigen. De wrapper-pagina hoort een `aria-busy="true"`-marker te
 * zetten op het content-gebied tot de echte data arriveert.
 */
function SkeletonBlock({
  className = '',
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      aria-hidden="true"
      className={`${BLOCK_BG} ${PULSE_CLASS} ${className}`}
      style={style}
    />
  )
}

/**
 * Wrapper die de pulse-keyframes injecteert. We renderen 'm één keer per
 * skeleton-component (niet per blok) zodat de DOM clean blijft.
 *
 * `aria-busy="true"` op de root signaleert assistive-tech dat hier nog data
 * onderweg is. Bij data-aankomst unmount Next.js dit hele segment (Suspense
 * vervangt fallback), dus het busy-attribuut verdwijnt automatisch.
 */
function SkeletonRoot({ children }: { children: ReactNode }) {
  return (
    <div aria-busy="true" role="status" aria-label="Pagina laadt">
      {children}
      {/* Component-scoped <style> — Next.js / React 19 ondersteunt dit als
          gewone DOM-styling. We gebruiken bewust GEEN styled-jsx (`<style jsx>`)
          om server-component-compatibiliteit te behouden: deze skeleton-helpers
          zijn server-renderbaar (geen `'use client'` directive).

          Animatie: 1.5s ease-in-out infinite alternate. `alternate` zorgt dat
          de pulse heen-en-weer gaat (50% opacity) ipv abrupt te resetten.
          Reduced-motion: opacity vast op 1, geen animatie. */}
      <style>{`
        .${PULSE_CLASS} {
          animation: shell-page-skeleton-pulse-kf 1.5s ease-in-out infinite alternate;
          will-change: opacity;
        }
        @keyframes shell-page-skeleton-pulse-kf {
          from { opacity: 1; }
          to   { opacity: 0.45; }
        }
        @media (prefers-reduced-motion: reduce) {
          .${PULSE_CLASS} {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}

// ── PageSkeletonList ─────────────────────────────────────────────────
//
// Lijst-pagina skeleton. Gebaseerd op de typische TriFinity-list-structuur:
// een rij = avatar/icon + titel-regel + subtitel-regel + chevron, gescheiden
// door 1px border-b. Variërende breedte per rij geeft een natuurlijke look
// (anders krijg je een "robot-grid" gevoel).
//
// Dimensies (matchen typische lijst-rijen):
//  - py-3 (12px boven + onder) per rij
//  - title-blok: h-4 (16px)
//  - subtitle-blok: h-3 (12px), mt-1.5
// Resultaat: 1 rij ≈ 60px hoog, sluit aan bij echte holdings/budgets/debts-rijen.

/** Variërende breedtes voor rij-titels — 5 unieke patronen, voorspelbaar maar niet uniform. */
const LIST_TITLE_WIDTHS = ['w-2/3', 'w-1/2', 'w-3/4', 'w-3/5', 'w-2/5'] as const

/** Variërende breedtes voor sub-titels (smaller, geometrisch passend bij money + percentage). */
const LIST_SUB_WIDTHS = ['w-1/3', 'w-1/4', 'w-2/5', 'w-1/3', 'w-1/4'] as const

type PageSkeletonListProps = {
  /** Aantal rij-skeletons. Default 6 — komt overeen met "above-the-fold" op smartphone. */
  rows?: number
  /** Optioneel: skip de bovenste header-block. Default `true` (= toont header). */
  withHeader?: boolean
}

/**
 * Skeleton voor lijst-pagina's (holdings-overzicht, budgets-lijst, debts-lijst).
 *
 * Layout:
 *  - Optionele header (titel + subtitle van de lijst, geen filter-knoppen want
 *    die zijn shell-chrome, niet content).
 *  - 6 rijen met variërende breedte voor natuurlijke ritme.
 */
export function PageSkeletonList({ rows = 6, withHeader = true }: PageSkeletonListProps) {
  // Cap rows in een redelijk bereik om accidental {rows: 999} te voorkomen.
  const safeRows = Math.max(1, Math.min(rows, 12))

  return (
    <SkeletonRoot>
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        {withHeader && (
          // Header sluit visueel aan op echte module-landingsheaders:
          // h-7 (28px) titel + h-4 (16px) subtitel. Geen border-onder want
          // de eerste lijst-rij draagt al een border-top.
          <div className="mb-5">
            <SkeletonBlock className="h-7 w-44" />
            <SkeletonBlock className="mt-2 h-4 w-64 max-w-full" />
          </div>
        )}

        {/* Lijst — `border-t` op de container + `border-b` per rij geeft een
            scherpe krant-tabel-uitstraling zonder rounded-* corners. */}
        <ul className="border-t border-[var(--border-ed)]">
          {Array.from({ length: safeRows }, (_, i) => i).map(i => (
            <li
              key={i}
              className="border-b border-[var(--border-ed)] flex items-center gap-3 py-3"
            >
              {/* Icon-placeholder — vierkant 32px, scherp. */}
              <SkeletonBlock className="h-8 w-8 shrink-0" />

              {/* Titel + subtitel. min-w-0 nodig in flex-container om truncate
                  te laten werken in echte content; hier voor uniformiteit. */}
              <div className="flex-1 min-w-0">
                <SkeletonBlock className={`h-4 ${LIST_TITLE_WIDTHS[i % LIST_TITLE_WIDTHS.length]}`} />
                <SkeletonBlock
                  className={`mt-1.5 h-3 ${LIST_SUB_WIDTHS[i % LIST_SUB_WIDTHS.length]}`}
                />
              </div>

              {/* Chevron-placeholder rechts — 12px breed, matcht echte ChevronRight icon. */}
              <SkeletonBlock className="h-3 w-3 shrink-0" />
            </li>
          ))}
        </ul>
      </div>
    </SkeletonRoot>
  )
}

// ── PageSkeletonDetail ───────────────────────────────────────────────
//
// Detail-pagina skeleton (holding-detail, budget-detail, debt-detail).
// Layout:
//   - Header-blok (titel groot + subtitle).
//   - 4-koloms figures-strip (KPI-rij: typisch € huidige waarde, return %,
//     dividenden, allocatie). Op mobile in 2x2 grid.
//   - 3-4 body-paragraphs (chart + transacties + acties).
//
// Komt overeen met de echte detail-layout in components/core/holding-detail.tsx
// en vergelijkbaren — 4 KPI-cards bovenin, dan een chart, dan een tabel.

export function PageSkeletonDetail() {
  return (
    <SkeletonRoot>
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        {/* Header — grote titel + sub-titel. Dimensies sluiten aan op echte
            detail-headers (h-8 ≈ 32px = section-title-grootte). */}
        <header className="mb-5">
          <SkeletonBlock className="h-8 w-3/5" />
          <SkeletonBlock className="mt-2 h-4 w-2/5" />
        </header>

        {/* Figures-strip — 4 KPI-blokken. Op smartphone 2x2, vanaf sm: 4 kolommen.
            Elke cel = label (h-3) + value (h-6). Komt overeen met echte KPI-cards
            in holdings/budget detail-pagina's. */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => i).map(i => (
            <div
              key={i}
              className="border border-[var(--border-ed)] bg-[var(--paper)] p-3"
            >
              <SkeletonBlock className="h-3 w-2/3" />
              <SkeletonBlock className="mt-2 h-6 w-1/2" />
            </div>
          ))}
        </div>

        {/* Body-paragraphs — 4 blokken die typisch chart + tabel + actions
            voorstellen. Hoogte gradiënt: groot blok (chart-placeholder),
            twee middelgrote (tabel-rijen), één kleine (actie-rij).
            Specifieke hoogtes ipv aspect-ratio: voorkomt dat een chart-skeleton
            op een 16:9-aspect plotseling 600px hoog wordt op desktop. */}
        <div className="space-y-4">
          {/* Chart-blok — 192px hoogte sluit aan bij Recharts default-height. */}
          <SkeletonBlock className="h-48 w-full" />

          {/* Twee rijen tekst-blokken — bv. paragraph-summary. */}
          <div>
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="mt-2 h-4 w-11/12" />
            <SkeletonBlock className="mt-2 h-4 w-3/4" />
          </div>

          {/* Tabel-rij — 3x12px regel met variërende cell-breedtes. */}
          <div className="border-t border-[var(--border-ed)] pt-3 space-y-2">
            <div className="flex gap-3">
              <SkeletonBlock className="h-4 w-1/3" />
              <SkeletonBlock className="h-4 w-1/4" />
              <SkeletonBlock className="h-4 w-1/4 ml-auto" />
            </div>
            <div className="flex gap-3">
              <SkeletonBlock className="h-4 w-2/5" />
              <SkeletonBlock className="h-4 w-1/5" />
              <SkeletonBlock className="h-4 w-1/4 ml-auto" />
            </div>
          </div>
        </div>
      </div>
    </SkeletonRoot>
  )
}

// ── PageSkeletonForm ─────────────────────────────────────────────────
//
// Form-pagina skeleton (budget-create, holding-edit, debt-edit).
// Layout: 3-4 label+input-blokken + submit/cancel-rij placeholder.
//
// Dimensies match echte forms: label = h-3 + 4px gap + input = h-10 (40px,
// matcht onze touch-target standaard). Voorkomt jump bij data-aankomst.

type PageSkeletonFormProps = {
  /** Aantal velden. Default 4 — typisch voor Trifinity-forms. */
  fields?: number
}

export function PageSkeletonForm({ fields = 4 }: PageSkeletonFormProps) {
  // Cap velden in zinvolle range. >8 wordt doorgaans gesplitst in stappen-wizard.
  const safeFields = Math.max(1, Math.min(fields, 8))

  return (
    <SkeletonRoot>
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        {/* Form-titel — kleinere sectie-header dan detail-pagina. */}
        <header className="mb-6">
          <SkeletonBlock className="h-6 w-1/2" />
          <SkeletonBlock className="mt-2 h-3 w-2/3" />
        </header>

        {/* Velden-stack — label + input per blok.
            mb-5 tussen velden = 20px = matcht echte form-spacing. */}
        <div className="space-y-5">
          {Array.from({ length: safeFields }, (_, i) => i).map(i => (
            <div key={i}>
              {/* Label — kort, varierend zodat het natuurlijk oogt. */}
              <SkeletonBlock
                className={`h-3 ${i % 2 === 0 ? 'w-24' : 'w-32'}`}
              />
              {/* Input — full-width, 40px hoog (touch-target standard). */}
              <SkeletonBlock className="mt-2 h-10 w-full" />
            </div>
          ))}
        </div>

        {/* Submit/cancel-rij placeholder. Komt visueel overeen met action-bar
            BottomBar (plan §4.4 'action-bar'); zit hier in content omdat sommige
            forms hun eigen inline submit-knoppen hebben. */}
        <div className="mt-8 flex gap-3 border-t border-[var(--border-ed)] pt-4">
          <SkeletonBlock className="h-10 w-32" />
          <SkeletonBlock className="h-10 w-24" />
        </div>
      </div>
    </SkeletonRoot>
  )
}
