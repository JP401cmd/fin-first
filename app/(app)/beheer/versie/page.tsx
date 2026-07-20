import type { Metadata } from 'next'
import { PageInfoButton } from '@/components/editorial'
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
        description="Alleen-lezen overzicht van je git-, deploy- en migratie-staat. Toont waar localhost staat t.o.v. master en productie, welke werkboom je open hebt, of er ongecommit of ongepusht werk is, en of alle Supabase-migraties zijn toegepast. Onderaan staat een spiekbrief over hoe committen, branches, pushen en worktrees samenhangen."
      />
      <VersieClient />
    </div>
  )
}
