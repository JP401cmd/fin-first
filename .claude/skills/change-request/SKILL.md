---
name: change-request
description: "Gebruik bij elke wijziging aan de draaiende omgeving die een PR-diff niet laat zien — een cron erbij of eraf, een env-var of secret, third-party-config (Supabase, Vercel, mailprovider, bankprovider), of een handmatige actie op productie. Vier vragen vooraf en één aantekening in het beheerders-runbook. Niet voor migraties (schemawijziging), een gewone deploy (release) of een nieuwe verwerker (verwerkersregister)."
---

# Change-request — de enige poort voor wat niet in de diff staat

**Eerste regel — Vercel deployt op push (ADR 0066).** Code komt daardoor altijd nog langs een PR-diff en een review. Alles wat níét in die diff zichtbaar is — een schedule in een dashboard, een sleutel in Vercel, een instelling bij een provider, een handmatige `update` op productie — glijdt er stilletjes in. Dit is de enige plek waar zo'n wijziging bewust langskomt, en daarom is de aantekening het product van deze skill, niet een bijproduct.

**Tweede regel — deze skill dupliceert geen enkele bestaande route.** Migraties horen bij `schemawijziging`, een gewone deploy bij `release`, een nieuwe of gewijzigde externe dienst bij `verwerkersregister` (die gáát voor: register eerst, dan pas de wijziging). Raakt de wijziging persoonsgegevens en twijfel je of er iets is uitgelekt, dan loopt dat parallel via `datalek-72u` — de klok van 72 uur wacht niet op deze poort.

## Gedeelde conventies (verplicht)

Lees en volg `.claude/skills/_shared/pijplijn-conventies.md`.

## Wat er wél onder valt

Vier soorten, bewust smal gehouden:

- **Een cron erbij of eraf** — `vercel.json` is wél een diff, maar het *effect* (draait hij, faalt hij stil) is dat niet.
- **Een env-var of secret** — nieuw, gewijzigd of geroteerd, in Vercel of `.env.local`.
- **Third-party-config** — een Supabase-projectinstelling, een Vercel-projectinstelling, de mailprovider, de bankprovider (bijvoorbeeld sandbox ↔ productie wisselen).
- **Een handmatige actie op productie** — data met de hand rechtzetten, een rij aanpassen, een taak losstaand draaien.

## De vier vragen — beantwoord ze vóór de wijziging, niet erna

1. **Wat verandert er precies?** Eén zin, concreet genoeg dat iemand anders het kan nadoen — of terugdraaien.
2. **Wat gebeurt er als het misgaat?** Wie merkt het, en waaraan: een gebruiker die iets niet meer kan, een stille taak, een verkeerd bedrag.
3. **Hoe zie je dát het misgaat?** Benoem de meting: `/beheer/jobs` (`job_runs`), `/beheer/errors`, `/beheer/email`, de cron-alertmail. Is er géén meting die dit zou vangen, dan is die meting onderdeel van de wijziging — geen los voornemen.
4. **Hoe draai je het terug?** De concrete handeling, niet "terugzetten". Kun je die vraag niet beantwoorden, dan is de wijziging niet klaar om gedaan te worden.

## Vastleggen — één aantekening, geen nieuw artefact

De aantekening gaat naar `docs/beheerders-runbook.md`, sectie **Wijzigingen aan de draaiende omgeving**: datum, wat, waarom, hoe terug. Dat is dezelfde plek waar `herstelproef` en `incidentprotocol` schrijven; een eigen changelog ernaast is de tweede bron die gaat driften. Schrijf 'm meteen — een wijziging die je je over drie maanden nog moet herinneren, is precies degene die dan onverklaarbaar blijkt.

## Twee gevallen die verder reiken dan de aantekening

- **Raakt de wijziging de back-upinrichting of de sleutels** (`ENCRYPTION_KEY_V1`, `IBAN_INDEX_KEY_V1`)? Dan is de herstelproef opnieuw nodig — `herstelproef` noemt dat expliciet als trigger. Een herstel dat vóór jouw wijziging werkte, bewijst niets over daarna.
- **Raakt de wijziging persoonsgegevens of een verwerker?** Eerst `verwerkersregister`, dan pas doen.

## Verwijzing

`org_plan/20-skills.md` §change-request; rollen De Machinist en De Bouwer (`org_plan/10-rollen.md`), stromen 07, 12, 13. Verwant: `release`, `schemawijziging`, `verwerkersregister`, `herstelproef`, `incidentprotocol`. Grond: ADR 0066 (`docs/adr/0066-repo-topologie-skills-op-schijf-deploy-op-push.md`).
