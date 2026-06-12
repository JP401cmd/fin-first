# Budgetplan-templates — onderzoek & herzieningsvoorstel

**Status:** voorstel, wacht op go
**Datum:** 12 juni 2026
**Aanleiding:** in het Uitgebreid-template zit het detail "zijwaarts" (16 platte hoofdbudgetten, o.a. 3 losse hoofdbudgetten voor auto) in plaats van "in de diepte" (deelbudgetten onder herkenbare hoofdbudgetten).

---

## 1. Huidige situatie

### 1.1 Twee templatesystemen

| Systeem | Bestand | Gebruikt door | Doel |
|---|---|---|---|
| **3 detailniveaus** (Minimalistisch / Nibud / Uitgebreid) | `lib/budget-templates/onboarding-presets.ts` | Budgetteren-setup-gate (`budgetteren.config.tsx`) + plan-editor (`budget-plan-editor-sheet.tsx`) | Gebruikersgericht — dit voorstel gaat hierover |
| **4 persona's** (Starter / Gezin / ZZP / Pensioen) | `lib/budget-templates/index.ts` + `starter.ts` e.a. | Alleen `/beheer/testdata` | Admin-testdata; buiten scope |

### 1.2 Canonieke taxonomie

`lib/budget-data.ts` → `getDefaultBudgets()`: **8 hoofdbudgetten + 24 deelbudgetten** (incl. Inkomen en Eigen rekening). Vervoer is hier al correct hiërarchisch: één hoofdbudget met 4 deelbudgetten.

### 1.3 De drie templates nu

| Template | Categorieën | Structuur |
|---|---|---|
| Minimalistisch | 5 | Logische groepen (Wonen bundelt 4 slugs) |
| Nibud-standaard | 9 | Redelijk gegroepeerd |
| **Uitgebreid** | **16** | **Vrijwel plat: bijna elke slug een eigen hoofdbudget** |

Het Uitgebreid-template maakt o.a. *Brandstof & OV*, *Auto vaste lasten*, *Auto onderhoud* en *Fiets & deelvervoer* elk tot een eigen hoofdbudget met één deelbudget eronder — terwijl de canonieke taxonomie hiervoor al één hoofdbudget *Vervoer* met 4 deelbudgetten kent.

### 1.4 Twee toepassingspaden die uiteenlopen

1. **Setup-gate** (`POST /api/budgetteren/setup`): negeert de template-*categorieën* volledig — seedt áltijd de canonieke 8+24-boom uit `getDefaultBudgets()`; het template bepaalt alleen de **bedragen**. De preview in de picker (bv. "16 categorieën") komt dus **niet overeen** met wat er werkelijk wordt aangemaakt.
2. **Plan-editor** (`buildTemplateDraft`): maakt per template-categorie een hoofdbudget + per slug een deelbudget. Hier ontstaat de platte 16-parent-structuur wél echt.

### 1.5 Gevonden defecten (los van de structuurdiscussie)

| # | Defect | Plek |
|---|---|---|
| D1 | `huishouden-verzorging` zit in het Nibud-template in **twee** categorieën ("Boodschappen & huishouden" én "Kleding & verzorging") → plan-editor maakt het deelbudget dubbel aan en de allocatie telt op tot 102% | `onboarding-presets.ts:52,55` + `budget-plan-editor-sheet.tsx:369` (geen dedup) |
| D2 | Preview setup-gate toont template-categorieën, resultaat is de default-boom (zie 1.4) | `budgetteren.config.tsx` vs `setup/route.ts` |
| D3 | Plan-editor-templates geven elk hoofdbudget icoon `'Circle'` en kunstmatige slug `${eersteSlug}-parent` i.p.v. de canonieke hoofdslugs/iconen | `budget-plan-editor-sheet.tsx:362-363` |

### 1.6 Gaten in de taxonomie

Vergeleken met de Nibud-postenlijst ontbreken klassieke posten — waardoor "Uitgebreid" feitelijk niet uitgebreider *kan* zijn dan Nibud:

