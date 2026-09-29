'use client'

import { useState } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import type { Product } from '@/lib/modules/resolve'

const PRODUCT_LABEL: Record<Product, string> = {
  krant: 'Krant',
  geheel: 'Geheel',
}

const PRODUCT_UITLEG: Record<Product, string> = {
  krant: 'Het account ziet daarna alleen de Krant en zijn accountpagina’s. Alle gegevens blijven staan; terug naar het Geheel toont alles weer zoals het was.',
  geheel: 'Het account krijgt alle modules en landt op het overzicht. De Krant blijft aan en er wordt niets gewist.',
}

/**
 * Productkeuze op /beheer/gebruikers (Krant 2D fase 1, besluit B12): de
 * support-route terug naar alleen de Krant, en omgekeerd.
 *
 * Toont bewust niet het huidige product: beheer leest `active_modules` niet
 * (ADR 0146, `lib/beheer/geen-inhoud.test.ts`). De keuze is dus een actie
 * ("zet op…"), geen weergave; na afloop meldt de statusbanner het resultaat.
 * Elke keuze gaat via een bevestiging en `POST /api/admin/users/product`.
 */
export function ProductKeuze({
  userId,
  naam,
  disabled = false,
  onStatus,
}: {
  userId: string
  naam: string
  disabled?: boolean
  onStatus: (status: { type: 'success' | 'error'; message: string }) => void
}) {
  const [keuze, setKeuze] = useState<Product | null>(null)
  const [laatste, setLaatste] = useState<Product>('krant')
  const [bezig, setBezig] = useState(false)
  if (keuze && keuze !== laatste) setLaatste(keuze)

  async function bevestig() {
    if (!keuze || bezig) return
    setBezig(true)
    try {
      const res = await fetch('/api/admin/users/product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, product: keuze }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: unknown }
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Product wijzigen mislukt')
      onStatus({ type: 'success', message: `${naam} staat nu op ${PRODUCT_LABEL[keuze]}` })
      setKeuze(null)
    } catch (err) {
      onStatus({ type: 'error', message: err instanceof Error ? err.message : 'Product wijzigen mislukt' })
      setKeuze(null)
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2 text-sm text-[var(--ink-2)]">
      <span className="text-[var(--ink-3)]">Product</span>
      {(['krant', 'geheel'] as const).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setKeuze(p)}
          disabled={disabled || bezig}
          className="min-h-[36px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1 text-sm text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-50"
        >
          Zet op {PRODUCT_LABEL[p]}
        </button>
      ))}

      <ShellOverlay
        kind="confirm"
        open={keuze !== null}
        onClose={() => setKeuze(null)}
        onRequestClose={() => !bezig}
        title={`${naam} op ${PRODUCT_LABEL[keuze ?? laatste]} zetten?`}
        footer={
          <ModalFooter
            layout="stacked"
            primary={{ label: `Zet op ${PRODUCT_LABEL[keuze ?? laatste]}`, onClick: () => void bevestig(), loading: bezig }}
            secondary={{ label: 'Annuleren', onClick: () => setKeuze(null), disabled: bezig }}
          />
        }
      >
        <div className="p-6 text-sm leading-relaxed text-[var(--ink-2)]">
          <p>{PRODUCT_UITLEG[keuze ?? laatste]}</p>
        </div>
      </ShellOverlay>
    </div>
  )
}
