'use client'

// ── Eén hook die bepaalt waar een AI-functie draait ─────────────────────────
//
// Tot nu toe deed elk lokaal oppervlak dit zelf: de chat-transport-swap
// (components/app/chat/chat-panel.tsx) en de categorisatie-resolver-swap
// (components/app/ai-categorize-sheet.tsx) hebben allebei hun eigen kopie van
// "lees de voorkeur, check de GPU, check of het model er staat, beslis". Met
// twee consumenten was dat te overzien; met zeven groepen wordt het een bron van
// stille afwijkingen — en juist hier is één afwijking een gebroken privacybelofte.
//
// Deze hook is die ene plek. Hij levert een expliciete toestand:
//
//   'resolving' → we weten het nog niet. Er mag NIETS vertrekken.
//   'cloud'     → deze groep draait via de cloud-AI; gebruik het normale pad.
//   'lokaal'    → draait on-device; gebruik het lokale pad.
//   'blocked'   → moet lokaal, maar het mag of kan niet: dit toestel kan het
//                 niet, óf het 'ai'-abonnement is niet meer actief. Er mag NIETS
//                 vertrekken en er mag ook niets on-device gegenereerd worden —
//                 ook niet "even via de cloud".
//
// FAIL-CLOSED IS DE KERN. Zowel 'resolving' als 'blocked' betekenen: niet
// versturen. Een consument die alleen op `=== 'lokaal'` test en anders de cloud
// pakt, breekt de belofte precies in het venster waarin de voorkeur nog geladen
// wordt. Gebruik daarom `canUseCloud` / `canUseLocal` in plaats van je eigen
// vergelijking.
//
// VERSE LEZING, GEEN CACHE. De voorkeur wordt per activering opnieuw opgehaald,
// bewust niet via een gedeelde singleton: iemand die net op /mijn/privacy iets
// heeft omgezet, moet dat onmiddellijk terugzien. Een seconde verouderde cache is
// hier geen prestatiewinst maar een verkeerde bestemming voor iemands gegevens.

import { useCallback, useEffect, useState } from 'react'
import { checkLocalAiCapability } from './webgpu-capability'
import { getLocalModelState } from './model-manager'
import { resolveLocalReadiness } from './local-readiness'
import type { AiExecutionGroup, AiExecutionMode } from '@/lib/ai/execution-groups'

export type ExecutionStatus = 'resolving' | 'cloud' | 'lokaal' | 'blocked'

export interface ExecutionModeState {
  status: ExecutionStatus
  /** Uitleg bij 'blocked' — de concrete reden uit resolveLocalReadiness. */
  message: string | null
  /** De gekozen bestemming, ongeacht of die haalbaar is. Handig voor UI-tekst. */
  intended: AiExecutionMode | null
  /** Mag er nu een cloud-aanroep vertrekken? */
  canUseCloud: boolean
  /** Mag er nu on-device gegenereerd worden? */
  canUseLocal: boolean
  /** Opnieuw bepalen — bv. nadat de gebruiker het model heeft gedownload. */
  refresh: () => void
}

const RESOLVING: Omit<ExecutionModeState, 'refresh'> = {
  status: 'resolving',
  message: null,
  intended: null,
  canUseCloud: false,
  canUseLocal: false,
}

/**
 * Melding bij een verlopen/ontbrekend AI-abonnement terwijl de groep op lokaal
 * staat. Benoemt allebei de helften van het niemand-opgesloten-principe: het
 * genereren stopt, maar de keuze blijft omkeerbaar.
 */
export const LOCAL_SUBSCRIPTION_REVOKED_MESSAGE =
  'Je AI-abonnement is niet (meer) actief, dus er wordt niets meer gegenereerd — ook niet op je eigen toestel. ' +
  'Je zit nergens aan vast: via Mijn → Privacy kun je deze functie altijd terugzetten op cloud-AI, ook zonder abonnement.'

interface ExecutionPrefs {
  mode: AiExecutionMode
  /** Staat het 'ai'-abonnement nu nog open? Server is hier de enige autoriteit. */
  hasAi: boolean
}

/**
 * Leest de opgeloste keuze per groep PLUS de abonnementsstand. Faalt de lezing
 * (transient netwerk), dan behandelen we dat NIET als "dan maar cloud": bij een
 * onbekende voorkeur weten we niet of iemand privé-modus aan had staan, en dan
 * is stil naar de cloud gaan precies de fout die deze hele architectuur moet
 * voorkomen. We geven `null` terug en de hook blijft in 'resolving' — er
 * vertrekt dus niets.
 *
 * Een antwoord ZONDER `hasAiSubscription` telt bewust ook als onbekend. Dat veld
 * is de enige poort op de zuiver lokale paden (die tijdens het genereren geen
 * server meer aanraken); het stilzwijgend als "abonnement in orde" lezen zou
 * precies het revocatie-gat teruggeven dat dit dicht moet zetten. Een half
 * antwoord is hier geen antwoord.
 */