- **Telefoon, internet & tv** (Nibud: vaste last; nu nergens — streaming hangt impliciet onder "Vrije tijd & sport")
- **Abonnementen & contributies** (Nibud: vaste last)
- **Onderhoud huis & tuin** (Nibud: reserveringsuitgave)
- **Inventaris & apparaten** (Nibud: reserveringsuitgave)
- **Huisdieren** (Nibud: huishoudelijke uitgave)
- **Cadeaus & feestdagen** (Nibud: huishoudelijk/reservering)

---

## 2. Best practices uit de markt

**Nibud-methode** (Nederlandse standaard): drie hoofdgroepen — *vaste lasten* (contractueel, regelmatig), *reserveringsuitgaven* (zeker maar onregelmatig: kleding, inventaris, onderhoud, vakantie, eigen risico) en *huishoudelijke uitgaven* (regelmatig maar variabel: voeding, verzorging, huisdieren). Richtlijnen: **±30% woonquote**, **≥10% sparen**. Posten o.a.: huur/hypotheek, energie & water, gemeentelijke heffingen, verzekeringen, kinderopvang, telefoon & internet, abonnementen.

**YNAB**: standaardgroepen *Bills / Frequent / Non-Monthly / Goals / Quality of Life*. Kernadvies: **6-8 hoofdcategorieën volstaan**; laat extra categorieën "hun plek verdienen". Het *true expenses*-principe (onregelmatige kosten maandelijks reserveren) ≙ Nibud-reserveringsuitgaven.

**50/30/20-regel** (Warren): needs / wants / savings — bevestigt dat een mínimaal niveau van 3-5 hoofdgroepen al werkbaar is.

**Conclusie voor TriFinity:** alle referenties wijzen dezelfde kant op —

1. **Weinig, stabiele hoofdgroepen** (5-9); detail hoort **onder** de groepen, niet ernaast.
2. Detailniveau = **hoeveel deelbudgetten**, niet hoeveel hoofdbudgetten.
3. Onregelmatige kosten (vakantie, onderhoud, kleding) verdienen eigen reserveringspotjes in het uitgebreide niveau.

---

## 3. Voorstel

### 3.1 Kernprincipe: één vaste hoofdstructuur, detail groeit in de diepte

Alle drie de templates gebruiken **dezelfde 8 hoofdbudgetten** (= canonieke taxonomie). Het template bepaalt alleen hoe ver elk hoofdbudget is opgesplitst:

| Hoofdbudget | Minimalistisch | Nibud-standaard | Uitgebreid |
|---|---|---|---|
| Inkomen | 1 deelbudget | 4 | 4 |
| Wonen & vaste lasten | — (boekt op hoofd) | 6 | 8 |
| Dagelijkse uitgaven | — | 4 | 5 |
| Vervoer | — | 4 | 4 |
| Vrije tijd & lifestyle | — | 4 | 5 |
| Sparen & investeren | 2 | 2 | 2 |
| Schulden & aflossingen | — | 2 | 2 |
| Eigen rekening | 1 (technisch) | 1 | 1 |
| **Totaal budgets** | **±12** | **±35** | **±39** |

Voordelen: het Vervoer-probleem is per definitie opgelost (altijd één hoofdbudget); opschalen van Minimalistisch → Uitgebreid is een natuurlijk "splits dit potje"-pad; rapportages/heatmap/donut blijven op hoofdniveau vergelijkbaar ongeacht template; en de preview kan eindelijk kloppen met het resultaat.

> Minimalistisch boekt transacties direct op het hoofdbudget — een hoofdbudget zónder children is al een geldig toewijsdoel (`budgetOptions` in `budget-data.ts:298` valt terug op de parent; sleepmodus sluit alleen parents *mét* children uit).

### 3.2 Nieuwe deelbudget-slugs (6)

