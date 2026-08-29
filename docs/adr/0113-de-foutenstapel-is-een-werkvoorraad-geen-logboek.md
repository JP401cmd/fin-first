---
status: accepted
date: 2026-08-28
elements: [t-platform, t-supabase, app-comp]
---

# 0113 — De foutenstapel is een werkvoorraad, geen logboek

## Context

Twee van de zes inbakken in het beheerders-runbook stonden op *"niet
afvinkbaar"*:

- **`error_logs`** is append-only: geen `resolved`/`seen`-kolom, geen
  "nieuw sinds"-notie. Je kon er alleen naar kijken. Wat je op zo'n moment niet
  meteen doorzette naar een kaart, was je kwijt.
- **`news_feedback`** had alleen eigen-rij-RLS (`user_id = auth.uid()`) en kwam
  in geen enkel `/beheer`-scherm voor. Beheer kón er niet bij.

Dat blokkeerde ook de uitgestelde skill `customer-research`: patronen uit de
stapel halen kan pas zodra de stapel bevraagbaar is.

De echte stapel stuurde het ontwerp: **honderden logregels bleken een handvol
unieke problemen — een ontdubbelfactor van ongeveer 6×**, verdeeld over een
handvol contexten. Het vermoeden dat "een vlag per rij het ontdubbelen niet
oplost" was daarmee gemeten, niet aangenomen. `news_feedback` was op dat moment
nog helemaal niet gevuld. (Exacte tellingen staan bewust niet in deze repo —
ADR 0111; ze zijn read-only na te meten.)

## Besluit

### 1. De eenheid is de foutSOORT, en die wordt in het leespad bepaald

`/beheer/errors` toont **groepen**, gesleuteld op een genormaliseerde
(context, message). De sleutel wordt in het leespad berekend
(`lib/error-groups.ts`) — er komt **geen `signature`-kolom** op `error_logs` en
dus ook geen SQL-backfill. Reden: zo'n backfill zou een tweede normalisator
naast de TypeScript-versie zetten, en twee normalisatoren die uiteenlopen is
precies het defect dat je hier zou bouwen in plaats van oplossen. Bij deze
schaal (honderden rijen, 12 maanden retentie) is het snelheidsvoordeel van een
kolom theoretisch; hij blijft een latere optimalisatie zonder contractwijziging.

`error_logs` blijft daarmee **volledig append-only**: geen kolom erbij, geen
UPDATE-policy erop. Dat is de eerlijke eigenschap van een logboek.

### 2. Eén normalisator, twee afgeleiden — de HMAC hoort niet op `error_logs`

De meldingen-sweep (ADR 0102) had de groepeersleutel al: `errorFingerprint()`
over een genormaliseerde melding. Die is een **HMAC met `CRON_SECRET`**, en ADR
0102 geeft daar één reden voor: de sweep bewaart zijn fingerprints in
`app_settings`, dat voor élke ingelogde gebruiker leesbaar is. Een kale hash zou
daar een goedkoop orakel op interne foutmeldingen zijn.

Die reden geldt hier **niet**: `error_log_resolutions` is superadmin-only, heeft
geen eigen-rij SELECT en zit niet in de AVG-export. De HMAC koopt er niets, en
kost wél — **rotatie van `CRON_SECRET` zou élke afgevinkte groep wees maken**.

Daarom is `normalizeMessage()` afgesplitst naar
`lib/alerts/error-signature.ts`. De sweep houdt zijn HMAC voor het externe
kanaal; de resolutie-boekhouding krijgt een **sleutelloze** digest over dezelfde
genormaliseerde tekst. Eén normalisator, twee afgeleiden — bewaakt door
`lib/alerts/error-signature.test.ts`.

### 3. Afvinken in een aparte tabel; heropenen is een afleiding

`public.error_log_resolutions (signature PK, resolved_at, resolved_by, note,
resolved_count, last_seen_at)`, RLS superadmin (SELECT/INSERT/UPDATE/DELETE),
`resolved_by` afgedwongen op `auth.uid()` in de WITH CHECK.

`note` is vrije beheerderstekst voor een kaartnummer of de oorzaak. **Norm: geen
gebruikersidentificerende tekst.** Deze tabel valt bewust buiten de user-scoped
inventaris van `lib/user-data-tables.ts` (geen `user_id`-kolom) en wordt dus niet
per gebruiker gewist of geëxporteerd; een identificerende notitie zou daar
stilzwijgend buiten vallen.

Naast het ontdubbelargument staat een tweede, hardere reden voor een aparte
tabel: **de retentie-cron wist `error_logs`-rijen na 12 maanden.** Een vlag per
rij verdwijnt mét zijn rijen; je zou "dit is behandeld" dus stilzwijgend
kwijtraken. Een groepsrij overleeft dat — en wordt op zijn beurt gepruned op
`last_seen_at` (12 mnd), zodat de tabel niet monotoon groeit.

De prune kijkt naar `last_seen_at` zoals dat bij het AFVINKEN gold. Gevolg, en
dat is bewust: een groep die na het afvinken twaalf maanden lang blijft
terugkomen zonder opnieuw afgevinkt te worden, verliest zijn resolutie (en dus
de notitie). Dat is de juiste uitkomst — hij staat dan al een jaar open, en een
resolutie die een jaar niet meer klopt is geen historie maar ruis.

