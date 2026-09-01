// Statisch action-register voor het ⌘K command-palette.
// Acties zijn pure runners die functionaliteit ontsluiten die NIET via een
// route bereikbaar is (chat openen, privacy toggelen, sync triggeren). Alle
// route-gebaseerde "acties" leven in `navigation-index.ts` — geen duplicatie.

import {
  Eye, EyeOff, RefreshCw, LogOut, User, Users, UserCheck,
  Layers, PanelTopClose, CalendarClock, Wallet, Home, PiggyBank, type LucideIcon,
} from 'lucide-react'
import type { EuroView } from '@/lib/euro-display'
import type { HomeScreen } from '@/lib/home-screen'
import type { ModuleId } from '@/lib/module-registry'
import type { Perspective, PerspectiveOption } from '@/lib/types/perspective'
import type { CommandItem, CommandModuleContext } from './types'

/**
 * Cap op het aantal algemene acties dat de palette zonder zoekterm toont.
 * Leeft hier (bij het register) zodat de test kan bewaken dat elke kern-actie
 * — inclusief 'Synchroniseer prijzen' — binnen de cap valt; een nieuwe actie
 * toevoegen zonder de cap te verhogen drukt anders stilzwijgend de onderste
 * actie uit de standaardlijst.
 */
export const ACTIONS_LIMIT_VISIBLE = 6

/**
 * Capabilities die een action kan gebruiken. Wordt door de provider gebouwd
 * uit React contexts (`useMaskedAmounts`, `useGlobalSync`,
 * `useRouter`, `usePerspective`) en doorgegeven aan de `build`-factory.
 */
export type ActionRunContext = {
  router: { push: (href: string) => void }
  closePalette: () => void
  /** Toggle privacy-masking voor bedragen. */
  togglePrivacy: () => void
  /** Huidige privacy-state — bepaalt label "Bedragen verbergen" vs "Bedragen tonen". */
  privacyMasked: boolean
  /** Toggle de profiel-brede weergavemodus (Eenvoudig ⇄ Volledig). */
  toggleDisplayMode: () => void
  /** Huidige weergavemodus — bepaalt label "Volledige/Eenvoudige weergave tonen". */
  displayMode: 'simple' | 'full'
  /** Toggle de profiel-brede euro-weergave (toekomstige ⇄ huidige euro's). */
  toggleEuroView: () => void
  /** Huidige euro-weergave — bepaalt het label van de toggle-actie. */
  euroView: EuroView
  /** Toggle het profiel-brede homescherm (Overzicht ⇄ Budgetteren). */
  toggleHomeScreen: () => void
  /** Huidig homescherm — bepaalt het label van de toggle-actie. */
  homeScreen: HomeScreen
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

/* Geen chat-actie in het palet (besluit 29-08-2026, vervolg op B-011): de chat
   is altijd al bij de hand via de Fin-knop in de nav-pill / het gedokte paneel —
   een palet-ingang was een tweede weg naar hetzelfde. Niet her-toevoegen zonder
   nieuw eigenaarsbesluit. */
const ACTIONS: ActionDef[] = [
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
    // Beschrijft wat de modus ECHT doet, en dat is niet één mechanisme: het
    // leeuwendeel van de reductie is `HideInSimple` (hard weg in Eenvoudig,
    // terug in Volledig), en op drie plekken `DepthSection` (ingeklapt mét
    // behoud — cashflow-instellingen, "Alle meldingstypen", de AI-uitvoerings-
    // groepen). De oude tekst ("Diepte-secties standaard tonen of inklappen")
    // beloofde dát laatste voor de héle app en klopte dus voor vrijwel geen
    // enkel oppervlak; deze sublabel dekt beide mechanismen.
    getSublabel: () => 'Meer/minder detail op elke pagina',
    getIcon: (ctx) => (ctx.displayMode === 'simple' ? Layers : PanelTopClose),
    module: 'globaal',
    build: (ctx) => () => {
      ctx.toggleDisplayMode()
      ctx.closePalette()
    },
  },
  {
    // Staat bewust direct onder de weergavemodus-actie: beide zijn profiel-brede
    // weergavekeuzes die cross-device meereizen.
    id: 'action:toggle-euro-view',
    getLabel: (ctx) =>
      ctx.euroView === 'nominal' ? "Toon huidige euro's" : "Toon toekomstige euro's",
    getSublabel: (ctx) =>
      ctx.euroView === 'nominal'
        ? 'Projecties in koopkracht van vandaag'
        : 'Projecties in de euro’s van dat jaar',
    getIcon: (ctx) => (ctx.euroView === 'nominal' ? Wallet : CalendarClock),
    module: 'globaal',
    build: (ctx) => () => {
      ctx.toggleEuroView()
      ctx.closePalette()
    },
  },
  {
    // Derde profiel-brede voorkeur in dit rijtje (na weergavemodus en
    // euro-weergave): waar de app voor je opent. Alleen semantische
    // "ga naar hoofdscherm"-navigaties volgen de keuze (login-landing,
    // /dashboard/PWA, top-bar ←, long-press op de waffle) — de menu-indeling
    // verandert niet mee. Bewust NIET gegate op de budgetteren-app: wie
    // 'budget' kiest zonder inrichting ziet de AppSetupGate als startscherm —
    // zelfverklarend en hier direct omkeerbaar.
    id: 'action:toggle-home-screen',
    getLabel: (ctx) =>
      ctx.homeScreen === 'overzicht'
        ? 'Budgetteren als startscherm'
        : 'Overzicht als startscherm',
    getSublabel: () => 'Waar de app voor je opent',
    getIcon: (ctx) => (ctx.homeScreen === 'overzicht' ? PiggyBank : Home),
    module: 'globaal',
    build: (ctx) => () => {
      ctx.toggleHomeScreen()
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
