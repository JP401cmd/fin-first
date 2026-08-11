# Beheerders-runbook — TriFinity

Praktische gids voor superadmins: hoe voer je veelvoorkomende beheertaken uit?
Alle beheerschermen staan onder **`/beheer`** (alleen zichtbaar voor `profiles.role = 'superadmin'`),
ingedeeld in vier groepen: **Technisch beheer**, **Functioneel beheer**, **Test & ontwikkeling**, **Ter info**.

> Bron van waarheid voor de indeling: `lib/beheer-sections.ts`.

---

## Gebruikers

### Een abonnement toekennen of intrekken
1. Ga naar **Functioneel beheer → Gebruikers** (`/beheer/gebruikers`).
2. Zoek de gebruiker op e-mailadres.
3. Klik **Toekennen** / **Intrekken** bij AI of Connected.
   Dit is een handmatige comp (los van de Polar-checkout) en wordt gelogd in de
   toewijzingsgeschiedenis én in de audit-trail.

### Een rol wijzigen (user ↔ superadmin)
- Op dezelfde gebruikerskaart: kies de rol in het uitklapmenu.
- Je kunt je **eigen** rol niet wijzigen en de **laatste** superadmin niet degraderen.

### Een account blokkeren / deblokkeren
- Op de gebruikerskaart: **Blokkeren** (vraagt bevestiging). De gebruiker wordt direct
  uitgelogd en kan niet meer inloggen; deblokkeren herstelt de toegang.
- Je kunt jezelf niet blokkeren en een superadmin niet (zet eerst de rol op gebruiker).

---

## AVG / privacy

### Inzageverzoek (recht op inzage)
- **Admin-export:** zoek de gebruiker op **Functioneel beheer → Gebruikers** (`/beheer/gebruikers`),
  open **Supportview** en klik **Exporteer data (AVG)**. Levert profiel + bezittingen + schulden +
  transacties als JSON. De export wordt gelogd in de audit-trail.
- **Self-service:** de gebruiker kan z'n data ook zelf downloaden (`/api/export`, CSV/JSON).

### Verwijderverzoek (recht op vergetelheid)
- **Self-service (voorkeur):** de gebruiker verwijdert z'n account via de account-pagina
  (`/api/account/delete`, modus *delete*).
- **Admin-gestuurd:** een één-klik admin-verwijdering is bewust nog niet gebouwd (destructief,
  vereist de service-role-key). Voer een admin-verzoek uit op database-niveau met
  `deleteAllUserData(serviceClient, userId)` + `auth.admin.deleteUser(userId)`, en noteer het
  verzoek. Dit is de enige actie in dit runbook die niet via een knop loopt.

---

## Een kapotte bankimport debuggen
1. Vraag de gebruiker om het e-mailadres en het tijdstip van de import.
2. **Foutmeldingen** (`/beheer/errors`, Technisch beheer): kijk of er rond dat tijdstip een
   client-fout van die gebruiker staat.
3. Een volledige per-gebruiker datadiagnose (rekeningen / laatste sync / importfouten) is nog
   een open backlog-item (*supportview*). Tot die tijd: directe DB-inspectie.

---

## Platform-incidenten

### Onderhoudsmodus of een aankondiging tonen
- **Technisch beheer → Platform-status** (`/beheer/platform`):
  - *Onderhoudsmodus* toont een rode, niet-sluitbare banner aan iedereen.
  - *Aankondiging* toont een (sluitbare) info/waarschuwing-banner.

### AI globaal uitschakelen (kill-switch)
- Op **Platform-status**: zet **AI ingeschakeld** uit. Alle AI-functies (chat, briefing,
  rapporten, extractie, …) geven dan direct een nette melding. Eén schakelaar, werkt overal.

### Bankkoppeling uitschakelen
- **Technisch beheer → Bank Connect** (`/beheer/bank-connect`): zet TrueLayer uit.

### TrueLayer-omgeving wisselen (sandbox ↔ productie)
- Sandbox en Live zijn in de TrueLayer-console **aparte apps met eigen credentials**:
  het sandbox-client-id heeft een `sandbox-`-prefix (bv. `sandbox-finfirst-…`) en een
  **eigen** client-secret. Wissel je van omgeving, wissel dan altijd client-id én secret mee —
  anders toont de TrueLayer-authpagina "Unknown client or client not enabled".
