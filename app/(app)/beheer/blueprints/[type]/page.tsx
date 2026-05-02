import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  BLUEPRINT_BY_TYPE,
  BLUEPRINTS,
  moduleStyle,
  type BlueprintType,
} from '../_data'
import {
  LandingPreview,
  ListPreview,
  DetailPreview,
} from '../_components/previews-1-3'
import {
  EditPreview,
  ModalPreview,
  KassabonPreview,
  WizardPreview,
} from '../_components/previews-4-7'
import {
  SettingsPreview,
  EmptyPreview,
  CalculatorPreview,
} from '../_components/previews-8-10'
import { BudgetterenPreview } from '../_components/preview-budgetteren'

const PREVIEWS: Record<BlueprintType, () => React.ReactElement> = {
  landing: LandingPreview,
  list: ListPreview,
  detail: DetailPreview,
  edit: EditPreview,
  modal: ModalPreview,
  kassabon: KassabonPreview,
  wizard: WizardPreview,
  settings: SettingsPreview,
  empty: EmptyPreview,
  calculator: CalculatorPreview,
  'app-budgetteren': BudgetterenPreview,
}

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

export function generateStaticParams() {
  return BLUEPRINTS.map((b) => ({ type: b.type }))
}

interface PageProps {
  params: Promise<{ type: string }>
}

export default async function BlueprintTypePage({ params }: PageProps) {
  const { type } = await params
  const meta = BLUEPRINT_BY_TYPE[type as BlueprintType]
  if (!meta) {
    notFound()
  }
  const Preview = PREVIEWS[meta.type]

  // Volgende/vorige blueprint voor sequentieel doorklikken
  const idx = BLUEPRINTS.findIndex((b) => b.type === meta.type)
  const prev = idx > 0 ? BLUEPRINTS[idx - 1] : null
  const next = idx < BLUEPRINTS.length - 1 ? BLUEPRINTS[idx + 1] : null

  return (
    <div style={moduleStyle(meta.module)}>
      <main className="mx-auto max-w-5xl space-y-6">
        {/* Back-link naar hub */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Link
            href="/beheer/blueprints"
            className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)] hover:text-[var(--ink)] font-mono"
          >
            ← Alle blueprints
          </Link>
          <span
            className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]"
          >
            {meta.kicker} · module: {meta.module}
          </span>
        </div>

        {/* Annotatie-blok over wat hieronder staat */}
        <section
          className="border-l-4 p-4"
          style={{
            borderLeftColor: 'var(--module-active-500)',
            background: 'var(--paper)',
            border: '1px solid var(--ink)',
            borderLeftWidth: '4px',
            borderLeftStyle: 'solid',
            fontFamily: SOURCE_SERIF,
          }}
        >
          <div
            className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)] mb-1.5"
          >
            {meta.kicker} — {meta.title}
          </div>
          <h1
            className="font-bold text-[22px] sm:text-[26px] leading-tight tracking-[-0.01em] mb-2"
            style={{ fontFamily: PLAYFAIR }}
          >
            Preview voor{' '}
            <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
              {meta.italicEm}
            </em>
          </h1>
          <p className="text-sm leading-relaxed text-[var(--ink-2)]">
            {meta.description} Routes als voorbeeld:{' '}
            <em>{meta.routeExample}</em>.
          </p>
        </section>

        {/* De daadwerkelijke preview */}
        <section className="bg-[var(--bg)] py-2 sm:py-4">
          <Preview />
        </section>

        {/* Navigatie tussen types */}
        <nav className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-6 border-t border-[var(--border-ed)]">
          {prev ? (
            <Link
              href={`/beheer/blueprints/${prev.type}`}
              className="block p-3 border border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--ink)]"
            >
              <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
                ← Vorige · {prev.kicker}
              </div>
              <div
                className="font-bold text-base mt-0.5"
                style={{ fontFamily: PLAYFAIR }}
              >
                {prev.title}
              </div>
            </Link>
          ) : (
            <div />
          )}
          {next ? (
            <Link
              href={`/beheer/blueprints/${next.type}`}
              className="block p-3 border border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--ink)] sm:text-right"
            >
              <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
                Volgende · {next.kicker} →
              </div>
              <div
                className="font-bold text-base mt-0.5"
                style={{ fontFamily: PLAYFAIR }}
              >
                {next.title}
              </div>
            </Link>
          ) : (
            <div />
          )}
        </nav>
      </main>
    </div>
  )
}
