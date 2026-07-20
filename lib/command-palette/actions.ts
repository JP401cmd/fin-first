// Statisch action-register voor het ⌘K command-palette.
// Acties zijn pure runners die functionaliteit ontsluiten die NIET via een
// route bereikbaar is (chat openen, privacy toggelen, sync triggeren). Alle
// route-gebaseerde "acties" leven in `navigation-index.ts` — geen duplicatie.

import {
  MessageSquare, Eye, EyeOff, RefreshCw, LogOut, User, Users, UserCheck,
  Layers, PanelTopClose, type LucideIcon,
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
  /** Toggle de profiel-brede weergavemodus (Eenvoudig ⇄ Volledig). */
  toggleDisplayMode: () => void
  /** Huidige weergavemodus — bepaalt label "Volledige/Eenvoudige weergave tonen". */
  displayMode: 'simple' | 'full'
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
    getSublabel: () => 'Stel een vraag of laat Fin analyseren',
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
    id: 'action:toggle-display-mode',
    getLabel: (ctx) =>
      ctx.displayMode === 'simple' ? 'Volledige weergave tonen' : 'Eenvoudige weergave tonen',
    getSublabel: () => 'Diepte-secties standaard tonen of inklappen',
    getIcon: (ctx) => (ctx.displayMode === 'simple' ? Layers : PanelTopClose),
    module: 'globaal',
    build: (ctx) => () => {
      ctx.toggleDisplayMode()
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

// ── Perspectief-acties ───────────────────────────────────────────────────────
//
// Eén actie per beschikbaar perspectief (Persoonlijk / Huishouden / Partner),
// gegroepeerd onder de aparte sectie "Perspectief" in de palette. Eén klik =
// directe selectie — geen cycle. De huidige selectie krijgt "· actief" in de
// sublabel zodat de gebruiker meteen ziet wat er nu geldt. Solo-gebruikers
// (1 beschikbaar perspectief) zien niets — geen no-op-noise.
//
// Klik op het actieve perspectief: no-op (alleen palette sluit). Klik op een
// ander: `setPerspective` patcht naar /api/perspective via PerspectiveProvider
// en valt terug op localStorage.

const PERSPECTIVE_ICONS: Record<Perspective, LucideIcon> = {
  personal: User,
  household: Users,
  partner: UserCheck,
}

function buildPerspectiveActions(ctx: ActionRunContext): CommandItem[] {
  if (ctx.availablePerspectives.length <= 1) return []

  return ctx.availablePerspectives.map<CommandItem>((opt) => {
    const isCurrent = ctx.currentPerspective === opt.id
    return {
      id: `action:perspective-${opt.id}`,
      kind: 'action',
      label: opt.label,
      sublabel: isCurrent ? `${opt.description} · actief` : opt.description,
      icon: PERSPECTIVE_ICONS[opt.id] ?? User,
      module: 'globaal',
      run: () => {
        if (!isCurrent) {
          ctx.setPerspective(opt.id)
        }
        ctx.closePalette()
      },
    }
  })
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
