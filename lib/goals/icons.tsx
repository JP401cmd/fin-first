// ── Goal-iconen — krant-stijl monoline ──────────────────────────────────
// Centrale mapping van GoalSlug → lucide-component. De catalog houdt
// `icon: 'Sparkles'` als string; deze helper resolved dat naar de daadwerkelijke
// React-component zodat callers `<Icon className="..." />` kunnen renderen.
//
// Krant-esthetiek: lucide monoline (1.5-2px stroke) past bij de inkt-op-
// papier toon. Emoji's (✨🎯📊) zijn bewust afgeschaft op de plekken waar
// een doel-icoon naast tekst staat — kleurige emoji's contrasteren met de
// neutrale kicker-typografie en renderen OS-afhankelijk.
//
// De `emoji`-velden in de catalog blijven beschikbaar als fallback voor
// niet-React contexten (e-mail, OG-images, plain-text exports) maar worden
// in de UI niet meer gerenderd.

import type { ComponentType, SVGProps } from 'react'
import {
  Sparkles,
  Wallet,
  PieChart,
  ShieldCheck,
  CreditCard,
  Compass,
  Target,
} from 'lucide-react'
import type { GoalSlug } from './types'

type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>

const ICON_MAP: Record<GoalSlug, LucideIcon> = {
  'bewust-leven': Sparkles,
  'grip-uitgaven': Wallet,
  'vermogen-overzicht': PieChart,
  noodfonds: ShieldCheck,
  'schulden-aflossen': CreditCard,
  'eerder-stoppen': Compass,
}

/**
 * Geeft het lucide-icoon-component terug voor een doel-slug. Fallback op
 * `Target` (generiek doel-icoon) wanneer de slug onbekend is — voorkomt
 * lege ruimte in de UI bij toekomstige doelen die nog geen mapping hebben.
 */
export function getGoalIcon(slug: GoalSlug | string): LucideIcon {
  return ICON_MAP[slug as GoalSlug] ?? Target
}