- **"Test verbinding" bewijst in sandbox-modus de credentials níet** (haalt alleen de kale
  providerlijst op, die slaagt ook met fout client-id). De echte proef is een koppelpoging.
- Registreer per omgeving de redirect-URI `…/api/bank-connect/callback` in de TrueLayer-console
  (Settings → Redirect URIs). Let op: op de **Live**-app staat nu alleen
  `https://fin-first.vercel.app/callback` — het juiste pad
  `https://fin-first.vercel.app/api/bank-connect/callback` moet daar nog bij vóór livegang.

### Consent-tekst op het bankkoppelscherm (Data use description)
De zin die de gebruiker leest vlak vóór hij zijn bank autoriseert, staat **niet in deze repo maar
in de TrueLayer-console**: *Product UI → Data UI → Data use description*. Dit is de bron van die
tekst; wijzig hem daar en werk deze regels bij, zodat er één afgesproken formulering is.

- **Kies "Custom description", geen preset.** De presets (Credit Affordability, Income
  Verification, Rental Affordability, Cashback, Rewards, Tax …) beschrijven een doel dat wij níet
  hebben. Een onjuist doel op het consentscherm is een doelbindingsprobleem (AVG), niet alleen een
  toonkwestie. Komt er ooit tóch een preset in beeld: *Personal Finance Management* is de enige die
  in de buurt komt.
- **Het veld is een doelzin, geen volledige zin.** TrueLayer plakt hem in een vast frame:
  *"To {{data use description}}, TrueLayer need permission to access the following information and
  share it with TriFinity."* Begin dus met een werkwoord in de onbepaalde wijs, zonder hoofdletter
  en zonder punt.
- **Afgesproken tekst (NL, te plakken):**

  > je uitgaven, saldo's en vermogen automatisch bij te houden in TriFinity en te laten zien hoeveel vrijheidstijd je geld waard is

- **Kortere variant** (als het veld of de preview de zin afkapt):

  > je uitgaven en vermogen automatisch bij te houden in TriFinity

- **Engelse variant** (kies deze als je één tekst wilt die in élke taalversie van het dialoog
  klopt; het veld wordt niet vertaald):

  > keep your spending, balances and net worth up to date in TriFinity and show you how much freedom time your money is worth

- **De tekst moet blijven kloppen met wat we écht opvragen** — `accounts`, `balance`,
  `transactions`, `offline_access` (zie `lib/truelayer/client.ts`). Geen identiteits-, inkomens- of
  kredietdoel noemen: dat vragen we niet op. En geen advies beloven (Wft-grens: inzicht mag,
  advies niet).
- **Na opslaan:** de console toont rechts een live preview van het autorisatiescherm — lees de
  volledige zin daar één keer na. Wijzigingen kunnen enkele minuten duren en gelden voor álle
  UI's van die app, dus zet hem in **sandbox én live** apart.

---

## Monitoring

### Het kijkmoment — 2× 15 min per week (reactienorm)

Er is **bewust geen dagelijks rondje**. Zolang de allowlist dicht is hebben de inbakken
nauwelijks invoer; een dagritueel is dan verkeerd gedimensioneerd. Wat het doel dient is een
**reactienorm**, geen dagritme:

- **Wanneer:** de eerste 15 minuten van elk bouwblok, 2× per week. Geen apart agenda-item.
- **Norm:** een **verkeerd bedrag** gaat *dezelfde dag* de hotfix-route uit. Al het overige
  binnen 72 uur.
- **Uitkomst landt in de Notion-werkqueue** — geen tweede register. Twee lijsten is erger dan
  geen lijst.
- **Herijken zodra de allowlist opengaat** (F1): dimensioneer dan op de werkelijke invoer.

> **Twee klokken wachten nooit op dit moment.** Een **AVG-verzoek** (30 dagen na ontvangst) en
> een **mogelijk datalek** (72 uur na kennisname) gaan direct de eigen route in — zie de skills
> `avg-verzoek` en `datalek-72u`. Bij 2× 15 min per week kun je anders tot 3,5 dag van een
> 72-uursklok verliezen.

Dit moment is **pull**: je haalt op. Daarnaast duwt de app zelf — zie *Meldingen naar je telefoon*
verderop. Kort: `lib/cron-alert.ts` mailt én pusht bij `job_runs.status='error'`, en de
meldingen-sweep (`/api/cron/alerts-sweep`) pusht elk kwartier bij een nieuwe soort fout of een
taak die stil bleef. Beide zwijgen zolang hun kanaal niet is geconfigureerd.

