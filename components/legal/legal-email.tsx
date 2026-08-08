import { LEGAL_CONTACT, type LegalContactKind } from '@/lib/legal-contact'

/**
 * LegalEmail — toont het publieke contactadres van een juridische pagina,
 * of een expliciete placeholder zolang dat adres nog niet bestaat.
 *
 * Zolang `LEGAL_CONTACT[kind].address` `null` is (geen geregistreerd domein,
 * zie lib/legal-contact.ts) rendert dit géén mailto-link maar de invulplek
 * `[privacy-e-mailadres — volgt]`. Zo belooft de tekst geen kanaal dat vandaag
 * geen post kan ontvangen. Zodra het adres gevuld is, verschijnt overal
 * automatisch weer een gewone mailto-link.
 *
 * Bewust geen 'use client': puur presentationeel, bruikbaar in zowel de
 * publieke server-pagina's als de in-app client-componenten.
 */
export function LegalEmail({
  kind,
  className = 'font-semibold text-kern-700 underline hover:text-kern-800',
}: {
  kind: LegalContactKind
  /** Klassen voor de mailto-link; de placeholder houdt zijn eigen stijl. */
  className?: string
}) {
  const { address, placeholder } = LEGAL_CONTACT[kind]

  if (!address) {
    return (
      <span className="font-mono text-[0.9em] not-italic text-[var(--ink-3)]">
        {placeholder}
      </span>
    )
  }

  return (
    <a href={`mailto:${address}`} className={className}>
      {address}
    </a>
  )
}
