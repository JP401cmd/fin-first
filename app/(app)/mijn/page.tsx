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
 * Zeven sub-routes:
 *  - /mijn/profiel       basis-gegevens
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
      {/* /mijn is een tab-root → 'rich' TopBar zodat de mobiele utility-cluster
          (kompas + privacy + nieuws + meldingen + account) zichtbaar blijft.
          Zonder expliciete topBar valt NavStackMeta terug op 'simple' en zou
          de cluster verdwijnen (zie nav-stack-meta.tsx DEFAULT_TOP_BAR). */}
      <NavStackMeta title="Mijn" topBar={{ kind: 'rich' }} bottomBar={{ kind: 'tabs' }} />
      <MijnOverview />
    </>
  )
}
