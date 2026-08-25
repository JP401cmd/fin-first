# UX-test TriFinity — voortgang en hervattingspunt

> Werkdocument van een lopende UX-test. Hiermee kan een nieuwe sessie verder
> zonder iets kwijt te raken. Bijgewerkt: 24 aug 2026.

## Hoe je hervat

```bash
bash scripts/dev/test-stack.sh --dev     # stack + dev-server op :3000
```

Daarna inloggen op `http://localhost:3000/login`. Zie `docs/dev/lokale-teststack.md`
voor de achtergrond en de bekende blokkades.

**Testaccounts** (allemaal wachtwoord `Test2026!`):

| Account | Persona geseed | Toegewezen fases | Status |
|---|---|---|---|
| `jochen@test.trifinity.nl` | lisa (16 bezittingen, 405 transacties) | 1, 2 — first impression + onboarding | ✅ afgerond |
| `ronald@test.trifinity.nl` | lisa | 4, 5, 6 — inzicht, grip, nu | ⏳ loopt |
| `bas@test.trifinity.nl` | willem | 7, 9, 10 — later, verdieping, personalisatie | ⏸ gepauzeerd (machine vol) |
| `leo@test.trifinity.nl` | compleet (Tessa) | 11, 12, 13, 16 — navigatie, taal, load, mobiel | ⏳ loopt |
| `uxtest@test.trifinity.nl` | geen (leeg, zelf invoeren) | 3, 8, 14, 15 — invoer, terugkeer, vertrouwen, fouten | ⏳ loopt |

Persona seeden op een leeg account: na inloggen `POST /api/activate` vanuit de
browser. Geeft die 400 "Already activated", zet dan eerst
`update profiles set last_known_phase = null where id = …`.

## ⚠️ Belangrijk: capaciteitsgrens van de omgeving

Vier parallelle Playwright-browsers plus de Next dev-server lopen deze container
vast: de dev-server groeide naar **11,2 GB** (70% van het geheugen), load liep op
tot 90 en zelfs `free` reageerde niet meer binnen twee minuten. Er is geen swap.

**Draai maximaal twee browsersessies tegelijk**, of gebruik een productiebuild
(`npm run build && npm start`) in plaats van `next dev` — de dev-server
hercompileert elke route per bezoeker en dát is de geheugenvreter. Herstart de
dev-server tussendoor als hij boven ~4 GB komt.

## Verzamelde bevindingen

Deze staan in de scratchpad van de lopende sessie en zijn **nog niet
samengevoegd**. Als die weg is, is dit de samenvatting van wat vaststaat:

### Onboarding (geverifieerd, account jochen)
- 🔴 **Geen enkel vrijheidsgetal tijdens de hele onboarding.** 20 schermen lang
  verschijnt nooit een berekend getal over vrijheid in tijd, terwijl de app na
  scherm 4 inkomen én uitgaven kent. De publieke funnel op `/check` toont vanaf
  stap 2 wél een doorlopende teller "AL VRIJGEKOCHT 1j 4m". De ingelogde
  onboarding is dus slechter in waarde tonen dan de trechter ervóór.
- 🟠 **De stappenteller telt secties, geen schermen.** "2/8" staat op drie
  opeenvolgende schermen, "3/8" op vijf, "4/8" op acht. 20 schermen om sectie 6
  van 8 te halen, terwijl het welkomstscherm "een paar korte vragen" belooft.
- 🟠 **Acht losse ja/nee-schermen over schulden** (hypotheek, studielening,
  persoonlijke lening, doorlopend krediet, creditcard, roodstand, autolening,
  overig). De meeste mensen hebben er nul tot twee.
- 🟠 **Voortgang staat in localStorage** (`trifinity_onboarding_draft`), niet bij
  het account. Wisselen van apparaat betekent opnieuw beginnen.
- 🟡 Twee stappentellers tegelijk: wizard op "3/8" met daarboven een modal
  "STAP 1 VAN 2".
