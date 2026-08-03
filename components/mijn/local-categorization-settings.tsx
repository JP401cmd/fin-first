'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { hasSubscription } from '@/lib/feature-registry'
import { checkLocalAiCapability, type LocalAiCapability } from '@/lib/ai/local/webgpu-capability'
import {
  getLocalModelState,
  downloadLocalModel,
  deleteLocalModel,
  type LocalModelState,
  type LocalModelProgress,
} from '@/lib/ai/local/model-manager'
import { AiExecutionChoice } from './ai-execution-choice'
import { AiExecutionGroupList } from './ai-execution-group-list'
import { LocalModelSection, progressPercent, type LocalModelPhase } from './local-model-section'

/**
 * AiExecutionSettings — de sectie "Waar draait de AI?" op `/mijn/privacy`.
 *
 * Was: één experimentele toggle voor lokale transactiecategorisatie. Is nu: een
 * echte keuze over de bestemming van je gegevens, op twee niveaus —
 *
 *   1. de hoofdkeuze (`profiles.privacy_mode`): Cloud-AI (standaard) of lokaal
 *      waar mogelijk, met een eerlijke voor-en-nadelen-vergelijking;
 *   2. per functionaliteit (`profiles.ai_execution_prefs`): de zeven groepen uit
 *      lib/ai/execution-groups.ts, elk met wat je lokaal inlevert.
 *
 * Dit bestand is de ORCHESTRATOR: het bezit de profielstaat en de
 * capability→consent→download→beheer-toestandsmachine, en verdeelt die over drie
 * presentatie-componenten (`AiExecutionChoice`, `LocalModelSection`,
 * `AiExecutionGroupList`). De machine blijft hier omdat de hoofdschakelaar hem
 * aanstuurt: aanzetten start de capability-check, en pas na een geslaagde download
 * gaat `privacy_mode` op true.
 *
 * BESTANDSNAAM. Bewust ongewijzigd. Dit is het enige bestand in deze sectie dat
 * nog rechtstreeks met de browser-client op `profiles` leest (eigen rij:
 * ai_enabled + privacy_mode + active_subscriptions), en het staat onder die naam
 * als grandfather-entry op de ALLOWLIST in scripts/check-client-data-reads.mjs
 * (ADR 0058). Hernoemen vraagt een wijziging in die gate; dat hoort in een aparte,
 * gemotiveerde stap — niet als bijvangst van een UI-herbouw. De groepenlijst leest
 * en schrijft wél volgens de conventie via /api/ai-execution-prefs.
 *
 * SINGLE SOURCE / SECURITY: schrijven van `privacy_mode` gaat via de own-row
 * POST-route (/api/privacy-mode), die ook de autoritatieve tier-gate draagt; deze
 * UI spiegelt hem alleen (voorkomt een 403-verrassing). De lokale-AI-primitieven
 * komen uit lib/ai/local.
 *
 * TIER-GATE: AANzetten vereist het 'ai'-abonnement; UITzetten blijft altijd vrij,
 * zodat een verlopen abonnement of een coarse-pointer-toestel niemand opsluit.
 */

/**
 * Gecentraliseerde toegang tot "is het model bruikbaar?". Afgestemd op het
 * bindende contract in lib/ai/local/model-manager: getLocalModelState() levert
 * `{ state, bytes }` met `state: LocalModelState` = 'klaar' zodra het model
 * klaarstaat.
 */
