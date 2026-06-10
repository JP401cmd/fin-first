'use client'

import { usePathname } from 'next/navigation'

// De meeste beheerschermen lezen prettig in een gecentreerde kolom (max-w-4xl).
// De architectuurplaat is breed en wint bij alle beschikbare ruimte, dus die
// route krijgt de volle contentbreedte (viewport minus de sidebar — die ruimte
// reserveert <main> al via lg:pl-[264px]).
const FULL_WIDTH_PREFIXES = ['/beheer/architectuur']

export function BeheerContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const wide = FULL_WIDTH_PREFIXES.some((p) => pathname?.startsWith(p))
  return (
    <div className={`mx-auto px-4 py-5 sm:px-6 sm:py-12 ${wide ? 'max-w-none' : 'max-w-4xl'}`}>
      {children}
    </div>
  )
}