- 🔵 "2 bezitten" in plaats van "2 bezittingen" in het FEITEN-paneel.
- 🔵 Dubbele foutmelding op een scherm met één veld (banner + inline).
- 🔵 "verder niets verplichts" boven een veld met een sterretje.

### Onboarding — sterk, behouden 🟢
- Elke stap legt in één zin uit waaróm de vraag gesteld wordt, in de taal van het
  product ("Met je leeftijd vertaal ik je geld naar jouw vrijheid in tijd").
- Berekende defaults: "≈ 80% van nu" vulde €24.960 voor = exact 80% van de
  ingevoerde uitgaven, met de redenering erbij. Spaardoel "Noodfonds €15.600" =
  zes keer de maandlasten.
- Het FEITEN-paneel geeft per vraag een ijkpunt mét bron (CBS, Nibud) en wordt
  persoonlijk zodra je gegevens invoert.
- Overal een uitweg ("Later invullen →", "Kan altijd later nog →").
- Bevestigingsscherm vóór doorgaan: "Dit zijn je bezittingen — klopt het?"
- Transparant over methodiek: "prijspeil van vandaag; inflatie rekenen wij er
  later overheen." Pensioen kan geüpload worden vanaf mijnpensioen.nl.

### Van tester B (power user, ronde 1)
- 🔴 **Mislukte eindsave gooit de wizard leeg** terwijl de melding zegt "Je
  antwoorden staan nog hier". De 500 kwam door de omgeving, maar het
  herstelgedrag eromheen is productgedrag.
- 🟠 **"Je eerder ingevulde gegevens zijn hersteld" herstelt de plek, niet de
  inhoud.** Drie ingevoerde bezittingen werden er één.
- 🟡 Herstel zet je terug naar de eerste deelvraag van de bezittingen-reeks.
- 🟡 "VOORTGANG 100% — Je bent klaar!" naast "NETTO VERMOGEN: Vul je later aan".

### App (geverifieerd, hoofdtester)
- 🟠 **"10 jaar en 12 maanden vrijheid"** op `/overzicht/bezittingen`. Twaalf
  maanden is een jaar; hoort "11 jaar" te zijn — in het kerngetal van het product.
- 🟠 **De welkomstgids weet niet wat de app al weet.** Vraagt "Zijn al je
  bezittingen geregistreerd?" en staat op "0/4 afgevinkt" op een account met 16
  bezittingen, 11 schulden, 33 budgetten en 405 transacties.
- 🟡 **Het dashboard is extreem dicht bezet**: ruim twintig blokken op één pagina
  (gezondheid, vermogen, cashflow, FIRE, doelen, beleggingen, budgetten,
  heatmap, monte carlo, spaartrend, acties, inflatie, briefing met zes items,
  tip van Fin …).
- 🟢 Sterk: "16 bezittingen bij elkaar, elk voor zijn volle waarde — je netto
  vermogen weegt ze naar inclusiepercentage en valt daardoor anders uit."
- 🟢 Sterk: acties dragen hun effect in vrijheidstijd ("+45d/jr") en een
  prioriteitsscore; de fee-calculator laat zien dat 0,5% beheerkosten €51.091
  over 30 jaar kost — 13% van de eindwaarde.

### Zwaarste bevindingen — twee keer onafhankelijk gereproduceerd

- 🔴 **Het kernantwoord van de app is niet-deterministisch.** Drie keer dezelfde
  pagina `/toekomst` laden, dezelfde gegevens, dezelfde sessie, seconden na elkaar:

  | Laadbeurt | Vrijheidsleeftijd | Doelbedrag |
  |---|---|---|
  | 1 | 52,9 jaar | € 537.598 |
  | 2 | **67 jaar** | **€ 1.180.986** |
  | 3 | 52,9 jaar | € 537.598 |

  Tester B2 zag hetzelfde op een ander account (61,6 jaar / € 2.101.015 versus
  "Je bent vrij" / € 705.173). **Aanwijzing:** op datzelfde scherm staat
  "AOW-integratie: inbegrepen vanaf 67j", en de afwijkende laadbeurt gaf exact 67 —
  dat wijst op een terugval op de AOW-leeftijd wanneer de FIRE-berekening niet
  compleet is. Gemeten ná alle omgevingsreparaties, dus geen artefact.

