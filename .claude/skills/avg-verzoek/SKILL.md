---
name: avg-verzoek
description: Gebruik wanneer iemand vraagt om inzage, export, verwijdering of correctie van zijn persoonsgegevens — per support-mail, in een gesprek, of hoe dan ook geformuleerd ("mag ik mijn data?", "verwijder mijn account maar"). Ook bij twijfel of iets een AVG-verzoek is; behandel het dan als verzoek. Start de 30-dagenklok, stelt de identiteit vast en handelt af via de bestaande export- en verwijder-API.
---

# AVG-verzoek — inzage, export, verwijdering, correctie (30 dagen)

**Eerste regel — de termijn loopt vanaf ontvangst, niet vanaf lezing.** Een verzoek dat drie dagen ongelezen in de support-mail lag, heeft nog 27 dagen. Noteer daarom bij elke binnenkomst eerst de ontvangstdatum — dat is de klok. De dagelijkse triage (De Poortwachter) begrenst het verlies tot hooguit één dag.

## Soorten

- **Inzage** — welke gegevens hebben jullie van mij? Antwoord: categorieën + de export zelf.
- **Export (dataportabiliteit)** — de bestaande export-API levert dit; machinerie bestaat.
- **Verwijdering** — de bestaande verwijder-API. Benoem in de bevestiging wat wél bewaard blijft en waarom (wettelijke bewaarplicht, bijv. facturatie) — dat is geen weigering maar een uitzondering, en die leg je uit.
- **Correctie** — aanpassen wat aantoonbaar onjuist is; de meeste gegevens kan de gebruiker zelf wijzigen, wijs daar eerst op.

## De route

1. **Registreren** — ontvangstdatum, kanaal, soort verzoek. De aantekening is een item in het **AVG & datalekken-register** in Notion (onder de startpagina *trifinity*; spoor = verzoek) — de ⏰-deadlineview rekent de 30 dagen mee.
2. **Identiteit vaststellen** — antwoord uitsluitend naar het e-mailadres dat bij het account hoort; dat antwoord ís de toets. Vraag nooit méér gegevens op om iemand te identificeren dan je al hebt (dataminimalisatie) — geen kopie-ID.
3. **Uitvoeren** via de bestaande API's (export, verwijdering) of handmatig (correctie). Geen maatwerk-query's op productie als er een voorziening bestaat.
4. **Bevestigen** aan de verzoeker: wat is er gedaan, en bij verwijdering wat er op welke grond bewaard blijft.
5. **Aantekening afronden** — datum afgehandeld, wat er is gedaan. Bij een geweigerd of beperkt verzoek: de reden erbij.

**Lukt het niet binnen 30 dagen?** Verlengen mag (tot twee maanden extra) bij een complex verzoek — maar alleen als je dat bínnen de eerste 30 dagen aan de verzoeker laat weten, met reden.

## Verwijzing

Stroom 13, spoor 1 in `trifinity-org/org_plan/30-werkstromen.md`. Verwant: `datalek-72u` (spoor 2, de 72-uursklok), `verwerkersregister` (wie verwerkt wat — nodig voor een volledig inzage-antwoord).