| Slug | Naam | Onder | Nibud-groep |
|---|---|---|---|
| `telefoon-internet-tv` | Telefoon, internet & tv | Wonen & vaste lasten | Vaste lasten |
| `abonnementen-contributies` | Abonnementen & contributies (incl. streaming) | Wonen & vaste lasten | Vaste lasten |
| `onderhoud-huis-tuin` | Onderhoud huis & tuin | Wonen & vaste lasten | Reservering |
| `inventaris-apparaten` | Inventaris & apparaten | Wonen & vaste lasten | Reservering |
| `huisdieren` | Huisdieren | Dagelijkse uitgaven | Huishoudelijk |
| `cadeaus-feestdagen` | Cadeaus & feestdagen | Vrije tijd & lifestyle | Reservering |

Bewust **niet** (houdt de lijst gebonden, kan later alsnog): zorgverzekering splitsen van `verzekeringen-wonen`; persoonlijke verzorging splitsen van `huishouden-verzorging`.

### 3.3 De drie templates uitgewerkt

#### Template 1 — Minimalistisch (5 potjes + sparen-splitsing)

*"Vijf potjes, klaar."* — 50/30/20-achtig, transacties direct op het hoofdbudget.

| Budget | % netto-inkomen |
|---|---|
| Wonen & vaste lasten | 38% |
| Dagelijkse uitgaven | 17% |
| Vervoer | 7% |
| Vrije tijd & lifestyle | 13% |
| Sparen & investeren — Noodbuffer 10% / Investeren & FIRE 15% | 25% |
| **Totaal** | **100%** |

(Schulden & aflossingen-hoofdbudget wordt wel aangemaakt op €0 — structuur compleet, geen allocatie.)

#### Template 2 — Nibud-standaard (8 hoofd, ±22 deel)

*"Het Nibud-huishoudboekje, herkenbaar voor elk Nederlands huishouden."*

| Hoofdbudget | Deelbudgetten (% netto-inkomen) | Subtotaal |
|---|---|---|
| Wonen & vaste lasten | Huur/hypotheek 24 · Gas, water, licht 5 · Verzekeringen 4 · Gemeentelijke lasten 2 · Telefoon, internet & tv 2 · Abonnementen & contributies 1 | 38% |
| Dagelijkse uitgaven | Boodschappen 12 · Huishouden & verzorging 2 · Kinderen & school/opvang 2 · Medische kosten 2 | 18% |
| Vervoer | Brandstof/laden & OV 4 · Auto vaste lasten 3 · Auto onderhoud & parkeren 2 · Fiets & deelvervoer 1 | 10% |
| Vrije tijd & lifestyle | Uit eten & horeca 3 · Vrije tijd & sport 3 · Vakantie 3 · Kleding & overige 3 | 12% |
| Sparen & investeren | Noodbuffer 7 · Investeren & FIRE 10 | 17% |
| Schulden & aflossingen | Aflossingen 3 · Extra aflossing hypotheek 2 | 5% |
| **Totaal** | | **100%** |

Sparen 17% ≥ Nibud-richtlijn 10%; wonen 38% incl. álle vaste lasten (kale woonquote 24+5=29% ≈ 30%-norm).

#### Template 3 — Uitgebreid (8 hoofd, ±29 deel)

*"Maximaal inzicht — elk potje apart, inclusief reserveringen."* Zelfde hoofdstructuur als Nibud, plus de reserverings- en detailpotjes:

| Hoofdbudget | Deelbudgetten (% netto-inkomen) | Subtotaal |
|---|---|---|
| Wonen & vaste lasten | Huur/hypotheek 23 · Gas, water, licht 4 · Verzekeringen 4 · Gemeentelijke lasten 2 · Telefoon, internet & tv 2 · Abonnementen & contributies 1 · **Onderhoud huis & tuin 2** · **Inventaris & apparaten 1** | 39% |
| Dagelijkse uitgaven | Boodschappen 11 · Huishouden & verzorging 2 · Kinderen & school/opvang 2 · Medische kosten 2 · **Huisdieren 1** | 18% |
| Vervoer | Brandstof/laden & OV 3 · Auto vaste lasten 3 · Auto onderhoud & parkeren 2 · Fiets & deelvervoer 1 | 9% |
| Vrije tijd & lifestyle | Uit eten & horeca 3 · Vrije tijd & sport 3 · Vakantie 3 · Kleding & overige 3 · **Cadeaus & feestdagen 1** | 13% |
| Sparen & investeren | Noodbuffer 6 · Investeren & FIRE 10 | 16% |
| Schulden & aflossingen | Aflossingen 3 · Extra aflossing hypotheek 2 | 5% |
| **Totaal** | | **100%** |