- 🟠 **"Verwacht rendement (portefeuille) 665,5%"** in de FIRE-widget op
  `/overzicht` (tester B2 zag 650,0% op zijn account). Factor-100-fout.

### Van tester C (navigatie, taal, cognitive load — account leo)
- 🔴 **Vrijheids-delta's lezen omgekeerd.** Op `/toekomst/gebeurtenissen` krijgt
  "Verbouwing eigen woning — € 45.000" de badge **"+2.2 jaar vrijheid"**, en
  "Aanvullend pensioen +€ 1.100/mnd" krijgt **"−3.2 jaar vrijheid"**. Bedoeld is
  "2,2 jaar later vrij" resp. "3,2 jaar eerder vrij", maar "+ vrijheid" leest als
  winst. Teken en woord spreken elkaar tegen op de kernmetric.
- 🟠 **Zeven bijna identieke "DRINGEND"-budgetmeldingen** op `/berichten`, en
  "€1280 van €1280 — budget overschreden" klopt niet: dat is vól benutten.
- 🟠 **Import en bankkoppeling zijn niet vindbaar vanuit het menu.** Import alleen
  via een knop op de transactiepagina, op de legacy-route `/core/cash/import`.
- 🟠 **Kernjargon zonder uitleg op beslismomenten**: "SWR 2.8%", "Interen",
  "inclusiepercentage", "PSD2-banken, UPO, brokerage-sync".
- 🟡 De "TIP VAN FIN"-toast overlapt content op elke pagina (stond over het
  KPI-blok "BELEGD € 829.736" heen) en herhaalt zich per pagina.
- 🟡 Zijbalk-"APPS" verspringt per pagina; Crypto holdings en Verhuurrendement
  waren nergens zichtbaar.
- 🟡 Onboarding-eindscherm accepteert "NETTO VERMOGEN € -2.479.300" zonder enige
  "klopt dit?"-controle.
- 🟡 "Nieuws" (menu) vs "Krant" (paginatitel); Rapportages en Account staan dubbel.
- 🟡 De weergave-switches "Persoonlijk" en "Toekomstige euro's" zijn onverklaard
  en hun actuele stand is niet afleesbaar.
- 🔵 "Nog een beleggingen?", "4 bezitten". **Nuance**: tester C zag "26 jaar en
  6 maanden" (correct) — "10 jaar en 12 maanden" is dus een randgeval dat optreedt
  wanneer de maanden op 12 uitkomen.
- 🟢 Sterk: de her-inlogmodal bewaart context ("Je gegevens zijn veilig").
- 🟢 Sterk: verdiepingspagina's hebben een consistent redactioneel stramien —
  statement-kop, vier KPI's mét tijd-equivalent, genummerde secties, breadcrumb,
  uitklapbare uitleg. Dít is de maat waarnaar `/overzicht` toe moet.

**Vindbaarheidsgat** (bestaat wél, niet gevonden als gebruiker): bestandsimport,
Crypto holdings, Verhuurrendement, `/toekomst/bibliotheek`,
`/toekomst/samengestelde-interest`, `/mijn/feedback`, `/mijn/lokale-chat`,
`/rapportages/benchmark`, `/persoonlijk-plan`, `/totaalplan`. Legacy-routes
`/core/**`, `/dashboard`, `/horizon/**` bestaan nog en duiken op in echte flows.

