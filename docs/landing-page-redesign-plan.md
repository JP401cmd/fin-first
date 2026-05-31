# Landingspagina v2 — voorstel

> **Status**: voorstel, nog niet geïmplementeerd.
> Vraag: gebruiker (taak #5 van de 5-stappen-sessie 31 mei 2026).
> Kernboodschap die behouden blijft: *"De vrijheid om met inzicht en grip
> keuzes te maken voor nu en later."*

---

## 1. Probleem met de huidige landing

`app/page.tsx` rendert `<Hero />`, `<Features />`, `<Footer />`. De
huidige features-pagina is 1026 regels en draagt nog de oude
3-modules-architectuur uit (Kern / Wil / Horizon) — die is sindsdien
geconsolideerd tot **2 modules**: **Overzicht** en **Toekomst**. Plus
de Hero's feature-pills noemen die oude module-namen.

Verder mist de landing belangrijke huidige differentiators die we
inmiddels in de app hebben:

- **Rekenhulp + bibliotheek** (Will-gegenereerde calculators, 12
  prefab-calcs, deelbaar tussen gebruikers)
- **DNA-velden** in calcs (narrative, derived, applicability,
  freedom-time framing)
- **Levensgebeurtenissen-catalogus** met Will-route
- **Doelen** gekoppeld aan bezittingen/schulden/metrics
- **Huishouden-modus** (privé/samen/partner-perspectief)
- **Command palette** (⌘K) als globale navigatie

De landing voelt daardoor als een snapshot van een eerdere app-versie.

## 2. Wat blijft staan (sterke punten)

| Element | Waarom behouden |
|---|---|
| Editorial krantenstijl ("Persoonlijk Financieel Dagblad") | Distinctief, geen generieke SaaS-look. Bouwt vertrouwen via tijdloosheid. |
| Filosofie-quote "Geld is opgeslagen tijd" | Kern-DNA. Onmiddellijk herkenbaar en uniek. |
| Mock vrijheidsprofiel-card | Concrete productdemo above-the-fold. Toont meteen wat de output is. |
| Privacy-sectie | Vertrouwen bij financiële data is essentieel. |
| Tijd-metafoor als rode draad | Differentiërend tov "saldo + grafiekjes"-apps. |
| Drie-kleuren-palette (amber/teal/purple per module) | Visuele herkenning. |

## 3. Best-practice scan (financial-app landings)

Op basis van veelgebruikte patronen in succesvolle fintech/PFM apps
(YNAB, Monarch Money, Wealthfront, Bunq, Nibud):

**Wat top-landings gemeen hebben**:
1. **5-seconden-test bestaan**: hero communiceert wat het is + voor
   wie + waarom uniek, zonder doorscrollen
2. **Sociale proof vroeg** (testimonials, ratings, klantcount,
   awards) — fintech draait om vertrouwen
3. **Productdemo zichtbaar** (screenshot, animated mock, video). Geen
   "abstract feature list".
4. **Probleem → belofte → bewijs** als narratief
5. **Privacy/security expliciet** met concrete beweringen ("EU-hosted",
   "geen tracking", "open methodes")
6. **Pricing transparant** (of "altijd gratis" of "X euro/maand met
   wat je krijgt")
7. **FAQ** voor objection-handling (kost niets aan ruimte, scheelt
   support-vragen)
8. **Eén dominante CTA** (signup) door de hele pagina herhaald, plus
   één secundaire (demo/lees meer)

**Wat veel landings juist mislopen**:
- Te veel feature-lijsten (overweldigt)
- Stockfoto's van glimlachende mensen (klinkt nep voor financiën)
- "Trust badges" zonder context
- Geen "voor wie is dit NIET" — zonder dat lijkt het voor iedereen
  bedoeld (= voor niemand)

## 4. Voorgestelde nieuwe structuur

| # | Sectie | Doel | Status |
|---|---|---|---|
| 1 | **Masthead + Hero** | 5-sec-test + first CTA | refactor |
| 2 | **Probleem → belofte** | Emotioneel haakje | refactor |
| 3 | **Twee modules** (Overzicht + Toekomst) | Productstructuur | vervangt "Drie domeinen" |
| 4 | **Productdemo** | Visueel bewijs | nieuw |
| 5 | **Rekenhulp + bibliotheek** | Differentiator | nieuw |
| 6 | **Will — AI-coach** | Differentiator | refactor |
| 7 | **Voor wie (en voor wie niet)** | Self-selection | refactor |
| 8 | **Sociale proof** | Vertrouwen | nieuw (placeholder eerst) |
| 9 | **Privacy & vertrouwen** | Risico-reductie | behoud |
| 10 | **Pricing** | Transparantie | nieuw / refactor |
| 11 | **FAQ** | Objection-handling | nieuw |
| 12 | **Slot-CTA + footer** | Conversie | behoud |

### 4.1 Hero — refactor

**Behoud**: krantenstijl-masthead, mock vrijheidsprofiel-card, filosofie-quote.

**Wijzigingen**:
- Feature-pills onder de CTA: vervang module-namen door **gebruikersrol-tags**:
  *"Salarisman/vrouw"* · *"Ondernemer/ZZP"* · *"Met huishouden"* ·
  *"FIRE-traject"* · *"100% Nederlands"*
- Tagline blijft: *"Financiële vrijheid is geen droom. Het is een berekening."*
- Sub: *"Inzicht in je geld vandaag, grip op je keuzes morgen,
  vooruitzicht op je vrijheid voor altijd."*
- Primary CTA: "Begin gratis" → `/signup`
- Secondary CTA: "Bekijk een demo" → demo-flow met seeded
  test-account (Ronald/Bas/Leo/Jochen — bestaan al in seed-migratie)

### 4.2 Probleem → belofte — refactor

Drie vragen-blokken (icoon + één regel elk):

> **"Kan ik dit betalen?"** — *Cashflow nu, met grenzen.*
> **"Spaar ik genoeg?"** — *Vrijheid morgen, in jaren en dagen.*
> **"Wanneer ben ik vrij?"** — *FIRE-prognose, met scenario's voor
> verbouwing, kinderen, pensioen.*

Sluit met one-liner: *"TriFinity beantwoordt ze met jóuw cijfers, in
jouw tijd."*

### 4.3 Twee modules — vervangt "Drie domeinen"

**Het Overzicht** (Vandaag) — *kleur: amber*
- Bezittingen, schulden, cashflow, belastingdruk
- Briefing-panel met max 6 inzichten per dag
- Tegelijk samen-modus voor partners

**De Toekomst** (Morgen + later) — *kleur: paars*
- Tijdas met levensgebeurtenissen
- Doelen gekoppeld aan bezittingen/schulden/metrics
- FIRE-prognose met scenario's
- Rekenhulp + bibliotheek met Will

Format: twee grote kaarten naast elkaar (50/50), elk met
miniatuur-screenshot van de echte module-hub.

### 4.4 Productdemo — nieuw

Carrousel of side-by-side van drie screenshots:
1. Overzicht-dashboard met briefing
2. Tijdas met levensgebeurtenissen
3. Rekenhulp-runner met scenario-vergelijking + narrative

Captions: één zin per screenshot, géén feature-bullets.

### 4.5 Rekenhulp + bibliotheek — nieuw

Krachtig differentiator-blok:

> **"Een rekenhulp voor elke beslissing"**
>
> Wij geven je 12 kant-en-klare rekenhulpen — van *aflossen vs.
> beleggen* tot *BV agio storten vs. privé beleggen*. Maar het echte
> verhaal: je vraagt Will een eigen rekenhulp voor jouw specifieke
> dilemma, en hij bouwt 'm.

Visueel: lijst van 4-6 prefab-titels met sterren (★) voor
complexiteit, plus een "Will-prompt" mock-input ("auto private leasen
vs auto kopen in de bv?") en de output (mini-screenshot van de
rekenhulp-runner).

CTA: "Bekijk de bibliotheek" → `/toekomst/bibliotheek` (publieke
preview na inloggen).

### 4.6 Will — AI-coach — refactor

Update wat Will doet:
- Bouwt rekenhulpen op vraag (NIEUW sinds vorige landing-versie)
- Stelt levensgebeurtenissen voor uit jouw situatie (NIEUW)
- Suggereert acties bij elk doel (BEHOUD)
- Beantwoordt vragen in jouw context (BEHOUD)

Cruciaal: noem expliciet wat Will **niet** doet — geen
beleggingsadvies, geen verkooppraat. Bouwt vertrouwen.

### 4.7 Voor wie (en voor wie niet) — refactor

**Voor wie WEL**:
- Mensen met salaris die willen weten "kan ik dit betalen?"
- Ondernemers/ZZP met BV-vraagstukken
- 30-50-jarigen met hypotheek + partner + kinderwens
- FIRE-aspiranten die concrete cijfers willen i.p.v. memes
- Vermogenden met box 3 / vastgoed / familievermogen

**Voor wie NIET** (eerlijk):
- Mensen die enkel een betaalrekening willen → gebruik je bank-app
- Active day-traders → tooltools-vraag, niet ons domein
- Iemand die financieel advies wil zonder zelf na te denken

Self-selection bespaart frustratie aan beide kanten.

### 4.8 Sociale proof — nieuw

Drie elementen:
1. **Quote-strip** (3 testimonials, anoniem of met initialen + leeftijd)
2. **Telbalk**: "X publieke rekenhulpen gedeeld · Y miljoen euro
   tijd-equivalent in beeld" (zodra data beschikbaar)
3. **Press/awards** (optioneel — als ze er komen)

Voor v1: 3 placeholder-quotes die we later vervangen door echte
testimonials uit beta-gebruikers.

### 4.9 Privacy & vertrouwen — behoud

Wel verscherpen:
- Concrete beweringen: "Data leeft op EU-servers (Supabase Frankfurt)"
- "Wij verkopen je data niet — punt"
- "Open methodologie: rekenhulp-formules zijn inspecteerbaar"
- "Eigen export: download al je data wanneer je wilt"
- Wft-disclaimer expliciet maar rustig gepresenteerd

### 4.10 Pricing — nieuw of refactor

Twee opties:
- **Gratis met optionele Pro** (freemium): basis-overzicht + 5
  rekenhulpen per week gratis. Pro €5-10/mnd: onbeperkt rekenhulpen,
  geavanceerde fiscale modules, partner-modus.
- **Eén tarief** (single tier): €X/mnd voor alles.

Welke = product-keuze, niet landing-keuze. Voor de landing:
toon wat de gekozen variant ook is, transparant.

### 4.11 FAQ — nieuw

Top 6 vragen (op basis van wat beta-gebruikers waarschijnlijk vragen):
1. *"Kan ik mijn bankrekeningen koppelen?"* (PSD2/Tink-status)
2. *"Werkt het voor ondernemers / BV-houders?"*
3. *"Wat als ik geen partner heb?"* (single-user UX)
4. *"Hoe veilig is mijn data?"* (verwijst naar privacy-sectie)
5. *"Is dit financieel advies?"* (nee, educatief — Wft-compliance)
6. *"Kan ik opzeggen?"* (ja, met data-export)

Accordion-stijl, compact.

### 4.12 Footer — behoud + uitbreid

Voeg toe: blog-link (als er een blog komt), changelog, status-pagina,
GitHub-link (als open-source), contact.

## 5. Tone-of-voice

- Persoonlijk Financieel Dagblad-stijl: redactioneel, geen
  marketingjargon
- Nederlands eerlijk: "we weten het niet altijd, hier is wat we wel
  weten"
- Tijd-metafoor als rode draad ("vrijheid in jaren", "opgeslagen tijd")
- Anti-hype: geen "10x je vermogen", wel "weet wat je hebt"

## 6. Implementatie-volgorde (apart traject)

Geen onderdeel van dit voorstel-bestand zelf. Bij groen licht:

1. **Hero-refactor** (1 commit) — feature-pills, CTA-rij
2. **Probleem-sectie → drie vragen** (1 commit)
3. **Vervang "Drie domeinen" door "Twee modules"** (1 commit)
4. **Productdemo + screenshots** (1 commit, plus screenshot-assets)
5. **Rekenhulp-sectie nieuw** (1 commit, met preview van bibliotheek)
6. **Will-sectie update** (1 commit)
7. **Voor wie + sociale proof + FAQ** (1 commit)
8. **Pricing + privacy refactor** (1 commit)
9. **Footer + slot-CTA** (1 commit)

Iedere stap zelfstandig committeerbaar en deploybaar — geen big bang.

## 7. Wat hierna nog beslist moet

| Beslissing | Wie |
|---|---|
| Freemium-vs-single-tier pricing | productowner |
| Echte testimonials (beta-recruitment) | productowner |
| Demo-flow: seeded account of guided tour? | productowner |
| Bankkoppeling-status (PSD2/Tink) in FAQ | techlead |
| Open-source-positionering (GitHub-link?) | productowner |

Met deze beslissingen kan de implementatie in ~8-10 commits over een
paar dagen worden uitgerold.
