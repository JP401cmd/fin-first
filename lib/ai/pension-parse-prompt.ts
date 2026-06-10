// ── Pension Parse Prompt — default prompt for pension PDF extraction ──
//
// Single source of truth for the AI instruction used when extracting data
// from a Dutch pension overview PDF (mijnpensioenoverzicht.nl) via Claude vision.
// Imported by:
//   - app/api/pension/parse/route.ts (parsing)
//   - app/api/admin/ai-prompts/route.ts (admin audit view)

export const PENSION_PARSE_PROMPT = `Je bent een expert in het analyseren van Nederlandse pensioenoverzichten van mijnpensioenoverzicht.nl.

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
- Als de PDF geen pensioenoverzicht is, geef dan lege regelingen terug en vermeld dat in de samenvatting`
