import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { MijnOverview } from '@/components/mijn/mijn-overview'

export const metadata: Metadata = {
  title: 'Mijn — TriFinity',
  description: 'Profiel, partner, privacy, koppelingen, voorkeuren en rapportages.',
}

/**
 * /mijn — kaart-grid van alle 8 sub-routes (plan §6.4).
 *
 * Vervangt de eerdere /identity-monolith (1823+ regels) volledig: alle
 * tabs zijn uitgekamerd naar dedicated sub-pages onder /mijn.
 *
 * Acht sub-routes:
 *  - /mijn/profiel       basis-gegevens
 *  - /mijn/delen         partner & delen
 *  - /mijn/privacy       data-overzicht
 *  - /mijn/koppelingen   PSD2/UPO/brokerage
 *  - /mijn/uiterlijk     palet, font, kleuren
 *  - /mijn/notificaties  e-mail/push instellingen
 *  - /rapportages        balans/vermogen/budget/plan
 *  - /mijn/geavanceerd   exports, debug
 */
export default function MijnPage() {
  return (
    <>
      <NavStackMeta title="Mijn" bottomBar={{ kind: 'tabs' }} />
      <MijnOverview />
    </>
  )
}
