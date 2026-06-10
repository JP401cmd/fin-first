'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Milestone } from 'lucide-react'
import {
  PROMISE_PILLARS,
  ROADMAP_EFFORT_LABEL,
  ROADMAP_PROMISE,
  ROADMAP_RESEARCH_META,
  ROADMAP_SOURCES,
  ROADMAP_STRATEGIC_NOTES,
  ROADMAP_TIERS,
  ROADMAP_VALIDATED_STRENGTHS,
  type PromisePillar,
  type RoadmapItem,
  type RoadmapTier,
} from '@/lib/roadmap-functionaliteiten'

export default function BeheerRoadmapPage() {
  const meta = ROADMAP_RESEARCH_META

  return (
    <div>
      {/* Kop */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Milestone className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Roadmap functionaliteiten</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Gap-analyse uit marktonderzoek — welke functies missen we die aan de vrijheidsbelofte bijdragen
        </p>
      </div>

      {/* Belofte + pijler-legenda */}
      <div className="mb-6 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-4)]">De belofte</p>
        <p className="mt-1 font-serif text-lg leading-snug text-[var(--ink)]">{ROADMAP_PROMISE}</p>
        <p className="mt-2 text-xs text-[var(--ink-3)]">
          De belofte valt uiteen in vier toetsstenen. Elke kandidaat is gekoppeld aan de pijler(s) waaraan hij bijdraagt.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(PROMISE_PILLARS) as PromisePillar[]).map((key) => {
            const p = PROMISE_PILLARS[key]
            return (
              <span
                key={key}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${p.badge}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />
                {p.label}
                <span className="font-normal opacity-70">· {p.hint}</span>
              </span>
            )
          })}
        </div>
      </div>

      {/* Onderzoeksmeta */}
      <div className="mb-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--ink-3)]">
        <span>Bron: deep-research, {meta.period}</span>
        <span aria-hidden>·</span>
        <span className="font-mono tabular-nums">{meta.agents}</span> agenten
        <span aria-hidden>·</span>
        <span className="font-mono tabular-nums">{meta.sources}</span> bronnen
        <span aria-hidden>·</span>
        <span className="font-mono tabular-nums">{meta.claimsVerified}</span> claims geverifieerd
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
          <span className="font-mono tabular-nums">{meta.claimsConfirmed}</span> bevestigd
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-rose-700">
          <span className="font-mono tabular-nums">{meta.claimsRefuted}</span> weerlegd
        </span>
      </div>

      {/* Tiers */}
      <div className="space-y-8">
        {ROADMAP_TIERS.map((tier, i) => (
          <TierBlock key={tier.id} tier={tier} defaultOpenFirst={i === 0} />
        ))}
      </div>

      {/* Strategische richting (Tier 3) */}
      <div className="mt-10">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--ink-2)]">
          Strategische richting
        </h3>
        <p className="mt-1 text-xs text-[var(--ink-3)]">
          Geen directe feature — koers voor de langere termijn.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {ROADMAP_STRATEGIC_NOTES.map((note) => (
            <div
              key={note.title}
              className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4"
            >
              <p className="text-sm font-semibold text-[var(--ink)]">{note.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-3)]">{note.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Wat we niet missen */}
      <div className="mt-10 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-5">
        <h3 className="text-sm font-bold text-[var(--ink)]">Wat we expliciet níét missen</h3>
        <p className="mt-1 text-xs text-[var(--ink-3)]">
          Markt-geverifieerde sterktes — niet opnieuw bouwen.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ROADMAP_VALIDATED_STRENGTHS.map((s) => (
            <span
              key={s}
              className="inline-flex items-center rounded-md border border-[var(--border-md)] bg-[var(--paper)] px-2.5 py-1 text-xs text-[var(--ink-2)]"
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Bronnen */}
      <div className="mt-8">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--ink-2)]">Bronnen</h3>
        <ul className="mt-3 space-y-1.5">
          {ROADMAP_SOURCES.map((src) => (
            <li key={src.url} className="text-xs">
              <a
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--ink-3)] underline decoration-[var(--border-md)] underline-offset-2 transition-colors hover:text-[var(--ink)]"
              >
                {src.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function TierBlock({ tier, defaultOpenFirst }: { tier: RoadmapTier; defaultOpenFirst: boolean }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="inline-flex items-center rounded-md border border-[var(--border-md)] bg-[var(--subtle)] px-2 py-0.5 text-[11px] font-bold tracking-wider text-[var(--ink-2)]">
          {tier.rank}
        </span>
        <div>
          <h3 className="text-base font-bold text-[var(--ink)]">{tier.label}</h3>
          <p className="text-xs text-[var(--ink-3)]">{tier.blurb}</p>
        </div>
      </div>
      <div className="space-y-3">
        {tier.items.map((item, idx) => (
          <ItemCard key={item.mark} item={item} defaultOpen={defaultOpenFirst && idx === 0} />
        ))}
      </div>
    </section>
  )
}

function ItemCard({ item, defaultOpen }: { item: RoadmapItem; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--subtle)]"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--border-md)] bg-[var(--subtle)] text-xs font-bold font-mono text-[var(--ink-2)]">
              {item.mark}
            </span>
            <p className="text-sm font-semibold text-[var(--ink)]">{item.title}</p>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-3)]">{item.summary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {item.pillars.map((pillar) => {
              const p = PROMISE_PILLARS[pillar]
              return (
                <span
                  key={pillar}
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${p.badge}`}
                >
                  <span className={`h-1 w-1 rounded-full ${p.dot}`} />
                  {p.label}
                </span>
              )
            })}
            <span className="inline-flex items-center rounded border border-[var(--border-md)] bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-3)]">
              {ROADMAP_EFFORT_LABEL[item.effort]}
            </span>
          </div>
        </div>
        {open ? (
          <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" />
        ) : (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" />
        )}
      </button>

      {open && (
        <div className="border-t border-[var(--border-ed)] px-5 py-4 space-y-3">
          <Detail label="Marktbasis" body={item.market} />
          <Detail label="Zo bouwen we het" body={item.build} />
        </div>
      )}
    </div>
  )
}

function Detail({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-4)]">{label}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-2)]">{body}</p>
    </div>
  )
}
