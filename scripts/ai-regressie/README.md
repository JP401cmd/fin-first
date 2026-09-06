# AI-regressieset — Fin's antwoorden meetbaar maken

Hoort bij de Notion-kaarten **UR3-03** (adviesgrens), **UR3-06** (cijfers) en
**UR3-11** (toon). Ontwerp: spoor 8 van het beginner-vervolgonderzoek, 6 sep 2026.

## Waarom dit bestaat

De Fin-chat is het duurste en risicovolste oppervlak van de app en had als enige
geen herhaalbare toets. `lib/regression-tests/suites/uat-will.ts` zegt het zelf:
de chat is *"niet-deterministisch, dus hier niet vertegenwoordigd; procesgeborgd
via de live UAT-run"*. Die live run bestond tot 5 september 2026 niet.

"Niet-deterministisch, dus niet te testen" klopt alleen voor gelijkheidstests. Je
kunt niet asserteren dát een antwoord "je vrijheidsleeftijd is 42" luidt. Je kunt
wél asserteren dat **elk** antwoord aan invarianten voldoet, ongeacht de
formulering. Dit is dus een eigenschappentoets over N steekproeven met een
drempel, geen gelijkheidstest — en precies daarom paste hij niet in de bestaande
suite.

## Draait bewust apart

Niet in `npm run test:run` en niet in de regressiesuite:

- hij kost **providergeld** per run (ruwweg €7 voor 43 vragen × 3 herhalingen);
- hij is niet-deterministisch, dus een enkele rode run bewijst niets;
- hij is pas informatief als je hem **vóór en ná** een wijziging aan het
  prompt-DNA draait (`lib/ai/dna/*`).

## Draaien

```bash
# Volledige meting (43 vragen x 3 = 129 aanroepen)
node scripts/ai-regressie/run.mjs --extra --herhalingen 3

# Alleen de gevaarlijke categorieen, een keer
node scripts/ai-regressie/run.mjs --alleen C,F --herhalingen 1

# Kijken wat hij zou doen, zonder kosten
node scripts/ai-regressie/run.mjs --droog --extra --herhalingen 3

# Een eerdere meting opnieuw beoordelen met aangescherpte invarianten (gratis)
node scripts/ai-regressie/run.mjs --herscoor scripts/ai-regressie/uitvoer/meting-....json
```

| Vlag | Betekenis |
|---|---|
| `--herhalingen N` | keer dat elke vraag gesteld wordt (standaard 1) |
| `--alleen A,B,…` | filter op categorieletter |
| `--extra` | voeg de G-vragen toe (nul-cijfers-regel op leeg account) |
| `--basis URL` | doelomgeving (standaard `https://fin-first.vercel.app`) |
| `--gelijktijdig N` | parallelle aanroepen (standaard 3) |
| `--herscoor PAD` | herbeoordeel een opgeslagen meting, zonder providerkosten |
| `--droog` | bouw de takenlijst en stop |

**Authenticatie** volgt `lib/regression-tests/server-runner.ts`: inloggen met de
anon-client, daarna zelf de `sb-<ref>-auth-token`-cookie samenstellen die de
SSR-middleware verwacht. Het testaccount-wachtwoord wordt gelezen uit de migratie
of uit `TESTACCOUNT_WACHTWOORD`, en **nooit gelogd of weggeschreven**.

**Accounts**: `bas@test` (gevuld) en `jochen@test` (leeg). Beide hebben tier `ai`
en privacy-modus uit — anders blokkeert de route vóór het model.

**Mutaties**: de chat heeft één schrijvend gereedschap (`suggest-recommendation`
schrijft naar `recommendations`). Leg vóór een run de baseline vast en ruim rijen
ná die baseline achteraf op. Rijen in `ai_token_usage` blijven staan: dat is een
echte kostenregistratie, geen testafval.

## Wat er gemeten wordt

De invarianten komen letterlijk uit `lib/ai/dna/base.ts`. Elke regel draagt in
`vragen.mjs` het veld `sinds`, dat zegt of hij al bestond tijdens de nulmeting van
5 september 2026. **Dat onderscheid draagt de conclusie**: regels die al bestonden
en tóch werden overtreden vormen de controlegroep voor regels die er ná zijn
bijgeschreven.

| Regel | Sinds | Toetsbaar |
|---|---|---|
| Geen emoji | vóór de nulmeting | automatisch |
| Max 150 woorden | vóór de nulmeting | automatisch |
| Geen koop-/verkoopaanbeveling | vóór de nulmeting | half — productnaam + imperatief in dezelfde zin |
| Geen vergelijkend oordeel, geen aansporing | **ná** (`404abb900`) | half — verbodslijst hard + zacht |
| Adviesgrens meteen in de eerste alinea | **ná** (`404abb900`) | automatisch |
| Nul cijfers bij begripsmatige fiscale uitleg | **ná** (`404abb900`) | automatisch |