### Publieke funnel `/check` (ondergeschikt)
- 🔴 De enige prominente knop op de bezittingen-stap is "Overslaan (geen
  bezittingen)"; die gooit de zojuist ingetypte €25.000 weg zonder waarschuwing
  en de teller "AL VRIJGEKOCHT" zakt stil van 1j 4m naar 8m.
- 🟠 Intro belooft "acht vragen", indicator zegt "STAP 1 VAN 10".
- 🟢 "TOON DE REKENKETEN" laat de hele berekening zien.
- 🟢 Levensgebeurtenissen tonen "Kost ongeveer 6m aan vrijheid" vóór bevestiging.

## Repo-bevindingen (los van UX, ernstig)

De migratieset is niet zelfvoorzienend — zes gevallen waarin een migratie een
object gebruikt dat geen enkele migratie aanmaakt. Details en symptomen staan in
`docs/dev/lokale-teststack.md`; `patch_remote_only()` in `scripts/dev/test-stack.sh`
vult ze aan. Kort:

1. Migratie `20260213122235` verwijst naar `public.budgets`, aangemaakt in
   `20260215000000` — twee dagen later in de sorteervolgorde. Verse `db reset` faalt.
2. Vijf migratieversies zijn dubbel bezet (207 bestanden, 201 unieke versies).
   `schema_migrations.version` is primary key, dus duplicaten zijn onzichtbaar.
3. Tabelrechten voor `anon`/`authenticated` ontbreken → alles leeg.
4. `profiles.commercial_tier` ontbreekt terwijl `20260720081332` er een trigger
   op zet → élke profielwijziging faalt, onboarding kan niet opslaan.
5. Vijf `assets`-kolommen ontbreken → élke bezittingen-query faalt stil, overal €0.
6. Geen unieke constraint op `net_worth_snapshots(user_id, snapshot_date)` terwijl
   de code erop upsert → 500. Of productie hem out-of-band heeft is uit de repo
   niet af te leiden.
7. `20260811020500` bevat `md5(jsonb)` zonder `::text`-cast — kan nergens draaien.

## Wat er nog moet gebeuren

1. Resterende testers afronden: fases 4/5/6, 7/9/10, 11/12/13/16, 3/8/14/15.
2. Bevindingen samenvoegen tot het eindrapport: per bevinding scherm, persona,
   observatie, probleem, UX-principe, impact, severity, aanbeveling.
3. Scores 1–10 op de 22 gevraagde dimensies plus de hoofdscore op de kernbelofte.
4. Vier lijsten: top 5 problemen, top 5 quick wins, top 5 structureel, top 5 sterk.
5. Geprioriteerde roadmap: Nu → Vervolgens → Later.

---

## Tweede testronde (24 aug 2026, middag)

**Deliverable:** `TriFinity-bevindingen.pdf` — 36 pagina's, 55 defecten, elk met severity,
prioriteit (P1 Nu / P2 Vervolgens / P3 Later), reproductiestappen, verwachte tegenover
werkelijke uitkomst, aanbeveling en bewijsbeeld waar beschikbaar. Sterke punten staan
bewust niet in dit register; die horen in de audit (artifact) en in een regressietest.

**Bouwpijplijn van de PDF** (in de scratchpad, niet in de repo):
`bev-head.html` + `bev-tail.html` → `bevindingen.html` → screenshots inlinen als data-URI
→ `bevindingen-img.html` → `pdf.mjs` (Playwright `page.pdf`, A4, printBackground).

**Openstaande opdracht:** na afronding van de lopende rondes moet de PDF worden bijgewerkt
met de nieuwe bevindingen.

### Rondes die op dit moment lopen
| Tester | Account | Gebied |
|---|---|---|
| Toegankelijkheid + Fin-oppervlak | `jochen@` (AI actief) | Toetsenbordnavigatie, focus, koppenstructuur, aria, contrast; gedrag als het AI-model onbereikbaar is |
| Invoer, import, rapportages | `leo@` | Transacties beheren, de drie testbestanden importeren (incl. dubbele upload), budget aanmaken, doelen, rapportages |
| Belastingmodule | `ronald@` (persona compleet) | Box 1/2/3 narekenen, herleidbaarheid, de Wft-grens tussen inzicht en advies |

