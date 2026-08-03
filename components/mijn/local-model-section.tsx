'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Download,
  Trash2,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  MessageSquare,
  ArrowRight,
} from 'lucide-react'
import { Kicker } from '@/components/editorial'
import { LOCAL_MODEL_DOWNLOAD_GB, type LocalModelProgress } from '@/lib/ai/local/model-manager'

/**
 * LocalModelSection — het beheer van het lokale model op /mijn/privacy.
 *
 * Geschiktheidscheck, de eenmalige download met consent (~2,0 GB), de
 * voortgangsbalk, de eerlijke `navigator.storage.persisted`-melding en het
 * beheer-blok (verwijderen / opnieuw downloaden). Gedrag is ongewijzigd
 * overgenomen uit de vorige monoliet; alleen de weergave is hier losgeknipt.
 *
 * PRESENTATIONEEL: de toestandsmachine (capability → consent → download → beheer)
 * blijft bij de container, omdat de hoofdschakelaar hem aanstuurt. Wat hier lokaal
 * leeft is uitsluitend de verwijder-bevestiging — pure UI-state zonder gevolgen
 * buiten dit blok.
 *
 * DESIGN: bewust INLINE disclosure (geen sheet/modal) — de voortgangsbalk moet
 * zichtbaar blijven tijdens een download van meerdere minuten, en dat past niet in
 * een overlay die open moet blijven.
 */

export type LocalModelPhase = 'loading' | 'idle' | 'checking' | 'consent' | 'downloading' | 'error'

/** Voortgang → percentage 0..100 (het contract levert bytes, geen percent). */
export function progressPercent(p: LocalModelProgress | null): number {
  if (!p || !p.totalBytes) return 0
  return Math.min(100, Math.max(0, (p.loadedBytes / p.totalBytes) * 100))
}

