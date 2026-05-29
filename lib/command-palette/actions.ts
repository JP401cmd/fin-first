// Statisch action-register voor het ⌘K command-palette.
// Acties zijn pure runners die functionaliteit ontsluiten die NIET via een
// route bereikbaar is (chat openen, privacy toggelen, sync triggeren). Alle
// route-gebaseerde "acties" leven in `navigation-index.ts` — geen duplicatie.

import {
  MessageSquare, Eye, EyeOff, RefreshCw, LogOut, User, Users, UserCheck, type LucideIcon,
} from 'lucide-react'
import type { ModuleId } from '@/lib/module-registry'
import type { Perspective, PerspectiveOption } from '@/components/app/perspective-provider'
import type { CommandItem, CommandModuleContext } from './types'

/**
 * Capabilities die een action kan gebruiken. Wordt door de provider gebouwd
 * uit React contexts (`useChatContext`, `useMaskedAmounts`, `useGlobalSync`,
 * `useRouter`, `usePerspective`) en doorgegeven aan de `build`-factory.
 */
export type ActionRunContext = {
  router: { push: (href: string) => void }
  closePalette: () => void
  /** Open AI-chat panel. */
  openChat: () => void
  /** Toggle privacy-masking voor bedragen. */
  togglePrivacy: () => void
  /** Huidige privacy-state — bepaalt label "Bedragen verbergen" vs "Bedragen tonen". */
  privacyMasked: boolean
  /** Trigger een prices-only sync (geen bank-/exchange-koppelingen vereist). */
  triggerPricesSync: () => Promise<void> | void
  /** Huidig actief perspectief (personal/household/partner). */
  currentPerspective: Perspective
  /** Beschikbare perspectief-opties voor deze gebruiker. Solo-users zien
   *  alleen `personal`; household-users zien de drie opties. */
  availablePerspectives: ReadonlyArray<PerspectiveOption>
  /** Wijzig actief perspectief. */
  setPerspective: (p: Perspective) => void
}

/**
 * ActionDef gebruikt overal callable getters (ook voor static velden) om
 * het union-type-probleem te ontwijken — Lucide-icons zijn ForwardRef-objects
 * die `typeof === 'function'` triggeren, dus runtime-narrowing tussen
 * `LucideIcon` en `(ctx) => LucideIcon` is fragile. Uniform callable is
 * helder en lijnt op met de dynamische "Bedragen tonen / verbergen"-actie.
 */
type ActionDef = {
  id: string
  getLabel: (ctx: ActionRunContext) => string
  getSublabel?: (ctx: ActionRunContext) => string
  getIcon: (ctx: ActionRunContext) => LucideIcon
  module?: CommandModuleContext
  requiredModule?: ModuleId
  build: (ctx: ActionRunContext) => () => void | Promise<void>
}

// ── Register ─────────────────────────────────────────────────────────────────

const ACTIONS: ActionDef[] = [
  {
    id: 'action:open-chat',
    getLabel: () => 'Open AI-chat',
    getSublabel: () => 'Stel een vraag of laat Will analyseren',
    getIcon: () => MessageSquare,
    module: 'wil',
    build: (ctx) => () => {
      ctx.closePalette()
      ctx.openChat()
    },
  },
  {
    id: 'action:toggle-privacy',
    getLabel: (ctx) => (ctx.privacyMasked ? 'Bedragen tonen' : 'Bedragen verbergen'),
    getSublabel: () => 'Toggle privacy-masking voor saldi',
    getIcon: (ctx) => (ctx.privacyMasked ? Eye : EyeOff),
    module: 'globaal',
    build: (ctx) => () => {
      ctx.togglePrivacy()
      ctx.closePalette()
    },
  },
  {
    id: 'action:sync-prices',
    getLabel: () => 'Synchroniseer prijzen',
    getSublabel: () => 'Beleggings- en cryptokoersen verversen',
    getIcon: () => RefreshCw,
    module: 'globaal',
    requiredModule: 'vermogensregistratie',
    build: (ctx) => async () => {
      ctx.closePalette()
      await ctx.triggerPricesSync()
    },
  },
  {
    id: 'action:logout',
    getLabel: () => 'Uitloggen',
    getSublabel: () => 'Sessie beëindigen',
    getIcon: () => LogOut,
    module: 'globaal',
    build: (ctx) => () => {
      ctx.closePalette()
      ctx.router.push('/logout')
    },
  },
]

// ── Perspectief-actie ────────────────────────────────────────────────────────
//
// Eén compacte cycle-actie i.p.v. losse rows per perspectief — past beter bij
// het dropdown-pattern dat de gebruiker zoekt:
//   "Perspectief: [huidige]"
//   ↳ sublabel: "Wisselen naar [volgende] · [beschrijving]"
//
// Klik cyclet naar de volgende beschikbare optie en persisteert via
// `setPerspective` (server-PATCH naar /api/perspective is ingebouwd in
// PerspectiveProvider). Solo-gebruikers (1 perspectief) krijgen niets te zien.

const PERSPECTIVE_ICONS: Record<Perspective, LucideIcon> = {
  personal: User,
  household: Users,
  partner: UserCheck,
}

function buildPerspectiveActions(ctx: ActionRunContext): CommandItem[] {
  if (ctx.availablePerspectives.length <= 1) return []

  const currentIdx = ctx.availablePerspectives.findIndex((p) => p.id === ctx.currentPerspective)
  const safeIdx = currentIdx >= 0 ? currentIdx : 0
  const current = ctx.availablePerspectives[safeIdx]
  const next = ctx.availablePerspectives[(safeIdx + 1) % ctx.availablePerspectives.length]

  return [
    {
      id: 'action:perspective-cycle',
      kind: 'action',
      label: `Perspectief: ${current.label}`,
      sublabel: `Wisselen naar ${next.label} · ${next.description}`,
      icon: PERSPECTIVE_ICONS[current.id] ?? User,
      module: 'globaal',
      run: () => {
        ctx.setPerspective(next.id)
        ctx.closePalette()
      },
    },
  ]
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Bouwt de runtime-CommandItem[] uit het action-register voor de huidige context. */
export function buildActionItems(
  ctx: ActionRunContext,
  activeModules: ReadonlyArray<ModuleId>,
): CommandItem[] {
  const staticItems = ACTIONS
    .filter((a) => !a.requiredModule || activeModules.includes(a.requiredModule))
    .map<CommandItem>((a) => ({
      id: a.id,
      kind: 'action',
      label: a.getLabel(ctx),
      sublabel: a.getSublabel?.(ctx),
      icon: a.getIcon(ctx),
      module: a.module,
      requiredModule: a.requiredModule,
      run: a.build(ctx),
    }))

  return [...staticItems, ...buildPerspectiveActions(ctx)]
}