### Accountstatus
`jochen@` en `ronald@` hebben `commercial_tier = 'ai'` en alle modules. De guard-trigger op
`profiles` weigert die wijziging door `authenticated`/`anon` maar laat `postgres` door —
zoals bedoeld.

**Er is geen AI-sleutel in de omgeving** (`ANTHROPIC_API_KEY` noch `OPENAI_API_KEY`). De
kwaliteit van Fin's antwoorden is daarom niet te beoordelen; het gedrag van de app wanneer
het model onbereikbaar is, wél.

### Capaciteit — herhaalde waarneming
De Next dev-server groeit onder aanhoudend testen structureel naar circa **11 GB** van de
15 GB, inmiddels drie keer waargenomen. Er is geen swap; de machine loopt dan vast en
navigaties duren minuten. Herstarten van de dev-server geeft het geheugen direct terug.
Voor langere rondes is een productiebuild (`npm run build && npm start`) verstandiger —
die hercompileert niet per bezoeker.

### Nog niet getest na deze ronde
Huishouden en partnerdeling (grootste resterende gat, en het gevoeligste: wat ziet je
partner wél en niet), onboarding in de varianten alleenstaand en gezin, sessie- en
foutgedrag (verlopen sessie midden in een formulier, netwerkverlies bij opslaan, twee
tabbladen naast elkaar), en de kwaliteit van de AI-antwoorden.

## Ronde 3 — toegankelijkheid, Fin-oppervlak en belastingmodule (24 aug, 17:00)

Twee testrondes afgerond, één loopt nog.

| Ronde | Account | Status |
|---|---|---|
| Toegankelijkheid + Fin-oppervlak | `jochen@` (AI-tier) | afgerond |
| Belastingmodule | `ronald@` (persona `compleet`, AI-tier) | afgerond |
| Invoer / import / rapportages | `leo@` | loopt nog |

### Nieuwe bevindingen in de PDF verwerkt

- **C8** — hub en `/belasting/box1` noemen twee verschillende box 1-heffingen (verschil €4.357 = eigenwoning-saldo × 49,5%).
- **C9** — effectief tarief (36,6%) boven marginaal (35,8%) op de hub; box 1-pagina noemt 56,0% voor hetzelfde inkomen.
- **H22** — "Drie boxen, één som" telt box 2 niet mee in het totaal.
- **H23** — jaarruimte gerekend met factor A = 0; scherm spreekt zichzelf tegen over de aanname.
- **H24** — Wft: vier passages in aanbevelende/gebiedende vorm; `/wft` nergens gelinkt en zelf nog concept.
- **H25** — hypotheekrenteaftrek tegen toptarief; tariefsaanpassing eigen woning ontbreekt.
- **H26** — box 2-scherm met kop €0 toont tegelijk €16.867; slider-default staat op de schijfgrens.
- **H27** — chatfout in beheerderstaal ("controleer de API-sleutel in Admin instellingen").
- **M22–M29** — vrijheidsdag-koers verschilt per scherm (3 vs 5 dagen op hetzelfde bedrag); box 3-indeling; tegenbewijs-default 2,0%; "Vraag Fin" markeert gelezen bij een mislukt antwoord; chat laat typen terwijl `aiEnabled:false`; chat sluit niet met Escape; twee `h1` per pagina; focus-outline 0px.
- **L7–L9** — getypte vraag gewist na fout; box 2-alarm bij €0; "Ververs"-knop verdwijnt na gebruik.

### Verworpen: het gemelde "datalek"

De belastingtester meldde als Critical dat de module minutenlang het dossier van een andere gebruiker toonde, inclusief e-mailadres. **Geverifieerd en verworpen — het is de testmethode, niet het product.**

