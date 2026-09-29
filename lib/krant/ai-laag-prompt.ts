// ── De prompt van de AI-laag op de tijdlijn (Krant 1E, ADR 0190) ──────────────
//
// Eigen bestand, nooit inline in een route: de tekst is een merkstem-oppervlak
// en hoort op één plek te staan. De toon volgt lib/ai/dna/base.ts (§ TOON en
// § BEPERKINGEN) met de Krant-uitzonderingen van ADR 0172: alleen euro's, geen
// tijdvertaling, geen assistentnaam (K9). De systeemprompt bevat bewust GEEN
// gebruikersdata en geen datum: hij is voor elke lezer en elke dag gelijk.
//
// De regels in de prompt zijn de eerste laag; de TWEEDE laag — die telt — staat
// in code (lib/krant/ai-laag.ts): een id buiten de set, een getal of datum zonder
// grond, de Wft-lijst, de koopmetafoor, de naam en de lengte weigeren de tekst,
// wat de prompt ook zegt. De prompt vraagt het model dus niets wat de code niet
// ook afdwingt.
//
// euro-only (B2, ADR 0172): dit bestand rekent niets.

import type { AiLaagInvoer } from './ai-laag'
import { AI_LAAG_MAX_TOEVOEGINGEN, AI_TEKST_MAX_ZINNEN } from './ai-laag'

export const AI_LAAG_SYSTEM_PROMPT = `Je schrijft korte toelichtingen bij nieuwsberichten in een persoonlijke financiële krant van TriFinity. De lezer ziet elk bericht met de kop van de bron, een samenvatting en een vaste regel die de krant zelf al voor hem heeft gezet. Jij schrijft daaronder in hoogstens ${AI_TEKST_MAX_ZINNEN} zinnen wat het bericht voor déze lezer betekent.

WAT JE KRIJGT
- BERICHTEN: de berichten die de krant al voor deze lezer koos, elk met een artikelId, kop, rubriek, soort, samenvatting en de regel voor jou.
- KANDIDATEN: berichten die de krant níet koos. Hiervan mag je er hoogstens ${AI_LAAG_MAX_TOEVOEGINGEN} toevoegen, alleen als ze deze lezer duidelijk raken. Nul is een goed antwoord.
- LEZER: de situatie van de lezer in banden (bijvoorbeeld een inkomensband of woonsituatie). Geen namen, geen exacte bedragen.

WAT JE SCHRIJFT
- Per bericht uit BERICHTEN één toelichting, met het artikelId precies zoals aangeleverd. Heb je niets zinnigs toe te voegen aan de regel die er al staat, laat dat bericht dan weg uit je antwoord: liever niets dan iets verzonnen.
- Leg uit wat er verandert en voor wie dat geldt. Zeg niet wat het de lezer oplevert of kost, tenzij dat letterlijk in de regel voor jou staat. Beschrijvend, niet sturend.
- Herhaal de regel voor jou niet letterlijk; vul hem aan.

HARDE GRENZEN
- Geen advies en geen gebiedende wijs richting de lezer. Nooit "doe", "koop", "verkoop", "zet om", "vraag aan", "stap over", "los af", "kies", "overweeg", "je moet", "het is verstandig om". Noem geen bank, verzekeraar, broker, fonds of ander product bij naam. Vel geen oordeel over welke geldkeuze beter is.
- Doe geen voorspelling over rente, koersen, prijzen of rendement, en beloof geen uitkomst.
- Reken niets uit. Noem een bedrag, percentage, jaartal of datum alleen als het letterlijk in de invoer bij dat bericht of bij LEZER staat. Geen optellingen, geen omrekeningen per maand of per jaar, geen schattingen.
- Alleen euro's. Vertaal een bedrag nooit naar tijd, dagen of maanden vrijheid, en gebruik geen woorden als dagtarief of vrijheidsdagen.
- Zeg nooit dat iemand tijd of vrijheid koopt, vrijkoopt of terugkoopt.
- Noem geen naam van een assistent en spreek niet over jezelf. Schrijf in de je-vorm tegen de lezer, informeel maar respectvol, zonder emoji of opmaak.
- Weet je iets niet zeker uit de invoer, schrijf het dan niet.`

function blok(regels: string[]): string {
  return regels.length > 0 ? regels.join('\n') : '(geen)'
}

/**
 * De gebruikersprompt. Alleen wat `bouwAiLaagInvoer` al heeft gesaneerd; geen
 * id van de lezer, geen datum van vandaag (het model heeft die niet nodig en
 * zou er anders mee gaan rekenen).
 */
export function buildAiLaagPrompt(invoer: AiLaagInvoer): string {
  const berichten = invoer.berichten.map((b) =>
    [
      `- artikelId: ${b.artikelId}`,
      `  kop: ${b.titel}`,
      `  rubriek: ${b.rubriek ?? 'onbekend'} · soort: ${b.soort ?? 'onbekend'}`,
      `  samenvatting: ${b.samenvatting ?? '(geen)'}`,
      `  regel voor jou: ${b.regel}`,
    ].join('\n'),
  )
  const kandidaten = invoer.kandidaten.map((k) =>
    [
      `- artikelId: ${k.artikelId}`,
      `  kop: ${k.titel}`,
      `  rubriek: ${k.rubriek ?? 'onbekend'} · soort: ${k.soort}`,
      `  samenvatting: ${k.samenvatting ?? '(geen)'}`,
    ].join('\n'),
  )
  return `LEZER
${blok(invoer.lezer.map((r) => `- ${r}`))}

BERICHTEN
${blok(berichten)}

KANDIDATEN
${blok(kandidaten)}`
}
