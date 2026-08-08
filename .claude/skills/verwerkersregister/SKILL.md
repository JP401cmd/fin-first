---
name: verwerkersregister
description: Gebruik bij elke nieuwe of gewijzigde externe dienst die persoonsgegevens raakt (nieuwe SDK, mail-, analytics- of betaalpartij), bij het kwartaalmoment naast de BTW-administratie, en bij een AVG-vraag over wie wat verwerkt. Houdt het register bij; welke verwerker, welke gegevens, welk doel, welke grondslag, welke overeenkomst.
---

# Verwerkersregister — wie verwerkt wat, en op welke grond

**Eerste regel — elke stack-keuze is óók een AVG-keuze.** Een nieuwe dienst die persoonsgegevens raakt komt éérst in het register (met grondslag en verwerkersovereenkomst), en pas dáárna gaat er data heen. Niet andersom.

## Waar het register leeft

In **Notion · TriFinity** (de bedrijfsbak) — het is een levend bedrijfsdocument, geen code. Deze skill beschrijft hoe je het bijhoudt; het register zelf staat daar.

## Per verwerker vastleggen

`naam · welke gegevens · doel · grondslag · verwerkersovereenkomst (ja/nee + vindplaats) · regio/doorgifte buiten de EER · sinds · laatst gecontroleerd`

## De huidige verwerkers

- **Vercel** — hosting, logs (IP-adressen, request-data).
- **Supabase** — de database: álle gebruikersdata, inclusief de versleutelde `lead_intakes` (geboortedatum, inkomen, vermogen).
- **Resend** — transactionele e-mail; elke poging gelogd in `mail_log`.
- **Anthropic** — het cloud-AI-pad (consent per ADR 0035). *OpenAI en Mistral staan geconfigureerd als alternatief in `lib/ai/config.ts` — alleen registreren als ze daadwerkelijk geactiveerd worden; het on-device pad (Gemma, privacy-modus) verwerkt juist zónder externe partij.*
- **Straks:** Polar (betalen, bij livegang — besluit 05) en een eventuele analytics-partij (besluit 04) — **die staat hier als eerste in, vóór hij live gaat.**

## Onderhoud — twee vaste momenten

1. **Het kwartaalmoment**, naast de BTW-administratie: elke stack-factuur is twee dingen tegelijk — een kostenpost voor De Ondernemer en een verwerker voor De Grenswachter (stroom 08). Loop de facturen langs het register: klopt de lijst nog, staat elke `laatst gecontroleerd` op dit kwartaal?

   **En één stap verder — is het beleid ook uitgevoerd?** Een register dat klopt bewijst alleen dat je de afspraak kent, niet dat je hem nakomt. Controleer daarom in dezelfde ronde de bewaartermijnen: draaide de retentie-cron (`/api/cron/retention`, dagelijks, termijnen single-sourced in `lib/retention.ts`) en staat hij groen in `job_runs` / op `/beheer/jobs`? Een cron die stil faalt, laat gegevens staan die je hebt beloofd te wissen — dat is een AVG-tekortkoming die je nergens anders ziet.
2. **Bij elke `change-request`** die een externe dienst toevoegt of wijzigt: register eerst.

## Verwijzing

Stroom 08 en 13 in `trifinity-org/org_plan/30-werkstromen.md`. Verwant: `change-request`, `avg-verzoek` (het register is nodig voor een volledig inzage-antwoord), `cash-flow-snapshot`.
