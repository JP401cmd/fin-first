/**
 * Neutrale "komt eraan" op /nieuws (Krant 1C fase 2, B40). Een Krant-account
 * waarvoor de tijdlijn nog niet openstaat, ziet dit — nooit een doodlopende
 * upsell of een verwijzing naar een andere variant. Pure presentatie.
 *
 * `children` is de plek voor het bezwaarblok: de weekrun maakt ook voor deze
 * lezer proefedities, en /privacy 2.4 belooft een bezwaar "onderaan je Krant"
 * (security-run R1-delta 🟡-A: het wachtscherm was de derde uitkomst zonder knop).
 */
export function KrantWacht({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <header className="space-y-3">
        <h2
          className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-[var(--ink)] sm:text-[36px]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          Krant
        </h2>
        <p
          className="max-w-prose text-[15px] leading-relaxed text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Je Krant wordt klaargezet. Zodra hij klaar is, zie je hier het nieuws dat jouw situatie raakt.
        </p>
      </header>
      {children}
    </div>
  )
}
