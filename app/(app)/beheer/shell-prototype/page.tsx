'use client'

/**
 * SANDBOX / Fase 0 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §3, §4, §5
 * Sinds Fase 0.2 ook host van de feature-flag-toggle voor `new_navigation_shell`.
 *
 * Toont de drie fundament-componenten van de nieuwe shell-architectuur:
 *  1. Sidebar (variant A, productie) — desktop links, fixed positioned.
 *  2. MobileStackShell + NavStackProvider — Bitvavo-stijl per-tab-stack.
 *  3. ShellOverlay (driewegregel: pane / sheet / confirm).
 *
 * Bedoeld voor visuele review en handmatige interactietest. De feature-flag-
 * toggle bovenaan activeert de nieuwe ResponsiveShell voor alle (app)-routes.
 *
 * VERWIJDERBAAR: deze pagina + components/app/shell/ + de drie demo-files
 * mogen verwijderd zodra de productie-shell live staat (Fase 4).
 */

import Link from 'next/link'
import { NavStackProvider } from '@/components/app/shell/nav-stack-provider'
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag'
import { SidebarDemo } from './sidebar-demo'
import { OverlayDemo } from './overlay-demo'
import { StackDemo } from './stack-demo'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

export default function ShellPrototypePage() {
  return (
    <main className="mx-auto max-w-5xl">
      {/* Back-link */}
      <Link
        href="/beheer/ai"
        className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)] hover:text-[var(--ink)] mb-6 font-mono"
      >
        ← Terug naar Beheer
      </Link>

      {/* Feature-flag-toggle — primair entry-point voor de nieuwe shell.
          Boven aan de pagina zodat hij makkelijk te vinden is voor reviewers. */}
      <FeatureFlagToggle />

      {/* Editorial masthead — dubbele bovenstreep + tf. + meta */}
      <header
        className="border-t-4 border-double border-b border-[var(--ink)] py-3 sm:py-4 flex items-baseline justify-between gap-4 flex-wrap"
        style={{ borderColor: 'var(--ink)' }}
      >
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-2)] font-mono">
          Editie · shell-prototype
        </div>
        <div
          className="text-[28px] sm:text-[34px] leading-none italic font-black tracking-[-0.02em]"
          style={{ fontFamily: PLAYFAIR }}
        >
          tf<span style={{ color: 'var(--color-kern-500)' }}>.</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-2)] font-mono text-right">
          Drie fundamenten · één shell
        </div>
      </header>

      {/* Headline-row */}
      <section className="border-b border-[var(--ink)] py-7 sm:py-10 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-10 items-end">
        <div>
          {/* Kicker met streepje */}
          <div className="flex items-center gap-2.5 mb-4 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
            <span
              aria-hidden
              className="inline-block w-7 h-px"
              style={{ background: 'var(--module-active-500)' }}
            />
            Fase 0 · architectuur-fundamenten
          </div>
          {/* Headline met italic-em in module-kleur */}
          <h1
            className="font-black leading-[0.95] tracking-[-0.025em] text-[36px] sm:text-[48px] md:text-[56px]"
            style={{ fontFamily: PLAYFAIR }}
          >
            Hoe voelt de
            <br />
            <em
              className="font-normal italic"
              style={{ color: 'var(--module-active-700)' }}
            >
              nieuwe shell
            </em>{' '}
            aan?
          </h1>
        </div>
        {/* Deck */}
        <p
          className="italic text-base sm:text-[17px] leading-snug max-w-[380px] text-[var(--ink-2)] pl-4"
          style={{
            fontFamily: SOURCE_SERIF,
            borderLeft: '2px solid var(--module-active-500)',
          }}
        >
          Drie geïsoleerde demo-blokken: de productie-sidebar (variant A links),
          de Bitvavo-stijl stack-shell (alleen op &lt;1024px) en de
          driewegregel-overlay-wrapper (pane · sheet · confirm).
        </p>
      </section>

      {/* ─── Sectie I: Sidebar ─────────────────────────────────────── */}
      <SectionHeader
        roman="i."
        kicker="Webapp sidebar"
        title="Persistente verticale navigatie — ≥1024px"
        deck="Modules-first hiërarchie. Active-state via linker accent + module-bg-tint. Inline tag-strip met categorieën onder active module. Profiel-pill in footer. Toggle in branding-rij collapse't naar 64px icon-rail."
      />
      <div className="my-6">
        <SidebarDemo />
      </div>

      {/* ─── Sectie II: Mobile stack ───────────────────────────────── */}
      <SectionHeader
        roman="ii."
        kicker="Mobile stack-shell"
        title="Bitvavo-stijl per-tab-stack — &lt;1024px"
        deck="TopBar 48px sticky met persistent terug-knop linksboven. Sub-pagina's schuiven in van rechts. Per-tab-stack in sessionStorage, max 5 entries diep, scrollpositie bewaard. Pathname-driven auto-push voor de echte app; demo gebruikt overrideActiveTab='other'."
      />
      <div className="my-6 space-y-4">
        <p
          className="italic text-[14px] leading-snug text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          De stack-shell is <code className="font-mono text-xs">lg:hidden</code>.
          Schaal je viewport onder 1024px om de live shell te zien, óf gebruik
          de mock device-frame hieronder om de mobile-rendering op desktop te
          inspecteren.
        </p>

        <DeviceFrame>
          <NavStackProvider overrideActiveTab="other">
            <StackDemo />
          </NavStackProvider>
        </DeviceFrame>
      </div>

      {/* ─── Sectie III: Overlays ──────────────────────────────────── */}
      <SectionHeader
        roman="iii."
        kicker="Driewegregel-overlays"
        title="ShellOverlay — pane · sheet · confirm"
        deck="Eén wrapper, drie kinds. Pane = 'ergens naartoe gaan' (slide-in op desktop, full-sheet fallback op mobile). Sheet = 'even iets snel doen' (responsive BottomSheet). Confirm = onomkeerbare bevestiging (smal centered, destructive variant)."
      />
      <div className="my-6">
        <OverlayDemo />
      </div>

      {/* ─── Notes ─────────────────────────────────────────────────── */}
      <SectionHeader
        roman="iv."
        kicker="Aandachtspunten"
        title="Wat valt op tijdens deze review?"
        deck="Schrijf bevindingen op die we mee moeten nemen voor Fase 0.2 (ResponsiveShell-integratie) en Fase 1 (Kern-migratie)."
      />
      <ul
        className="my-6 space-y-2 text-[14px] leading-relaxed text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        <li>
          <strong className="text-[var(--ink)]">Sidebar &amp; AppHeader-overlap.</strong>{' '}
          De productie-sidebar mount <code className="font-mono text-xs">fixed left-0 top-[var(--header-height)]</code>;
          op deze pagina overlapt zij met de bestaande beheer-layout. In Fase 0.2
          krijgt <code className="font-mono text-xs">ResponsiveShell</code> een
          padding-left op de content-area waardoor dit niet meer zichtbaar is.
        </li>
        <li>
          <strong className="text-[var(--ink)]">Pane-fallback op mobile.</strong>{' '}
          Onder <code className="font-mono text-xs">lg:</code> rendert{' '}
          <code className="font-mono text-xs">ShellOverlay kind=&quot;pane&quot;</code>{' '}
          tijdelijk een full-screen <code className="font-mono text-xs">BottomSheet</code>;
          in Fase 0.5 wordt dat een echte stack-push via de NavStackProvider.
        </li>
        <li>
          <strong className="text-[var(--ink)]">prefers-reduced-motion.</strong>{' '}
          Slide-animaties (pane + stack) zijn gerespecteerd. Test onder
          OS-instelling om te valideren dat alles instant rendert.
        </li>
        <li>
          <strong className="text-[var(--ink)]">Module-fallback.</strong>{' '}
          Schakel een module uit via <code className="font-mono text-xs">/identity/instellingen</code>{' '}
          en kom terug — de sidebar-rij voor die module dient gedimd te zijn met
          een &ldquo;Activeer in Instellingen&rdquo;-CTA (plan §2.6).
        </li>
        <li>
          <strong className="text-[var(--ink)]">Sandbox-VERWIJDERBAAR.</strong>{' '}
          Deze pagina + alle <code className="font-mono text-xs">components/app/shell/</code>-files
          zijn productie-componenten; alleen <code className="font-mono text-xs">app/(app)/beheer/shell-prototype/</code>{' '}
          + de drie demo-bestanden zijn sandbox en mogen weg in Fase 4.
        </li>
      </ul>

      <footer className="mt-12 border-t border-[var(--border-ed)] pt-4 pb-12 text-center text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
        Trifinity ✦ Beheer ✦ shell-prototype Fase 0
      </footer>
    </main>
  )
}

