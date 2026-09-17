'use client'

import { useId, useState, type ReactNode } from 'react'
import {
  AI_FACT_HEADINGS,
  AI_LOCAL_VARIANT_FACT,
  AI_MASKED_FACTS,
  AI_MASKING_NOTE,
  AI_PROCESSING_FACTS,
  AI_REVERSIBLE_FACT,
  AI_SHARED_FACTS,
  APP_WITHOUT_AI_FACTS,
  aiFeaturesLostWithoutConsent,
} from '@/lib/ai/privacy-facts'

/**
 * AiConsentFacts — de feiten onder de AI-keuze (ADR 0155), één keer in JSX voor
 * twee hosts: de beta-keuzepopup bij het eerste AI-gebruik (ADR 0157) en de
 * eenmalige keuze-overlay in de app-shell. Alle tekst komt letterlijk uit
 * `lib/ai/privacy-facts.ts` — toestemming is toestemming voor wat dáár staat.
 *
 * Compact maar zonder klik vindbaar: elk blok toont zijn kop plus de eerste
 * regel. Lijsten met meer regels klappen de rest uit via een tekstknop met
 * `aria-expanded`; de losse zinnen (lokale variant, terugdraaien) en de
 * maskeer-nuance staan altijd volledig.
 *
 * Koppen: de host bepaalt het niveau (`headingLevel`) — in een sheet/overlay
 * (titel = h3 van de BottomSheet) zijn het h4's; een host buiten de app-shell
 * met een eigen h1 kan h2 vragen.
 */
export interface AiConsentFactsProps {
  headingLevel?: 'h2' | 'h4'
}

export function AiConsentFacts({ headingLevel = 'h4' }: AiConsentFactsProps) {
  const lost = aiFeaturesLostWithoutConsent()

  return (
    <div className="divide-y divide-[var(--rule-soft)] border-y border-[var(--rule-soft)]">
      <FactList
        heading={AI_FACT_HEADINGS.shared}
        headingLevel={headingLevel}
        items={AI_SHARED_FACTS.map((t) => ({ key: t, node: t }))}
      />
      <FactList
        heading={AI_FACT_HEADINGS.masked}
        headingLevel={headingLevel}
        note={AI_MASKING_NOTE}
        items={AI_MASKED_FACTS.map((t) => ({ key: t, node: t }))}
      />
      <FactList
        heading={AI_FACT_HEADINGS.processing}
        headingLevel={headingLevel}
        items={AI_PROCESSING_FACTS.map((f) => ({
          key: f.title,
          node: (
            <>
              <strong className="font-semibold text-[var(--ink)]">{f.title}:</strong> {f.text}
            </>
          ),
        }))}
      />
      <FactText heading={AI_FACT_HEADINGS.local} headingLevel={headingLevel} text={AI_LOCAL_VARIANT_FACT} />
      <FactText
        heading={AI_FACT_HEADINGS.reversible}
        headingLevel={headingLevel}
        text={AI_REVERSIBLE_FACT}
      />
      <FactList
        heading={AI_FACT_HEADINGS.lost}
        headingLevel={headingLevel}
        items={lost.map((f) => ({
          key: f.label,
          node: (
            <>
              <strong className="font-semibold text-[var(--ink)]">{f.label}</strong> — {f.description}
            </>
          ),
        }))}
      />
      <FactList
        heading={AI_FACT_HEADINGS.kept}
        headingLevel={headingLevel}
        items={APP_WITHOUT_AI_FACTS.map((t) => ({ key: t, node: t }))}
      />
    </div>
  )
}

// ── Subcomponenten ─────────────────────────────────────────────────────

const SERIF = 'var(--font-source-serif, Georgia, serif)'
const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

function FactHeading({ level, id, children }: { level: 'h2' | 'h4'; id?: string; children: string }) {
  const H = level
  return (
    <H
      id={id}
      className="text-[14px] font-semibold leading-snug text-[var(--ink)]"
      style={{ fontFamily: PLAYFAIR }}
    >
      {children}
    </H>
  )
}

function FactText({
  heading,
  headingLevel,
  text,
}: {
  heading: string
  headingLevel: 'h2' | 'h4'
  text: string
}) {
  return (
    <section className="py-3">
      <FactHeading level={headingLevel}>{heading}</FactHeading>
      <p className="mt-1 text-[13px] leading-snug text-[var(--ink-2)]" style={{ fontFamily: SERIF }}>
        {text}
      </p>
    </section>
  )
}

function FactList({
  heading,
  headingLevel,
  items,
  note,
}: {
  heading: string
  headingLevel: 'h2' | 'h4'
  items: ReadonlyArray<{ key: string; node: ReactNode }>
  note?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const headingId = useId()
  const zichtbaar = expanded ? items : items.slice(0, 1)
  const verborgen = items.length - 1

  return (
    <section className="py-3" aria-labelledby={headingId}>
      <FactHeading level={headingLevel} id={headingId}>
        {heading}
      </FactHeading>
      {note && (
        <p
          className="mt-1 text-[12px] italic leading-snug text-[var(--ink-3)]"
          style={{ fontFamily: SERIF }}
        >
          {note}
        </p>
      )}
      <ul
        id={listId}
        className="mt-1.5 space-y-1 text-[13px] leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SERIF }}
      >
        {zichtbaar.map((item) => (
          <li key={item.key} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-[var(--module-active-400)]"
            />
            <span>{item.node}</span>
          </li>
        ))}
      </ul>
      {verborgen > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={listId}
          className="mt-1.5 min-h-8 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--module-active-700)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          {expanded ? 'Toon minder' : `Toon alle ${items.length}`}
        </button>
      )}
    </section>
  )
}
