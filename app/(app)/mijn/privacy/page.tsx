import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PrivacyOverview } from '@/components/mijn/privacy-overview'
import { AiPrivacySettings } from '@/components/mijn/ai-privacy-settings'
import { AiExecutionSettings } from '@/components/mijn/local-categorization-settings'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Privacy & transparantie — TriFinity',
  description: 'Wat we opslaan, waar en waarom — plus directe data-export en account-verwijdering.',
}

/**
 * /mijn/privacy — plan §3.4 transparantie-anker. Vervangt de eerdere
 * redirect naar legacy /identity/instellingen door een dedicated pagina
 * die per data-categorie laat zien wat we opslaan en waarom, met
 * prominente data-export + delete-CTAs.
 */
export default function MijnPrivacyPage() {
  return (
    <>
      <NavStackMeta title="Privacy" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-3xl px-4 pt-4 sm:px-6">
        <PageInfoButton
          description={PAGE_INFO['/mijn/privacy'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <PrivacyOverview />
      <AiPrivacySettings />
      <AiExecutionSettings />
    </>
  )
}
