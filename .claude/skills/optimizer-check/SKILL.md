---
name: optimizer-check
description: Gebruik na wijzigingen aan lib/tax-optimizer/**, lib/tax-lifetime/**, de Box 3-motor, de kansen-loader of de optimizer-katernen, bij twijfel of de fiscale keuzes nog kloppen op het scherm, of als periodieke visuele regressie-check bovenop de vitest-suites. Ook wanneer iemand vraagt "check de optimizer", "leg de belastingstrategieën naast elkaar" of een rapport met schermafbeeldingen per keuze wil.
---

# Optimizer-check — live verificatie van de fiscale keuzes

Meet op een geseed account wat `/overzicht/belasting/optimizer` daadwerkelijk toont per katern, toetst de bedragen aan hun eigen definitie, en levert een rapport met oordeel. De vitest-suites bewijzen dat de motor rekent; deze check bewijst dat het scherm zegt wat het rekent.

## Vaste gegevens

- Dev-server `http://localhost:3000`; chromedev-browser ingelogd als **jochen@test.trifinity.nl** (wegwerp-superadmin). **NOOIT** uitloggen, **NOOIT** het echte account (jpsmit@…). Verifieer het e-mailadres in de HTML van `/mijn/account` vóór alles.
- Motor-waarheid: `npx vitest run components/overview/belasting lib/tax-optimizer lib/tax-lifetime lib/uat/acceptance/belast.engine.test.ts`. Rood = eerst dáár kijken, niet in de browser.
- Persona: **`compleet`** (weergavenaam "Tessa") — de enige met beleggingen, pensioenpot én onbenutte jaarruimte tegelijk. Een persona die er één mist laat de bijbehorende keuze simpelweg weg, en dan valt er niets te vergelijken. (Let op: in `woonstrategie-check` is Tessa juist de verkeerde keuze — daar maakt haar vermogen de strategieën gelijk. Hier is dat geen bezwaar.)
- **De partnerkeuze is met één account onbereikbaar.** `GET /api/household/status` geeft `has_household:false`; de seed maakt geen fiscaal partner en een huishouden vormen vereist een tweede account dat de uitnodiging accepteert. Meld dat als grens, ga er niet omheen door uit te loggen.

## Stappen

1. **Preflight** — account-check; vitest groen; dev-server bereikbaar.
2. **Seed** — `POST /api/admin/seed` `{"persona":"compleet"}` via `evaluate_script` in de ingelogde sessie; stream uitlezen tot `{"done":true}`.
3. **Katern I + II meten** — navigeer naar de optimizer. Lees de vergelijking uit de **DOM**, niet uit de broncode: `#optimizer-vergelijking table` → rijen × cellen. Noteer per keuze: heffing na, bruto besparing, rendementseffect, netto effect, en wélke kolom de winnaar-badge draagt.
4. **Katern III** — open de uitwerking van de shift-keuze, zet de slider op max via de native value-setter + een `input`-event, lees de besparing, zet hem terug.
5. **Katern IV** — knop "Reken de drie varianten door" klikken, pollen tot de knop verdwijnt (worker, enkele seconden), dan de tabel uitlezen. Noteer ook de kanttekeningen (`li`-items).
6. **Invarianten toetsen** (afwijking = eerst de vitest, dan de bug-fix-route — niet wegredeneren):
   - `netto effect = bruto besparing − verwacht rendementseffect`, per keuze, op de euro.
   - De winnaar-badge staat op de hoogste **netto** waarde — niet op de grootste bruto besparing, en niet op een rij die per saldo geld kost.
   - Katern IV rekent **niets** vóór de klik: hij opent in de uitnodigingsfase.
   - Katern IV: `box 3 + box 1 = totale druk` per variant, en elk verschilbedrag klopt met het ijkpunt.
   - Het eindpunt van de shift-verkenner (100% verschoven) is **identiek** aan de shift-keuze in katern II.
   - De drie varianten leveren verschillende uitkomsten; zijn ze gelijk, dan is de persona of de prio-overlay verdacht.
   - Taal: "keuze" is de verzamelnaam; "kans" mag alleen op de winnaar-badge en in de inleidende zin.
7. **Rapport** — artifact met de gemeten tabellen, per bevinding severity + oordeel, én expliciet wat *niet* getoetst kon worden (bestaand rapport bijwerken via dezelfde URL als het een vervolg is). Het account blijft op de Tessa-opstelling; de volgende run herseedt toch. Niets committen behalve een tekstfout die je onderweg zelf repareert; nooit uitloggen.

## Valkuilen (uit de eerste run, 6 aug 2026)

| Signaal | Oorzaak / actie |
|---|---|
| Maar één of twee keuzes zichtbaar | Persona mist beleggingen of jaarruimte; of de weergave staat op Persoonlijk terwijl je de huishoud-keuze zoekt. |
| Partnerkeuze verschijnt nooit | `has_household:false` — structureel, geen bug. Meld het als grens van de opzet. |
| Katern IV lijkt te ontbreken | Het is een eigen sectie `#optimizer-levenslang` met een eigen kop ("Wanneer je je pensioenpot aanspreekt") — zoek op het id, niet op het woord "levenslang". |
| Klik doet niets op een React-knop | Dispatch `pointerdown` + `pointerup` + `click`; een kale `.click()` laat 'm onberoerd. |
| Katern IV blijft leeg na de klik | De sweep draait in een worker. Poll tot de uitnodigingsknop weg is, lees dan pas. |
| Slider verandert niets | Zet de waarde via de native `HTMLInputElement.value`-setter en dispatch daarna `input` + `change`; React negeert een directe toewijzing. |
| Grep vindt de foute tekst niet | Een grep op de woorden die je wijzigde vindt per definitie niet wat je vergéten bent. Lees de gerenderde tabel uit — zo kwam "Heffing na scenario" boven water. |
| Browser start niet ("already running") | Het chromedev-profiel is in gebruik door een openstaande Chrome. Niet afsluiten zonder te vragen; meld dat de visuele check niet kon draaien. |

## Wat deze check niet is

Geen UAT-run (dat is `/uat`, met de definities uit `lib/uat/**`) en geen vervanging van de vitest-suites. Deze check kijkt naar het **gat tussen motor en scherm**: een correct berekend getal dat op de verkeerde grondslag of onder een misleidend label staat, valt in geen enkele unit-test om.
