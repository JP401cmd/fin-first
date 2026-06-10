'use client'

// Datamodel-view: een interactieve ERD van de Supabase-tabellen, gegroepeerd per
// domein, met foreign-key-relaties als edges. Klik een tabel → FK-buren lichten
// op + detail (eigenaarschap, RLS, verwijzingen in/uit, en welke API-domeinen de
// tabel raken). Bewust een áfzonderlijke plaat, los van de ArchiMate-plaat.

import { useMemo, useState } from 'react'
import { KeyRound, Lock, Users, X } from 'lucide-react'
import {
  buildDatabaseModel,
  domainColor,
  getDbRelationsFor,
  getDbNeighbours,
  type DbTable,
  type DatabaseModel,
} from '@/lib/architecture/db-model'
import type { ArchInsights } from '@/lib/architecture/facts'

interface Props {
  insights: ArchInsights
}

function boxAnchor(t: DbTable, side: 'L' | 'R') {
  return { x: side === 'L' ? t.x : t.x + t.w, y: t.y + t.h / 2 }
}

function edgePath(from: DbTable, to: DbTable): string {
  const goRight = to.x >= from.x + from.w
  const goLeft = to.x + to.w <= from.x
  let a: { x: number; y: number }
  let b: { x: number; y: number }
  if (goRight) {
    a = boxAnchor(from, 'R')
    b = boxAnchor(to, 'L')
  } else if (goLeft) {
    a = boxAnchor(from, 'L')
    b = boxAnchor(to, 'R')
  } else {
    // zelfde kolom: lus naar rechts
    a = boxAnchor(from, 'R')
    b = boxAnchor(to, 'R')
    const mx = a.x + 22
    return `M${a.x},${a.y} L${mx},${a.y} L${mx},${b.y} L${b.x},${b.y}`
  }
  const mx = (a.x + b.x) / 2
  return `M${a.x},${a.y} L${mx},${a.y} L${mx},${b.y} L${b.x},${b.y}`
}

