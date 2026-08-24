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
