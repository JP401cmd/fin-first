/**
 * SectionHeading — krant-sectiekop (rule · label · rule) voor de berichten- en
 * nieuws-pagina's. Eén gedeelde bron; eerder stond dit als bewust-gedupliceerde
 * lokale helper in zowel `berichten-client.tsx` als `nieuws-only-client.tsx`
 * (K-06-consolidatie). Pure presentatie, geen state.
 */
export function SectionHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 pb-4 pt-2">
      <div className="h-px flex-1 bg-[var(--border-ed)]" />
      <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
        {label}
      </span>
      <div className="h-px flex-1 bg-[var(--border-ed)]" />
    </div>
  )
}
