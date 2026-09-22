'use client'

import { useState } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import type { DuidingWeergaveUitkomst, ParamWeergave } from '@/lib/krant/duiding-beheer'
import { TERUGTREK_REDEN_LABEL, TOELICHTING_MAX_TEKENS } from '@/lib/krant/duiding-beheer'
import { TERUGTREK_REDENEN, type TerugtrekReden } from '@/lib/krant/duiding-schema'

/**
 * De duiding van één artikel op `/beheer/nieuws` (1A fase 2, ADR 0171): status,
 * mechanisme met per param het grond-citaat ernaast, doelgroep, samenvatting,
 * en de twee beheeracties — terugtrekken (alleen 'geduid', B4) en opnieuw laten
 * duiden (alleen 'afgewezen'/'mislukt').
 *
 * Alle tekst is modeluitvoer of brontekst en wordt als platte React-tekst
 * gerenderd (geen HTML-injectie, geen markdown). De params komen
 * als waarde + eenheid uit de catalogus; ze worden hier niet omgerekend.
 */

export interface DuidingVelden {
  duiding_status: string
  duiding_versie: number | null
  duiding_fout: string | null
  geduid_at: string | null
  teruggetrokken_at: string | null
  teruggetrokken_reden: string | null
  duiding: DuidingWeergaveUitkomst | null
}

export const DUIDING_STATUS_LABEL: Record<string, string> = {
  wacht: 'Wacht',
  geduid: 'Geduid',
  afgewezen: 'Afgewezen',
  mislukt: 'Mislukt',
  teruggetrokken: 'Teruggetrokken',
}

/** Stoplicht-semantiek, nooit een module-accent. */
export function statusKleur(status: string): string {
  switch (status) {
    case 'geduid':
      return 'text-[var(--positive)]'
    case 'afgewezen':
    case 'teruggetrokken':
      return 'text-[var(--negative)]'
    case 'mislukt':
      return 'text-[var(--warning)]'
    default:
      return 'text-[var(--ink-4)]'
  }
}

const datumFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
})
function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : datumFmt.format(d)
}

function paramWaarde(p: ParamWeergave): string {
  if (p.waarde === null) return '—'
  if (typeof p.waarde !== 'number') return String(p.waarde)
  const getal = p.waarde.toLocaleString('nl-NL', { maximumFractionDigits: 2 })
  if (p.eenheid === 'eur') return `€ ${getal}`
  if (p.eenheid === 'pct') return `${getal}%`
  return getal
}

interface Props {
  articleId: string
  titel: string
  velden: DuidingVelden
  /**
   * Na een actie: de melding, en bij succes de nieuwe veldwaarden zodat de
   * pagina de rij ter plekke bijwerkt (geen herlading naar pagina 0).
   */
  onGewijzigd: (melding: { type: 'success' | 'error'; message: string }, wijziging?: Partial<DuidingVelden>) => void
}

