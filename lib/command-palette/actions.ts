// Statisch action-register voor het ⌘K command-palette.
// Acties zijn pure runners die functionaliteit ontsluiten die NIET via een
// route bereikbaar is (chat openen, privacy toggelen, sync triggeren). Alle
// route-gebaseerde "acties" leven in `navigation-index.ts` — geen duplicatie.

import {
  MessageSquare, Eye, EyeOff, RefreshCw, LogOut, type LucideIcon,
} from 'lucide-react'
import type { ModuleId } from '@/lib/module-registry'
import type { CommandItem, CommandModuleContext } from './types'

/**
 * Capabilities die een action kan gebruiken. Wordt door de provider gebouwd
 * uit React contexts (`useChatContext`, `useMaskedAmounts`, `useGlobalSync`,
 * `useRouter`) en doorgegeven aan de `build`-factory.
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

// ── Public API ───────────────────────────────────────────────────────────────

/** Bouwt de runtime-CommandItem[] uit het action-register voor de huidige context. */
export function buildActionItems(
  ctx: ActionRunContext,
  activeModules: ReadonlyArray<ModuleId>,
): CommandItem[] {
  return ACTIONS
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
}