### De zes inbakken — wat je langsloopt, en wat "afgehandeld" hier betekent

Let op: **maar drie van de zes hebben een afvinkbare werkvoorraad.** Een checklist die
suggereert dat je alle inbakken kunt "legen", liegt — daarom staat er per inbak eerlijk bij wat
je er wél kunt.

| Inbak | Waar | Wat "afgehandeld" betekent |
|---|---|---|
| Feedback | `/beheer/feedback` | **Afvinkbaar** — status `new` → `reviewed`. Echte werkvoorraad: leeg = klaar. |
| Rekenhulp-meldingen | `/beheer/calculator-reports` | **Afvinkbaar** — status `open` → `reviewed` / `dismissed`. |
| Foutmeldingen | `/beheer/errors` | **Niet afvinkbaar.** `error_logs` is append-only: geen `resolved`/`seen`-kolom, geen "nieuw sinds"-notie. Je kunt hier alleen *kijken*. Ontdubbel met de hand — honderden regels zijn typisch een handvol unieke problemen. Afhandelen = een kaart in de werkqueue, niet een vinkje hier. |
| Nieuwsfeedback | *(geen beheerscherm)* | **Vandaag onbereikbaar voor beheer.** `news_feedback` heeft alleen eigen-rij-RLS (`user_id = auth.uid()`), geen superadmin-leespolicy en geen scherm. Sla over tot die er zijn. |
| Support-mail | *(geen mailbox)* | **Ontvangt vandaag niets.** Er is nog geen domein; `lib/legal-contact.ts` zet beide adressen op `null` en toont een placeholder in plaats van een `mailto:`. Zolang dat zo is komt hier geen post binnen — **ook geen AVG-verzoek en geen lekmelding.** |
| In-app meldingen | `public.user_reports` → Notion-werkqueue | **Zichzelf legend.** Bug/vraag/wens uit de app worden automatisch kaartjes in de queue; een dagelijkse cron herstelt wat live misging. Jij controleert alleen of er niets hangt: zonder `notion_api_token` blijven rijen op `notion_sync_status = 'pending'`. Inhaalroute: het commando `/meldingen-doorzetten`. |

**Wat je hier dus werkelijk doet:** twee inbakken legen, één controleren op hangende sync, één
inbak lezen-en-ontdubbelen, en twee overslaan tot ze bestaan. Duurt het langer dan 15 minuten,
kort dan de checklist in — verleng niet het moment.

**Openstaand, en geen af te vinken stap:** zolang de support-mailbox niet bestaat, is er geen
externe meldroute. Dat raakt de twee klokken hierboven rechtstreeks: een AVG-verzoek of
lekmelding zou vandaag niet binnenkomen. Zie `lib/legal-contact.ts` voor het aanzetten zodra het
domein er is.

### Triage — waar gaat een melding heen?

Ontdubbel eerst (dezelfde melding, dezelfde fout), bepaal dan module (Kern / Wil / Horizon) en
ernst, en kies één uitgang. Er zijn er vijf:

| Soort melding | Waarheen | Klok |
|---|---|---|
| **Verkeerd bedrag** op het scherm | Hotfix-route, hoogste niveau | **Zelfde dag** |
| **AVG-verzoek** (inzage, export, verwijdering, correctie) | Skill `avg-verzoek` | **30 dagen** na ontvangst |
| **Mogelijk datalek** | Skill `datalek-72u` | **72 uur** na kennisname |
| **Idee / wens** (geen defect) | Kaart in de Notion-werkqueue | Geen |
| **Al het overige** (defect) | Skill `bug-fix` | Binnen 72 uur |

Een verkeerd bedrag is **altijd** het hoogste niveau: dit is een rekenapp, en een fout getal
ondermijnt precies datgene waarvoor iemand de app gebruikt. De twee klokken (AVG, lek) wachten
nooit op het volgende kijkmoment.

### Draaien de geplande taken nog?
- **Technisch beheer → Achtergrondtaken** (`/beheer/jobs`): laatste run, status, duur en
  samenvatting per cron. De lijst met taken staat in `app/(app)/beheer/jobs/page.tsx`, het
  schema in `vercel.json`.