### 3.4 Structurele fixes die meeliften

1. **Eén gedeelde template-builder** in `onboarding-presets.ts` die de hiërarchische structuur (hoofd → deel, met canonieke slugs/iconen) oplevert; zowel de setup-route als de plan-editor consumeren die. Lost D2 en D3 op, en de picker-preview toont voortaan hoofd + deelbudgetten zoals ze echt worden aangemaakt.
2. **Dedup-garantie**: een slug mag in een template maar in één categorie voorkomen (D1 verdwijnt door de herziening zelf; een vitest-case borgt het).
3. **Subtitels in de picker** worden eerlijk: "5 potjes" / "8 hoofdbudgetten, 22 potjes" / "8 hoofdbudgetten, 29 potjes".

---

## 4. Impact

| Gebied | Impact |
|---|---|
| `lib/budget-data.ts` | 6 nieuwe slugs in `BUDGET_SLUGS`; `getDefaultBudgets()` (canonieke seed, ook fallback in onboarding save-own-data) uitbreiden naar de Uitgebreid-structuur óf op Nibud-niveau houden — **keuze voor de business owner**, voorstel: canonieke taxonomie = Uitgebreid, default seed = Nibud-niveau |
| AI-categorisatie | Geen promptwijziging nodig — werkt op de per-verzoek aangeboden budgetlijst (`categorize-system-prompt.ts:37`); wel regressiecases voor de nieuwe potjes (bv. Vodafone → telefoon-internet-tv, Netflix → abonnementen) |
| Sleepmodus / `lib/category-rules.ts` | Werkt op gebruikersbudgetten; controleren dat childless parents (Minimalistisch) overal toewijsbaar blijven |
| Bestaande gebruikers | Geen migratie — templates raken alleen nieuwe setups en expliciete "Template toepassen"-acties (delete-first respectievelijk draft-replace blijven zoals nu) |
| Persona-testdata (`lib/budget-templates/index.ts`) | Buiten scope; kan later de nieuwe slugs adopteren |
| Regressietests | `onboarding-budgets.ts`, `budget-plan-editor.ts` suites bijwerken; vitest voor allocatie-sommen = 100% en slug-uniciteit per template |

## 5. Implementatievolgorde (na go)

1. Slugs + namen/iconen/omschrijvingen toevoegen (`budget-data.ts`).
2. `onboarding-presets.ts` herschrijven: hiërarchische templates + gedeelde builder + allocaties (tabellen §3.3).
3. Setup-route en plan-editor op de gedeelde builder zetten (D1-D3 weg).
4. Picker-previews (setup-gate + plan-editor) hiërarchisch tonen.
5. Tests: allocatie=100%, slug-uniek, childless-parent-toewijzing, AI-regressiecases.
6. Architectuurdocs: geen nieuw domein/tabel — wel curatie-check Praatplaat (budgetteren-functionaliteit ongewijzigd beschreven).

---

### Bronnen

- [Nibud — de Nibud-methode van budgetteren](https://www.nibud.nl/onderwerpen/rondkomen/plannen-en-begroten/nibud-methode-van-budgetteren/)
- [Nibud — Stappenplan jaarbegroting maken](https://www.nibud.nl/tools/stappenplan-jaarbegroting-maken/)
- [Nibud — Sparen (10%-richtlijn en bufferadvies)](https://www.nibud.nl/onderwerpen/sparen/)
- [YNAB — How many YNAB categories should I have?](https://www.ynab.com/blog/how-many-ynab-categories)
- [YNAB — Category templates (standaardgroepen)](https://support.ynab.com/en_us/category-templates-HknjS_RA)