**Heropenen is geen kolom en geen cron, maar een pure afleiding:** een groep
staat open zodra er een rij bestaat met `created_at > resolved_at`. Een
opgeloste fout die terugkomt heropent zichzelf. Dat *is* een regressie en hoort
zichtbaar te zijn.

### 4. De sweep blijft onafhankelijk van `resolved`

De sweep beantwoordt "is dit nieuw sinds het vorige kwartier"; `resolved`
beantwoordt "heb ik dit afgehandeld". Andere vragen. Koppelen zou een
alarmkanaal afhankelijk maken van menselijke boekhouding. De prijs — een
afgevinkte fout die terugkomt pusht opnieuw — is correct gedrag.

### 5. Nieuwsfeedback wordt een venster, geen inbox

`news_feedback` draagt `verdict: 'less' | 'more'` per (gebruiker, artikel). Dat
is een **voorkeurssignaal**, geen melding die afhandeling vraagt: er is geen
natuurlijke `new → reviewed`. Statusknoppen zouden afvinkbaarheid faken op een
tabel die er niet om vraagt — en het runbook waarschuwt letterlijk voor een
checklist die suggereert dat je alle inbakken kunt legen.

Daarom een **alleen-lezen aggregaat** als sectie op `/beheer/nieuws` (geen eigen
nav-item, geen statusknoppen), en dat staat eerlijk zo in het runbook. Dat vult
de eis *"of een expliciet gemotiveerde reden waarom niet"*.

**Toegang via service-role, niet via een policy.** ADR 0006 somt zijn
uitzonderingen op de "geen brede beheer-policies"-regel letterlijk op —
`feedback`, `error_logs`, `mail_log`, `job_runs`, `ai_usage`, operationele
tabellen zonder persoonlijke financiën. `news_feedback` staat daar niet bij en
hoort daar ook niet: hij zit in `ALL_USER_SCOPED_TABLES` én in de AVG-export van
de gebruiker. Een superadmin-SELECT-policy erop zou die uitzonderingslijst
uitbreiden, en dat is een ADR-amendement, geen implementatiekeuze. De route
`/api/admin/news-feedback` leest daarom met `getServiceClient()` na
`isSuperAdmin()`, met `logAdminAction` bij elke inzage.

**Privacy-vorm:** het aggregaat toont categorieën, koppen en tellingen. `user_id`
gaat de aggregator wél in — de demotieregel van `/api/news` is per gebruiker,
dus zonder die sleutel kun je het effect niet eerlijk weergeven — maar komt er
alleen als telling weer uit. Er is geen veld waarin een identiteit past.

## Gevolgen

- `/beheer/errors` is een werkvoorraad: open soorten bovenaan, teruggekomen
  soorten expliciet gemarkeerd, afgehandelde soorten standaard verborgen.
- De inbakken-tabel in `docs/beheerders-runbook.md` klopt weer: van zes inbakken
  zijn er nu vier met een werkvoorraad, één venster en één die niets ontvangt.
- Een nieuwe tabel verschijnt automatisch in de gescande ERD na
  `npm run arch:diagram`. Conform het precedent van ADR 0102 blijft interne
  observability buiten ArchiMate/HLD/Berekeningen.
- **Uitrolvolgorde is bindend: migratie eerst, dan de code.** Deployt de code
  eerder, dan faalt `/beheer/errors` volledig (de resolutions-query is geen
  optioneel pad) én zet de retentie-cron zichzelf elke dag op `error` — met een
  dagelijkse melding erachteraan. Dat is bewust niet weggeprogrammeerd: een
  ontbrekende tabel hoort hard te falen, niet stil te degraderen.
- Open: het "bekend gat"-blok in `.claude/skills/ticket-triage/SKILL.md` moet mee
  — dat valt onder de zelfmodificatie-gate en is bewust niet in deze wijziging
  meegenomen.
- **Restrisico (bestaande kaart):** `/api/log-error` heeft geen rate limit. Wie
  veel van één fouttype post kan het leesvenster van 2000 regels volduwen en
  daarmee oudere soorten uit beeld drukken. Het venster liegt daar niet over
  (`truncated` wordt getoond), maar de echte fix is de throttle op die route —
  al genoteerd als open punt in ADR 0102.

## Alternatieven overwogen

- **`signature`-kolom op `error_logs` + backfill (A1).** Indexeerbaar, maar
  vraagt een SQL-normalisator naast de TS-versie. Afgewezen om het driftrisico;
  bij een orde van grootte meer volume opnieuw te overwegen.
- **Superadmin SELECT-policy op `news_feedback` (C1).** Technisch veilig — beide
  productie-lezers filteren expliciet op `user_id`, dus een brede policy kan hier
  niet stilletjes een gewoon app-oppervlak verbreden zoals destijds op
  `assets`/`transactions`. Afgewezen omdat het de uitzonderingslijst van ADR 0006
  uitbreidt zonder dat daar noodzaak voor is.
- **Sweep slaat resolved signaturen over (B2).** Zou dezelfde sleutel in beide
  paden dwingen en een service-role-lezing aan de cron toevoegen. Alleen de
  moeite waard bij een bekend-onoplosbare fout die blijft ruisen; die is er niet.
