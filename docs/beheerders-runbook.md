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

---

## Monitoring

### Draaien de geplande taken nog?
- **Technisch beheer → Achtergrondtaken** (`/beheer/jobs`): laatste run, status, duur en
  samenvatting per cron (prijsverversing, maandsnapshots, nieuws-ingest).

### Fouten die gebruikers raken
- **Technisch beheer → Foutmeldingen** (`/beheer/errors`): ongevangen client-fouten met
  stacktrace, automatisch verzameld.

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
  **Doelen** (`/beheer/doelen`), **Nieuws** (`/beheer/nieuws`).

Nog hardcoded (vereisen een deploy): landingscopy, FAQ, glossarium, en de juridische pagina's
(`/privacy`, `/voorwaarden`, `/wft` — gemarkeerd als concept, nog juridisch te valideren).
