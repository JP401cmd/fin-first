import type { Metadata } from 'next'
import HorizonInspector from './horizon-inspector'
import { HorizonV2Toggle } from './horizon-v2-toggle'

export const metadata: Metadata = { title: 'Horizon-tabellen — Beheer' }

export default function HorizonTabellenPage() {
  return (
    <div className="space-y-4">
      <HorizonV2Toggle />
      <HorizonInspector />
    </div>
  )
}
