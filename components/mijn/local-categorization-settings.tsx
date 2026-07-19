'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Cpu,
  Download,
  Trash2,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  MonitorSmartphone,
} from 'lucide-react'
import { hasSubscription } from '@/lib/feature-registry'
import { AiSubscriptionUpsell } from '@/components/app/ai-subscription-upsell'
import { checkLocalAiCapability, type LocalAiCapability } from '@/lib/ai/local/webgpu-capability'
import {
  getLocalModelState,
  downloadLocalModel,
  deleteLocalModel,
  LOCAL_MODEL_DOWNLOAD_GB,
  type LocalModelState,
  type LocalModelProgress,
} from '@/lib/ai/local/model-manager'

/**
 * LocalCategorizationSettings — de opt-in toggle + download/consent-flow voor
 * lokale transactie-categorisatie op `/mijn/privacy` (ADR 0043, fase 2, FR-2.x).
 *
 * Scope A, desktop-only, assistief: bij `privacy_mode=true` categoriseert
 * TriFinity transacties volledig op het eigen toestel (WebGPU/Gemma) — de
 * transactietekst verlaat de browser niet. Andere AI-functies (chat, briefing)
 * blijven cloud. Elk voorstel loopt nog steeds via de bestaande review-UI; hier
 * regelen we alleen de voorkeur + het model-beheer, niet de categorisatie zelf.
 *
 * Flow: toggle aan → capability-check (checkLocalAiCapability) → bij ok een
 * consent-stap (eenmalige download) → download met voortgang → POST
 * privacy_mode=true. Uit → POST false (model blijft lokaal staan). Beheer-blok
 * met verwijderen / opnieuw downloaden zodra het model klaar staat.
 *
 * DESIGN: bewust INLINE disclosure (geen aparte BottomSheet) — de hele
 * capability→consent→download→beheer-toestandsmachine hoort visueel bij de
 * toggle en de voortgangsbalk moet zichtbaar blijven tijdens een meerdere-
 * minuten-download; dat past niet in een modal die open moet blijven. Sluit aan
 * bij de bestaande inline transparantie-blokken van AiPrivacySettings.
 *
 * SINGLE SOURCE / SECURITY: schrijven van `privacy_mode` gaat via de own-row
 * POST-route (/api/privacy-mode); lezen van ai_enabled + privacy_mode +
 * active_subscriptions gebeurt op mount via één supabase-select (spiegelt
 * AiPrivacySettings, geen flash). De lokale-AI-primitieven komen uit lib/ai/local
 * (parallel gebouwd tegen het gedeelde contract).
 *
 * TIER-GATE (eigenaarsbesluit 17 jul 2026, requirements §5 optie 2): AANzetten
 * vereist het 'ai'-abonnement. De server-route (/api/privacy-mode) is de
 * autoritatieve laag; deze UI spiegelt hem alleen (voorkomt een 403-verrassing)
 * en toont bij aanzet-poging zonder tier de gedeelde `AiSubscriptionUpsell`
 * (single source voor prijs/tagline uit lib/subscription-catalog.ts). UITzetten
 * blijft altijd vrij; staat privé-modus al aan terwijl de tier verliep, dan meldt
 * het beheer-blok dat eerlijk (uitzetten kan niet meer ongedaan zonder abonnement).
 *
 * A11Y: elk reden-blok (AI uit / tier / mobiel) heeft een id; de toggle-button
 * verwijst via `aria-describedby` naar het momenteel zichtbare blok, zodat de
 * disabled-reden ook voor screenreaders aan de schakelaar hangt.
 */

type Phase = 'loading' | 'idle' | 'checking' | 'consent' | 'downloading' | 'error'

/**
 * Gecentraliseerde toegang tot "is het model bruikbaar?". Afgestemd op het
 * bindende fase-3-contract (lib/ai/local/model-manager): getLocalModelState()
 * levert `{ state, bytes }` met `state: LocalModelState` = 'klaar' zodra het
 * model klaarstaat. (Fase-2 nam eerder een `.status === 'ready'`-vorm aan; door
 * de reconciliatie hier — en nergens anders — klopt de integratie met het
 * daadwerkelijke contract.)
 */
function isModelReady(model: { state: LocalModelState; bytes: number | null }): boolean {
  return model.state === 'klaar'
}

/** Voortgang → percentage 0..100 (het contract levert bytes, geen percent). */
function progressPercent(p: LocalModelProgress | null): number {
  if (!p || !p.totalBytes) return 0
  return Math.min(100, Math.max(0, (p.loadedBytes / p.totalBytes) * 100))
}

