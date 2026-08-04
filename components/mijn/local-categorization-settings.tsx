'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { hasSubscription } from '@/lib/feature-registry'
import { checkLocalAiCapability, type LocalAiCapability } from '@/lib/ai/local/webgpu-capability'
import {
  getLocalModelState,
  downloadLocalModel,
  deleteLocalModel,
  proveLocalModel,
  selectLocalModel,
  type LocalModelState,
  type LocalModelProgress,
} from '@/lib/ai/local/model-manager'
import { readProofVerdict, writeProofVerdict, clearProofVerdict } from '@/lib/ai/local/proof-verdict'
import type { ProofOutcome } from '@/lib/ai/local/output-proof'
import { getSelectedLocalModelId } from '@/lib/ai/local/selected-model'
import {
  LOCAL_MODEL_CATALOG,
  resolveLocalModel,
  type LocalModelId,
} from '@/lib/ai/local/model-catalog'
import { DEFAULT_GATE_CONFIG, parseGateConfig, type LocalAiGateConfig } from '@/lib/ai/local/gate-config'
import { notifyExecutionPrefsChanged } from '@/lib/ai/execution-prefs-signal'
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
    // De hoofdschakelaar raakt élk oppervlak dat de uitvoerkeuze leest: de chat,
    // het waarschuwingsicoon op de Fin-knop, de privacy-indicatoren. Zonder dit
    // sein blijven die op de oude stand staan tot een herlaad.
    if (res.ok) notifyExecutionPrefsChanged()
    return res.ok
  } catch {
    return false
  }
}

/**
 * De beheer-instelbare toelatingsdrempel. Faalt de lezing, dan geldt de STRENGE
 * standaard — een netwerkhapering mag de poort nooit soepeler maken.
 */