**`CRON_SECRET` is een harde randvoorwaarde voor élke cron.** Staat de env-var niet in de
Vercel-omgeving, dan weigert iedere cron-handler zichzelf *fail-closed* met een 500
(`{"error":"CRON_SECRET not configured"}`) — vóór er ook maar iets gebeurt. Dat is bewust: een
cron-endpoint draait op de service-role-sleutel en mag zonder secret niet open staan. De prijs
is dat de storing zich verstopt.

> **Lees `/beheer/jobs` daarom zo: "geen regel" betekent níét "nog niet aan de beurt".** Op zes
> van de zeven crons zit die weigering vóór `recordJobRun()`, dus zonder secret ontstaat er
> helemaal geen regel — precies hetzelfde beeld als een taak die nooit is ingepland. Alleen
> `news-ingest` logt de weigering wél. Zo bleef het uitvallen van alle zeven crons van 29 juli
> t/m 11 augustus 2026 onopgemerkt, op één dagelijkse `news-ingest`-error na.

Controleren en herstellen:
1. `npx vercel env ls production` — `CRON_SECRET` hoort in de lijst te staan.
2. Ontbreekt hij: zetten is een **wijziging aan de draaiende omgeving** (zie het kopje verderop) —
   dus via de `change-request`-skill, mét een regel in de tabel daar. Waarde: 32 willekeurige bytes,
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`; environment
   **Production** (en Preview als je daar wilt kunnen testen). Een env-var wordt pas actief bij de
   eerstvolgende deploy — dus daarna opnieuw deployen.
3. Volg `/beheer/jobs` de 24 uur erna: elke dagelijkse cron hoort een `success`- of een verklaarde
   `error`-regel te krijgen, en `news-ingest` hoort te stoppen met de dagelijkse
   "CRON_SECRET ontbreekt"-fout. `snapshots` draait maandelijks (de 1e) en volgt later.

Hetzelfde geldt voor `EMAIL_UNSUB_SECRET`: die valt terug op `CRON_SECRET`, dus zonder allebei
weigert de briefing-mail (een mail zonder werkende afmeldlink mag niet uit).

### Meldingen naar je telefoon (push)

Sinds ADR 0102 duwt de app zelf. Twee wachters, en je hebt ze **allebei** nodig.

**Binnenwacht — `/api/cron/alerts-sweep`.** Draait elk kwartier en meldt drie dingen:
een **nieuwe soort fout** in `error_logs` (niet elk voorval — alleen nieuwe soorten, plus één
her-alarm als een bekende fout 10× zo vaak gaat voorkomen), een **gefaalde** achtergrondtaak, en
een taak die **stil** bleef (geen geslaagde run binnen zijn `maxAgeHours` uit
`lib/job-catalog.ts`). Per signaalsoort hoogstens één gebundelde melding per kwartier; per
fouttype en per taak hoogstens één per 24 uur.

**Buitenwacht — de dead man's switch.** De binnenwacht kan zijn eigen stilte niet zien: valt de
Vercel-cronplanner uit, dan draait ook de sweep niet. Daarom hoort er een **externe** pinger
omheen (healthchecks.io of cron-job.org, gratis) die elk kwartier dezelfde URL aanroept **en
zelf alarm slaat als die aanroep uitblijft of faalt**. Zonder dat onderdeel is de hele opzet
schijnzekerheid — precies het scenario van 29 juli t/m 11 augustus 2026.

Inrichten (alles hieronder is een **wijziging aan de draaiende omgeving** → via de
`change-request`-skill, met een regel in de tabel daar):

1. **Kanaal.** Maak een ntfy-topic met een onraadbare naam en een access token (ntfy.sh of
   self-hosted). Een topic zónder token is **publiek leesbaar** — token dus verplicht.
2. **Env in Vercel** (Production): `NTFY_TOPIC`, `NTFY_TOKEN`, optioneel `NTFY_SERVER`. Daarna
   opnieuw deployen; env-vars worden pas actief bij de volgende deploy.
3. **Externe pinger.** Laat hem elk kwartier `GET https://<domein>/api/cron/alerts-sweep`
   aanroepen met header `Authorization: Bearer <CRON_SECRET>`. Zet zijn eigen grace period op
   ~30 minuten.
   > **Gebruik de header, niet `?secret=…`.** Een querystring landt in de Vercel-toegangslogs,
   > in de logs van de pinger en in elke proxy ertussen. En `CRON_SECRET` is één sleutel voor
   > **alle** cron-routes — ook `/api/cron/retention`, die rijen *verwijdert*. Wie het secret uit
   > een log plukt, kan dus meer dan alleen de sweep triggeren. healthchecks.io, cron-job.org en
   > UptimeRobot ondersteunen custom headers. Kan je pinger dat écht niet, geef hem dan een eigen
   > secret in plaats van `CRON_SECRET` te delen.
