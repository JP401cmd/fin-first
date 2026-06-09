import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'
import { createClient } from '@/lib/supabase/server'
import { AccountClient } from '@/components/mijn/account/account-client'

export const metadata: Metadata = {
  title: 'Account — TriFinity',
  description: 'Beheer je abonnement, inloggegevens en account.',
}

/**
 * /mijn/account — abonnementenbeheer + account-basis. Toont de huidige
 * abonnementsstatus (active_subscriptions), inloggegevens (e-mail/wachtwoord)
 * en de danger zone. Server-component laadt user + abonnement; de interactie
 * leeft in AccountClient.
 */
export default async function MijnAccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_subscriptions')
    .eq('id', user.id)
    .maybeSingle()

  const activeSubscriptions = (profile?.active_subscriptions as string[] | null) ?? []

  return (
    <>
      <NavStackMeta title="Account" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-3xl px-4 pt-4 sm:px-6">
        <PageInfoButton
          description={PAGE_INFO['/mijn/account'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <AccountClient
        email={user.email ?? ''}
        activeSubscriptions={activeSubscriptions}
      />
    </>
  )
}
