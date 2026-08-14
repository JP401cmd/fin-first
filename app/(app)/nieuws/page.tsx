import { redirect } from 'next/navigation'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { NieuwsOnlyClient } from '@/components/berichten/nieuws-only-client'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'

export default async function NieuwsOnlyPage() {
  // De user_id gaat als prop mee omdat de browsercache van de krant erop wordt
  // gescoped — zie de toelichting in nieuws-only-client.tsx. Server-side bepaald,
  // zodat er geen moment bestaat waarop de cache al gelezen is maar de identiteit
  // nog niet vaststaat.
  //
  // getCachedUser i.p.v. auth.getUser(): de layout haalt de user al zo op, dus dit
  // deelt diezelfde React-cache() — geen tweede JWT-roundtrip, en de page wacht op
  // een promise die toch al liep (anders een skeleton-flits uit loading.tsx).
  const supabase = await createClient()
  const user = await getCachedUser(supabase)
  if (!user) redirect('/login')

  return (
    <>
      {/* /nieuws is een globale hoofd-bestemming (tab 'other') → 'rich' TopBar
          zodat de mobiele utility-cluster (kompas + privacy + nieuws + meldingen
          + account) zichtbaar blijft. Zonder expliciete topBar kiest de
          pathname-watcher 'simple' (geen cluster). */}
      <NavStackMeta title="Krant" topBar={{ kind: 'rich' }} />
      <NieuwsOnlyClient userId={user.id} />
    </>
  )
}