4. **Proef.** Zet het topic tijdelijk op je telefoon, forceer een `job_runs`-errorrij en een
   `error_logs`-rij, en controleer dat er **één** melding komt — en bij herhaling binnen 24 uur
   géén tweede. Zet daarna de pinger een uur uit en controleer dat de buitenwacht alarm slaat.

**Zonder `NTFY_TOPIC` is de sweep een stille no-op**: geen fouten, `/beheer/jobs` blijft groen.
Dat is bewust, maar het betekent ook: een groene `/beheer/jobs` bewijst niet dat je gealarmeerd
zou worden. Controleer bij het kwartaalritme of de env-vars nog staan.

**Wat een melding wél en niet zegt.** Meldingen dragen uitsluitend **tellingen**, taak-labels,
een geknepen context-tag en een link naar `/beheer/errors` of `/beheer/jobs` — nooit de
fouttekst, stacktrace of URL. Dat is een harde regel (AVG): het kanaal loopt buiten onze stack
en `error_logs.context` wordt ongefilterd door de browser aangeleverd. Voor de inhoud klik je
door naar de beheerpagina. De cron-**mail** bevat wél de fouttekst; die gaat naar onze eigen
mailbox.

### Fouten die gebruikers raken
- **Technisch beheer → Foutmeldingen** (`/beheer/errors`): ongevangen client-fouten met
  stacktrace, automatisch verzameld.
- **Let op de dekking:** `error_logs` bevat client-fouten en ónafgevangen serverfouten. Een
  afgevangen API-500 via `serverError()` gaat alleen naar de Vercel-logs en verschijnt hier
  (en dus in de meldingen) **niet**. Aparte kaart.

### AI-verbruik en -kosten
- **Technisch beheer → AI Features** (`/beheer/ai-features`): maandbudgetten (AI-abonnees /
  gratis proefbudget), vaste kosten per actie, en het verbruik-dashboard (totaal · per functie ·
  grootste verbruikers). Gebruikers zien hun eigen verbruik op `/mijn/account`.

### Wie wijzigde wat?
- **Ter info → Audit-trail** (`/beheer/audit`): logboek van abonnement-, rol-, blokkade- en
  configuratiewijzigingen.

---

## E-mail
- **Technisch beheer → E-mail** (`/beheer/email`): providerstatus + recente pogingen.
- Versturen werkt zodra `RESEND_API_KEY` (en optioneel `EMAIL_FROM`) is gezet en het afzenderdomein
  bij Resend is geverifieerd. Zonder key worden pogingen als *overgeslagen* gelogd en blijven
  huishouden-uitnodigingen via de deelbare link werken.

---

## Inhoud & teksten
Aanpasbaar zonder deploy (Functioneel beheer):
- **Welkomstgids** (`/beheer/welkom`), **Coach** (`/beheer/coach`), **Briefing** (`/beheer/briefing`),
  **Nieuws** (`/beheer/nieuws`).

> `/beheer/doelen` (doelgids-stappen) is op 8 aug 2026 verwijderd: die configuratie
> had sinds ADR 0007 geen enkele consument meer, dus wijzigingen hadden nul effect.
> Doel-gebonden begeleiding loopt via de **Welkomstgids**.

Nog hardcoded (vereisen een deploy): landingscopy, FAQ, glossarium, en de juridische pagina's
(`/privacy`, `/voorwaarden`, `/wft` — gemarkeerd als concept, nog juridisch te valideren).

## Wijzigingen aan de draaiende omgeving

De werkwijze staat in `.claude/skills/change-request` — vier vragen vóór de wijziging, één regel erna.

Vercel deployt op push (ADR 0066), dus code komt altijd langs een PR-diff. Wat daar *niet* in staat komt
nergens anders langs: een cron erbij of eraf, een env-var of secret, third-party-config (Supabase, Vercel,
mailprovider, bankprovider), en elke handmatige actie op productie. Die horen hieronder. Migraties niet
(die staan in `supabase/migrations/`), gewone deploys ook niet (die staan in de git-historie).