export function ArchimateDatabaseView({ insights }: Props) {
  const model: DatabaseModel = useMemo(() => buildDatabaseModel(insights), [insights])
  const [selected, setSelected] = useState<string | null>(null)
  const [scrolled, setScrolled] = useState(false)

  const byName = useMemo(() => new Map(model.tables.map((t) => [t.name, t])), [model])
  const domainIndex = useMemo(() => {
    const m = new Map<string, number>()
    model.columns.forEach((c, i) => m.set(c.domain, i))
    return m
  }, [model])
  const neighbours = useMemo(() => (selected ? getDbNeighbours(model, selected) : new Set<string>()), [model, selected])
  const rels = selected ? getDbRelationsFor(model, selected) : null
  const selTable = selected ? byName.get(selected) : null
  const apiTouch = selected ? insights.tableAccess?.byTable[selected] ?? [] : []

  function tableOpacity(name: string): number {
    if (!selected) return 1
    return name === selected || neighbours.has(name) ? 1 : 0.25
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
          <span aria-hidden="true" className="mr-2.5 inline-block h-px w-7 bg-[var(--rule-soft)] align-middle" />
          Datamodel · {model.tables.length} tabellen · {model.edges.length} foreign keys
        </p>
        <h2 className="mt-2 font-serif text-2xl font-bold text-[var(--ink)]">
          Hoe de <em className="font-serif italic font-normal text-[var(--ink-2)]">tabellen</em> samenhangen
        </h2>
        <p className="mt-3 max-w-[68ch] border-l-2 border-[var(--rule-soft)] pl-3 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Foreign keys tussen tabellen, gegroepeerd per domein. Eigenaarschap (gebruiker / huishouden) en Row Level
          Security komen uit de migraties. Klik een tabel om haar relaties en de API-domeinen die haar raken te zien.
        </p>
      </header>

      {/* legenda */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-[var(--ink-2)]">
        <span className="inline-flex items-center gap-1.5">
          <KeyRound className="h-3.5 w-3.5 text-[var(--ink-3)]" aria-hidden="true" /> gebruiker-eigendom
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-[var(--ink-3)]" aria-hidden="true" /> huishouden-deelbaar
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-[var(--ink-3)]" aria-hidden="true" /> Row Level Security
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          kleur = domein
        </span>
      </div>

      <div className="relative">
        <div
          className="overflow-x-auto border border-[var(--border-ed)] bg-[var(--paper)] p-2"
          onScroll={(e) => {
            if (!scrolled && e.currentTarget.scrollLeft > 0) setScrolled(true)
          }}
        >
          <svg
            viewBox={`0 0 ${model.width} ${model.height}`}
            className="block h-auto w-full min-w-[1100px]"
            aria-label="ERD van de TriFinity-database"
          >
            <defs>
              <marker id="db-arrow" markerWidth="11" markerHeight="11" refX="8" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8" fill="none" stroke="#8a857c" strokeWidth="1.3" />
              </marker>
            </defs>

            {/* kolom-koppen */}
            {model.columns.map((c, i) => (
              <g key={c.domain} aria-hidden="true">
                <rect x={c.x} y={c.y} width={c.w} height={20} fill={domainColor(i)} opacity={0.12} />
                <rect x={c.x} y={c.y} width={3} height={20} fill={domainColor(i)} />
                <text x={c.x + 8} y={c.y + 14} fontSize={10.5} fontWeight={700} fill="var(--ink-2)">
                  {c.domain}
                </text>
              </g>
            ))}

            {/* edges */}
            <g>
              {model.edges.map((e) => {
                const from = byName.get(e.from)
                const to = byName.get(e.to)
                if (!from || !to) return null
                const active = selected && (e.from === selected || e.to === selected)
                const dim = selected && !active
                return (
                  <path
                    key={e.id}
                    d={edgePath(from, to)}
                    fill="none"
                    stroke={active ? 'var(--ink)' : '#b8b2a6'}
                    strokeWidth={active ? 1.8 : 1}
                    markerEnd="url(#db-arrow)"
                    opacity={dim ? 0.08 : 1}
                    className="pointer-events-none transition-opacity"
                  />
                )
              })}
            </g>

            {/* tabellen */}
            <g>
              {model.tables.map((t) => {
                const di = domainIndex.get(t.domain) ?? 0
                const col = domainColor(di)
                const isSel = selected === t.name
                return (
                  <g
                    key={t.name}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSel}
                    aria-label={`Tabel ${t.name}`}
                    opacity={tableOpacity(t.name)}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      setSelected(t.name)
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault()
                        setSelected(t.name)
                      }
                    }}
                    className="cursor-pointer outline-none transition-opacity [&:focus-visible>rect]:stroke-[var(--ink)]"
                  >
                    <rect
                      x={t.x}
                      y={t.y}
                      width={t.w}
                      height={t.h}
                      fill="var(--paper)"
                      stroke={isSel ? 'var(--ink)' : 'var(--border-md)'}
                      strokeWidth={isSel ? 2.2 : 1}
                    />
                    <rect x={t.x} y={t.y} width={3} height={t.h} fill={col} />
                    <text x={t.x + 10} y={t.y + 19} fontSize={11} fontWeight={600} fill="var(--ink)" className="pointer-events-none">
                      {t.name.length > 20 ? t.name.slice(0, 19) + '…' : t.name}
                    </text>
                    {/* badges rechts */}
                    <g className="pointer-events-none" transform={`translate(${t.x + t.w - 11},${t.y + t.h / 2})`}>
                      {t.rls && <circle cx={0} cy={0} r={2.4} fill="var(--ink-3)" />}
                      {t.household && <circle cx={-8} cy={0} r={2.4} fill="var(--color-horizon-500)" />}
                    </g>
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-3.5 top-3.5 border border-[var(--rule-soft)] bg-[var(--paper)] px-1.5 py-px font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--ink-3)] transition-opacity duration-200 ${scrolled ? 'opacity-0' : 'opacity-100'}`}
        >
          sleep →
        </span>
      </div>

      {/* detail */}
      {selTable && rels ? (
        <div aria-live="polite" className="border border-[var(--ink)] bg-[var(--paper)]">
          <div className="relative border-b border-[var(--border-ed)] px-5 py-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">{selTable.domain}</span>
            <h3 className="mt-1 font-mono text-lg font-bold text-[var(--ink)]">{selTable.name}</h3>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-2)]">
              {selTable.user && (
                <span className="inline-flex items-center gap-1">
                  <KeyRound className="h-3 w-3" aria-hidden="true" /> gebruiker-eigendom
                </span>
              )}
              {selTable.household && (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" aria-hidden="true" /> huishouden-deelbaar
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3 w-3" aria-hidden="true" /> {selTable.rls ? 'RLS actief' : 'geen RLS'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Selectie wissen"
              className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid gap-5 px-5 py-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                Verwijst naar ({rels.out.length})
              </h4>
              {rels.out.length === 0 ? (
                <p className="font-serif italic text-xs text-[var(--ink-3)]">Geen uitgaande foreign keys.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {rels.out.map((r) => (
                    <button
                      key={`${r.table}-${r.column}`}
                      type="button"
                      onClick={() => setSelected(r.table)}
                      className="flex items-center justify-between gap-2 border border-[var(--border-ed)] px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-[var(--subtle)]"
                    >
                      <span className="font-mono text-[var(--ink)]">{r.table}</span>
                      <span className="font-mono text-[10px] text-[var(--ink-4)]">.{r.column}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                Verwezen door ({rels.in.length})
              </h4>
              {rels.in.length === 0 ? (
                <p className="font-serif italic text-xs text-[var(--ink-3)]">Geen inkomende foreign keys.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {rels.in.map((r) => (
                    <button
                      key={`${r.table}-${r.column}`}
                      type="button"
                      onClick={() => setSelected(r.table)}
                      className="flex items-center justify-between gap-2 border border-[var(--border-ed)] px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-[var(--subtle)]"
                    >
                      <span className="font-mono text-[var(--ink)]">{r.table}</span>
                      <span className="font-mono text-[10px] text-[var(--ink-4)]">.{r.column}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {apiTouch.length > 0 && (
            <div className="border-t border-[var(--border-ed)] px-5 py-4">
              <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                Geraakt door API-domeinen ({apiTouch.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {apiTouch.map((w) => (
                  <span
                    key={w.domain}
                    className={`border px-2 py-0.5 font-mono text-[11px] ${
                      w.write
                        ? 'border-[var(--negative)]/40 bg-[var(--negative)]/8 text-[var(--ink)]'
                        : 'border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-2)]'
                    }`}
                  >
                    {w.label}
                    {w.write && <span className="ml-1 text-[var(--negative)]">✎</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="border border-[var(--border-ed)] bg-[var(--paper)] px-5 py-8 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">Tabel-detail</p>
          <p className="mt-2 font-serif italic text-sm text-[var(--ink-3)]">
            Klik een tabel in de ERD — relaties en toegang verschijnen hier.
          </p>
        </div>
      )}
    </div>
  )
}