async function fetchPrefs(group: AiExecutionGroup): Promise<ExecutionPrefs | null> {
  try {
    const res = await fetch('/api/ai-execution-prefs')
    if (!res.ok) return null
    const data = (await res.json()) as {
      modes?: Partial<Record<AiExecutionGroup, AiExecutionMode>>
      hasAiSubscription?: unknown
    }
    const mode = data.modes?.[group]
    if (mode !== 'lokaal' && mode !== 'cloud') return null
    if (typeof data.hasAiSubscription !== 'boolean') return null
    return { mode, hasAi: data.hasAiSubscription }
  } catch {
    return null
  }
}

/**
 * @param group   De uitvoergroep waar deze functionaliteit onder valt.
 * @param active  Zet op false zolang het oppervlak dicht is (modal niet open,
 *                sectie niet zichtbaar). Voorkomt een GPU-check en een fetch bij
 *                elke render van een pagina waar de functie niet gebruikt wordt.
 */
export function useExecutionMode(group: AiExecutionGroup, active = true): ExecutionModeState {
  const [nonce, setNonce] = useState(0)

  // De uitkomst draagt de invoer waarvoor hij geldt. Daardoor hoeft er bij een
  // wisseling van groep/activering niets synchroon teruggezet te worden: zolang
  // de sleutel niet matcht, IS de toestand 'resolving' — en 'resolving' betekent
  // fail-closed, dus er vertrekt niets. Een `setState(RESOLVING)` bovenin het
  // effect zou hetzelfde bedoelen maar één render te laat komen: heel even zou
  // de vorige uitkomst nog gelden, en precies dat venster is waar een oppervlak
  // ten onrechte 'cloud' zou kunnen lezen.
  const key = `${group}|${active ? 1 : 0}|${nonce}`
  const [resolved, setResolved] = useState<{
    key: string
    value: Omit<ExecutionModeState, 'refresh'>
  } | null>(null)

  const state = resolved?.key === key ? resolved.value : RESOLVING

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!active) return

    let cancelled = false
    const setState = (value: Omit<ExecutionModeState, 'refresh'>) => setResolved({ key, value })

    void (async () => {
      const prefs = await fetchPrefs(group)
      if (cancelled) return

      // Onbekend → in 'resolving' blijven (zie fetchPrefs): niets versturen.
      if (prefs === null) return

      if (prefs.mode === 'cloud') {
        setState({
          status: 'cloud',
          message: null,
          intended: 'cloud',
          canUseCloud: true,
          canUseLocal: false,
        })
        return
      }

      // ── Abonnement, vóór capability ──────────────────────────────────────
      // Zonder geldig 'ai'-abonnement stopt ook het lokale genereren. Deze check
      // staat bewust vóór de GPU-/modelcontrole: "je abonnement is verlopen" is
      // de fundamentelere en concreter oplosbare reden dan "je model staat niet
      // klaar", en een GPU-probe die tot niets kan leiden slaan we zo over.
      //
      // 'blocked' en niet stil terugvallen op cloud: deze gebruiker koos lokaal.
      // Hem nu ongevraagd naar een externe AI-leverancier sturen zou de belofte
      // breken die hij gekocht heeft — en de cloudroutes zouden hem daar tóch
      // met een tier-403 tegenhouden. NIEMAND-OPGESLOTEN blijft intact langs de
      // andere kant: terugzetten naar cloud is nooit gegated (POST
      // /api/ai-execution-prefs gate't alléén de weg NAAR lokaal, spiegel van
      // /api/privacy-mode r70-81), dus de keuze is altijd terug te draaien —
      // alleen het genereren stopt. De melding zegt dat er ook bij.
      if (!prefs.hasAi) {
        setState({
          status: 'blocked',
          message: LOCAL_SUBSCRIPTION_REVOKED_MESSAGE,
          intended: 'lokaal',
          canUseCloud: false,
          canUseLocal: false,
        })
        return
      }

      // Lokaal gewenst — kan dit toestel het ook? Capability en modelstaat samen,
      // want ze geven verschillende, concreet verschillende adviezen.
      const [cap, model] = await Promise.all([checkLocalAiCapability(), getLocalModelState()])
      if (cancelled) return

      const readiness = resolveLocalReadiness(cap, { state: model.state })
      if (!readiness.ready) {
        setState({
          status: 'blocked',
          message: readiness.message ?? 'Lokale AI is nu niet beschikbaar op dit toestel.',
          intended: 'lokaal',
          canUseCloud: false,
          canUseLocal: false,
        })
        return
      }

      setState({
        status: 'lokaal',
        message: null,
        intended: 'lokaal',
        canUseCloud: false,
        canUseLocal: true,
      })
    })()

    return () => {
      cancelled = true
    }
    // `key` is afgeleid van precies group/active/nonce; die drie blijven de
    // echte afhankelijkheden, zodat het effect niet per render opnieuw draait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, active, nonce])

  return { ...state, refresh }
}
