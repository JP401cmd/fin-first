import type { Metadata } from 'next'
import { PageInfoButton } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'
import { VersieClient } from './versie-client'

export const metadata: Metadata = { title: 'Versie & git — Beheer' }
export const dynamic = 'force-dynamic'

/**
 * /beheer/versie — alleen-lezen dashboard van de git-, versie-, deploy- en
 * migratie-staat. Beantwoordt in één blik: staat localhost vóór master/prod,
 * is er ongecommit werk, en klopt de migratie-staat? Data komt live uit
 * /api/admin/version-status (superadmin-only) via de client-component.
 */
export default function BeheerVersiePage() {
  return (
    <div className="relative">
      <PageInfoButton
        className="absolute right-0 top-0 z-10"
        content={getPageInfo('/beheer/versie')}
      />
      <VersieClient />
    </div>
  )
}
