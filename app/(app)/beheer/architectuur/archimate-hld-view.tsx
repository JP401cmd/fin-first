'use client'

// HLD-praatplaat vanuit gebruikersperspectief. Geen techniek — het verhaal van
// de app in gewone taal, met de functionaliteiten prominent zodat een leek
// meteen snapt "dit kan de app voor mij doen". Editorial Finance-vormgeving.

import { ArrowRight, MessageCircle } from 'lucide-react'
import { buildHldModel, type HldAccent } from '@/lib/architecture/hld-model'

const ACCENT: Record<HldAccent, { bar: string; text: string }> = {
  kern: { bar: 'var(--color-kern-500)', text: 'var(--color-kern-700)' },
  horizon: { bar: 'var(--color-horizon-500)', text: 'var(--color-horizon-700)' },
  wil: { bar: 'var(--color-wil-500)', text: 'var(--color-wil-700)' },
  ink: { bar: 'var(--ink)', text: 'var(--ink)' },
}

export function ArchimateHldView() {
  const model = buildHldModel()
  const totalCaps = model.capabilityGroups.reduce((s, g) => s + g.items.length, 0)

  return (
    <div className="space-y-10">
      {/* ── belofte ── */}
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
          <span aria-hidden="true" className="mr-2.5 inline-block h-px w-7 bg-[var(--color-horizon-500)] align-middle" />
          Praatplaat · {model.promise.kicker} · {totalCaps} functionaliteiten
        </p>
        <h2 className="mt-2 font-serif text-3xl font-bold leading-tight text-[var(--ink)]">
          {model.promise.headline}{' '}
          <em className="font-serif italic font-normal text-[var(--color-horizon-700)]">{model.promise.emphasis}</em>
        </h2>
        <p className="mt-3 max-w-[68ch] border-l-2 border-[var(--color-horizon-500)] pl-3 font-serif italic text-[15px] leading-relaxed text-[var(--ink-2)]">
          {model.promise.deck}
        </p>
      </header>

      {/* ── functionaliteiten (het hart) ── */}
      <section className="space-y-7">
        <div className="flex items-baseline gap-2 border-b-2 border-double border-[var(--ink)] pb-1.5">
          <h3 className="font-serif text-xl font-bold text-[var(--ink)]">Wat de app voor je doet</h3>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]">in gewone taal</span>
        </div>

        {model.capabilityGroups.map((group) => {
          const accent = ACCENT[group.accent]
          return (
            <div key={group.id}>
              <p className="mb-3 flex items-center gap-2.5">
                <span aria-hidden="true" className="inline-block h-4 w-1" style={{ backgroundColor: accent.bar }} />
                <span className="font-serif text-lg font-bold italic" style={{ color: accent.text }}>
                  {group.goal}
                </span>
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((cap) => (
                  <div key={cap.title} className="relative border border-[var(--border-ed)] bg-[var(--paper)] p-4">
                    <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: accent.bar }} />
                    <p className="font-serif text-[15px] font-bold leading-snug text-[var(--ink)]">{cap.title}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-2)]">{cap.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </section>

      {/* ── de reis ── */}
      <section>
        <div className="mb-4 border-b-2 border-double border-[var(--ink)] pb-1.5">
          <h3 className="font-serif text-xl font-bold text-[var(--ink)]">Hoe het gaat — stap voor stap</h3>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          {model.journey.map((stage, i) => (
            <div key={stage.n} className="flex flex-1 items-stretch gap-3">
              <div className="flex-1 border border-[var(--border-ed)] bg-[var(--paper)] p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center bg-[var(--ink)] font-mono text-[11px] font-bold text-[var(--paper)]">
                    {stage.n}
                  </span>
                  <span className="font-serif text-base font-bold text-[var(--ink)]">{stage.title}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink)]">{stage.you}</p>
                <p className="mt-1.5 text-[13px] italic leading-relaxed text-[var(--ink-3)]">{stage.app}</p>
              </div>
              {i < model.journey.length - 1 && (
                <ArrowRight className="hidden h-5 w-5 shrink-0 self-center text-[var(--ink-3)] lg:block" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
        {/* uitkomst */}
        <div className="mt-4 border-2 border-[var(--ink)] bg-[var(--color-horizon-50)] px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-horizon-700)]">De uitkomst</p>
          <p className="mt-1 font-serif text-xl font-bold text-[var(--ink)]">
            <span className="bg-[linear-gradient(transparent_60%,var(--color-horizon-200)_60%)] px-0.5">{model.outcome.title}</span>
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]">{model.outcome.desc}</p>
        </div>
      </section>

      {/* ── Will ── */}
      <section className="border border-[var(--ink)] bg-[var(--paper)] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-wil-500)] text-[var(--paper)]">
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="font-serif text-lg font-bold text-[var(--ink)]">{model.companion.name}</p>
            <p className="text-sm text-[var(--ink-2)]">{model.companion.role}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {model.companion.touches.map((t) => (
            <span key={t} className="border border-[var(--border-ed)] bg-[var(--subtle)] px-2.5 py-1 text-xs text-[var(--ink-2)]">
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* ── soevereiniteit ── */}
      <section>
        <div className="mb-1 border-b-2 border-double border-[var(--ink)] pb-1.5">
          <h3 className="font-serif text-xl font-bold text-[var(--ink)]">Hoe je groeit</h3>
        </div>
        <p className="mb-4 max-w-[68ch] font-serif italic text-sm text-[var(--ink-3)]">
          De app groeit met je mee — als motivatie, niet als slot op de deur. Alles blijft beschikbaar; het niveau laat
          zien hoe ver je bent.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          {model.phases.map((phase, i) => (
            <div key={phase.label} className="flex flex-1 items-stretch gap-2">
              <div className="flex-1 border border-[var(--border-ed)] bg-[var(--paper)] p-3.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]">Fase {i + 1}</p>
                <p className="mt-0.5 font-serif text-base font-bold text-[var(--ink)]">{phase.label}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-2)]">{phase.meaning}</p>
              </div>
              {i < model.phases.length - 1 && (
                <ArrowRight className="hidden h-4 w-4 shrink-0 self-center text-[var(--ink-3)] sm:block" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── modules (synced) ── */}
      <section>
        <div className="mb-3 border-b border-[var(--border-ed)] pb-1.5">
          <h3 className="font-serif text-lg font-bold text-[var(--ink)]">Onderdelen die je aanzet</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {model.modules.map((m) => (
            <div key={m.id} className="border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
              <p className="flex items-baseline gap-2">
                <span className="font-serif text-[15px] font-bold text-[var(--ink)]">{m.label}</span>
                {!m.standalone && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)]">bouwt voort</span>
                )}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-2)]">{m.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
