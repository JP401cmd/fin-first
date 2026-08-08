import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { badRequest, errorResponse, serverError, unauthorized } from '@/lib/api/respond'
import { pushReportToNotion, type UserReportRow } from '@/lib/user-reports/notion'

/**
 * POST `/api/user-reports` — meldingen van testgebruikers (bug/vraag/wens).
 *
 * Supabase-first: het screenshot gaat als eerste naar de privé bucket, daarna
 * legt `public.reserve_user_report_slot` de melding vast (rem + insert in één
 * atomaire stap) en daarna pas volgt — best effort — het Notion-kaartje. Zo is
 * een melding nooit kwijt als Notion hapert.
 *
 * Body is multipart FormData:
 *   - `payload`    JSON-string met de tekstvelden (schema hieronder)
 *   - `screenshot` optioneel bestand (png/jpeg/webp, ≤ 4 MB; niet bij aanbeveling)
 *
 * `parseBody` is JSON-only en past hier dus niet; de payload wordt handmatig
 * geparsed en met hetzelfde zod-fundament gevalideerd (ADR 0044-envelope).
 */

// Node-runtime: de best-effort Notion-push leest server-only secrets.
export const runtime = 'nodejs'

const BUCKET = 'user-report-screenshots'
const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4 MB
const ALLOWED_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/**
 * De rem (5 meldingen per rollend uur) staat NIET meer hier maar in
 * `public.reserve_user_report_slot` (migratie 20260806161500). Bewust: de vorige
 * count-dan-insert was een TOCTOU én volledig te omzeilen door rechtstreeks via
 * PostgREST in te voegen. De RPC telt en voegt in onder één advisory lock, en de
 * eigen-rij INSERT-policy is opgeheven zodat er geen pad omheen meer bestaat.
 * De limiet is geen parameter van de RPC — anders zou een directe aanroep hem
 * kunnen oprekken. Hij komt terug als `slot_limit` voor logging.
 */

/**
 * Uitkomst van `public.reserve_user_report_slot`. `report` is de volledige
 * ingevoegde rij als jsonb — `null` wanneer de rem de melding weigerde.
 */
interface ReserveSlotResult {
  slot_allowed: boolean
  slot_used: number
  slot_limit: number
  report: UserReportRow | null
}

const ContextSchema = z.object({
  pathname: z.string().trim().max(300),
  pageTitle: z.string().trim().max(200).nullable().optional(),
  userAgent: z.string().trim().max(600),
  viewport: z.string().regex(/^\d{2,5}x\d{2,5}$/, 'viewport heeft een ongeldig formaat'),
  appVersion: z.string().trim().max(64),
})

const ReportSchema = z
  .object({
    type: z.enum(['bug', 'vraag', 'aanbeveling']),
    screen: z.string().trim().max(120).optional(),
    description: z.string().trim().min(5).max(4000),
    expected: z.string().trim().max(4000).optional(),
    consent: z.boolean(),
    context: ContextSchema,
  })
  .superRefine((value, ctx) => {
    if (value.type === 'aanbeveling') {
      // Een aanbeveling kent bewust geen scherm, geen verwachting en geen
      // toestemmingsvraag — die velden accepteren zou suggereren dat ze iets doen.
      if (value.screen) {
        ctx.addIssue({ code: 'custom', path: ['screen'], message: 'niet toegestaan bij een aanbeveling' })
      }
      if (value.expected) {
        ctx.addIssue({ code: 'custom', path: ['expected'], message: 'niet toegestaan bij een aanbeveling' })
      }
      if (value.consent) {
        ctx.addIssue({ code: 'custom', path: ['consent'], message: 'niet toegestaan bij een aanbeveling' })
      }
      return
    }

    // Bug en vraag horen altijd bij een scherm: zonder plek is triage giswerk.
    if (!value.screen || value.screen.length < 1) {
      ctx.addIssue({ code: 'custom', path: ['screen'], message: 'scherm is verplicht' })
    }
  })

