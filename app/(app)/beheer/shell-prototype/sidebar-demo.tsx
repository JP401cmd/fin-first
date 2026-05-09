'use client'

/**
 * SANDBOX / Fase 0 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §3
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * Demonstreert de productie-versie van Sidebar (variant A) met mock-data.
 * Toont actieve module op basis van huidige pathname (de gebruiker is per
 * definitie op /beheer/shell-prototype, dus standaard *geen* module actief —
 * dat valideert het "geen accent op niet-module-route"-gedrag).
 *
 * BELANGRIJK — portal-rendering in deze demo:
 * `app/(app)/layout.tsx` wikkelt alle routes met `ChatLayoutWrapper` die
 * `contain: layout` gebruikt om een containing-block te creëren voor fixed
 * descendants (`components/app/chat/chat-layout-wrapper.tsx:34`). Dat is
 * gewenst gedrag in productie (chat-sidebar-resize), maar het betekent dat
 * onze fixed-positioned Sidebar relatief aan ChatLayoutWrapper komt te staan
 * en dus mee scrollt met de wrapper-content.
 *
 * In productie (Fase 0.2) staat `ResponsiveShell` BUITEN ChatLayoutWrapper
 * in `app/(app)/layout.tsx`, dus daar werkt `position: fixed` correct. Voor
 * de sandbox-demo portalen we de Sidebar naar `document.body` zodat hij de
 * containment ontwijkt. Dat reflecteert exact hetzelfde gedrag als de echte
 * productie-rendering zonder de layout aan te passen.
 */

import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { Sidebar, type SidebarProps } from '@/components/app/shell/sidebar'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

const MOCK_PROPS: SidebarProps = {
  netWorth: 142_000,
  actionCount: 4,
  unreadMessageCount: 2,
  userInitials: 'JP',
  userName: 'Jan Pieter',
}

/**
 * Resolve een mensvriendelijke beschrijving van de actieve module zodat de
 * tester kan controleren dat `usePathname()`-detectie werkt zoals bedoeld.
 */
function describeActiveModule(pathname: string): string {
  if (pathname.startsWith('/core')) return 'Kern (active op /core/*)'
  if (pathname.startsWith('/will')) return 'Wil (active op /will/*)'
  if (pathname.startsWith('/horizon')) return 'Horizon (active op /horizon/*)'
  return 'geen module-route — sidebar accent zou afwezig moeten zijn'
}

export function SidebarDemo() {
  const pathname = usePathname() ?? '/'
  const activeDescription = describeActiveModule(pathname)

  return (
    <div className="space-y-6">
      {/* Mock-data overzicht — voor de tester transparant. */}
      <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-5">
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono font-semibold text-[var(--ink-2)] mb-3">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--color-horizon-500)' }}
          />
          Sidebar-demo · variant A productie
        </div>
        <p
          className="italic text-[14px] leading-snug text-[var(--ink-2)] mb-4"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Mock-waarden gebruikt door de Sidebar-component. De daadwerkelijke
          data wordt in productie via props van een server-component aangeleverd.
        </p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
          <DemoMetaRow label="netWorth" value={`€ ${MOCK_PROPS.netWorth.toLocaleString('nl-NL')}`} />
          <DemoMetaRow label="actionCount" value={String(MOCK_PROPS.actionCount)} />
          <DemoMetaRow label="unreadMessageCount" value={String(MOCK_PROPS.unreadMessageCount ?? 0)} />
          <DemoMetaRow label="userInitials" value={MOCK_PROPS.userInitials} />
          <DemoMetaRow label="userName" value={MOCK_PROPS.userName} />
        </dl>

        <div
          className="mt-4 pt-4 border-t border-[var(--border-ed)] text-[12px] text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          <strong className="font-bold text-[var(--ink)]" style={{ fontFamily: PLAYFAIR }}>
            Active module
          </strong>
          <span className="ml-2 italic">{activeDescription}</span>
        </div>
      </div>

      {/* Sidebar in standalone preview — fixed positionering vereist dat we
          afzonderlijk renderen, niet binnen een card. We tonen een hint dat
          de echte sidebar links naast de pagina-shell staat. */}
      <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-5">
        <div className="text-[10px] uppercase tracking-[0.18em] font-mono font-semibold text-[var(--ink-2)] mb-3">
          Live sidebar — links op het scherm
        </div>
        <p
          className="italic text-[13px] leading-snug text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          De Sidebar-component is hieronder direct gemount (fixed-positionering).
          Op schermen ≥1024px verschijnt de sidebar links-vast met haar eigen
          scroll. Schaal de viewport onder 1024px om te zien dat de sidebar
          correct verbergt (hidden lg:flex).
        </p>
      </div>

      {/* Standalone Sidebar render — via portal naar document.body om de
          ChatLayoutWrapper's `contain: layout` te ontwijken (zie module-comment
          bovenaan). Op deze manier staat de fixed Sidebar t.o.v. de viewport. */}
      <SidebarPortal>
        <Sidebar {...MOCK_PROPS} />
      </SidebarPortal>
    </div>
  )
}

/**
 * Portal-wrapper die kinderen naar `document.body` rendert. Gebruikt
 * `useSyncExternalStore` als canonical client-only-detect pattern (React 19
 * lint-regel `react-hooks/set-state-in-effect` keurt useState+useEffect af).
 * Server-snapshot = false (geen mount); client-snapshot = true → portal mount.
 */
const subscribePortal = () => () => {}
const getPortalSnapshot = () => true
const getPortalServerSnapshot = () => false

function SidebarPortal({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(subscribePortal, getPortalSnapshot, getPortalServerSnapshot)
  if (!mounted || typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

function DemoMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
        {label}
      </dt>
      <dd className="font-mono tabular-nums text-[12px] text-[var(--ink)]">{value}</dd>
    </>
  )
}
