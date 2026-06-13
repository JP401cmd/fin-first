import type { Metadata } from 'next'
import MijnLedger from './mijn-ledger'

export const metadata: Metadata = { title: 'Horizon-tabellen (mijn data) — Beheer' }

export default function HorizonTabellenMijPage() {
  return <MijnLedger />
}