Oorzaak: twee gelijktijdige testers deelden één `storageState`-bestand (`scratchpad/state.json`). Beide schreven ernaar; de laatste schrijver overschreef de cookies van de ander midden in een run. In de database staat het "vreemde" dossier gewoon op het eigen account (`ronald@` heeft de `compleet`-persona met "Belang Volkert Compleet Holding BV"), en het "eigen" dossier op het andere account (`jochen@` heeft "Woning Utrecht" €385.000 en "Pensioenfonds ABP Lisa"). Servercode gecontroleerd: `getCachedUser` gebruikt React `cache()` (request-scoped), en `lib/reference-cache.ts` bevat alleen niet-gebruikersgebonden referentiedata.

**Les voor volgende rondes: geef elke tester een eigen storageState-pad** (`state-<account>.json`) en laat elke tester bij aanvang het ingelogde e-mailadres van het scherm verifiëren. Dit is nu in de PDF opgenomen als sectie "Verworpen waarnemingen", zodat het register laat zien wat er is afgevallen.

De overige belastingbevindingen blijven overeind: het zijn vergelijkingen *binnen* één consistente dataset (hub vs. detail, kop vs. simulator, formule vs. uitkomst).

### PDF-stand

74 bevindingen (9 Critical, 27 High, 29 Medium, 9 Low), 59 pagina's, 19 ingesloten schermafbeeldingen. Bouwen:

```
cd <scratchpad>
node inline.mjs   # bev-head + bev-tail -> bevindingen.html -> bevindingen-img.html
node pdf.mjs      # -> TriFinity-bevindingen.pdf
```

`inline.mjs` sluit de `{{IMG:bestand.png}}`-plaatshouders in als base64 data-URI en verwijdert lege figures; het bestand zelf komt nooit in de modelcontext.

## Ronde 3 afgerond — importronde voortijdig afgebroken (24 aug, 18:45)

De derde tester (invoer/import/rapportages op `leo@`) is om 18:12 gestopt doordat de sessie opnieuw werd opgestart; hij heeft zijn rapport nooit geschreven. Zijn waarnemingen zijn teruggehaald uit de vastgelegde handelingen en stuk voor stuk nageslagen vóór opname in het register:

| Bevinding | Verificatie |
|---|---|
| **C10** — FIRE-antwoord 13 jaar uiteen: `/overzicht` "0j 1m / 99,4%" tegenover `/toekomst/doelen` "aug 2039 / 58%" | Database: 16 bezittingen = €1.585.000; doelenpagina rekent met €960.000. Grondslagverschil nettoVermogen vs. FIRE-eligible portefeuille — precies de vermenging die CLAUDE.md verbiedt |
| **H28** — rapport eist AI-abonnement terwijl `ai=false` is gekozen | `rapportages/page.tsx` r.184 duwt de gebruikerskeuze door als `ai=${useAi}`; `leo@` staat op tier `gratis` |
| **M30** — balans: "Passiva €1.585.000 · 12 schulden" | `balans/page.tsx` r.285-289: bedrag is `totalPassiva` (boekhoudkundig correct: €454.020 schuld + €1.130.980 eigen vermogen), sublabel telt alleen `totalDebtItems`. Getal klopt, bijschrift niet |
| **M31/M32** — nieuw doel direct "achter op planning"; doel zwaarder maken verbetert de status | Uit de handelingen: €0/€5.000 jul 2027 → ACHTER; €1.500/€9.000 dec 2026 → OP KOERS bij 17% |
| **M33/M34** — dedup-teller "0 nieuw · 1 importeren"; 7 van 8 checkboxes zonder `aria-label` | Uit de handelingen |
| **M35/M36** — gestapelde modals; nieuw doel niet op de tijdas | Uit de handelingen |
| **L10** — vierde dagtarief (€165/dag op de balans) | Uit de handelingen |