function formatGb(bytes: number): string {
  return (bytes / 1e9).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** "2,0" i.p.v. "2" — NL-notatie, zodat de download-omvang niet groter of kleiner oogt dan hij is. */
const DOWNLOAD_GB_LABEL = LOCAL_MODEL_DOWNLOAD_GB.toLocaleString('nl-NL', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function LocalModelSection({
  phase,
  capabilityReasons,
  progress,
  errorMsg,
  modelReady,
  privacyMode,
  aiEnabled,
  hasAiTier,
  likelyMobile,
  storagePersisted,
  onConsentConfirm,
  onConsentCancel,
  onRetry,
  onRedownload,
  onDelete,
}: {
  phase: LocalModelPhase
  capabilityReasons: string[] | null
  progress: LocalModelProgress | null
  errorMsg: string | null
  modelReady: boolean
  privacyMode: boolean
  aiEnabled: boolean
  hasAiTier: boolean
  likelyMobile: boolean
  /** null = onbekend/niet-ondersteund → niets tonen (geen loze bewering). */
  storagePersisted: boolean | null
  onConsentConfirm: () => void
  onConsentCancel: () => void
  onRetry: () => void
  onRedownload: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const showBeheer = phase === 'idle' && modelReady
  const showPending = phase === 'idle' && privacyMode && !modelReady
  // Eerlijke verlopen-staat: lokaal staat aan terwijl het abonnement weg is.
  const subscriptionExpired = privacyMode && !hasAiTier

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Kicker>Het lokale model</Kicker>
        <p className="text-sm leading-relaxed text-[var(--ink-2)]">
          Om lokaal te kunnen draaien staat er eenmalig een taalmodel van ongeveer {DOWNLOAD_GB_LABEL} GB in
          je browser. Die download bevat alleen het model — er gaat geen enkel gegeven van jou de andere
          kant op.
        </p>
      </div>

      {/* ── Capability-check gefaald ── */}
      {capabilityReasons && capabilityReasons.length > 0 && (
        <div className="border border-warning/40 bg-warning-bg p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-[var(--ink)]">Dit toestel is (nog) niet geschikt</h4>
          </div>
          <ul className="space-y-1.5 text-sm text-[var(--ink-2)]">
            {capabilityReasons.map((reason) => (
              <li key={reason} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-[var(--ink-3)]">
            Er is geen download gestart. Je blijft Cloud-AI gebruiken.
          </p>
        </div>
      )}

      {/* ── Consent-stap ── */}
      {phase === 'consent' && (
        <div className="space-y-3 border border-[var(--border-ed)] p-4">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 shrink-0 text-wil-600" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-[var(--ink)]">Eenmalige download</h4>
          </div>
          <ul className="space-y-1.5 text-sm text-[var(--ink-2)]">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
              <span>
                Ongeveer <strong>{DOWNLOAD_GB_LABEL} GB</strong> eenmalige download — wifi aanbevolen.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
              <span>Daarna werkt het offline, direct op je toestel.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
              <span>
                Je data verlaat je apparaat niet — de download bevat alleen het model, geen gegevens.
              </span>
            </li>
          </ul>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onConsentConfirm}
              className="inline-flex min-h-11 items-center gap-2 bg-[var(--ink)] px-5 py-2 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download &amp; zet aan
            </button>
            <button
              type="button"
              onClick={onConsentCancel}
              className="text-sm font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
            >
              Annuleren
            </button>
          </div>
        </div>
      )}

      {/* ── Download bezig ── */}
      {phase === 'downloading' && (
        <div className="space-y-3 border border-[var(--border-ed)] p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-wil-600" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-[var(--ink)]">Model downloaden…</h4>
          </div>
          <div
            className="h-2 w-full overflow-hidden bg-[var(--subtle)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress ? Math.round(progressPercent(progress)) : 0}
            aria-label="Download-voortgang"
          >
            <div
              className="h-full bg-wil-500 transition-[width] duration-300"
              style={{ width: `${progressPercent(progress)}%` }}
            />
          </div>
          <p className="text-xs tabular-nums text-[var(--ink-3)]">
            {progress
              ? `${formatGb(progress.loadedBytes)} / ${formatGb(progress.totalBytes ?? 0)} GB · ${Math.round(progressPercent(progress))}%`
              : 'Voorbereiden…'}
          </p>
          <p className="text-xs leading-relaxed text-[var(--ink-4)]">
            Je kunt dit tabblad open laten. Sluit je het tussentijds, dan hervat je de download later vanaf
            deze pagina.
          </p>
        </div>
      )}

      {/* ── Download-fout ── */}
      {phase === 'error' && errorMsg && (
        <div className="space-y-3 border border-negative/30 bg-negative/5 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-[var(--ink-2)]">{errorMsg}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center gap-2 border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Opnieuw proberen
          </button>
        </div>
      )}

      {/* ── In afwachting: lokaal aan, model ontbreekt ── */}
      {showPending && (
        <div className="space-y-3 border border-warning/40 bg-warning-bg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-[var(--ink)]">In afwachting — download vereist</h4>
          </div>
          <p className="text-sm leading-relaxed text-[var(--ink-2)]">
            Je hebt lokaal draaien aangezet, maar het model staat niet (meer) op dit toestel. Zolang het
            ontbreekt worden de betrokken functies geblokkeerd — er wordt bewust niet stilletjes op de cloud
            teruggevallen.
          </p>
          <button
            type="button"
            onClick={onRedownload}
            disabled={likelyMobile}
            className="inline-flex min-h-11 items-center gap-2 bg-[var(--ink)] px-5 py-2 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Model downloaden (~{DOWNLOAD_GB_LABEL} GB)
          </button>
        </div>
      )}

      {/* ── Beheer-blok: model staat klaar ── */}
      {showBeheer && (
        <div className="space-y-4 border border-[var(--border-ed)] p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-positive" aria-hidden="true" />
            <div>
              <h4 className="text-sm font-semibold text-[var(--ink)]">Model staat klaar op dit toestel</h4>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">
                Ongeveer {DOWNLOAD_GB_LABEL} GB, opgeslagen in deze browser.{' '}
                {privacyMode
                  ? 'Lokaal draaien staat aan.'
                  : 'Lokaal draaien staat uit — het model blijft bewaard voor later.'}
              </p>
              {/* Eerlijke verlopen-staat: geen alarm, wel transparant over het
                  gevolg van uitzetten zonder abonnement. */}
              {subscriptionExpired && (
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-3)]">
                  Je AI-abonnement is verlopen — lokaal draaien blijft werken, maar zet je &apos;m uit dan
                  kun je &apos;m zonder abonnement niet opnieuw aanzetten.
                </p>
              )}
              {/* Opslagbescherming: null → niets tonen (geen loze bewering). */}
              {storagePersisted === true && (
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-3)]">
                  Je browser beschermt deze opslag — het model blijft bewaard.
                </p>
              )}
              {storagePersisted === false && (
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-3)]">
                  Let op: je browser beschermt deze opslag niet. Bij ruimtegebrek kan het model verwijderd
                  worden; download dan opnieuw via deze pagina.
                </p>
              )}
            </div>
          </div>

          {confirmDelete ? (
            <div className="space-y-3 border border-negative/30 bg-negative/5 p-3">
              <p className="text-sm leading-relaxed text-[var(--ink-2)]">
                Weet je zeker dat je het lokale model verwijdert? Lokaal draaien gaat dan uit en je moet het
                model opnieuw downloaden om het weer te gebruiken.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(false)
                    onDelete()
                  }}
                  className="inline-flex min-h-11 items-center gap-2 bg-negative px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Ja, verwijder het model
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-sm font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
                >
                  Annuleren
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex min-h-11 items-center gap-2 border border-negative/30 px-4 py-2 text-sm font-medium text-negative transition-colors hover:bg-negative/5"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Model verwijderen
              </button>
              <button
                type="button"
                onClick={onRedownload}
                disabled={likelyMobile}
                className="inline-flex min-h-11 items-center gap-2 border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Opnieuw downloaden
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Bescheiden ingang naar de lokale chat (experimenteel) ── */}
      {/* Alleen tonen als lokale AI hier bruikbaar is: AI aan, tier aanwezig en op
          een desktop. De chatpagina her-checkt capability + model zelf. */}
      {phase === 'idle' && aiEnabled && hasAiTier && !likelyMobile && (
        <Link
          href="/mijn/lokale-chat"
          className="flex items-center justify-between gap-3 border border-[var(--border-ed)] bg-[var(--paper)] p-4 transition-colors hover:bg-[var(--subtle)]"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center bg-wil-50">
              <MessageSquare className="h-4 w-4 text-wil-600" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-semibold text-[var(--ink)]">Probeer de lokale chat</h4>
                <span className="inline-flex items-center border border-warning/40 bg-warning-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                  Experimenteel
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">
                Praat met Fin volledig op dit apparaat — je financiële gegevens verlaten je toestel niet.
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