/**
 * Zod-issue → Nederlandse tekst voor de melder.
 *
 * Zod's eigen `issue.message` is Engels en technisch ("Too big: expected string
 * to have <=4000 characters"). Die letterlijk doorgeven zou de énige Engelse
 * zin in een verder volledig Nederlandse flow zijn — en bovendien praten over
 * `description` in plaats van over "je omschrijving". Daarom vertalen we per
 * veld, in de taal van het formulier zelf.
 *
 * Gesleuteld op het pad (`context.viewport` → 'context.viewport'), zodat een
 * hernoemd veld hier zichtbaar uit de lucht valt in plaats van stil op de
 * fallback te belanden. Het formulier heet naar de gebruiker toe een "wens",
 * niet een "aanbeveling" — de teksten volgen die woordkeuze.
 */
const VALIDATION_MESSAGES: Record<string, (issue: z.ZodIssue) => string> = {
  type: () => 'Kies eerst wat voor melding dit is.',
  screen: (issue) =>
    issue.message === 'niet toegestaan bij een aanbeveling'
      ? 'Bij een wens hoort geen scherm.'
      : issue.code === 'too_big'
        ? 'De schermnaam is te lang (maximaal 120 tekens).'
        : 'Vul in op welk scherm je dit tegenkwam.',
  description: (issue) =>
    issue.code === 'too_big'
      ? 'Je omschrijving is te lang. Houd het op maximaal 4.000 tekens.'
      : issue.code === 'too_small'
        ? 'Je omschrijving is te kort. Schrijf minstens 5 tekens.'
        : 'Vul een omschrijving in.',
  expected: (issue) =>
    issue.message === 'niet toegestaan bij een aanbeveling'
      ? 'Bij een wens hoort geen verwachting.'
      : issue.code === 'too_big'
        ? 'Wat je verwachtte is te lang. Houd het op maximaal 4.000 tekens.'
        : 'Wat je verwachtte kon niet gelezen worden.',
  consent: (issue) =>
    issue.message === 'niet toegestaan bij een aanbeveling'
      ? 'Bij een wens hoort geen toestemmingsvraag.'
      : 'De toestemmingsvraag is niet goed ingevuld.',
  // De context wordt automatisch meegestuurd, niet ingetypt. Gaat hier iets mis,
  // dan is dat een fout van de app en niet van de melder — dus geen "verbeter
  // dit"-tekst, maar een vraag om het opnieuw te proberen.
  'context.pathname': () => 'De pagina-gegevens van je melding konden niet gelezen worden.',
  'context.pageTitle': () => 'De pagina-gegevens van je melding konden niet gelezen worden.',
  'context.userAgent': () => 'De browsergegevens van je melding konden niet gelezen worden.',
  'context.viewport': () => 'De schermafmeting van je melding kon niet gelezen worden.',
  'context.appVersion': () => 'De versiegegevens van je melding konden niet gelezen worden.',
  context: () => 'De technische gegevens van je melding konden niet gelezen worden.',
}