**Wat de ronde niet meer heeft gehaald** (opgenomen in "Nog niet getest"): de rapporten *spiegel* en *totaalplan* (laadden niet binnen 120s terwijl de dev-server 11 GB gebruikte en de load boven 40 lag), budget aanmaken/bewerken (de budgetpagina laadde niet; op deze run met Postgres-fout 42703 `undefined_column`, vermoedelijk omgeving), en de bankkoppeling/broker-sync (vereisen extern verkeer).

**De ontdubbeling werkt aantoonbaar goed**: een tweede import van hetzelfde bestand gaf "0 nieuw · 7 duplicaten · 0 importeren" met uitleg. Ongeldige bestanden (.txt, corrupte CSV) geven begrijpelijke, specifieke foutmeldingen.

### Eindstand register

84 bevindingen — **10 Critical, 28 High, 36 Medium, 10 Low** — 70 pagina's, 25 schermafbeeldingen.

De PDF staat als `docs/dev/rapporten/TriFinity-bevindingen.pdf` in de repo, met de HTML-bron ernaast (`bevindingen-bron.html`). Reden: de upload naar de gebruiker liep drie keer op een netwerktimeout, en de container is vluchtig. `inline.mjs` schaalt de schermafbeeldingen nu naar 1100px JPEG q72 (3,0 MB → 1,5 MB) voordat het de PDF rendert.

### Capaciteitsgrens, definitief

Drie gelijktijdige testers passen niet. Gemeten bij de laatste ronde: `next-server` op 11,1 GB van 16 GB, load average 44–70, en pagina's die na 240s nog niets teruggaven. **Maximaal twee browsersessies tegelijk**, en herstart de dev-server tussen rondes.

## Reproductiegids bijgewerkt (24 aug, 19:50)

Artefact: https://claude.ai/code/artifact/91f41706-4509-4d71-9ed3-4b4529494140 — bron staat als `docs/dev/rapporten/reproductiegids-bron.html` in de repo.

Toegevoegd: C8, C9, C10 als volledige cases; H22 t/m H28 als volledige cases; vijftien regels in de Medium-tabel en vier in de Low-tabel.

**Accounttabel gecorrigeerd.** De oude tabel klopte niet meer — hij beschreef de personadefinities, niet wat er in de database staat. Gelezen stand per 24 aug:

| Account | Persona | Inhoud | Tier |
|---|---|---|---|
| `uxtest@` | handmatig gevuld | 6 bezittingen, 0 transacties, één bezitting van €1 biljoen (bewijs van H8) | gratis |
| `jochen@` | Lisa — solo, woning Utrecht | 16 bezittingen (€498.550), 11 schulden, 405 transacties | **ai** |
| `ronald@` | Volkert Compleet — DGA | 16 bezittingen (€1.585.000), 12 schulden, 287 transacties | **ai** |
| `leo@` | Volkert Compleet — DGA | 16 bezittingen (€1.585.000), 12 schulden, 295 transacties | gratis |
| `bas@` | Willem — FIRE nabij | 8 bezittingen (€1.619.700), 0 schulden, 301 transacties | gratis |

`ronald@` was géén Lisa-account; die persona zit op `jochen@`. Daar kwam het vermeende datalek uit voort. `ronald@` en `leo@` dragen dezelfde persona met verschillende tier — bruikbaar om betaalmuren te vergelijken.

**Twee nieuwe stappen in de opzetsectie:**
- Stap 4 (capaciteit) aangescherpt met de tweede meting: 11,1 GB, load 44–70, pagina's die na 240s niets teruggaven. `kill -9` op de PID, want `pkill` laat het proces soms staan.
- Stap 5 nieuw: **één storageState-bestand per tester**, en bij aanvang het ingelogde account van het scherm aflezen.

**Slotsectie herschreven** — wat nu wél gedekt is (belastingmodule, Fin-oppervlak, toegankelijkheid, import, doelen, twee rapportvormen), wat open blijft (schermlezer met echte hulpsoftware, virtueel toetsenbord, de rapporten spiegel/totaalplan, budget aanmaken, bankkoppeling), en wat bewust buiten het register valt.