export function NewsDuidingDetail({ articleId, titel, velden, onGewijzigd }: Props) {
  const [terugtrekOpen, setTerugtrekOpen] = useState(false)
  const [reden, setReden] = useState<TerugtrekReden>('fout-getal')
  const [toelichting, setToelichting] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const status = velden.duiding_status
  const weergave = velden.duiding?.ok ? velden.duiding.duiding : null

  async function post(pad: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
    const res = await fetch(pad, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { ok: res.ok, data }
  }

  async function bevestigTerugtrekken() {
    setBezig(true)
    setFout(null)
    try {
      const { ok, data } = await post('/api/admin/news-duiding/terugtrekken', {
        id: articleId,
        reden,
        ...(toelichting.trim() ? { toelichting: toelichting.trim() } : {}),
      })
      if (!ok) {
        setFout(typeof data?.error === 'string' ? data.error : 'Terugtrekken mislukt')
        return
      }
      setTerugtrekOpen(false)
      setToelichting('')
      const edities = typeof data?.edities === 'number' ? data.edities : null
      const wijziging: Partial<DuidingVelden> = data?.alTeruggetrokken
        ? { duiding_status: 'teruggetrokken' }
        : { duiding_status: 'teruggetrokken', teruggetrokken_at: new Date().toISOString(), teruggetrokken_reden: reden }
      onGewijzigd(
        data?.alTeruggetrokken
          ? { type: 'success', message: 'Deze duiding was al teruggetrokken.' }
          : data?.herberekeningMislukt
            ? { type: 'error', message: 'Duiding teruggetrokken, maar het herberekenen van de edities mislukte. Trek hem nog eens terug om de herberekening te herhalen.' }
            : {
                type: 'success',
                message:
                  edities && edities > 0
                    ? `Duiding teruggetrokken; ${edities} editie${edities === 1 ? '' : 's'} van deze week opnieuw berekend.`
                    : 'Duiding teruggetrokken; er stond deze week geen editie op dit artikel.',
              },
        wijziging,
      )
    } catch {
      setFout('Terugtrekken mislukt')
    } finally {
      setBezig(false)
    }
  }

  async function opnieuwDuiden() {
    setBezig(true)
    try {
      const { ok, data } = await post('/api/admin/news-duiding/opnieuw', { id: articleId })
      if (ok) {
        onGewijzigd(
          { type: 'success', message: 'Terug in de wachtrij; de volgende ingest-run duidt het artikel opnieuw.' },
          { duiding_status: 'wacht', duiding: null, duiding_fout: null, duiding_versie: null, geduid_at: null },
        )
      } else {
        onGewijzigd({ type: 'error', message: typeof data?.error === 'string' ? data.error : 'Opnieuw duiden mislukt' })
      }
    } catch {
      onGewijzigd({ type: 'error', message: 'Opnieuw duiden mislukt' })
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="space-y-3 border-t border-[var(--border-ed)] pt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-medium text-[var(--ink-3)]">Duiding</span>
        <span className={`font-medium ${statusKleur(status)}`}>{DUIDING_STATUS_LABEL[status] ?? status}</span>
        {velden.duiding_versie !== null && <span className="text-[var(--ink-4)]">versie {velden.duiding_versie}</span>}
        {velden.geduid_at && <span className="text-[var(--ink-4)]">{fmt(velden.geduid_at)}</span>}
        {velden.duiding_fout && (
          <span className="font-mono text-[var(--ink-3)]">
            {status === 'geduid' ? 'mechanisme vervallen: ' : 'code: '}
            {velden.duiding_fout}
          </span>
        )}
      </div>

      {status === 'teruggetrokken' && (
        <p className="text-xs text-[var(--negative)]">
          Teruggetrokken op {fmt(velden.teruggetrokken_at)} — reden:{' '}
          {velden.teruggetrokken_reden && velden.teruggetrokken_reden in TERUGTREK_REDEN_LABEL
            ? TERUGTREK_REDEN_LABEL[velden.teruggetrokken_reden as TerugtrekReden]
            : '—'}
        </p>
      )}

      {velden.duiding && !velden.duiding.ok && (
        <p className="text-xs text-[var(--negative)]">De opgeslagen duiding voldoet niet aan het leescontract en wordt niet getoond.</p>
      )}

      {weergave && (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-[var(--ink-4)]">Soort</dt>
            <dd className="text-[var(--ink-2)]">{weergave.soort}</dd>
            <dt className="text-[var(--ink-4)]">Ingangsdatum</dt>
            <dd className="font-mono tabular-nums text-[var(--ink-2)]">{weergave.ingangsdatum ?? '—'}</dd>
            {weergave.deadline && (
              <>
                <dt className="text-[var(--ink-4)]">Deadline</dt>
                <dd className="font-mono tabular-nums text-[var(--ink-2)]">
                  {weergave.deadline.datum} ({weergave.deadline.soort})
                </dd>
              </>
            )}
            <dt className="text-[var(--ink-4)]">Doelgroep</dt>
            <dd className="text-[var(--ink-2)]">
              {weergave.doelgroep.length === 0
                ? 'algemeen'
                : weergave.doelgroep.map((r) => `${r.veld} ${r.op} ${r.waarden.join(' / ')}`).join(' · ')}
            </dd>
            <dt className="text-[var(--ink-4)]">Brontekst</dt>
            <dd className="text-[var(--ink-2)]">
              {weergave.brontekst} ({weergave.tekens.toLocaleString('nl-NL')} tekens) · {weergave.model}
            </dd>
          </dl>

          <div>
            <span className="text-xs font-medium text-[var(--ink-3)]">Samenvatting (duiding)</span>
            <p className="mt-0.5 text-[var(--ink-2)]">{weergave.samenvatting}</p>
          </div>

          <div>
            <span className="text-xs font-medium text-[var(--ink-3)]">
              Mechanisme{weergave.mechanisme ? `: ${weergave.mechanisme.label}` : ''}
              {weergave.mechanisme?.rekent ? ' (rekent)' : ''}
            </span>
            {!weergave.mechanisme ? (
              <p className="mt-0.5 text-xs text-[var(--ink-4)]">Geen mechanisme — telt als &quot;zonder mechanisme&quot; in de meting.</p>
            ) : (
              <table className="mt-1 w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--ink-4)]">
                    <th className="py-1 pr-3 font-medium">Param</th>
                    <th className="py-1 pr-3 font-medium">Waarde</th>
                    <th className="py-1 font-medium">Grond (letterlijk uit de bron)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-ed)]">
                  {weergave.mechanisme.drempel && (
                    <tr>
                      <td className="py-1 pr-3 font-mono text-[var(--ink-3)]">drempel</td>
                      <td className="py-1 pr-3 font-mono text-[var(--ink-2)]">{weergave.mechanisme.drempel}</td>
                      <td className="py-1 text-[var(--ink-4)]">bij naam — waarde uit de code, niet uit de bron</td>
                    </tr>
                  )}
                  {weergave.mechanisme.params.map((p) => (
                    <tr key={p.naam}>
                      <td className="py-1 pr-3 font-mono text-[var(--ink-3)]">{p.naam}</td>
                      <td className="py-1 pr-3 font-mono tabular-nums text-[var(--ink-2)]">{paramWaarde(p)}</td>
                      <td className="py-1 text-[var(--ink-2)]">{p.citaat ? <q>{p.citaat}</q> : <span className="text-[var(--ink-4)]">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {(status === 'geduid' || status === 'afgewezen' || status === 'mislukt') && (
        <div className="flex flex-wrap gap-2 pt-1">
          {status === 'geduid' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setFout(null)
                setTerugtrekOpen(true)
              }}
              className="inline-flex min-h-[44px] items-center border border-[var(--negative)] px-4 py-2 text-sm font-medium text-[var(--negative)] transition-colors hover:bg-[var(--subtle)]"
            >
              Terugtrekken
            </button>
          )}
          {(status === 'afgewezen' || status === 'mislukt') && (
            <button
              type="button"
              disabled={bezig}
              onClick={(e) => {
                e.stopPropagation()
                void opnieuwDuiden()
              }}
              className="inline-flex min-h-[44px] items-center border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-40"
            >
              {bezig ? 'Bezig…' : 'Opnieuw duiden'}
            </button>
          )}
        </div>
      )}

      <ShellOverlay
        kind="confirm"
        destructive
        open={terugtrekOpen}
        onClose={() => setTerugtrekOpen(false)}
        // Tijdens de aanvraag niet te sluiten: anders landt een fout (409/500) in
        // een al gesloten venster en hoort beheer nooit dat het mislukte (B4).
        onRequestClose={() => !bezig}
        title="Duiding terugtrekken?"
        footer={
          <ModalFooter
            layout="stacked"
            primary={{
              label: 'Terugtrekken',
              onClick: () => void bevestigTerugtrekken(),
              loading: bezig,
              disabled: reden === 'anders' && !toelichting.trim(),
            }}
            secondary={{ label: 'Annuleren', onClick: () => setTerugtrekOpen(false), disabled: bezig }}
          />
        }
      >
        <div className="space-y-3 p-6 text-sm text-[var(--ink-2)]">
          {fout && (
            <p role="alert" className="border border-[var(--negative)] px-3 py-2 text-xs text-[var(--negative)]">
              {fout}
            </p>
          )}
          <p>
            Je trekt de duiding van <span className="font-semibold text-[var(--ink)]">{titel}</span> terug. Het artikel telt
            daarna niet meer mee voor een editie; de edities van deze week waarin het stond, worden opnieuw berekend. Dit
            kun je niet met een knop terugdraaien.
          </p>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-xs font-medium text-[var(--ink-3)]">Reden</legend>
            {TERUGTREK_REDENEN.map((r) => (
              <label key={r} className="flex min-h-[32px] items-center gap-2">
                <input type="radio" name="terugtrek-reden" value={r} checked={reden === r} onChange={() => setReden(r)} />
                {TERUGTREK_REDEN_LABEL[r]}
              </label>
            ))}
          </fieldset>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--ink-3)]">
              Toelichting {reden === 'anders' ? '(verplicht)' : '(optioneel)'}
            </span>
            <textarea
              value={toelichting}
              maxLength={TOELICHTING_MAX_TEKENS}
              onChange={(e) => setToelichting(e.target.value)}
              rows={2}
              className="w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-3)] focus:outline-none"
            />
          </label>
        </div>
      </ShellOverlay>
    </div>
  )
}