function isModelReady(model: { state: LocalModelState; bytes: number | null }): boolean {
  return model.state === 'klaar'
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

/**
 * Best-effort: beschermt de browser deze origin-opslag tegen automatische
 * eviction (navigator.storage.persisted)? `null` = onbekend/niet-ondersteund —
 * dan tonen we niets (geen loze bewering).
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

export function AiExecutionSettings() {
  // Stabiele client-ref: zonder memo is `supabase` bij elke render een nieuw
  // object → de mount-useEffect (dep [supabase]) draait telkens opnieuw en zet
  // aan het eind setPhase('idle'), wat een net gezette 'consent'/'checking'-fase
  // zou overschrijven.
  const supabase = useMemo(() => createClient(), [])

  const [phase, setPhase] = useState<LocalModelPhase>('loading')
  const [aiEnabled, setAiEnabled] = useState(true)
  // Default `true` (net als aiEnabled) → voorkomt een flash-of-upsell tijdens de
  // mount-load. De werkelijke tier komt uit de select hieronder.
  const [hasAiTier, setHasAiTier] = useState(true)
  const [privacyMode, setPrivacyMode] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const [capabilityReasons, setCapabilityReasons] = useState<string[] | null>(null)
  const [progress, setProgress] = useState<LocalModelProgress | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [likelyMobile, setLikelyMobile] = useState(false)
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null)

  // Proactieve desktop-only hint: op een coarse-pointer-toestel (mobiel/tablet)
  // faalt de capability-check toch — laat de keuze daar vriendelijk uit staan
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

  // Mount-load: ai_enabled + privacy_mode + active_subscriptions via één
  // eigen-rij select, en of het model al lokaal aanwezig is.
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
    // Spiegelt `toggleDisabled`: AANzetten vereist tier + desktop; UITzetten
    // blijft altijd toegestaan zolang AI aan staat en er niets bezig is.
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
      /* zelfs bij een fout volgt de UI de status: het model is niet meer bruikbaar */
    }
    setModelReady(false)
    const ok = await writePrivacyMode(false)
    if (ok) setPrivacyMode(false)
    setProgress(null)
    setPhase('idle')
  }, [])

  const toggleDisabled = !aiEnabled || busy || (!privacyMode && (likelyMobile || !hasAiTier))

  // Lokaal kiezen (hoofdkeuze én per groep) vereist AI aan, het 'ai'-abonnement
  // en een desktop. De reden staat erbij zodat een uitgegrijsde knop nooit
  // onverklaard is.
  const canChooseLocal = aiEnabled && hasAiTier && !likelyMobile
  const localBlockedReason = !aiEnabled
    ? 'AI staat helemaal uit. Zet AI-features hierboven aan om per onderdeel te kunnen kiezen.'
    : !hasAiTier
      ? 'Lokaal draaien hoort bij het AI-abonnement. Zonder abonnement blijft alles op Cloud-AI staan.'
      : likelyMobile
        ? 'Lokaal draaien kan alleen op een desktop of laptop — open deze pagina daar om per onderdeel te kiezen.'
        : undefined

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-4 pb-16 sm:px-6">
      <section className="border border-[var(--border-ed)] bg-[var(--paper)]">
        <div className="space-y-8 px-4 py-6 sm:px-6">
          <AiExecutionChoice
            privacyMode={privacyMode}
            aiEnabled={aiEnabled}
            hasAiTier={hasAiTier}
            likelyMobile={likelyMobile}
            disabled={toggleDisabled}
            onToggle={onToggle}
          />

          {/* Live-regio voor statusaankondigingen (blijft altijd gemount) */}
          <p className="sr-only" aria-live="polite">
            {phase === 'checking' && 'Bezig met controleren of je toestel geschikt is.'}
            {phase === 'downloading' &&
              `Model downloaden${progress ? `, ${Math.round(progressPercent(progress))} procent` : ''}.`}
            {phase === 'error' && 'De download is niet gelukt.'}
          </p>

          <LocalModelSection
            phase={phase}
            capabilityReasons={capabilityReasons}
            progress={progress}
            errorMsg={errorMsg}
            modelReady={modelReady}
            privacyMode={privacyMode}
            aiEnabled={aiEnabled}
            hasAiTier={hasAiTier}
            likelyMobile={likelyMobile}
            storagePersisted={storagePersisted}
            onConsentConfirm={() => runDownload(true)}
            onConsentCancel={() => setPhase('idle')}
            onRetry={() => runDownload(true)}
            onRedownload={() => runDownload(false)}
            onDelete={onDeleteModel}
          />
        </div>
      </section>

      <AiExecutionGroupList
        privacyMode={privacyMode}
        canChooseLocal={canChooseLocal}
        localBlockedReason={localBlockedReason}
      />
    </section>
  )
}