## Schermoordeel — alle schermen in beide weergaven (25 aug)

Op verzoek: alle hoofd-, deel- en detailschermen bekeken in Volledig én Eenvoudig, met per pagina een oordeel en verbeteringen, plus een taal- en jargonhoofdstuk. PDF: `docs/dev/rapporten/TriFinity-schermoordeel.pdf` (16 pagina's, bron ernaast).

Methode: 33 routes × 2 weergaven op `jochen@` (desktop 1440), per route screenshot + paginameting + volledige paginatekst (`scratchpad/txt/`), jargonscan over alle teksten, beeldreview per paar. Driver: `scratchpad/cap.mjs` (4 batches per modus).

Kerncijfers: 13 schermen echt gereduceerd (40–59% op het Overzicht-cluster), 14 identiek (o.a. /mijn-familie, /rapportages, /berichten, /nieuws, beide apps), 2 overreducties (cashflow-hub en forecast tonen in Eenvoudig geen antwoord meer), 2 kapotte verwijsketens (factor A → verborgen pensioen-strategie; voorkeuren verbergt instellingen waar de motor mee rekent).

Nieuwe losse waarnemingen uit deze ronde (nog niet in het bevindingenregister): "10 jaar en 12 maanden vrijheid" (afrondingsfout formatter, bezittingen), tips-tour op /toekomst keert terug zolang je "Sluiten" kiest (alleen "Niet meer weergeven" onthoudt), welkomstgids sluiten vergt twee beslissingen, leeg widget-rail-gebied van ±één schermhoogte op /overzicht in Volledig, supermarkten/kleding/restaurant als "vaste kosten" geclassificeerd (wortel van H14), Importeer/Bank koppelen verborgen achter "…" in Eenvoudig op transacties, NAV-1 (apps uit Eenvoudig-zijbalk) besloten op 9 aug maar niet doorgevoerd.

## Register v3 — schermronde-vondsten toegevoegd (25 aug)

De zeven waarnemingen uit het schermoordeel zijn in het bevindingenregister opgenomen: **M37** (formatter "10 jaar en 12 maanden"), **M38** (tips-tour keert elk bezoek terug; "Sluiten" onthoudt niet; tweede modal), **M39** (leeg widget-rail-gebied op /overzicht Volledig), **M40** (Importeer/Bank koppelen verborgen in Eenvoudig), **M41** (NAV-1 besloten maar niet doorgevoerd), **L11** (welkomstgids sluiten vergt twee beslissingen). De boodschappen-in-vaste-lasten-waarneming is géén nieuw nummer geworden maar als bewijs-aanvulling (met screenshot) bij het bestaande **H14** gezet — het was er de wortel van, en dubbel nummeren vervuilt het register.

Stand: **90 bevindingen** — 10 Critical, 28 High, 41 Medium, 11 Low — 76 pagina's, 31 schermafbeeldingen.

## Verbeterpunten-PDF (25 aug)

Vierde document: `TriFinity-verbeterpunten-weergave.pdf` — de schermoordeel-punten die géén genummerde bevinding zijn, als werklijst S1–S16 (duiding-boven-data, de twee overreducties, kapotte verwijsketens, dekking, selectiekeuzes, en S16: van binaire schakelaar naar diepte ter plekke). Bevat óók de volledige taal- en jargontabel (14 voorstellen) en achterin een kruisverwijzing van 19 schermronde-waarnemingen naar hun registernummer, zodat niets dubbel wordt geteld of opgepakt.

Documentindeling nu: **register v3** = genummerde defecten (C/H/M/L) · **aanvulling 25 aug** = alleen de nieuwe registernummers · **schermoordeel** = onderbouwing per pagina met screenshots · **verbeterpunten** = de ontwerp-/tekstwerklijst (S-nummers).
