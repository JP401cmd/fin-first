import { ModuleNav } from '@/components/app/module-nav'
import { horizonNav } from '@/lib/navigation'

export default function HorizonLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleNav config={horizonNav} />
      {children}
    </>
  )
}
