---
name: ticket-triage
description: Gebruik op het vaste kijkmoment en bij elke binnenkomende melding van een gebruiker — een bug, een vraag, een wens, een foutmelding of feedback. Ordent de stapel: ontdubbelen, module en ernst bepalen, één uitgang kiezen, en de melder iets laten horen. Het ritme en de uitgangen staan in het beheerders-runbook; deze skill is het hoe.
---

# Ticket-triage — de stapel ordenen

**Eerste regel — twee klokken wachten niet op het kijkmoment.** Raakt de melding persoonsgegevens (`avg-verzoek`, 30 dagen na ontvangst) of is het een mogelijk lek (`datalek-72u`, 72 uur na kennisname), dan gaat die route **direct** in. Beide lopen vanaf kennisname, niet vanaf het moment dat jij tijd hebt. Dit is de enige stap die niet mag wachten.

**Tweede regel — een verkeerd bedrag is altijd het hoogste niveau.** Dit is een rekenapp; een fout getal ondermijnt precies datgene waarvoor iemand hem gebruikt. Zelfde dag de hotfix-route uit, ongeacht hoeveel gebruikers het raakt.

## Het ritme staat elders — lees het daar

De reactienorm (2× 15 min per week, geen dagritme), de inbakken-tabel en de vijf uitgangen van de beslisboom staan in **`docs/beheerders-runbook.md` §Monitoring**. Dat is de bron; schrijf ze hier niet over. Deze skill beschrijft wat je *doet* zodra je voor de stapel zit.

## De vier handelingen

**1. Ontdubbelen — eerst, altijd.** Dezelfde fout levert tientallen regels; honderden `error_logs`-regels zijn typisch een handvol unieke problemen. Groepeer op de fout, niet op de melding. Bestaat er al een kaart, koppel de melding daaraan en maak geen tweede.

**2. Module en ernst.** Module: Kern (geld nu), Wil (acties/berichten) of Horizon (toekomst) — kies waar de gebruiker was, niet waar de code zit. Ernst volgt uit de uitgang: verkeerd bedrag = hoogste, dataverlies = hoogste, de rest binnen 72 uur.

**3. Eén uitgang kiezen.** Per melding precies één, volgens de beslisboom in het runbook. Twee aandachtspunten die daar niet in staan:
   - **Escalatie is geen aparte deur maar een tak.** Storing of dataverlies → `incidentprotocol`; die doet zijn eigen tien-minuten-triage en routeert zelf door naar `bug-fix` en zo nodig `datalek-72u`. Niet zelf een parallel spoor beginnen.
   - **Een wens is geen defect.** Een kaart in de werkqueue, niet de bug-route in. Verkeerd geplaatste wensen vervuilen de defect-cijfers.

**4. Laat de melder iets horen — de slotstap.** Handwerk, en het goedkoopste retentiemiddel dat er is: iemand die moeite deed om iets te melden en niets terughoort, meldt de volgende keer niets. Kort: wat je ermee doet en wanneer hij iets merkt. Toon volgt `merkstem`. Is het antwoord juridisch getint (een klacht, een verzoek over persoonsgegevens, een verwijt dat wij "geadviseerd" zouden hebben) → `legal-response`. Raakt het een claim → `compliance-check`.

## Wat je niet doorzet, ben je kwijt

Twee inbakken **onthouden niets van jouw ronde**, elk om een eigen reden:

- **Nieuwsfeedback** is bewust een *venster*, geen werkvoorraad (ADR 0113). Er ís een scherm (`/beheer/nieuws`, sectie *Feedback op nieuwsitems*), maar het is alleen-lezen: een voorkeurssignaal kent geen `nieuw → gelezen`. Wat je eruit meeneemt, neem je mee als kaart — of het is weg. Verschijnt daar ooit wél een afvinkknop, dan is dát een bevinding.
- **Support-mail** bestaat feitelijk niet: `lib/legal-contact.ts` zet beide adressen op `null` zolang er geen domein is, dus daar komt vandaag **geen post binnen, ook geen AVG-verzoek en geen lekmelding.**

**Foutmeldingen zijn hier sinds ADR 0113 de uitzondering geworden** — `/beheer/errors` is wél afvinkbaar, maar **per foutSOORT, niet per regel**: het scherm groepeert dezelfde fout met andere ids of bedragen tot één. `error_logs` zelf blijft append-only; het vinkje leeft in `error_log_resolutions` (migratie `20260828140000`). Komt een afgevinkte soort terug, dan **heropent hij zichzelf** met de aantekening "teruggekomen" — dat is een regressie en hoort een kaart te worden, geen tweede vinkje.

## In-app meldingen lopen anders — controleer, verwerk niet opnieuw

Meldingen uit de app zelf (bug / vraag / aanbeveling) landen in `public.user_reports` en worden **automatisch** kaartjes in de Notion-werkqueue; een dagelijkse cron herstelt wat live misging. Deze inbak heeft dus wél status (`notion_sync_status`, `notion_page_id`). Jouw taak hier is niet triëren maar **controleren of er niets is blijven hangen**: staat het Notion-token niet ingesteld, dan blijven rijen op `pending` staan. De handmatige inhaalroute is het commando `/meldingen-doorzetten`. Behandel zo'n kaartje daarna als elke andere kaart in de queue.

## Verwijzing

`org_plan/20-skills.md` §ticket-triage (`draft-response` is hier de *slotstap*, geen aparte skill); rol De Poortwachter (`org_plan/10-rollen.md`), stromen 01 en 07. Ritme en uitgangen: `docs/beheerders-runbook.md` §Monitoring. Verwant: `bug-fix`, `incidentprotocol`, `avg-verzoek`, `datalek-72u`, `legal-response`, `merkstem`.