| Datum | Wat | Waarom | Hoe terug |
| --- | --- | --- | --- |
| *(nog leeg — eerste aantekening bij de eerstvolgende wijziging)* | | | |

Twee gevallen reiken verder dan de aantekening: raakt de wijziging de **back-upinrichting of de sleutels**
(`ENCRYPTION_KEY_V1`, `IBAN_INDEX_KEY_V1`), dan is de herstelproef opnieuw nodig — zie hieronder. Raakt hij
**persoonsgegevens of een verwerker**, dan eerst het verwerkersregister.

## Back-up en herstel

De werkwijze staat in `.claude/skills/herstelproef` — elk kwartaal oefenen, nooit op productie.

**Hersteldoelen** (vastgesteld 2026-07-29, org-besluit 10 "lichte voorziening" — bijstellen mag bij de eerste herstelproef):

- **RPO (hoeveel data mag je kwijt zijn): 24 uur** — vereist minimaal een dagelijkse Supabase-back-up; verifieer dat die aanstaat en op welk tijdstip.
- **RTO (hoe lang mag herstel duren): 4 uur** — van "besluit tot terugzetten" tot checklist groen. De geklokte tijd van elke proef komt hieronder te staan.

### Wat je náást de database nodig hebt

Een teruggezette database alléén is géén werkende omgeving. Deze drie dingen zitten **niet** in een
Supabase-databaseback-up en moeten apart geregeld zijn, anders staat er straks onleesbare data:

- **Sleutels uit de omgeving.** `ENCRYPTION_KEY_V1` (versleutelde bankkoppeling-credentials, migratie
  `20260503193310_encrypt_bank_credentials`) en `IBAN_INDEX_KEY_V1` (de gehashte IBAN-index) wonen in
  Vercel/`.env.local`, niet in de database. Zonder exact dezelfde sleutels is de herstelde data er wél,
  maar onbruikbaar. Bewaar ze buiten de repo én buiten hetzelfde Supabase-project.
- **De `auth`- en `storage`-schema's.** Alleen `public` terugzetten betekent: data zonder gebruikers —
  niemand kan inloggen. Een dump/herstel moet `auth` (en `storage`) meenemen.
- **Bestanden in Storage.** Een databaseback-up herstelt de rijen in `storage.objects`, niet per se de
  bestanden zelf — controleer dit expliciet bij de proef. Let op wélke bucket je controleert: op
  2026-08-08 stond er in `pension-documents` **nul** bestanden, dus die eerder genoemde controle zou
  slagen zonder iets te bewijzen. De bestanden zitten in `guide-help` (13, openbaar) en
  `user-report-screenshots` (1, privé). De privé-bucket is de zinnige toets — een openbare bucket
  bewijst niets over toegang. Het controlescript vraagt de buckets op bij de omgeving zelf, dus een
  nieuwe of leeggelopen bucket valt automatisch op.

### De proef in stappen (met verwachte duur)

Omvang op 2026-07-29: database ~56 MB — klein genoeg dat het terugzetten zelf minuten kost, niet uren.
De tijd zit in het optuigen van de doelomgeving en de controle.

| # | Stap | Verwacht |
| --- | --- | --- |
| 0 | Vaststellen dát er een back-up is: Supabase-dashboard → Database → Backups (plan + tijdstip + retentie). Free plan = géén back-ups; dan haalt de RPO van 24 uur het niet. | 5 min |
| 1 | Doelomgeving: **een apart Supabase-project** (restore van de back-up/PITR). Géén branch — een branch draait de migraties op een lege database en bevat dus **geen productiedata**; dat toetst schema, niet herstel. | 15 min |
| 2 | Back-up terugzetten naar dat project, inclusief `auth` en `storage`. | 10–20 min |
| 3 | Env samenstellen: nieuwe project-URL + anon/service-role-key, plus de bestaande `ENCRYPTION_KEY_V1` en `IBAN_INDEX_KEY_V1` uit de kluis. | 15 min |
| 4 | Checklist aflopen (hieronder). De tellingen draaien via `npm run herstelproef:check`; inloggen, de bedragen-steekproef en het ontsleutelen van een bankkoppeling blijven handwerk. | 15 min |
| | **Totaal (eerste keer, realistisch)** | **1,5–2 uur — binnen de RTO van 4 uur, maar nog niet bewezen** |

