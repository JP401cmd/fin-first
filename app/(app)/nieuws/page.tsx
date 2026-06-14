import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { NieuwsOnlyClient } from '@/components/berichten/nieuws-only-client'

export default function NieuwsOnlyPage() {
  return (
    <>
      {/* /nieuws is een globale hoofd-bestemming (tab 'other') → 'rich' TopBar
          zodat de mobiele utility-cluster (kompas + privacy + nieuws + meldingen
          + account) zichtbaar blijft. Zonder expliciete topBar kiest de
          pathname-watcher 'simple' (geen cluster). */}
      <NavStackMeta title="Krant" topBar={{ kind: 'rich' }} />
      <NieuwsOnlyClient />
    </>
  )
}