async function writePrivacyMode(enabled: boolean): Promise<boolean> {
  try {
    const res = await fetch('/api/privacy-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    return res.ok
  } catch {
    return false
  }
}

function formatGb(bytes: number): string {
  return (bytes / 1e9).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/**
 * Best-effort: beschermt de browser deze origin-opslag tegen automatische
 * eviction (navigator.storage.persisted)? `null` = onbekend/niet-ondersteund —
 * dan tonen we niets (geen loze bewering). De ~3,2 GB shards overleven eviction
 * alleen als dit true is; false is een eerlijke waarschuwing waard.
 */
async function readStoragePersisted(): Promise<boolean | null> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
      return await navigator.storage.persisted()
    }
  } catch {
    /* best-effort — bij een fout weten we het niet */
  }
  return null
}

export function LocalCategorizationSettings() {
  // Stabiele client-ref: zonder memo is `supabase` bij elke render een nieuw
  // object → de mount-useEffect (dep [supabase]) draait telkens opnieuw en zet
  // aan het eind setPhase('idle'), wat een net door de toggle gezette 'consent'/
  // 'checking'-fase overschrijft. useMemo houdt de ref stabiel (mount draait één
  // keer). (Reconciliatie-fix; zie rapport fase 3.)
  const supabase = useMemo(() => createClient(), [])

  const [phase, setPhase] = useState<Phase>('loading')
  const [aiEnabled, setAiEnabled] = useState(true)
  // Default `true` (net als aiEnabled) → voorkomt een flash-of-upsell tijdens de
  // mount-load. De werkelijke tier komt uit de select hieronder.
  const [hasAiTier, setHasAiTier] = useState(true)
  const [privacyMode, setPrivacyMode] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const [capabilityReasons, setCapabilityReasons] = useState<string[] | null>(null)
  const [progress, setProgress] = useState<LocalModelProgress | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [likelyMobile, setLikelyMobile] = useState(false)
  // Opslagbescherming (navigator.storage.persisted): null = onbekend → niets
  // tonen; true/false → een geruststellende resp. waarschuwende regel in het
  // beheer-blok. Gelezen op mount én opnieuw na een geslaagde download (persist()
  // kan 'm net hebben aangezet).
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null)

  // Proactieve desktop-only hint: op een coarse-pointer-toestel (mobiel/tablet)
  // faalt de capability-check toch — laat de toggle daar vriendelijk uit staan
  // i.p.v. de gebruiker eerst een download-poging te laten doen.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false
      setLikelyMobile(Boolean(coarse))
    } catch {
      setLikelyMobile(false)
    }
  }, [])

  // Mount-load: ai_enabled + privacy_mode via één supabase-select, en of het
  // model al lokaal aanwezig is via getLocalModelState().
  useEffect(() => {
    let active = true
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        if (active) setPhase('idle')
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('ai_enabled, privacy_mode, active_subscriptions')
        .eq('id', user.id)
        .single()

      let ready = false
      try {
        const state = await getLocalModelState()
        ready = isModelReady(state)
      } catch {
        ready = false
      }

      // Best-effort opslagbescherming (guarded in readStoragePersisted zelf).
      const persisted = await readStoragePersisted()

      if (!active) return
      if (data?.ai_enabled != null) setAiEnabled(data.ai_enabled as boolean)
      setPrivacyMode(Boolean(data?.privacy_mode))
      // Tier-afleiding via de canonieke helper — geen eigen array-includes.
      const subs = (data?.active_subscriptions as string[]) ?? []
      setHasAiTier(hasSubscription(subs, 'ai'))
      setModelReady(ready)
      setStoragePersisted(persisted)
      setPhase('idle')
    })()
    return () => {
      active = false
    }
  }, [supabase])

  const busy = phase === 'checking' || phase === 'downloading'

  const runDownload = useCallback(async (setPrivacyAfter: boolean) => {
    setErrorMsg(null)
    setCapabilityReasons(null)
    setProgress(null)
    setPhase('downloading')
    try {
      await downloadLocalModel((p: LocalModelProgress) => setProgress(p))
      // Verklein het risico op storage-eviction door de browser.
      try {
        await navigator.storage?.persist?.()
      } catch {
        /* best effort */
      }
      setModelReady(true)
      // Herlees de bescherming: persist() hierboven kan 'm net hebben aangezet.
      setStoragePersisted(await readStoragePersisted())
      if (setPrivacyAfter) {
        const ok = await writePrivacyMode(true)
        if (ok) setPrivacyMode(true)
      }
      setPhase('idle')
    } catch {
      // Eerlijke melding, geen retry-loop — de gebruiker start zelf opnieuw.
      setErrorMsg(
        'De download is niet gelukt. Controleer je verbinding en probeer het opnieuw. Er is niets naar onze servers gestuurd.',
      )
      setPhase('error')
    }
  }, [])

  const onToggle = useCallback(async () => {
    // Spiegelt `toggleDisabled`: AANzetten (privacyMode=false) vereist tier +
    // desktop; UITzetten (privacyMode=true) blijft altijd toegestaan zolang AI aan
    // staat en er niets bezig is — zo raakt niemand opgesloten in privé-modus als
    // de tier of het toestel wegvalt (zelfde niemand-opgesloten-principe).
    if (!aiEnabled || busy || (!privacyMode && (likelyMobile || !hasAiTier))) return

    // Uitzetten: model blijft lokaal staan, alleen de voorkeur gaat uit.
    if (privacyMode) {
      setPrivacyMode(false) // optimistisch
      const ok = await writePrivacyMode(false)
      if (!ok) setPrivacyMode(true) // rollback bij schrijffout
      return
    }

    // Aanzetten: eerst capability-check, vóór er iets gedownload wordt.
    setCapabilityReasons(null)
    setErrorMsg(null)
    setPhase('checking')
    const cap: LocalAiCapability = await checkLocalAiCapability()
    if (!cap.ok) {
      setCapabilityReasons(cap.reasons)
      setPhase('idle')
      return
    }
    // Model staat er al → direct aanzetten zonder opnieuw te downloaden.
    if (modelReady) {
      const ok = await writePrivacyMode(true)
      if (ok) setPrivacyMode(true)
      setPhase('idle')
      return
    }
    setPhase('consent')
  }, [aiEnabled, likelyMobile, busy, privacyMode, modelReady, hasAiTier])

  const onDeleteModel = useCallback(async () => {
    try {
      await deleteLocalModel()
    } catch {
      /* zelfs bij een fout laten we de UI-status volgen: het model is niet meer bruikbaar */
    }
    setModelReady(false)
    const ok = await writePrivacyMode(false)
    if (ok) setPrivacyMode(false)
    setConfirmDelete(false)
    setProgress(null)
    setPhase('idle')
  }, [])

  // AANzetten (privacyMode=false) vereist het 'ai'-abonnement én een desktop;
  // UITzetten (privacyMode=true) mag altijd (ook op mobiel/zonder tier) — dit
  // versoepelt bewust het eerdere mobiel-gedrag voor uitzetten, zodat een verlopen
  // abonnement of coarse-pointer-toestel niemand in privé-modus opsluit.
  const toggleDisabled = !aiEnabled || busy || (!privacyMode && (likelyMobile || !hasAiTier))
  const showBeheer = phase === 'idle' && modelReady
  const showPending = phase === 'idle' && privacyMode && !modelReady

  // A11Y: koppel de op dit moment zichtbare reden-melding aan de toggle. De
  // takken spiegelen exact de render-condities van de drie reden-blokken (die
  // elkaar uitsluiten); geen zichtbaar blok → geen aria-describedby.
  const describedById = !aiEnabled
    ? 'lokale-cat-reden-ai-uit'
    : !hasAiTier && !privacyMode
      ? 'lokale-cat-reden-tier'
      : hasAiTier && likelyMobile
        ? 'lokale-cat-reden-mobiel'
        : undefined

  // Eerlijke verlopen-staat: privé-modus staat aan terwijl het abonnement weg is.
  const subscriptionExpired = privacyMode && !hasAiTier

  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6 pb-16">
      <section className="border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <div className="px-4 sm:px-6 py-6 space-y-6">
          {/* ── Kop + badge ── */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Lokale transactiecategorisatie
              </p>
              <span className="inline-flex items-center border border-amber-500/40 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">
                Experimenteel
              </span>
            </div>
            <p className="text-sm text-[var(--ink-2)] leading-relaxed">
              Als dit aanstaat, categoriseert TriFinity je transacties volledig op je eigen apparaat — de
              tekst van je transacties wordt nooit naar onze AI-server gestuurd voor categorisatie. Andere
              AI-functies (zoals chat en de briefing) gebruiken nog wel de cloud-AI.
            </p>
            <p className="text-xs text-[var(--ink-3)] leading-relaxed">
              Werkt alleen op desktop met een geschikte grafische kaart; voorstellen zijn behoudend en
              vragen altijd jouw controle.
            </p>
          </div>

          {/* ── Toggle-rij ── */}
          <div className="flex items-center justify-between border border-[var(--border-ed)] p-4">
            <div className="flex items-start gap-3 pr-4">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center bg-wil-50">
                <Cpu className="h-4 w-4 text-wil-600" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">Categoriseer transacties lokaal</h3>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                  {privacyMode
                    ? 'Je transactiedata verlaat je toestel niet bij het categoriseren.'
                    : 'Standaard categoriseert de cloud-AI je transacties.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={privacyMode}
              aria-label={`Lokale transactiecategorisatie ${privacyMode ? 'uitschakelen' : 'inschakelen'}`}
              aria-describedby={describedById}
              disabled={toggleDisabled}
              onClick={onToggle}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-wil-500 disabled:cursor-not-allowed disabled:opacity-50 ${privacyMode ? 'bg-wil-500' : 'bg-zinc-300'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${privacyMode ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>

          {/* Live-regio voor statusaankondigingen (blijft altijd gemount) */}
          <p className="sr-only" aria-live="polite">
            {phase === 'checking' && 'Bezig met controleren of je toestel geschikt is.'}
            {phase === 'downloading' &&
              `Model downloaden${progress ? `, ${Math.round(progressPercent(progress))} procent` : ''}.`}
            {phase === 'error' && 'De download is niet gelukt.'}
          </p>

          {/* ── Niet bedienbaar: AI uit ── */}
          {!aiEnabled && (
            <div id="lokale-cat-reden-ai-uit" className="flex items-start gap-3 bg-[var(--subtle)] p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
              <p className="text-sm text-[var(--ink-2)] leading-relaxed">
                Schakel eerst <strong>AI-features</strong> hierboven in. Lokale categorisatie is een
                verfijning van AI-gebruik, geen vervanging voor &apos;AI helemaal uit&apos;.
              </p>
            </div>
          )}

          {/* ── AI-abonnement vereist voor aanzetten ── */}
          {/* Alleen tonen bij aanzet-poging zonder tier: als privé-modus al aan
              staat blijft uitzetten vrij en is dit blok misplaatst. Canonieke
              upsell (AiSubscriptionUpsell) — één patroon met prijs/tagline uit
              de abonnementscatalogus, gedeeld met chat/briefing. De wrapper draagt
              het id voor de aria-describedby-koppeling op de toggle. */}
          {aiEnabled && !hasAiTier && !privacyMode && (
            <div id="lokale-cat-reden-tier">
              <AiSubscriptionUpsell variant="inline" />
            </div>
          )}

          {/* ── Proactieve desktop-only hint ── */}
          {/* Alleen als de tier er wél is — anders stapelt dit op het upsell-blok. */}
          {aiEnabled && hasAiTier && likelyMobile && (
            <div id="lokale-cat-reden-mobiel" className="flex items-start gap-3 bg-[var(--subtle)] p-4">
              <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
              <p className="text-sm text-[var(--ink-2)] leading-relaxed">
                Lokale categorisatie is <strong>alleen op desktop</strong> beschikbaar — een telefoon of
                tablet heeft niet genoeg grafisch geheugen om het model te draaien. Open deze instelling op
                een desktop of laptop om hem aan te zetten.
              </p>
            </div>
          )}

          {/* ── Capability-check gefaald ── */}
          {capabilityReasons && capabilityReasons.length > 0 && (
            <div className="border border-amber-500/40 bg-amber-50/60 p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <h4 className="text-sm font-semibold text-[var(--ink)]">
                  Dit toestel is (nog) niet geschikt
                </h4>
              </div>
              <ul className="space-y-1.5 text-sm text-[var(--ink-2)]">
                {capabilityReasons.map((reason) => (
                  <li key={reason} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-[var(--ink-3)] leading-relaxed">
                Er is geen download gestart. Je transacties blijven gewoon via de cloud-AI gecategoriseerd
                worden.
              </p>
            </div>
          )}

          {/* ── Consent-stap ── */}
          {phase === 'consent' && (
            <div className="border border-[var(--border-ed)] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 shrink-0 text-wil-600" aria-hidden="true" />
                <h4 className="text-sm font-semibold text-[var(--ink)]">Eenmalige download</h4>
              </div>
              <ul className="space-y-1.5 text-sm text-[var(--ink-2)]">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                  <span>
                    Ongeveer <strong>{LOCAL_MODEL_DOWNLOAD_GB} GB</strong> eenmalige download — wifi
                    aanbevolen.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                  <span>Daarna werkt het offline, direct op je toestel.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                  <span>Je data verlaat je apparaat niet — de download bevat alleen het model, geen gegevens.</span>
                </li>
              </ul>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => runDownload(true)}
                  className="inline-flex items-center gap-2 bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download &amp; zet aan
                </button>
                <button
                  type="button"
                  onClick={() => setPhase('idle')}
                  className="text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
                >
                  Annuleren
                </button>
              </div>
            </div>
          )}

          {/* ── Download bezig ── */}
          {phase === 'downloading' && (
            <div className="border border-[var(--border-ed)] p-4 space-y-3">
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
              <p className="text-xs text-[var(--ink-4)] leading-relaxed">
                Je kunt dit tabblad open laten. Sluit je het tussentijds, dan hervat je de download later
                vanaf deze pagina.
              </p>
            </div>
          )}

          {/* ── Download-fout ── */}
          {phase === 'error' && errorMsg && (
            <div className="border border-negative/30 bg-negative/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden="true" />
                <p className="text-sm text-[var(--ink-2)] leading-relaxed">{errorMsg}</p>
              </div>
              <button
                type="button"
                onClick={() => runDownload(true)}
                className="inline-flex items-center gap-2 border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Opnieuw proberen
              </button>
            </div>
          )}

          {/* ── In afwachting: privacy aan, model ontbreekt ── */}
          {showPending && (
            <div className="border border-amber-500/40 bg-amber-50/60 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <h4 className="text-sm font-semibold text-[var(--ink)]">In afwachting — download vereist</h4>
              </div>
              <p className="text-sm text-[var(--ink-2)] leading-relaxed">
                Lokale categorisatie staat aan, maar het model staat niet (meer) op dit toestel. Zolang het
                ontbreekt worden je transacties niet gecategoriseerd — er wordt bewust niet stilletjes op de
                cloud teruggevallen.
              </p>
              <button
                type="button"
                onClick={() => runDownload(false)}
                disabled={likelyMobile}
                className="inline-flex items-center gap-2 bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Model downloaden (~{LOCAL_MODEL_DOWNLOAD_GB} GB)
              </button>
            </div>
          )}

          {/* ── Beheer-blok: model staat klaar ── */}
          {showBeheer && (
            <div className="border border-[var(--border-ed)] p-4 space-y-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-positive" aria-hidden="true" />
                <div>
                  <h4 className="text-sm font-semibold text-[var(--ink)]">Model staat klaar op dit toestel</h4>
                  <p className="mt-0.5 text-xs text-[var(--ink-3)] leading-relaxed">
                    Ongeveer {LOCAL_MODEL_DOWNLOAD_GB} GB, opgeslagen in deze browser.{' '}
                    {privacyMode
                      ? 'Lokale categorisatie staat aan.'
                      : 'Lokale categorisatie staat uit — het model blijft bewaard voor later.'}
                  </p>
                  {/* Eerlijke verlopen-staat: geen alarm, wel transparant over het
                      gevolg van uitzetten zonder abonnement. */}
                  {subscriptionExpired && (
                    <p className="mt-1.5 text-xs text-[var(--ink-3)] leading-relaxed">
                      Je AI-abonnement is verlopen — lokale categorisatie blijft werken, maar zet je
                      &apos;m uit dan kun je &apos;m zonder abonnement niet opnieuw aanzetten.
                    </p>
                  )}
                  {/* Opslagbescherming: null → niets tonen (geen loze bewering). */}
                  {storagePersisted === true && (
                    <p className="mt-1.5 text-xs text-[var(--ink-3)] leading-relaxed">
                      Je browser beschermt deze opslag — het model blijft bewaard.
                    </p>
                  )}
                  {storagePersisted === false && (
                    <p className="mt-1.5 text-xs text-[var(--ink-3)] leading-relaxed">
                      Let op: je browser beschermt deze opslag niet. Bij ruimtegebrek kan het model
                      verwijderd worden; download dan opnieuw via deze pagina.
                    </p>
                  )}
                </div>
              </div>

              {confirmDelete ? (
                <div className="border border-negative/30 bg-negative/5 p-3 space-y-3">
                  <p className="text-sm text-[var(--ink-2)] leading-relaxed">
                    Weet je zeker dat je het lokale model verwijdert? Lokale categorisatie gaat dan uit en je
                    moet het model opnieuw downloaden om het weer te gebruiken.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={onDeleteModel}
                      className="inline-flex items-center gap-2 bg-negative px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Ja, verwijder het model
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
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
                    className="inline-flex items-center gap-2 border border-negative/30 px-4 py-2 text-sm font-medium text-negative transition-colors hover:bg-negative/5"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Model verwijderen
                  </button>
                  <button
                    type="button"
                    onClick={() => runDownload(false)}
                    disabled={likelyMobile}
                    className="inline-flex items-center gap-2 border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Opnieuw downloaden
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </section>
  )
}
