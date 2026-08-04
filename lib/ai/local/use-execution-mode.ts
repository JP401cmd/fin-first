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
//   'blocked'   → moet lokaal, maar het mag of kan niet. Drie redenen: de
//                 kill-switch (`profiles.ai_enabled`) staat uit, het
//                 'ai'-abonnement is niet meer actief, óf dit toestel kan het
//                 niet. Er mag NIETS vertrekken en er mag ook niets on-device
//                 gegenereerd worden — ook niet "even via de cloud".
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
import { readProofVerdict } from './proof-verdict'
import { useExecutionPrefsVersion } from '@/lib/ai/execution-prefs-signal'
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
 * Melding wanneer de gebruiker AI zélf heeft uitgezet (`profiles.ai_enabled`).
 * Bewust een andere tekst dan de abonnementsmelding: dit is geen beperking die
 * hem overkomt maar zijn eigen keuze, en de weg terug is een andere knop.
 */
export const LOCAL_AI_DISABLED_MESSAGE =
  'AI staat uit in je instellingen, dus er wordt niets gegenereerd — ook niet op je eigen toestel. ' +
  'Via Mijn → Privacy kun je AI weer aanzetten.'

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
  /** Staat de kill-switch (`profiles.ai_enabled`, /mijn/privacy) aan? */
  aiEnabled: boolean
}

/**
 * Leest de opgeloste keuze per groep PLUS de abonnementsstand. Faalt de lezing
 * (transient netwerk), dan behandelen we dat NIET als "dan maar cloud": bij een
 * onbekende voorkeur weten we niet of iemand privé-modus aan had staan, en dan
 * is stil naar de cloud gaan precies de fout die deze hele architectuur moet
 * voorkomen. We geven `null` terug en de hook blijft in 'resolving' — er
 * vertrekt dus niets.
 *
 * Een antwoord ZONDER `hasAiSubscription` of ZONDER `aiEnabled` telt bewust ook
 * als onbekend. Die twee velden zijn samen de enige poort op de zuiver lokale
 * paden (die tijdens het genereren geen server meer aanraken); ze stilzwijgend
 * als "in orde" lezen zou precies het revocatie- en kill-switch-gat teruggeven
 * die dit dicht moet zetten. Een half antwoord is hier geen antwoord.
 */
async function fetchPrefs(group: AiExecutionGroup): Promise<ExecutionPrefs | null> {
  try {
    const res = await fetch('/api/ai-execution-prefs')
    if (!res.ok) return null
    const data = (await res.json()) as {
      modes?: Partial<Record<AiExecutionGroup, AiExecutionMode>>
      hasAiSubscription?: unknown
      aiEnabled?: unknown
    }
    const mode = data.modes?.[group]
    if (mode !== 'lokaal' && mode !== 'cloud') return null
    if (typeof data.hasAiSubscription !== 'boolean') return null
    // `aiEnabled` telt om exact dezelfde reden als `hasAiSubscription` mee als
    // een VERPLICHT veld: het is op de zuiver lokale paden de laatste server-
    // uitspraak vóór het genereren. Het bij afwezigheid als "staat wel aan"
    // lezen zou de kill-switch teruggeven aan een oude server-versie.
    if (typeof data.aiEnabled !== 'boolean') return null
    return { mode, hasAi: data.hasAiSubscription, aiEnabled: data.aiEnabled }
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
  // Wijzigt iemand de keuze ergens anders in de boom (de popover in de chat, de
  // groepenlijst, de hoofdschakelaar), dan hoort ELKE lezer opnieuw te bepalen —
  // niet alleen degene die toevallig een refresh-callback had. Zonder dit bleef
  // bijvoorbeeld het waarschuwingsicoon op de Fin-knop staan tot een herlaad.
  const prefsVersion = useExecutionPrefsVersion()

  // De uitkomst draagt de invoer waarvoor hij geldt. Daardoor hoeft er bij een
  // wisseling van groep/activering niets synchroon teruggezet te worden: zolang
  // de sleutel niet matcht, IS de toestand 'resolving' — en 'resolving' betekent
  // fail-closed, dus er vertrekt niets. Een `setState(RESOLVING)` bovenin het
  // effect zou hetzelfde bedoelen maar één render te laat komen: heel even zou
  // de vorige uitkomst nog gelden, en precies dat venster is waar een oppervlak
  // ten onrechte 'cloud' zou kunnen lezen.
  const key = `${group}|${active ? 1 : 0}|${nonce}|${prefsVersion}`
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

      // ── Kill-switch, vóór het abonnement ─────────────────────────────────
      // `profiles.ai_enabled` is de knop "AI uit" op /mijn/privacy. Hij staat
      // vóór de abonnementscheck omdat dit de eigen, expliciete keuze van de
      // gebruiker is: wie AI zelf heeft uitgezet moet niet te horen krijgen dat
      // zijn abonnement verlopen is.
      //
      // Deze check zit ná de cloud-tak, en dat is een BEWUSTE AFBAKENING — geen
      // bewijs dat het cloudpad gedekt is. Dat is het namelijk niet: `ai_enabled`
      // komt in app/api uitsluitend voor in deze route en de vijf
      // `local-*`-context-routes; de echte cloudroutes gate'en op `privacy_mode`
      // (assertCloudAllowed) en tier, niet op de kill-switch — zie
      // app/api/ai/chat/route.ts r50-53. "AI uit" wordt op het cloudpad dus
      // evenmin afgedwongen.
      //
      // Dat gat is ouder dan deze hook en raakt meer dan alleen de oppervlakken
      // die hier langskomen, dus het hoort in een eigen ronde thuis en niet als
      // bijvangst van deze fix. Wat hier wél dicht gaat is het lokale pad: dat
      // raakt tijdens het genereren geen enkele route meer aan, waardoor deze GET
      // de laatste server-uitspraak is — en die zweeg erover.
      if (!prefs.aiEnabled) {
        setState({
          status: 'blocked',
          message: LOCAL_AI_DISABLED_MESSAGE,
          intended: 'lokaal',
          canUseCloud: false,
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

      // ── Uitvoer-toets: een bewaarde ZAKKING blokkeert ────────────────────
      // De capability-check kijkt of het toestel het model KAN draaien; de
      // uitvoer-toets of er iets BRUIKBAARS uit komt. Dat tweede is geen
      // theoretisch verschil: een gemeten telefoon haalde de GPU-lat met gemak
      // en leverde 0% bruikbare uitvoer (zie output-proof.ts).
      //
      // Een ONTBREKEND oordeel blokkeert bewust NIET. De poort staat op
      // /mijn/privacy — daar wordt het oordeel geveld vóór lokaal aan mag — en
      // hier alleen het vangnet. Afwezig-als-blokkade zou bovendien elk toestel
      // stilzetten dat het model al had staan voordat deze toets bestond.
      const verdict = readProofVerdict()
      if (verdict && !verdict.ok) {
        setState({
          status: 'blocked',
          message: `${verdict.reasons[0] ?? 'De proef op dit toestel is niet geslaagd.'} Lokale AI blijft daarom uit op dit apparaat; via Mijn → Privacy kun je de proef opnieuw draaien.`,
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
    // `key` is afgeleid van precies group/active/nonce/prefsVersion; die vier
    // blijven de echte afhankelijkheden, zodat het effect niet per render
    // opnieuw draait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, active, nonce, prefsVersion])

  return { ...state, refresh }
}
