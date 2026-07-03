import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, LineChart } from 'lucide-react'

/**
 * STUB (FASE 6, horizon-kernel-migratie — stap 5A). Deze route toonde het oude
 * v2-grootboek op de eigen data; die engine is fysiek verwijderd. De weergave is
 * vervangen door `/beheer/horizon-kernel` (de maandbasis-, oracle-bewezen
 * horizon-kernel — tab "Stappen & tabellen"). Deze pagina laadt geen engine en
 * geen ledger meer; ze verwijst enkel door. De nav-entry in
 * `lib/beheer-sections.ts` wordt door een parallelle sessie opgeruimd.
 */

export const metadata: Metadata = { title: 'Horizon-tabellen (mijn data) — Beheer' }

export default function HorizonTabellenMijPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-horizon-700)]">
          De Horizon · rekenkern
        </div>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-[var(--ink)]">
          <LineChart className="h-6 w-6 text-[var(--color-horizon-600)]" />
          Horizon-tabellen (mijn data)
        </h1>
      </div>

      <section className="border border-[var(--border-ed)] border-l-[3px] border-l-[var(--color-horizon-500)] bg-[var(--paper)] p-5">
        <div className="text-sm font-semibold text-[var(--ink)]">
          Vervangen door de Horizon-kernel
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">
          Deze weergave draaide op de oude v2-grootboek-engine. Die engine is verwijderd —
          de <strong>horizon-kernel</strong> (maandbasis, cel-voor-cel oracle-bewezen) is nu de
          enige rekenmotor. Bekijk de stappen en tabellen op je eigen gegevens voortaan daar.
        </p>
        <Link
          href="/beheer/horizon-kernel"
          className="mt-4 inline-flex items-center gap-2 border border-[var(--ink)] bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
        >
          Naar Horizon-kernel — transparantie
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  )
}
