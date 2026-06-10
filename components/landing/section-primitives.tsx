import { type LucideIcon } from 'lucide-react'

/**
 * Sectie-primitieven van de marketing-site — gedeeld door de home,
 * /functies, /prijzen en /veiligheid. Eén bron voor de redactionele
 * krantenstijl ("Persoonlijk Financieel Dagblad"): scheidingslijnen,
 * sectie-titels en de terugkerende kaartvormen.
 */

// ── Sectie-scheidingslijn ────────────────────────────────────────────

export function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 px-6 py-8 md:px-12">
      <div className="h-px flex-1 bg-[var(--border-ed)]" />
      <span className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
        {label}
      </span>
      <div className="h-px flex-1 bg-[var(--border-ed)]" />
    </div>
  )
}

// ── Sectie-titel ─────────────────────────────────────────────────────

export function SectionTitle({
  kicker,
  title,
  italics,
  intro,
}: {
  kicker: string
  title: string
  italics?: string
  intro?: string
}) {
  return (
    <div className="mb-10 text-center">
      <p className="mb-4 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
        {kicker}
      </p>
      <h2 className="font-display text-[2rem] font-bold leading-tight tracking-[-0.02em] text-[var(--ink)] md:text-[2.6rem]">
        {title}
        {italics && (
          <>
            {' '}
            <em className="italic text-kern-600">{italics}</em>
          </>
        )}
      </h2>
      {intro && (
        <p className="mx-auto mt-5 max-w-2xl font-serif text-lg leading-relaxed text-[var(--ink-2)]">
          {intro}
        </p>
      )}
    </div>
  )
}

// ── Module-kaart ─────────────────────────────────────────────────────

export function ModuleKaart({
  kleur,
  rubriek,
  titel,
  ondertitel,
  features,
  bgClass,
  borderClass,
  iconColor,
  Icon,
}: {
  kleur: string
  rubriek: string
  titel: string
  ondertitel: string
  features: string[]
  bgClass: string
  borderClass: string
  iconColor: string
  Icon: LucideIcon
}) {
  return (
    <div
      className={`overflow-hidden rounded-[var(--r-lg)] border ${borderClass} bg-[var(--paper)]`}
    >
      {/* Kaart-header — krantenrubriek */}
      <div className={`flex items-center justify-between border-b-2 px-6 py-3 ${bgClass}`} style={{ borderBottomColor: kleur }}>
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: kleur }}>
          {rubriek}
        </p>
        <Icon className={`h-4 w-4 ${iconColor}`} aria-hidden="true" />
      </div>

      {/* Titel + ondertitel */}
      <div className="px-6 py-6">
        <h3 className="mb-1 font-display text-2xl font-bold leading-tight text-[var(--ink)]">
          {titel}
        </h3>
        <p className="font-serif text-sm italic text-[var(--ink-3)]">
          {ondertitel}
        </p>
      </div>

      {/* Features */}
      <div className="border-t border-dashed border-[var(--border-ed)] px-6 py-5">
        <ul className="space-y-2">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 font-serif text-sm text-[var(--ink-2)]">
              <span aria-hidden="true" className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: kleur }} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── Privacy-bullet ───────────────────────────────────────────────────

export function PrivacyBullet({
  Icon,
  titel,
  beschrijving,
}: {
  Icon: LucideIcon
  titel: string
  beschrijving: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)]">
        <Icon className="h-4 w-4 text-[var(--ink-2)]" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="font-sans text-sm font-semibold text-[var(--ink)]">
          {titel}
        </p>
        <p className="mt-1 font-serif text-sm leading-relaxed text-[var(--ink-3)]">
          {beschrijving}
        </p>
      </div>
    </div>
  )
}