// ── Section header met romeinse num + kicker + headline + deck ──────────────

function SectionHeader({
  roman,
  kicker,
  title,
  deck,
}: {
  roman: string
  kicker: string
  title: string
  deck: string
}) {
  return (
    <section className="mt-12 border-t border-[var(--ink)] pt-6">
      <div className="flex items-center justify-between border-b border-[var(--rule-soft,var(--border-ed))] mb-5 pb-2">
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block w-7 h-px"
            style={{ background: 'var(--module-active-500)' }}
          />
          {kicker}
        </div>
        <span
          className="font-serif italic text-sm text-[var(--module-active-700)]"
          style={{ fontFamily: PLAYFAIR }}
        >
          {roman}
        </span>
      </div>
      <h2
        className="font-bold leading-tight tracking-[-0.02em] text-[24px] sm:text-[28px] text-[var(--ink)]"
        style={{ fontFamily: PLAYFAIR }}
      >
        {title}
      </h2>
      <p
        className="mt-3 italic text-[14px] leading-relaxed text-[var(--ink-2)] max-w-[60ch]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        {deck}
      </p>
    </section>
  )
}

// ── Mock device-frame om de mobile-stack op desktop te kunnen tonen ─────────

function DeviceFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-2 border-[var(--ink)] bg-[var(--bg)] overflow-hidden mx-auto" style={{ maxWidth: 390 }}>
      <div className="bg-[var(--ink)] text-[var(--paper)] text-[10px] uppercase tracking-[0.18em] font-mono px-3 py-1.5 text-center">
        Device-frame · 390px breed
      </div>
      <div className="relative" style={{ minHeight: 480 }}>
        {children}
      </div>
    </div>
  )
}

