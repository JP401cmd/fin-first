import type { Metadata } from 'next'
import HorizonInspector from './horizon-inspector'

export const metadata: Metadata = { title: 'Horizon-tabellen — Beheer' }

export default function HorizonTabellenPage() {
  return (
    <div className="space-y-4">
      <HorizonInspector />
    </div>
  )
}
