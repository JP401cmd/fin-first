import { redirect } from 'next/navigation'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { NieuwsOnlyClient } from '@/components/berichten/nieuws-only-client'
import { TijdlijnClient } from '@/components/berichten/tijdlijn-client'
import { KrantWacht } from '@/components/berichten/krant-wacht'
import { TerugNaarTijdlijn } from '@/components/berichten/terug-naar-tijdlijn'
import { KrantBezwaar } from '@/components/berichten/krant-bezwaar'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { magTesteditieZien } from '@/lib/krant/testeditie-toegang'
import { krantBronVoor } from '@/lib/krant/tijdlijn-bron'
import { laadTijdlijn } from '@/lib/krant/tijdlijn-lezen'

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

  // B40 (Krant 1C fase 2): de SERVER kiest de bron. De tijdlijn zonder AI is
  // de standaard; de AI-Krant alleen als bewuste keuze van een Geheel-account;
  // een Krant-account krijgt nooit /api/news (geen doodlopende AI-upsell) maar
  // bij een dichte bèta-vlag een neutrale "komt eraan". Zie lib/krant/tijdlijn-bron.ts.
  const { bron, variant, inBeta, kanAiKiezen } = await krantBronVoor(supabase, user.id)

  if (bron === 'tijdlijn') {
    const [overzicht, bezwaarRes] = await Promise.all([
      laadTijdlijn(supabase, user.id),
      supabase.from('profiles').select('krant_schaduw_bezwaar_at').eq('id', user.id).maybeSingle(),
    ])
    return (
      <>
        <NavStackMeta title="Krant" topBar={{ kind: 'rich' }} />
        <TijdlijnClient
          overzicht={overzicht}
          kanAiKiezen={kanAiKiezen}
          bezwaar={Boolean(bezwaarRes.data?.krant_schaduw_bezwaar_at)}
        />
      </>
    )
  }

  if (bron === 'wacht') {
    return (
      <>
        <NavStackMeta title="Krant" topBar={{ kind: 'rich' }} />
        <KrantWacht />
      </>
    )
  }

  // Keuze 12 (kaart 1B): de schaduweditie is tot 1C onzichtbaar, behalve als
  // testsectie voor SUPERADMIN (22 sep: versmald van testaccounts+superadmin
  // — `is_demo_user` bleek geen betrouwbaar testaccount-predicaat, zie
  // lib/krant/testeditie-toegang.ts). Server-side beslist, zodat een gewone
  // lezer het component niet eens meekrijgt; /api/krant/testeditie toetst
  // hetzelfde nog een keer.
  const [toonTestsectie, bezwaarRes] = await Promise.all([
    magTesteditieZien(supabase, user.id),
    supabase.from('profiles').select('krant_schaduw_bezwaar_at').eq('id', user.id).maybeSingle(),
  ])

  return (
    <>
      {/* /nieuws is een globale hoofd-bestemming (tab 'other') → 'rich' TopBar
          zodat de mobiele utility-cluster (kompas + privacy + nieuws + meldingen
          + account) zichtbaar blijft. Zonder expliciete topBar kiest de
          pathname-watcher 'simple' (geen cluster). */}
      <NavStackMeta title="Krant" topBar={{ kind: 'rich' }} />
      {/* Wie bewust de AI-Krant koos terwijl de tijdlijn open is, kan terug. */}
      {variant === 'ai' && inBeta && <TerugNaarTijdlijn />}
      <NieuwsOnlyClient userId={user.id} toonTestsectie={toonTestsectie} />
      {/* /privacy 2.4 §3 en §8 beloven een bezwaar "onderaan je Krant" — ook
          onder de Krant met AI, want de weekrun maakt ook voor deze lezer
          proefedities (security-run R1 🟡-2). */}
      <section
        aria-label="Bezwaar tegen de Krant op de achtergrond"
        className="mx-auto mt-10 max-w-3xl border-t border-[var(--border-ed)] px-4 pb-16 pt-5 text-[13px] leading-relaxed text-[var(--ink-3)] sm:px-6"
      >
        <KrantBezwaar bezwaar={Boolean(bezwaarRes.data?.krant_schaduw_bezwaar_at)} context="ai" />
      </section>
    </>
  )
}