### Controlechecklist

**Vul altijd de peildatum in.** Een herstelde omgeving is een foto van het moment van de back-up;
productie is intussen doorgelopen. Vergelijk je zonder afkap op `created_at`, dan verschilt élke
telling en zegt de uitkomst niets. Alle tellingen hieronder zijn daarom begrensd op het tijdstip van
de back-up.

**Een verschil is niet symmetrisch** — lees het zo:

| Uitkomst | Betekenis |
| --- | --- |
| hersteld > productie | rijen zijn ná de back-up verwijderd. Verwacht; wel verklaren. |
| hersteld < productie | de back-up mist rijen die er wél waren. **Fout.** |
| gelijk aantal, andere vingerafdruk | de inhoud is gedrift. **Fout.** |
| ongelijk aantal | de vingerafdruk zegt niets en wordt overgeslagen. |

Dat dit geen theorie is: tussen 29 juli en 8 augustus liep het aantal transacties terug van ~36.6k
naar 29.903. Rijen verdwijnen dus echt, en een strenge "moet exact gelijk zijn" zou de proef ten
onrechte laten falen.

**De snelle route** — draait de hele telling tegen één omgeving en vergelijkt twee metingen:

```bash
# 1. Nulmeting op productie (alleen lezen), op het tijdstip van de back-up:
npm run herstelproef:check -- --cutoff=<ISO-tijdstip> --storage-download --out=nulmeting.json

# 2. Zelfde meting tegen de herstelde omgeving, en vergelijken:
HERSTELPROEF_SUPABASE_URL=... HERSTELPROEF_SERVICE_ROLE_KEY=... \
  npm run herstelproef:check -- --doel=hersteld --cutoff=<ISO-tijdstip> \
    --storage-download --vergelijk=nulmeting.json
```

Het script (`scripts/herstelproef-check.mjs`) telt de kerntabellen, bouwt een vingerafdruk over
transacties en snapshots, loopt álle Storage-buckets langs en haalt per bucket één bestand op als
bewijs. Het schrijft niets en zet geen persoonsgegevens op schijf — het uitvoerbestand bevat alleen
tellingen en hashes. Uitvoercode 1 = harde afwijking.

**De handmatige route** (alleen de SQL-editor, geen sleutels nodig) geeft dezelfde vingerafdrukken:

```sql
with cutoff as (select '<ISO-tijdstip van de back-up>'::timestamptz as t)
select 'auth.users' as tabel,
       (select count(*) from auth.users, cutoff where auth.users.created_at <= cutoff.t) as rijen,
       (select md5(string_agg(id::text, ',' order by id))
          from auth.users, cutoff where auth.users.created_at <= cutoff.t) as vingerafdruk
union all select 'profiles',
       (select count(*) from public.profiles, cutoff where profiles.created_at <= cutoff.t),
       (select md5(string_agg(id::text, ',' order by id))
          from public.profiles, cutoff where profiles.created_at <= cutoff.t)
union all select 'transactions',
       (select count(*) from public.transactions, cutoff where transactions.created_at <= cutoff.t),
       (select md5(string_agg(id::text||'|'||date::text||'|'||amount::text, ',' order by id))
          from public.transactions, cutoff where transactions.created_at <= cutoff.t)
union all select 'bank_accounts',
       (select count(*) from public.bank_accounts, cutoff where bank_accounts.created_at <= cutoff.t), null
union all select 'assets',
       (select count(*) from public.assets, cutoff where assets.created_at <= cutoff.t), null
union all select 'budgets',
       (select count(*) from public.budgets, cutoff where budgets.created_at <= cutoff.t), null
union all select 'debts',
       (select count(*) from public.debts, cutoff where debts.created_at <= cutoff.t), null
union all select 'net_worth_snapshots',
       (select count(*) from public.net_worth_snapshots, cutoff where net_worth_snapshots.created_at <= cutoff.t),
       (select md5(string_agg(id::text||'|'||snapshot_date::text||'|'||net_worth::text, ',' order by id))
          from public.net_worth_snapshots, cutoff where net_worth_snapshots.created_at <= cutoff.t)
union all select 'bank_connections',
       (select count(*) from public.bank_connections, cutoff where bank_connections.created_at <= cutoff.t), null;
```