/** Eerste zod-issue als Nederlandse, client-veilige zin. */
function dutchValidationMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Er ontbreekt iets in je melding.'
  const path = issue.path.join('.')
  const translate = VALIDATION_MESSAGES[path]
  // Fallback bewust ZONDER issue.message: een onbekend pad mag geen Engelse
  // zod-tekst alsnog naar buiten laten glippen.
  return translate ? translate(issue) : 'Er ontbreekt iets in je melding.'
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  try {
    // 1. Multipart uitpakken en de payload valideren.
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return badRequest('Ongeldig verzoek.')
    }

    const rawPayload = formData.get('payload')
    if (typeof rawPayload !== 'string') {
      return badRequest('Melding ontbreekt.')
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(rawPayload)
    } catch {
      return badRequest('Melding kon niet gelezen worden.')
    }

    const parsed = ReportSchema.safeParse(parsedJson)
    if (!parsed.success) {
      return badRequest(dutchValidationMessage(parsed.error), 'validation_error')
    }
    const body = parsed.data

    // 2. Screenshot valideren (aanwezigheid, type en grootte).
    const rawFile = formData.get('screenshot')
    let screenshot: File | null = null
    if (rawFile instanceof File && rawFile.size > 0) {
      if (body.type === 'aanbeveling') {
        return badRequest('Bij een aanbeveling kun je geen schermafbeelding meesturen.')
      }
      if (!ALLOWED_MIME[rawFile.type] || rawFile.size > MAX_FILE_SIZE) {
        return badRequest('Alleen PNG, JPEG of WebP tot 4 MB.')
      }
      screenshot = rawFile
    }

    // 3. Screenshot eerst, ID vooraf. `user_reports` heeft bewust GEEN eigen-rij
    //    UPDATE-policy (een melding is een verzonden bericht, en de sync-velden
    //    mogen niet door de gebruiker terugzetbaar zijn). Een nagestuurde
    //    `screenshot_path`-update via de sessie-client zou daardoor STIL 0 rijen
    //    raken — RLS geeft daar geen fout op. Door de uuid hier te genereren
    //    kunnen we naar het definitieve pad uploaden en het pad meteen aan de
    //    reserveer-RPC meegeven; de rij is dus in één klap compleet.
    //    `upsert: false`: de bucket heeft eveneens geen UPDATE-policy, en het
    //    pad is per definitie nieuw.
    const reportId = crypto.randomUUID()
    let screenshotPath: string | null = null

    if (screenshot) {
      const extension = ALLOWED_MIME[screenshot.type]
      const path = `${user.id}/${reportId}.${extension}`
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, await screenshot.arrayBuffer(), {
          contentType: screenshot.type,
          upsert: false,
        })

      if (uploadError) {
        // De melding is belangrijker dan de illustratie: server-side loggen en
        // zonder beeld doorgaan.
        console.error(`[user-reports:POST] upload mislukt voor ${reportId}: ${uploadError.message}`)
      } else {
        screenshotPath = path
      }
    }

    // 4. Reserveren én invoegen in één atomaire stap. De rem van 5 per rollend
    //    uur zit ín deze RPC (advisory lock op de melder), dus N gelijktijdige
    //    verzoeken kunnen samen nooit meer dan de limiet doorlaten — de vorige
    //    count-dan-insert liet dat wél toe. `user_id` en `email` komen daar uit
    //    de sessie resp. `auth.users`, dus die sturen we bewust NIET mee.
    const { data: slots, error: slotError } = await supabase.rpc('reserve_user_report_slot', {
      p_id: reportId,
      p_report_type: body.type,
      p_description: body.description,
      p_screen_label: body.screen ?? null,
      p_expected: body.expected ?? null,
      p_consent_inzage: body.type === 'aanbeveling' ? false : body.consent,
      p_route: body.context.pathname,
      p_page_title: body.context.pageTitle ?? null,
      p_user_agent: body.context.userAgent,
      p_viewport: body.context.viewport,
      p_app_version: body.context.appVersion,
      p_screenshot_path: screenshotPath,
    })

    // `returns table (…)` levert via PostgREST een array met precies één rij.
    const slot = (Array.isArray(slots) ? slots[0] : slots) as ReserveSlotResult | undefined

    if (slotError || !slot) {
      // Bekende, begrensde restpost (geldt ook voor de 429 hieronder): een reeds
      // geüpload screenshot blijft dan als wees in de privé bucket staan.
      // Opruimen kan hier niet — de bucket heeft bewust geen DELETE-policy voor
      // de gebruiker — en het pad hangt aan een uuid die nooit meer terugkomt,
      // dus het is onbereikbaar afval.
      return serverError(
        slotError ?? new Error('reserve_user_report_slot leverde geen rij op'),
        'user-reports:POST',
      )
    }

    if (!slot.slot_allowed) {
      console.warn(
        `[user-reports:POST] throttle geweigerd voor ${user.id}: ${slot.slot_used}/${slot.slot_limit} in het laatste uur`,
      )
      return errorResponse(
        'Je hebt al veel meldingen gestuurd. Probeer het over een uur nog eens.',
        429,
        'rate_limited',
      )
    }

    if (!slot.report) {
      return serverError(
        new Error('slot toegestaan maar zonder rij'),
        'user-reports:POST',
      )
    }

    const row = slot.report

    // 5. Best-effort Notion-push. Faalt dit, dan blijft de rij op 'error' staan
    //    en pakt de dagelijkse cron 'm opnieuw op — de gebruiker merkt niets.
    try {
      await pushReportToNotion(getServiceClient(), row)
    } catch (err) {
      console.error('[user-reports:POST] notion-push wierp onverwacht:', err)
    }

    return NextResponse.json({ ok: true, id: row.id })
  } catch (err) {
    return serverError(err, 'user-reports:POST')
  }
}
