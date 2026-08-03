import { NextResponse } from 'next/server'
import { z } from 'zod'
import { unauthorized, forbidden, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { checkTierGate } from '@/lib/require-tier'
import { filterGroundedItems } from '@/lib/news-selection'
import {
  archiveCurrentEdition,
  currentJaargang,
  getCachedNews,
  getNextEditionNr,
  loadNewsArticlesByIds,
  markUsedArticles,
  setCachedNews,
} from '@/lib/news-edition-store'
import {
  localNewsClientItemSchema,
  reconcileLocalEdition,
} from '@/lib/ai/local/local-news-reconcile'
import { parseLocalNewsItemId, toLocalNewsSource } from '@/lib/ai/local/local-news-source'

/**
 * Bewaar de ON-DEVICE samengestelde nieuwseditie (groep 'nieuws' op lokaal).
 *
 * OMGEKEERDE VERTROUWENSRELATIE. Op het cloudpad genereert en bewaart de server
 * in één beweging; hier is de BROWSER de auteur en komt de editie over de lijn.
 * Alles wat daar impliciet klopte, wordt hier expliciet opnieuw afgedwongen:
 *
 *  1. de wire-vorm draagt géén `sourceUrl`/`sourceName`/`category`/`date` — de
 *     client heeft simpelweg geen veld om ze in te zetten;
 *  2. de server haalt de bronrijen ZELF op (`loadNewsArticlesByIds`, service-role)
 *     aan de hand van de artikel-id's die in de item-id's zitten, en zet die vier
 *     velden daaruit;
 *  3. `reconcileLocalEdition` klemt de impactScore op 1-5, degradeert een 'direct'
 *     zonder impactzin naar 'relevant', ontdubbelt en kapt hard af op 0-8;
 *  4. `filterGroundedItems` draait daarna alsnog als vangnet — hetzelfde net dat
 *     het cloudpad gebruikt, nu als tweede laag in plaats van als eerste.
 *
 * Een bericht dat naar een onbekend artikel wijst, bestaat dus niet en verdwijnt.
 *
 * PER BERICHT AANGEROEPEN. Er is geen server-side hervatting van een lokale
 * generatie; een tab die halverwege sluit mag geen halve editie laten verdampen.
 * De client stuurt na elk afgerond bericht de volledige lijst-tot-nu-toe, en de
 * server overschrijft de cache idempotent — geen append, dus geen race.
 *
 * GEEN CREDIT-REGISTRATIE (bewust): `recordAiUsage` hoort bij het cloudpad, waar
 * TriFinity de tokens betaalt. Hier levert de gebruiker de rekenkracht zelf; die
 * AI-credits in rekening brengen zou dubbel betalen zijn.
 *
 * TOEGANG: ingelogd → AI-kill-switch → 'ai'-abonnement. Geen privacy-gate en geen
 * cloud-guardrails: er is geen `getModel`-call en geen egress (ADR 0043 §5).
 */

/**
 * De bewaarde editie teruglezen.
 *
 * Nodig omdat `/api/news` op het lokale pad een 403 geeft (`assertCloudAllowed`):
 * dat is terecht — die route zou gaan genereren — maar het laat de client zonder
 * leespad voor de editie die hij zélf heeft bewaard. Zonder deze GET zou elke
 * paginabezoek een verse generatie van twee tot vier minuten starten.
 *
 * Uitsluitend leeswerk: dit pad start nooit een generatie.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const { data: profile } = await supabase
    .from('profiles')
    .select('ai_enabled')
    .eq('id', user.id)
    .single()
  if (profile?.ai_enabled === false) {
    return forbidden('AI-features staan uit')
  }

  const gate = await checkTierGate(supabase, user.id, 'ai')
  if (gate) return forbidden(gate.error)

  try {
    const [cached, editionNr] = await Promise.all([
      getCachedNews(supabase, user.id),
      getNextEditionNr(supabase, user.id),
    ])

    return NextResponse.json({
      items: cached?.items ?? [],
      cached: cached != null,
      generatedAt: cached?.generatedAt,
      sourceCount: cached?.sourceCount,
      editionNr,
      jaargang: currentJaargang(),
    })
  } catch (err) {
    return serverError(err, 'local-news-edition:GET')
  }
}

/** `news_articles.id` is een UUID-kolom; alles daarbuiten laat de query klappen. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const bodySchema = z.object({
  /** De editie-tot-nu-toe. Ruim boven de 0-8-cap zodat een te lange lijst een
   *  nette 400 geeft in plaats van stil te worden afgekapt. */
  items: z.array(localNewsClientItemSchema).max(50),
  /** True bij het eerste bericht van een run: archiveer dan de vorige editie. */
  archivePrevious: z.boolean().default(false),
  /** True bij het laatste bericht: markeer de gebruikte bronartikelen. */
  complete: z.boolean().default(false),
  /**
   * Hoeveel bronartikelen er zijn GETOETST (niet: gebruikt). Puur weergave: de
   * masthead toont "Gebaseerd op N bronartikelen" en de lege editie zegt "Fin
   * heeft N bronartikelen getoetst aan je profiel".
   *
   * Komt van de client omdat alleen die weet hoeveel artikelen hij van
   * /api/local-news-sources kreeg; de server kan het hier niet afleiden (hij ziet
   * alleen de artikelen die de editie hébben gehaald). Geklemd omdat het een
   * getal van buiten is — het stuurt geen enkele beslissing aan.
   */
  sourceCount: z.number().int().min(0).max(500).default(0),
  /**
   * Publicatiedatum van het nieuwste getoetste bronartikel (YYYY-MM-DD). Puur
   * weergave, net als `sourceCount`. Gaat mee omdat het cloudpad dit veld óók op
   * `CachedNews` schrijft: twee schrijvers van dezelfde cache-sleutel die elk een
   * ander deel invullen is precies de stille drift die `lib/news-edition-store.ts`
   * moest wegnemen.
   */
  sourceNewestAt: z.string().max(40).optional(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const { data: profile } = await supabase
    .from('profiles')
    .select('ai_enabled')
    .eq('id', user.id)
    .single()
  if (profile?.ai_enabled === false) {
    return forbidden('AI-features staan uit')
  }

  const gate = await checkTierGate(supabase, user.id, 'ai')
  if (gate) return forbidden(gate.error)

  const parsed = await parseBody(bodySchema, request)
  if (!parsed.ok) return parsed.response

  const { items, archivePrevious, complete, sourceCount, sourceNewestAt } = parsed.data

  try {
    // Welke bronartikelen claimt de client? Alleen de id's tellen; de inhoud
    // komt hieronder uit de database.
    // Alleen echte uuid's: `news_articles.id` is een UUID-kolom, en één andere
    // waarde in de `.in('id', …)` laat Postgres 22P02 gooien. Die fout wordt
    // faal-zacht opgevangen (lege lijst), waarna álle berichten als ongegrond
    // zouden afvallen — één rot id zou zo de hele editie gijzelen.
    const articleIds = items
      .map((i) => parseLocalNewsItemId(i.id))
      .filter((id): id is string => id !== null && UUID_PATTERN.test(id))

    const articles = await loadNewsArticlesByIds(articleIds)

    // ANOMALIE ≠ LEGE EDITIE. `loadNewsArticlesByIds` faalt zacht (service-client
    // weg, DB-storing) en geeft dan `[]` terug. Zonder deze controle zou dat
    // hieronder een LEGE editie wegschrijven — over de editie heen die er stond,
    // nadat `archiveCurrentEdition` de vorige al had weggezet, en zes uur lang
    // zichtbaar als "geen nieuws met impact". Stil verlies van andermans werk;
    // liever een eerlijke 500 en de bestaande editie laten staan.
    if (articleIds.length > 0 && articles.length === 0) {
      return serverError(
        new Error(`Bronartikelen niet laadbaar voor ${articleIds.length} bericht(en)`),
        'local-news-edition:POST',
      )
    }
    const today = new Date().toISOString().split('T')[0]
    const sources = articles.map((a) => toLocalNewsSource(a, today))

    const { kept, dropped } = reconcileLocalEdition(items, sources)
    if (dropped > 0) {
      console.warn(
        `[local-news-edition] ${dropped} bericht(en) verworpen: geen bronartikel, duplicaat of boven de cap.`,
      )
    }

    // Vangnet, niet de eerste verdediging: de bron-URL's komen hierboven al uit
    // de database, dus dit filter hoort niets meer weg te gooien. Het staat er
    // als tweede laag — dezelfde functie die het cloudpad gebruikt.
    const { kept: grounded, dropped: ungrounded } = filterGroundedItems(
      kept,
      sources.map((s) => s.sourceUrl),
    )
    if (ungrounded.length > 0) {
      console.warn(
        `[local-news-edition] Vangnet ving ${ungrounded.length} ongegrond bericht(en) — onverwacht.`,
      )
    }

    // Vorige editie naar het archief, precies één keer per run.
    if (archivePrevious) {
      await archiveCurrentEdition(supabase, user.id)
    }

    // sourceCount = aantal GETOETSTE artikelen (van de client), niet het aantal
    // gebruikte: `sources` bevat hier alleen de artikelen die de editie haalden.
    await setCachedNews(supabase, user.id, grounded, { sourceCount, sourceNewestAt })

    if (complete) {
      await markUsedArticles(articles, grounded)
    }

    return NextResponse.json({
      items: grounded,
      editionNr: await getNextEditionNr(supabase, user.id),
      jaargang: currentJaargang(),
    })
  } catch (err) {
    return serverError(err, 'local-news-edition:POST')
  }
}
