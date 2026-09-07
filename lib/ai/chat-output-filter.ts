/**
 * Uitvoerfilter op de chat-stream: emoji strippen (UR3-11) én PII maskeren.
 *
 * WAAROM DIT EEN EIGEN MODULE IS. De transform stond inline in
 * `app/api/ai/chat/route.ts` en was daardoor niet te testen zonder de hele route
 * (auth, gates, model, provider) te mocken. Precies dáárdoor kon de PII-tak jaren
 * stilstaan zonder dat één test rood werd: hij testte op `typeof chunk ===
 * 'string'`, terwijl `result.toUIMessageStream()` in AI SDK 6
 * `UIMessageChunk`-OBJECTEN levert (`AsyncIterableStream<InferUIMessageChunk>`;
 * de union in `node_modules/ai/dist/index.d.ts` bevat geen enkele string-variant).
 * De maskering vuurde dus nooit. Als losse module is de bewijslast een gewone
 * unittest: echte chunk-objecten erin, gefilterde chunks eruit.
 *
 * VOLGORDE. Eerst emoji strippen, dan PII maskeren — wat de gebruiker ziet is
 * daarmee altijd de gemaskeerde variant. Beide filters houden per tekstblok een
 * korte staart vast (een pictogram of een IBAN mag niet op een chunkgrens
 * ontsnappen); bij `text-end` worden ze in die volgorde geleegd.
 *
 * WAT BEWUST NIET WORDT AANGERAAKT: `reasoning-delta` (niet getoond in de chat),
 * `error` (onze eigen curated copy uit `error-copy.ts`) en tool-uitvoer (komt uit
 * onze eigen tools op eigen data, niet uit modeltekst).
 */

import { createEmojiTextFilter } from './emoji-output-filter'
import { createPIITextFilter } from './pii-stream-filter'

/** De velden die we van een UIMessageChunk lezen; de rest gaat ongemoeid door. */
type TekstChunk = { type?: string; id?: string; delta?: string }

/**
 * Bouw de TransformStream die tussen `toUIMessageStream()` en de HTTP-respons
 * hangt. Eén instantie per verzoek: beide filters houden per tekstblok toestand.
 */
export function createChatOutputFilter() {
  // Emoji-uitvoertoets (UR3-11, spoor B). Het emoji-verbod staat al in
  // `lib/ai/dna/base.ts`, maar de AI-regressieset mat op 6 sep 2026 alsnog 23
  // emoji in 129 antwoorden — stijl is de getrainde default van het model.
  // AC2 is absoluut ("bevat geen emoji"), dus hier ligt de deterministische
  // laag eronder. BEWUST alleen emoji en NIET de lengte: strippen is
  // teken-niveau en idempotent, een stream afkappen niet — dat levert precies
  // de kapotte zin op die de kaart meldt.
  const emojiFilter = createEmojiTextFilter()
  const piiFilter = createPIITextFilter()
  /** Tekstblokken waarvan nog geen `text-end` langskwam (zie `flush`). */
  const openBlokken = new Set<string>()

  /** Leeg beide staarten van tekstblok `id` en geef de resttekst terug. */
  function sluitBlok(id: string): string {
    openBlokken.delete(id)
    return piiFilter.end(id, emojiFilter.end(id))
  }

  return new TransformStream({
    transform(chunk: unknown, controller: TransformStreamDefaultController) {
      const part = chunk as TekstChunk
      if (part?.type === 'text-delta' && typeof part.id === 'string' && typeof part.delta === 'string') {
        // De staart wordt per tekstblok-id vastgehouden zodat een pictogram
        // (surrogaatpaar, variatieselector, ZWJ-reeks) of een IBAN/BSN dat op
        // een chunkgrens valt niet doorglipt.
        openBlokken.add(part.id)
        const schoon = emojiFilter.delta(part.id, part.delta)
        controller.enqueue({ ...part, delta: piiFilter.delta(part.id, schoon) })
        return
      }
      if (part?.type === 'text-end' && typeof part.id === 'string') {
        const staart = sluitBlok(part.id)
        if (staart) controller.enqueue({ type: 'text-delta', id: part.id, delta: staart })
      }
      controller.enqueue(chunk)
    },
    /**
     * Eindigt de stream zonder `text-end` (afgebroken verzoek, providerfout),
     * dan zou de vastgehouden staart verloren gaan. Hier komt hij alsnog vrij —
     * gemaskeerd, want dit is de laatste plek vóór de gebruiker.
     */
    flush(controller: TransformStreamDefaultController) {
      for (const id of [...openBlokken]) {
        const staart = sluitBlok(id)
        if (staart) controller.enqueue({ type: 'text-delta', id, delta: staart })
      }
    },
  })
}