async function fetchGateConfig(): Promise<LocalAiGateConfig> {
  try {
    const res = await fetch('/api/local-ai-gate')
    if (!res.ok) return DEFAULT_GATE_CONFIG
    const data = (await res.json()) as { config?: unknown }
    return parseGateConfig(data.config)
  } catch {
    return DEFAULT_GATE_CONFIG
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
  const [proofOutcome, setProofOutcome] = useState<ProofOutcome | null>(null)
  // De beheer-instelbare toelatingsdrempel. Start op de STRENGE standaard: gaat
  // de fetch mis, dan is dat de veilige stand (nooit stil soepeler worden).
  const [gate, setGate] = useState<LocalAiGateConfig>(DEFAULT_GATE_CONFIG)
  const [modelId, setModelId] = useState<LocalModelId>(getSelectedLocalModelId)

  // Toestel-hint: ADVISEREND, nooit blokkerend.
  //
  // Dit was een harde poort — stond hij aan, dan deed de schakelaar niets en
  // draaide `checkLocalAiCapability`, de enige check die écht naar WebGPU kijkt,
  // helemaal niet. Een gebruiker met een prima videokaart kreeg dan te lezen dat
  // het "alleen op desktop" werkt, zonder dat zijn kaart ooit was bekeken.
  //
  // Dat gebeurde ook echt, en het bewijs was scherp: op dezelfde laptop, in
  // dezelfde browser, wérkte /mijn/lokale-chat gewoon — want díe pagina vraagt
  // het aan de GPU. Alleen dit scherm gokte het uit de aanwijzer, en zat ernaast.
  //
  // De les is niet "kies een betere query" maar "een gok mag geen poort zijn".
  // `(pointer: coarse)` beschrijft de PRIMAIRE aanwijzer; een laptop met
  // touchscreen rapporteert die regelmatig als grof. Zelfs met de scherpere
  // combinatie hieronder blijft het een benadering — en de echte toets kost niets
  // en downloadt niets, dus er is geen reden om 'm vóór te zijn.
  //
  // Wat de hint nu nog doet: aankondigen wat er waarschijnlijk gaat gebeuren, op
  // een toestel waar de primaire aanwijzer grof is én er nergens een fijne
  // beschikbaar is (een telefoon; een touchscreen-laptop heeft een trackpad).
  // Klikt de gebruiker toch, dan volgt een concrete reden in plaats van een gok.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const coarsePrimary = window.matchMedia?.('(pointer: coarse)')?.matches ?? false
      const anyFinePointer = window.matchMedia?.('(any-pointer: fine)')?.matches ?? false
      setLikelyMobile(coarsePrimary && !anyFinePointer)
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

      // Eerst de beheer-instelling, dan pas de modelstaat: welke bundel er
      // "klaar" staat hangt af van WELK model er geldt, en dat kan beheer
      // dichtzetten op een andere dan de gebruiker eerder koos.
      const config = await fetchGateConfig()
      const effectiveModelId = config.allowUserModelChoice
        ? getSelectedLocalModelId()
        : config.modelId
      await selectLocalModel(effectiveModelId)

      let ready = false
      try {
        const state = await getLocalModelState()
        ready = isModelReady(state)
      } catch {
        ready = false
      }

      const persisted = await readStoragePersisted()

      if (!active) return
      setGate(config)
      setModelId(effectiveModelId)
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

  const busy = phase === 'checking' || phase === 'downloading' || phase === 'proving'

  /**
   * STAP 2 — de uitvoer-toets: het laatste woord over dit toestel.
   *
   * Draait als EIGEN handeling, losgekoppeld van de download. Die twee zaten
   * eerst aan elkaar vast, waardoor bij een zakking niet te zien was wát er nu
   * eigenlijk misging — en het zijn twee heel verschillende dingen: het één
   * haalt bestanden op, het ander stelt een vraag aan je grafische chip.
   *
   * Slaagt hij, dan pas gaat `privacy_mode` aan: pas hier weten we of er iets
   * BRUIKBAARS uit komt, en dat is precies wat de capability-check niet ziet.
   * Het oordeel wordt per toestel bewaard, zodat een geslaagd apparaat niet elke
   * keer opnieuw een halve minuut staat te proefdraaien.
   */
  const runProof = useCallback(async () => {
    setErrorMsg(null)
    setProofOutcome(null)
    setPhase('proving')
    const outcome = await proveLocalModel({ minPassed: gate.minPassed, timeoutMs: gate.timeoutMs })
    writeProofVerdict(outcome, new Date().toISOString())
    setProofOutcome(outcome)

    if (!outcome.ok) {
      // FAIL-CLOSED: niet aanzetten, en ook geen stille cloud-uitwijk.
      setPhase('proof-failed')
      return
    }

    const ok = await writePrivacyMode(true)
    if (ok) setPrivacyMode(true)
    setPhase('idle')
  }, [gate.minPassed, gate.timeoutMs])

  /**
   * Van model wisselen. De bundel van het nieuwe model staat er meestal nog niet,
   * en een oordeel over het vorige zegt niets over dit — dus allebei opnieuw
   * bepalen. `selectLocalModel` gooit onderwater de geladen engine weg.
   */
  const onSelectModel = useCallback(async (id: LocalModelId) => {
    setModelId(id)
    setProofOutcome(null)
    setCapabilityReasons(null)
    setErrorMsg(null)
    await selectLocalModel(id)
    try {
      setModelReady(isModelReady(await getLocalModelState()))
    } catch {
      setModelReady(false)
    }
    setPhase('idle')
  }, [])

  /**
   * STAP 1 — het model naar dit toestel halen. Meer niet: geen proef, geen
   * `privacy_mode`. Wie hier klaar is heeft bestanden, nog geen werkend geheel.
   */
  const runDownload = useCallback(async () => {
    setErrorMsg(null)
    setCapabilityReasons(null)
    setProofOutcome(null)
    setProgress(null)
    // Een verse bundel verdient een vers oordeel: het oude zegt niets meer over
    // wat er straks staat.
    clearProofVerdict()
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
    // Spiegelt `toggleDisabled`: AANzetten vereist tier; UITzetten blijft altijd
    // toegestaan zolang AI aan staat en er niets bezig is. Het TOESTEL zit hier
    // bewust niet meer in — zie de toelichting bij `likelyMobile`.
    if (!aiEnabled || busy || (!privacyMode && !hasAiTier)) return

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
    setProofOutcome(null)
    setPhase('checking')
    const cap: LocalAiCapability = await checkLocalAiCapability()
    if (!cap.ok) {
      setCapabilityReasons(cap.reasons)
      setPhase('idle')
      return
    }
    // Model staat er al → geen download nodig. Wel eerst het oordeel over dít
    // toestel: bewaard gezakt = meteen de reden tonen (niet opnieuw een halve
    // minuut proefdraaien), bewaard geslaagd = direct aan, nog niet beproefd =
    // nú beproeven. Dat laatste is ook het pad voor toestellen die het model al
    // hadden staan vóór deze toets bestond.
    if (modelReady) {
      const verdict = readProofVerdict()
      if (verdict && !verdict.ok) {
        setProofOutcome({ ok: false, reasons: verdict.reasons, results: [] })
        setPhase('proof-failed')
        return
      }
      if (verdict?.ok) {
        const ok = await writePrivacyMode(true)
        if (ok) setPrivacyMode(true)
        setPhase('idle')
        return
      }
      await runProof()
      return
    }
    // Model staat er nog niet: de twee stappen staan al in beeld, stap 1 is de
    // eerstvolgende handeling. Geen aparte consent-fase meer — de uitleg bij
    // stap 1 stáát er, en de knop is de instemming.
    setPhase('idle')
  }, [aiEnabled, busy, privacyMode, modelReady, hasAiTier, runProof])

  const onDeleteModel = useCallback(async () => {
    try {
      await deleteLocalModel()
    } catch {
      /* zelfs bij een fout volgt de UI de status: het model is niet meer bruikbaar */
    }
    // Het oordeel gold dít model op dít toestel; zonder model is het niets waard.
    clearProofVerdict()
    setProofOutcome(null)
    setModelReady(false)
    const ok = await writePrivacyMode(false)
    if (ok) setPrivacyMode(false)
    setProgress(null)
    setPhase('idle')
  }, [])

  const toggleDisabled = !aiEnabled || busy || (!privacyMode && !hasAiTier)

  // Lokaal kiezen (hoofdkeuze én per groep) vereist AI aan en het 'ai'-abonnement.
  // Die twee zijn feiten die de server ons vertelt. Het TOESTEL staat er bewust
  // niet meer bij: dat is geen feit maar een gok, en de echte toets
  // (checkLocalAiCapability) draait pas ná de klik — kost niets, downloadt niets
  // en geeft een concrete reden. De reden staat er altijd bij, zodat een
  // uitgegrijsde knop nooit onverklaard is.
  const canChooseLocal = aiEnabled && hasAiTier
  const localBlockedReason = !aiEnabled
    ? 'AI staat helemaal uit. Zet AI-features hierboven aan om per onderdeel te kunnen kiezen.'
    : !hasAiTier
      ? 'Lokaal draaien hoort bij het AI-abonnement. Zonder abonnement blijft alles op Cloud-AI staan.'
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
            {phase === 'proving' && 'Bezig met proefdraaien op dit toestel.'}
            {phase === 'proof-failed' && 'De proef is niet geslaagd; lokaal draaien blijft uit.'}
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
            storagePersisted={storagePersisted}
            proof={proofOutcome}
            model={resolveLocalModel(modelId)}
            modelChoices={gate.allowUserModelChoice ? LOCAL_MODEL_CATALOG : null}
            onSelectModel={onSelectModel}
            onDownload={runDownload}
            onProve={runProof}
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