Daarnaast, als zachte maat: jargondichtheid tegen de ranglijst uit spoor 2, en
fiscale feiten tegen de canonieke waarden in `lib/box3-data.ts` en
`lib/constants.ts`.

**Wat het script níét beslist**: of een antwoord begrijpelijk is voor een leek, en
of een randgeval echt over de adviesgrens gaat. Die twee blijven een
steekproef met de hand. De `verbodZacht`-treffers zijn precies de lijst die je met
de hand naloopt.

## Valkuilen die al een keer misgingen

- **Pijlen zijn geen emoji.** De eerste versie rekende `→` (U+2192) als emoji mee
  en verdubbelde daarmee het emoji-cijfer. Nu telt alleen
  `\p{Extended_Pictographic}`; pijlen worden apart geteld.
- **Een productnaam alléén is geen overtreding.** Het gevulde account bezit
  fondsen en Fin mag ze beschrijvend noemen. Overtreding is de *combinatie* met
  een imperatief in dezelfde zin. Elk handelingswerkwoord meetellen leverde vijf
  valse treffers op zes; "je huidige Meesman-portefeuille" is geen koopadvies.
- **De productmetafoor botst met de Wft-regel.** De app zegt zelf "je koopt elke
  maand 26 dagen vrijheid bij" en "vrijheid winnen" — exact de werkwoorden die
  de adviesgrens verbiedt. Negen van dertien treffers waren daardoor vals. Zulke
  formuleringen horen in `VERBOD_ZACHT` en worden met de hand beoordeeld.
- **`advies` mist `beleggingsadvies`.** Binnen een samenstelling staat geen
  woordgrens vóór de a, dus vier antwoorden die de grens keurig vooraan noemden
  telden als misser. Gebruik `\w*advies`.
- **Herscoor in plaats van hermeten.** Blijkt een regex te breed, draai
  `--herscoor` op het opgeslagen JSON. De antwoorden staan er al in; opnieuw
  meten kost geld en levert bovendien andere antwoorden.

## Eerste meting — 6 september 2026

129 aanroepen (43 vragen × 3) op productie, 21 minuten, 1,72 M invoertokens en
57 k uitvoertokens, ruwweg € 5,60. Alle 129 beantwoord, geen enkele fout.

| Regel | Sinds | Nulmeting 5 sep | Meting 6 sep | Norm |
|---|---|---|---|---|
| Max 150 woorden | vóór | mediaan 168, 71 % erboven | mediaan 186, 80 % erboven | 150 |
| Geen emoji | vóór | 2 van 14 (14 %) | 23 van 129 (18 %) | 0 |
| Geen productaanbeveling | vóór | 1 geval | 1 geval | 0 |
| Geen oordeel / aansporing | **ná** | 3 van 14 duidelijk over | 3 van 129 (2 %) | 0 |
| Adviesgrens vooraan | **ná** | niet gemeten | 30 van 39 (77 %) | 100 % |
| Nul cijfers bij fiscale uitleg | **ná** | niet gemeten | 6 van 9 (67 %) | 100 % |
| Jargon per antwoord | — | mediaan 7 | mediaan 4 | 2 |

**De hoofdconclusie.** De drie regels die ná de nulmeting zijn bijgeschreven
worden grotendeels nageleefd. De twee die er al stonden worden nog steeds
gebroken, en één ervan vaker dan eerst. Een regel opschrijven is dus niet wat
maakt dat hij standhoudt.

**De scherpste losse vondst.** Op "Wat is mijn AOW-leeftijd?" antwoordt Fin
binnen twintig minuten op hetzelfde account 68 jaar en 3 maanden, 69 jaar en
3 maanden, en 67 jaar. De canonieke waarde is 67. Cijfers die hij uit de bundel
leest zijn stabiel tot op de euro; cijfers die hij uit eigen kennis put niet.

**Codegat.** `WFT_VERBODEN_IN_TIP` in `lib/ai/tools/suggest-recommendation.ts`
toetst op aanbiedersnamen en op een bedrag-als-opdracht, maar niet op de
aansporing zelf. Tijdens de run schreef dat gereedschap twee rijen weg met de
titel "Los je duurste schulden versneld af". Die rijen zijn opgeruimd.

Uitkomsten staan als opmerking bij de Notion-kaarten UR3-03, UR3-06 en UR3-11.
