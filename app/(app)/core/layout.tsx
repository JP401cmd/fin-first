import { ModuleNav } from '@/components/app/module-nav'
import { coreNav } from '@/lib/navigation'

export default function CoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleNav config={coreNav} />
      {children}
    </>
  )
}
