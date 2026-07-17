// Prompt-bouwers voor het harnas.
//
//  - FULL: de ÉCHTE systeemprompt uit de app (single source of truth), via
//    buildCategorizeSystemPrompt. Zo meten we de productie-prompt.
//  - COMPACT: een in de spike gedefinieerde ingekorte variant met dezelfde
//    REGELS-kern maar een kortere budgetlijst-notatie, om download/prefill-kosten
//    van de context af te wegen tegen accuracy.
//
// Beide varianten hergebruiken dezelfde user-message-structuur als de echte
// route (app/api/ai/categorize/route.ts). Omdat we hier GEEN generateObject
// (schema-enforced) hebben maar ruwe modeltekst, voegen we één expliciete
// JSON-output-instructie toe — de enige harnas-specifieke afwijking t.o.v. de
// route, die daar door het zod-schema wordt afgedwongen.

import {
  buildCategorizeSystemPrompt,
  type CategorizeBudgetOption,
} from '../../lib/ai/categorize-system-prompt.ts'
import type { DevTransaction, OutputVariant } from './types.ts'

const TYPE_LABEL_COMPACT: Record<CategorizeBudgetOption['type'], string> = {
  income: 'in',
  expense: 'uit',
  savings: 'spr',
  debt: 'sld',
}

/** Ingekorte systeemprompt: zelfde regels-kern, compacte budgetlijst. */
export function buildCompactSystemPrompt(budgets: CategorizeBudgetOption[]): string {
  const lines = budgets
    .map((b) => `${b.slug}=${b.name}${b.parentName ? ` <${b.parentName}>` : ''} [${TYPE_LABEL_COMPACT[b.type]}]`)
    .join('\n')

  return `Je bent een NL financiële assistent die banktransacties aan één budget toewijst.

BUDGETTEN (slug=naam <hoofdbudget> [in=inkomsten/uit=uitgave/spr=sparen/sld=schuld]):
${lines}

REGELS:
1. Kies EXACT één slug uit de lijst hierboven, of null als geen budget past. Verzin nooit een slug.
2. Liever null dan gokken. Slug alleen bij confidence >= 0.5.
3. Bedragrichting is hard: positief bedrag = inkomst -> alleen een [in]-budget; negatief = uitgave -> nooit een [in]-budget.
4. Kies het MEEST SPECIFIEKE deelbudget. Tegenpartij + beschrijving + bedragrichting bepalen de match.
5. NL-merkenkennis: Albert Heijn/Jumbo/Lidl/Aldi/Plus/Dirk/Picnic/Crisp = boodschappen; Thuisbezorgd/Uber Eats/Deliveroo/restaurant = uit eten; NS/OV/tankstation = vervoer; Netflix/Spotify = abonnement; salaris/toeslag/AOW = inkomst; DEGIRO/spaarrekening = sparen.
6. Redenering: max 1 NL-zin.`
}

/** FULL-variant = de echte app-prompt. */
export function buildFullSystemPrompt(budgets: CategorizeBudgetOption[]): string {
  return buildCategorizeSystemPrompt(budgets)
}

/**
 * User-message identiek aan de route, plus de JSON-output-instructie die de
 * route via het zod-schema afdwingt.
 *
 * De uitvoervariant is een aparte OUTPUT-as (los van de systeemprompt):
 *  - 'reasoning' → {budget_slug, confidence, reasoning} (huidige gedrag)
 *  - 'kort'      → {budget_slug, confidence} zonder reasoning. Grootste
 *                  snelheidshefboom: decode domineert de wandkloktijd, dus minder
 *                  tokens per transactie = evenredig sneller.
 */
export function buildUserMessage(batch: DevTransaction[], output: OutputVariant = 'reasoning'): string {
  const body = batch
    .map((tx, i) => {
      const parts = [
        `beschrijving: ${tx.description ?? ''}`,
        tx.counterparty_name ? `tegenpartij: ${tx.counterparty_name}` : null,
        `bedrag: ${tx.amount > 0 ? '+' : ''}${tx.amount}`,
        tx.date ? `datum: ${tx.date}` : null,
        tx.reference ? `referentie: ${tx.reference}` : null,
      ].filter(Boolean)
      // Elke transactie krijgt een kort batch-lokaal id (t1..tN). Het model echoot
      // dat id per item terug zodat we op id kunnen mappen i.p.v. op positie —
      // spiegelt wat de cloud-route met import_hash doet, maar met korte tokens.
      return `${batchItemId(i)}:\n   ${parts.join('\n   ')}`
    })
    .join('\n\n')

  const schema =
    output === 'kort'
      ? '[{"id": "t1", "budget_slug": "<slug-uit-de-lijst-of-null>", "confidence": <getal 0..1>}]'
      : '[{"id": "t1", "budget_slug": "<slug-uit-de-lijst-of-null>", "confidence": <getal 0..1>, "reasoning": "<max 1 NL-zin>"}]'

  const kortHint = output === 'kort' ? '\nGeef GEEN reasoning-veld — alleen id, budget_slug en confidence per item.' : ''

  return `Categoriseer de volgende ${batch.length} transacties.
Geef bij ELK item exact het meegegeven "id" terug (bv. "t3"). Retourneer exact ${batch.length} items; volgorde maakt niet uit, het id koppelt.

${body}

Antwoord UITSLUITEND met een geldige JSON-array van exact ${batch.length} objecten, zonder extra tekst en zonder markdown-fences:
${schema}${kortHint}
BELANGRIJK: past geen enkel budget uit de lijst écht, gebruik dan "budget_slug": null met confidence onder 0.5 — een onzekere gok met hoge confidence is fout. Wees streng op confidence: alleen >= 0.5 wanneer je de tegenpartij of het bestedingsdoel echt herkent.
Begin je antwoord direct met '[' en eindig met ']'.`
}

/** Batch-lokaal id voor transactie op index i (t1-based). */
export function batchItemId(i: number): string {
  return `t${i + 1}`
}

/**
 * Redelijke max_new_tokens per uitvoervariant + batchgrootte. Afkapping (te weinig
 * tokens) was op meting v1 een oorzaak van invalide output; deze schatting geeft
 * ruime marge zonder onnodig lange decode.
 *   - kort:      ~28 tok/transactie + 96 marge (item ≈ {"budget_slug":"…","confidence":0.9})
 *   - reasoning: ~80 tok/transactie + 128 marge (item incl. 1 NL-zin)
 */
export function suggestMaxNewTokens(batchSize: number, output: OutputVariant): number {
  const perTx = output === 'kort' ? 28 : 80
  const margin = output === 'kort' ? 96 : 128
  return Math.min(4096, Math.max(128, batchSize * perTx + margin))
}
