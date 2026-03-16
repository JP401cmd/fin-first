import { createClient } from '@/lib/supabase/server'
import { getModel } from '@/lib/ai/config'
import { generateObject } from 'ai'
import { z } from 'zod'

// ── Rate limiting (in-memory, per user) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

// ── Pension parse result schema ──
const RegelingSchema = z.object({
  fondsNaam: z.string().describe('Naam van het pensioenfonds of de pensioenuitvoerder'),
  brutoBedrag: z.number().describe('Bruto maandbedrag in EUR'),
  ingangLeeftijd: z.number().describe('Leeftijd waarop het pensioen ingaat'),
  isGeindexeerd: z.boolean().describe('Wordt het pensioen geindexeerd (waardevast)?'),
  type: z.enum(['ouderdomspensioen', 'nabestaandenpensioen', 'arbeidsongeschiktheidspensioen', 'overig'])
    .describe('Type pensioenregeling'),
})

const PensionParseResultSchema = z.object({
  aowBedrag: z.number().nullable().describe('Verwacht bruto AOW-bedrag per maand in EUR, of null als niet vermeld'),
  regelingen: z.array(RegelingSchema).describe('Alle gevonden pensioenregelingen'),
  nabestaandenpensioen: z.number().nullable().describe('Totaal nabestaandenpensioen per maand in EUR, of null als niet vermeld'),
  samenvatting: z.string().describe('Korte samenvatting van het pensioenoverzicht in 1-2 zinnen'),
})

export type PensionParseResult = z.infer<typeof PensionParseResultSchema>

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Rate limit check
  if (!checkRateLimit(user.id)) {
    return Response.json(
      { error: 'Te veel uploads. Maximaal 5 per uur. Probeer het later opnieuw.' },
      { status: 429 }
    )
  }

  // Parse multipart form data
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return Response.json({ error: 'Ongeldig verzoek. Verwacht multipart/form-data.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return Response.json({ error: 'Geen bestand gevonden. Upload een PDF.' }, { status: 400 })
  }

  // Validate file type
  if (file.type !== 'application/pdf') {
    return Response.json({ error: 'Alleen PDF-bestanden zijn toegestaan.' }, { status: 400 })
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: 'Bestand is te groot. Maximaal 10 MB.' }, { status: 400 })
  }

  try {
    // Read file as base64
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Get AI model
    const model = await getModel(supabase)

    // Parse pension PDF with AI
    const { object: result } = await generateObject({
      model,
      schema: PensionParseResultSchema,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Je bent een expert in het analyseren van Nederlandse pensioenoverzichten van mijnpensioenoverzicht.nl.

Analyseer het bijgevoegde PDF-document en extraheer de volgende gegevens:

1. **AOW-bedrag**: Het verwachte bruto AOW-bedrag per maand. Als het niet vermeld staat, gebruik null.
2. **Pensioenregelingen**: Voor elke regeling:
   - fondsNaam: naam van het pensioenfonds
   - brutoBedrag: bruto maandbedrag in EUR
   - ingangLeeftijd: leeftijd waarop het pensioen ingaat
   - isGeindexeerd: of het pensioen waardevast is (geindexeerd)
   - type: ouderdomspensioen, nabestaandenpensioen, arbeidsongeschiktheidspensioen, of overig
3. **Nabestaandenpensioen**: Totaalbedrag per maand, of null als niet vermeld.
4. **Samenvatting**: Een korte samenvatting in 1-2 zinnen.

Let op:
- Bedragen zijn altijd in EUR per maand (reken jaar naar maand als nodig: deel door 12)
- Als een bedrag per jaar staat, deel het door 12
- Scheid ouderdomspensioen van nabestaandenpensioen
- Als de PDF geen pensioenoverzicht is, geef dan lege regelingen terug en vermeld dat in de samenvatting`,
            },
            {
              type: 'file',
              data: base64,
              mediaType: 'application/pdf',
            },
          ],
        },
      ],
    })

    return Response.json(result)
  } catch (err) {
    console.error('[pension/parse] Error:', err)
    const message = err instanceof Error ? err.message : 'Onbekende fout'

    // Check for AI config errors
    if (message.includes('API key')) {
      return Response.json(
        { error: 'AI is niet geconfigureerd. Stel een API key in via Beheer > AI Instellingen.' },
        { status: 503 }
      )
    }

    return Response.json(
      { error: 'Fout bij het verwerken van de PDF. Probeer het opnieuw.' },
      { status: 500 }
    )
  }
}
