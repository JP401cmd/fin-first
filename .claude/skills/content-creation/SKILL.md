---
name: content-creation
description: Gebruik voor elk nieuw publiek stuk tekst — landingcopy, een root-route, een /nieuws-item, de wekelijkse briefing-mail of een deelbaar asset. Twee modi: volledig (van briefing tot gepubliceerde tekst) en snel (concept op een korte briefing). Zorgt dat toon, claims en ontwerp uit hun canonieke bronnen komen en dat de compliance-poort vóór publicatie wordt gehaald.
---

# Content-creation — publieke stukken maken

**Eerste regel — elke claim over veiligheid, opslag of rendement gaat vóór publicatie langs `compliance-check`.** Dat is een poort, geen formaliteit: inzicht mag, vergunningsplichtig advies niet. Publiceren zonder die passage is geen tijdwinst maar een risico dat je later moet weghalen.

**Tweede regel — schrijf niets over wat elders canoniek staat.** Toon en framing: `merkstem` (die wijst door naar `lib/ai/dna/base.ts`). Toegestane claims: de claimlijst in `compliance-check`. Getallen: de canonieke engines, nooit zelf een som. Deze skill is het *proces*, niet de norm.

## Twee modi

**Volledig** — een nieuw stuk van betekenis: landingsectie, root-route, een /nieuws-item met eigen invalshoek. Doorloopt alle stappen hieronder.

**Snel** — een concept op een korte briefing: de wekelijkse briefing-mail, een korte aankondiging, een variant op bestaande copy. Stap 1 en 2 mag je samenvoegen; **stap 4 (de poort) nooit overslaan** — juist snelle teksten glippen erdoor.

## De stappen

1. **Waar gaat het over.** Komt het onderwerp uit `zoekvraag-onderzoek` (oordeel `inzicht`), dan ligt de vraag er al. Zo niet: schrijf in één zin welke vraag van de lezer je beantwoordt. Kun je dat niet, dan is het stuk er nog niet.
2. **Wat is de belofte, en houdt hij stand.** Eén kernbelofte per stuk. Toets 'm meteen tegen de claimlijst — een belofte die je later moet afzwakken is beter nu al anders geformuleerd.
3. **Schrijven.** Nederlands, je/jij, kort en concreet, geen emoji. Bedragen van betekenis ook in vrijheidstijd — "geld is opgeslagen tijd" is de taal, geen opsmuk. Kansen, niet schaarste.
4. **De poort.** `compliance-check`, met een beslisbare uitkomst (goedkeuren · aanpassen · afwijzen). Raakt het `/privacy`, `/voorwaarden` of `/wft`, dan geldt de uitzonderingsroute uit `CLAUDE.md`: nooit via `kleine-aanpassing`, altijd mét een `juridische-brief`-aantekening.
5. **Vormgeven.** Publieke/marketing-oppervlakken: `frontend-design`. In-app schermen: `ui-ux` is daar de single source of truth — verwar die twee niet.

## Waar het landt

`components/landing/**` (hero, secties, FAQ, pricing), de publieke root-routes, `/nieuws`, en de briefing-mail (`lib/briefing/**`).

**De briefing-mail is transactioneel en blijft dat.** Resend wordt uitsluitend transactioneel gebruikt; er is geen mailingplatform en geen opt-in-grondslag voor marketingmail. Volgt uit **ADR 0068** — daaruit volgt ook een harde tekstregel: **"we nemen contact op" mag nergens staan** zolang leads bewust niet worden opgevolgd. Wek die verwachting dus in geen enkel stuk.

## Verwijzing

`org_plan/20-skills.md` §content-creation (`draft-content` is hier de *snelle modus*, geen aparte skill); rol De Verteller (`org_plan/10-rollen.md`), stromen 03, 04, 09, 10. Verwant: `merkstem`, `compliance-check`, `zoekvraag-onderzoek`, `competitive-brief`, `frontend-design`, `ui-ux`.