// ── Feature-flag-toggle — primair entry-point voor de nieuwe shell ──────────
//
// Renders een prominente knop bovenaan de pagina waarmee reviewers de nieuwe
// `ResponsiveShell` voor alle (app)-routes kunnen activeren. De flag wordt
// in localStorage opgeslagen via `useFeatureFlag`; we triggeren een
// `window.location.reload()` zodat SSR + CSR opnieuw rendert met de nieuwe
// state — anders zou alleen deze pagina opnieuw renderen, niet de hogere
// (app)/layout.tsx waar ResponsiveShell zit.

function FeatureFlagToggle() {
  const [enabled, setEnabled] = useFeatureFlag('new_navigation_shell')

  // Toggle → schrijf flag → herlaad pagina. We herladen omdat de
  // ResponsiveShell-rendering deel uitmaakt van een server-component-
  // afhankelijke boom (app/(app)/layout.tsx); een SPA-update zou de oude
  // component-tree behouden tot de volgende route-navigatie.
  const handleToggle = () => {
    setEnabled(!enabled)
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  return (
    <section
      className="border-2 border-[var(--ink)] bg-[var(--paper)] p-5 mb-6 flex items-start justify-between gap-6 flex-wrap"
      aria-labelledby="shell-flag-toggle-heading"
    >
      <div className="flex-1 min-w-[280px]">
        <div className="flex items-center gap-2.5 mb-2 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block w-7 h-px"
            style={{ background: 'var(--module-active-500)' }}
          />
          Feature-flag · new_navigation_shell
        </div>
        <h3
          id="shell-flag-toggle-heading"
          className="text-[20px] sm:text-[24px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink)] mb-2"
          style={{ fontFamily: PLAYFAIR }}
        >
          {enabled ? 'Nieuwe shell is actief' : 'Nieuwe shell is uitgeschakeld'}
        </h3>
        <p
          className="italic text-[13px] leading-snug text-[var(--ink-2)] max-w-[58ch]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Toggle de feature-flag <code className="font-mono text-xs not-italic">new_navigation_shell</code>.
          Bij ingeschakeld: alle (app)-routes gebruiken de Sidebar (desktop, ≥1024px)
          of MobileStackShell (mobile, &lt;1024px). Bij uitgeschakeld: huidige
          AppHeader + BottomNav blijft intact. De pagina laadt automatisch
          opnieuw zodat de server-render synchroniseert met de client-state.
        </p>
      </div>
      <button
        type="button"
        onClick={handleToggle}
        className={`shrink-0 px-5 py-3 text-[12px] font-bold uppercase tracking-[0.12em] transition-colors border-2 border-[var(--ink)] ${
          enabled
            ? 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--subtle)]'
            : 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink-2)]'
        }`}
        aria-pressed={enabled}
      >
        {enabled ? 'Deactiveer nieuwe shell' : 'Activeer nieuwe shell'}
      </button>
    </section>
  )
}
