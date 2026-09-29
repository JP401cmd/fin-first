import { estimateCostUsd } from '@/lib/ai/token-prices'
import { tokenFeatureLabel } from '@/lib/ai/token-usage'
import type { AiAanroep } from './loader'
import { reeksLengteVoor, telPerDag, vergelijkPerioden, type DagPunt, type PeriodeVergelijking } from './reeksen'
import { dagVanIso } from './tijd'

/**
 * AI-aanroepen over tijd: hoeveel er slaagden, hoeveel er mislukten, en wat ze
 * bij benadering kosten.
 *
 * TWEE BRONNEN, TWEE VENSTERS. Geslaagde aanroepen komen uit `ai_token_usage`,
 * mislukte uit de foutenstapel. Beide worden met een bovengrens gelezen: is een
 * venster afgekapt, dan zijn de oudste dagen van die bron niet gemeten. Het
 * aandeel mislukt bestaat daarom alleen als beide totalen er zijn, en verbruik
 * en kosten alleen als de geslaagde aanroepen van de periode volledig zijn.
 *
 * KOSTEN ZIJN EEN SCHATTING. Tokens maal het modeltarief
 * (lib/ai/token-prices.ts). Eén aanroep op een model zonder bekend tarief maakt
 * het totaal onbekend: een deelsom tonen als het geheel is een stille
 * onderschatting.
 *
 * Puur: geen IO.
 */

export interface FunctieVerbruik {
  feature: string
  label: string
  aanroepen: number
  /** Daarvan zonder gebruiker (achtergrondtaken). */
  systeem: number
  tokensIn: number
  tokensUit: number
  /** `null` = minstens één aanroep op een model zonder bekend tarief. */
  kostenUsd: number | null
}

export interface AiBeeld {
  /** Geslaagde aanroepen per dag, over twee periodes plus vandaag. */
  geslaagd: DagPunt[]
  /** Mislukte aanroepen per dag; `null`-dagen vallen buiten het leesvenster van de fouten. */
  mislukt: DagPunt[]
  vergelijkGeslaagd: PeriodeVergelijking
  vergelijkMislukt: PeriodeVergelijking
  /** Over de laatste volle dagen van de periode; `null` als een van beide totalen ontbreekt. */
  aandeelMislukt: { mislukt: number; pogingen: number } | null
  /** Per functie, zwaarste eerst, over de laatste volle dagen van de periode. */
  perFunctie: FunctieVerbruik[]
  kostenUsd: number | null
  onbekendeModellen: string[]
  /**
   * De geslaagde aanroepen van de periode zijn niet volledig gelezen (de
   * bovengrens van de lezing is geraakt). Verbruik per functie en kosten zijn
   * dan een ondergrens, en `kostenUsd` is `null`.
   */
  verbruikOnvolledig: boolean
}

export interface AiBeeldInvoer {
  aanroepen: readonly AiAanroep[]
  /** Oudste gelezen aanroep van een afgekapte lezing, anders `null`. */
  aanroepenAfgekaptVanaf?: string | null
  /** Tijdstempels van mislukte aanroepen (foutregels met context `ai:`). */
  mislukt: readonly string[]
  /** Oudste regel van een afgekapt foutvenster, anders `null`. */
  foutenAfgekaptVanaf: string | null
  nu: Date
  dagen: number
}

export function bouwAiBeeld(invoer: AiBeeldInvoer): AiBeeld {
  const { aanroepen, nu, dagen } = invoer
  const lengte = reeksLengteVoor(dagen)

  const geslaagd = telPerDag(
    aanroepen.map((a) => a.created_at),
    { nu, dagen: lengte, afgekaptVanaf: invoer.aanroepenAfgekaptVanaf ?? null },
  )
  const mislukt = telPerDag(invoer.mislukt, { nu, dagen: lengte, afgekaptVanaf: invoer.foutenAfgekaptVanaf })
  const vergelijkGeslaagd = vergelijkPerioden(geslaagd, { nu, dagen })
  const vergelijkMislukt = vergelijkPerioden(mislukt, { nu, dagen })

  const g = vergelijkGeslaagd.huidig.aantal
  const m = vergelijkMislukt.huidig.aantal
  const aandeelMislukt = g !== null && m !== null && g + m > 0 ? { mislukt: m, pogingen: g + m } : null

  // Verbruik en kosten over dezelfde volle dagen als de vergelijking.
  const { van, tot } = vergelijkGeslaagd.huidig
  const perFunctie = new Map<string, FunctieVerbruik>()
  const onbekend = new Set<string>()
  let kosten: number | null = 0

  for (const a of aanroepen) {
    const dag = dagVanIso(a.created_at)
    if (dag === null || dag < van || dag > tot) continue

    const f = perFunctie.get(a.feature) ?? {
      feature: a.feature,
      label: tokenFeatureLabel(a.feature),
      aanroepen: 0,
      systeem: 0,
      tokensIn: 0,
      tokensUit: 0,
      kostenUsd: 0,
    }
    f.aanroepen += 1
    if (a.systeem) f.systeem += 1
    f.tokensIn += a.input
    f.tokensUit += a.output

    const prijs = estimateCostUsd(a.provider, a.model, a.input, a.output, {
      read: a.cacheRead,
      write: a.cacheWrite,
    })
    if (prijs === null) {
      onbekend.add(a.model)
      f.kostenUsd = null
      kosten = null
    } else {
      if (f.kostenUsd !== null) f.kostenUsd += prijs
      if (kosten !== null) kosten += prijs
    }
    perFunctie.set(a.feature, f)
  }

  // Zonder volledig totaal over de periode is de som een deelsom.
  const verbruikOnvolledig = g === null
  if (verbruikOnvolledig) kosten = null

  return {
    geslaagd,
    mislukt,
    vergelijkGeslaagd,
    vergelijkMislukt,
    aandeelMislukt,
    perFunctie: [...perFunctie.values()].sort(
      (a, b) => b.tokensIn + b.tokensUit - (a.tokensIn + a.tokensUit) || a.feature.localeCompare(b.feature),
    ),
    kostenUsd: kosten,
    onbekendeModellen: [...onbekend].sort(),
    verbruikOnvolledig,
  }
}
