// ── Pensioen parse-contracten ───────────────────────────
// Canonieke zod-schema's + afgeleide types voor het parsen van
// pensioenoverzichten. Verhuisd uit app/api/pension/parse/route.ts zodat
// lib/pension/* deze contracten importeert zonder terug naar de API-route te
// reiken (import-richting UI/route → lib).

import { z } from 'zod'

export const RegelingSchema = z.object({
  fondsNaam: z.string().describe('Naam van het pensioenfonds of de pensioenuitvoerder'),
  brutoBedrag: z.number().describe('Bruto maandbedrag in EUR'),
  ingangLeeftijd: z.number().describe('Leeftijd waarop het pensioen ingaat'),
  isGeindexeerd: z.boolean().describe('Wordt het pensioen geindexeerd (waardevast)?'),
  type: z.enum(['ouderdomspensioen', 'nabestaandenpensioen', 'arbeidsongeschiktheidspensioen', 'overig'])
    .describe('Type pensioenregeling'),
})

export const PensionParseResultSchema = z.object({
  aowBedrag: z.number().nullable().describe('Verwacht bruto AOW-bedrag per maand in EUR, of null als niet vermeld'),
  regelingen: z.array(RegelingSchema).describe('Alle gevonden pensioenregelingen'),
  nabestaandenpensioen: z.number().nullable().describe('Totaal nabestaandenpensioen per maand in EUR, of null als niet vermeld'),
  samenvatting: z.string().describe('Korte samenvatting van het pensioenoverzicht in 1-2 zinnen'),
  // Optioneel: alleen de deterministische JSON-mapper (mijnpensioen-json.ts) vult
  // deze. De AI-PDF-extractie laat ze ongemoeid (undefined), zodat het PDF-pad
  // onveranderd blijft en de AOW-keuze daar alleen "bijwerken" kan aanbieden.
  aowLeeftijd: z.number().optional().describe('AOW-leeftijd (hele jaren) — alleen uit de JSON-export'),
  aowLeefsituatie: z.enum(['samenwonend', 'alleenstaand']).optional()
    .describe('Woonsituatie waarop het AOW-bedrag gebaseerd is — alleen uit de JSON-export'),
})

export type PensionParseResult = z.infer<typeof PensionParseResultSchema>