**Referentiemeting productie, peildatum 2026-08-08T00:00:00Z** (script en SQL geven identieke
vingerafdrukken; op de dag van de proef vervang je deze door een verse nulmeting op het
back-uptijdstip):

| Tabel | Rijen | Vingerafdruk |
| --- | --- | --- |
| auth.users | 26 | `022c2ecc912244e3fb02456d1cf8db9f` |
| profiles | 26 | `022c2ecc912244e3fb02456d1cf8db9f` |
| transactions | 29.903 | `f4be6c855a89082ee5485cb856a1be2f` |
| bank_accounts | 26 | — |
| assets | 89 | — |
| budgets | 404 | — |
| debts | 39 | — |
| net_worth_snapshots | 175 | `293d565218b050baf446201a97687755` |
| bank_connections | 8 (alle 8 versleuteld) | — |

Daarnaast, en dit is bij een vermogensapp het punt waar het écht om gaat — deze vier doe je met de
hand, want ze bewijzen iets dat een telling niet kan:

- **inloggen** met een testaccount tegen de herstelde omgeving werkt;
- **steekproef op bedragen** — een paar bekende saldi én een uitkomst van de rekenkern
  (netto vermogen / FIRE-doel uit `net_worth_snapshots`) komen overeen met productie op de back-updatum;
- **bankkoppeling leesbaar** — een `bank_connections`-rij ontsleutelt met `ENCRYPTION_KEY_V1`. Het
  script telt alleen dát er ciphertext staat, niet dat die opengaat;
- **Storage** — een bestand uit een **privé**-bucket is daadwerkelijk op te halen (`--storage-download`
  doet dit al; controleer dat de gerapporteerde bucket niet leeg is).

**Proeflog:**

| Datum | Back-updatum | Hersteltijd | Uitkomst | Wat schuurde |
| --- | --- | --- | --- | --- |
| 2026-07-29 | — | — | **Droge doorloop, niet uitgevoerd** — er is nog geen herstel-doelomgeving. Stappenplan + checklist hierboven vastgelegd; wachten op go voor een tweede Supabase-project. | Geen Docker/psql op de beheerdersmachine (lokaal terugzetten kan niet); een Supabase-branch is géén geldig doel (geen productiedata); de encryptiesleutels en Storage-bestanden zitten niet in de databaseback-up. |
| 2026-08-08 | — | — | **Voorbereiding afgerond, proef nog niet uitgevoerd** — go is er (JP, 5 aug), maar de doelomgeving nog niet: er is geen `SUPABASE_ACCESS_TOKEN` en geen plan/regio-keuze. Wat er nu wél ligt: de checklist is een draaiend script (`npm run herstelproef:check`), getoetst tegen productie én tegen een opzettelijk bedorven nulmeting, plus een referentiemeting hierboven. | Twee fouten in de checklist van 29 juli gevonden: (1) de telling had géén peildatum, waardoor elke vergelijking met een herstelde omgeving sowieso zou verschillen; (2) de Storage-controle wees naar `pension-documents`, en die bucket is leeg — het controlepunt zou zijn geslaagd zonder iets te bewijzen. Verder: het aantal transacties liep in tien dagen terug van ~36.6k naar 29.903, dus "moet exact gelijk zijn" is een te strenge eis. |
| *(eerste échte proef — af vóór de allowlist opengaat)* | | | | |

**Wat de échte proef nog nodig heeft** (stand 2026-08-08 — alleen de eigenaar kan dit leveren):

1. **Plan- en regiokeuze** voor het tijdelijke tweede project.
2. **Management-toegang**: een `SUPABASE_ACCESS_TOKEN`, óf JP voert stap 0–2 zelf in het dashboard uit.
   Beide ontbreken nu; de Supabase-MCP op deze machine kan alleen SQL tegen het *productie*project en
   heeft geen enkele back-up- of projectfunctie.
3. **Bevestiging dat `ENCRYPTION_KEY_V1` en `IBAN_INDEX_KEY_V1` búiten dit project bewaard zijn.** Ze
   staan nu in `.env.local` op de beheerdersmachine en in Vercel — één kapotte laptop plus één
   verlopen Vercel-toegang en de herstelde bankdata is definitief onleesbaar. Dit is de goedkoopste
   van de drie en de enige die óók zonder de proef waarde heeft.
