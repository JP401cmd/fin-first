# Review: Boldin — Inspiratie voor fintwo

**Datum**: 2026-05-08
**Reviewer**: Claude (geautomatiseerde walkthrough via playwright-cli)
**App**: Boldin (https://www.boldin.com — voorheen NewRetirement)
**Account-type**: PlannerPlus (lijkt actief voor user)
**Scope**: Functionaliteit + visueel ontwerp + interactie/flow + visualisatie van data
**Lens**: Wat kan fintwo (Editorial Finance, Horizon-module, FIRE-planning) van deze app leren?

---

## Executive summary — top 7 leerpunten voor fintwo

1. **🟢 Vraag-gedreven insights library** — Boldin's `/planner/insights` is een gallerij van rapportages waar elke kaart een **vraag** is ("Wat's my current net worth?", "How am I doing at meeting my goals?", "What savings do I need to be FI?") met een thumbnail van de daadwerkelijke chart. Voor fintwo: vervang "Horizon" als monolithische pagina door een **Insights Library** met vraag-gedreven entry points die naar specifieke widget-pagina's leiden. Dit verlaagt drempel om diep te duiken.

2. **🟢 Sankey diagram voor money flows + year-slider** — De "Aha Moment" Sankey op de dashboard (Income → Outflows met categorie-arrows) plus de **year-slider die de Sankey door de tijd scrubt** is dé interactie van Boldin. fintwo heeft niets dat hier op lijkt. Past in Kern (cash-flow per jaar) of Horizon (lifetime cash flow per leeftijd).

3. **🟢 "What If I..." pre-built scenario toggles** — In plaats van een complexe scenario-builder geeft Boldin 6 voorgebakken what-ifs als radio's ("Stop working 3 years earlier", "Increase savings to 15%", "Live 5 years longer", "Take out $50k loan", "Have $50k expense in 5 years"). Toggle update de chart **side-by-side met baseline** + actionable next-step CTA. Dit is exact wat de testfase in fintwo nodig heeft: laagdrempelige what-if zonder dat de gebruiker eerst een scenario hoeft te bouwen.

4. **🟢 Plan-completion gamification met milestones-tijdlijn** — `My Plan Summary` toont "1 of 7 sections complete" als grote teal hero-card, gevolgd door een 7-card grid met progress per sectie. **Daaronder een tijdlijn met life-events** in tweede persoon ("You're making plans and making stuff happen", "Mortgage Paid Off", "You start Social Security"). fintwo's onboarding/`/identity` zou enorm winnen bij deze gamificatie + persoonlijke milestones-tijdlijn.

5. **🟢 Financial Wellness Scorecard met emoji-status-categorieën** — 5 buckets met emoji's (😊 Excelling 11, 🙂 Progressing 2, 😞 Vulnerable 1, ℹ️ Informational 4, ∅ No Data 1) met **customizable watchlist** (kies tot 19 metrics uit library). Past direct bij fintwo's Identity-overzicht — zou de huidige "temporal balance" verrijken.

6. **🟡 Persistente scenario-chip in topbar (BASELINE)** — Op **elke** Boldin-pagina staat boven `My retirement plan ▼ BASELINE` als globale context. Klik = scenario-switcher. Adjust- en Assumptions-knoppen direct ernaast. Voor fintwo: scenarios zijn nu in Horizon verstopt; deze patroon maakt scenarios een *werkmodus* in plaats van een feature.

7. **🟡 "Tips for Using the Chart"-sectie onder elke complexe visualisatie** — Boldin laat onder bijv. de Lifetime Income Projection en Surplus-Gap charts uitleg zien: "Notice when different income streams start and stop", "Notice if columns are taller than the expense line — this means you have more income than expenses". Proactief leren ipv tooltip-only. fintwo's complexe charts (FIRE-projectie, backtest-score) zouden hier ook van winnen.

---

## Navigatie-kaart

**Topbar (persistent)**:
- Hamburger menu (collapses sidebar)
- Boldin-logo (groene/teal regenboog) → home
- **Scenario-selector**: `My retirement plan ▼ BASELINE` (globaal scenario-context)
- **Adjust your scenario's forecast** icon (chart-icon) — popover voor optimistic/average/pessimistic
- **Assumptions** icon (sliders) — popover voor return/inflation/...
- **+ Ask** knop (BETA AI) — opent rechter-pane
- Help-icon
- Profile-avatar dropdown: Your Profile, Account settings, Log out

**Linker sidebar (vertical menubar)**:
- 🟢 Overview (dashboard)
- ☑ My Plan (collapsible) → Summary, Connections, Assets and Debts, Home and Real Estate, Income, Expenses and Healthcare, Money Flows, Estate Planning, Rate Assumptions
- ⚡ Coach (badge "6")
- ❤ Financial Wellness
- 💡 Insights (collapsible) → Library, Lifetime Income Projection, Net Worth, Retirement Chance of Success, IRMAA, Lifetime Cash Flow, Income & Expenses, Savings, Taxes, What You Need, Required Distributions, Retirement Withdrawals, Surplus-Gap, Spending Guardrails
- 🔭 Explorers (collapsible) → What If, Monte Carlo, Debt Payoff Explorer, Market Risk Explorer, Social Security Explorer, Roth Conversion Explorer
- ⬇ Download/Print

**Rechter pane (toggleable)**: "Ask Boldin BETA" — AI-chat met suggested prompts en voice-input.

Belangrijk: de sidebar heeft een **drielagen-structuur** (groep → submenu → page). Insights en Explorers zijn submenu-groepen die expanderen tot ~14 sub-items. Dit is veel — fintwo's huidige sidebar (5 hoofdmodules) is rustiger.

---

## Sectie 1: Dashboard (`/planner/dashboard`)

**Functionaliteit**:
- Personalised greeting "Welcome, jp" (voornaam)
- "Your First 'Aha' Moment" — Sankey met total-income/outflow voor één jaar + year-slider (2026-2068)
- KPI-grid met 8+ widgets in 2 kolommen:
  - Current Net Worth ($225k + monthly delta)
  - Retirement Chance of Success (99% met "You have a 99% chance of fully funding your plan through longevity")
  - Get an expert review from a CFP (sales)
  - Coach Suggestions (3 to-dos met chevrons)
  - Essential Tools for Your Plan (3 deeplinks: Scenario comparison, What-if, Roth)
  - Projected Net Worth (stacked area chart, "At retirement (67) $1.94M / At longevity (87) $4.36M")
  - Plan Accuracy (meter, "< 15%, missing inputs")
  - Sociale Security suggestion (sales/lead-gen "Get $168,426 more")
  - Financial Wellness summary (79% excelling)
  - Retirement Cash Flow (income vs expense per maand)
- Pagination 1/2/3 — meerdere dashboard-pagina's
- Educational content: Boldin Videos (YouTube), Podcast, Live Events, Classes, Boldin Advisors sales

**Visueel ontwerp**:
- Witruimte royaal, maar dichte cardgrid
- Groene/teal accent (#0D6F65-achtig), zwart-teal voor titels, oranje voor income, paars voor savings
- Typografie: serif hero ("Welcome, jp" in grote serif), sans-serif body
- Cards hebben fijne borders (1px lichtgrijs), geen drop-shadows — clean
- Logo: regenboog-arc in groen-teal-tinten (organic, hopeful)

**Visualisatie & data-presentatie**:
- **Sankey met year-slider**: dé feature. Income-categorieën aan de linkerkant (Work, Interest, Pension, Social Security, ...), expense-categorieën rechts (Medical, Mortgage, Tax, Recurring, Savings & Contributions). Klik en sleep slider om door tijd heen te schuiven en te zien hoe sources/expenses veranderen.
- **Stacked area-chart Projected Net Worth** (in de KPI-grid): meerdere lagen (Debt, Real Estate, Savings) over 40+ jaar.
- **Plan Accuracy meter**: gradient van rood→groen, naald op huidige score.
- **Retirement Chance of Success**: enkel groot percentage (99%) zonder chart — tekst-eerst.

**Interactie & flow**:
- Year-slider op Sankey is geanimeerd, vloeiend
- Hover op categorie in Sankey → highlight van die flow
- "What should I do now" knoppen op meerdere widgets — leiden naar coach/explorer
- Profile-avatar dropdown via klik (oops, ik klikte per ongeluk)
- AI-pane sliding overlay rechts; X om te sluiten, expand om fullscreen

**Screenshots**: `01-dashboard.png`, `02-dashboard-full.png`, `03-dashboard-fullpage.png`

**Observaties**:
- 🔴🟢 **De Sankey-met-year-slider als "First Aha Moment"** — dit is hét momentum-creërende patroon. fintwo's Horizon mist een visualisatie die met één blik laat zien "hoe geld stroomt door mijn leven". Past bij `/horizon` als dominante hero of bij `/core/budgets` als jaarsamenvatting.
- 🟡🟢 **Personalised greeting met voornaam** — "Welcome, jp". fintwo gebruikt al voornamen in delen, maar niet consequent in het hero-niveau van het dashboard.
- 🟡🟢 **"Essential Tools" widget met deeplinks naar 3 explorers** — fintwo's dashboard zou een vergelijkbaar block kunnen tonen voor de meest-gebruikte verdiepingen (Vermogenspad, Vrijheidsscenario's, Backtest).
- 🟡🟡 **Plan Accuracy meter** — gamificatie van "is je plan compleet?". fintwo heeft `koppelingen` en `instellingen` maar geen overkoepelende voortgangs-metric.
- 🔵⚫ **Educational content (YouTube/Podcast/Classes/Live events)** — Boldin gebruikt dashboard als marketing-/retentie-kanaal. Voor fintwo niet direct overneembaar (geen content-business), maar het patroon van "leerresources op dashboard" past wel bij /identity/gids.
- 🔴⚫ **Sales/upsell embedded in dashboard** — "Free Introduction to Boldin Advisors", "Get an expert review from a CFP" — Boldin verkoopt 1:1 advisor-diensten en mengt dat in de plan-views. Voor fintwo niet relevant, maar herinnert dat dashboards multi-purpose zijn.

---

## Sectie 2: Insights Library (`/planner/insights`)

**Functionaliteit**:
Library is de **entry point** voor 14 verschillende rapportages. Niet één pagina met tabs; elke rapportage is een eigen route, en de Library is een gallery die je naar de juiste plek leidt.

Categorieën in de Library:
- **New Reports** (5 thumbnails — recent toegevoegd of gepusht)
- **Featured Report** — Lifetime Income Projection met groot chart-preview en "Get Started" CTA
- **Taxes** (2 thumbnails)
- **Overall Health** (5 thumbnails — Lifetime Income Projection, Monte Carlo, Savings Needed, Milestones, Chance of Success)
- **Savings and Withdrawals** (5 thumbnails — Net Worth current/projected, Surplus Gap, Savings, Withdrawals)
- **Cash Flow** (continues — niet volledig gezien)

**Visueel ontwerp**:
- Elke thumbnail-card: grote chart-thumbnail (echte chart, niet icoon!), vraag-zin als titel ("What's my current net worth?"), kleine caption met feature-naam ("Net Worth →")
- Grid: 2-5 kolommen afhankelijk van breedte
- Categorie-koppen (paragraph-stijl, niet zware h2's) — minder rigide

**Visualisatie & data-presentatie**:
- De thumbnails zijn **mini-versies van de daadwerkelijke chart** met de échte data van de gebruiker. Geen stockafbeeldingen. Dit is briljant: je ziet meteen of een rapport relevant is op basis van de visuele preview.

**Interactie & flow**:
- Klik op thumbnail → naar de full-page rapportage
- Featured Report heeft ook een eigen CTA naast de chart-preview

**Screenshots**: `04-insights-library.png`, `04-insights-library-fullpage.png`

**Observaties**:
- 🔴🟢 **Vraag-gedreven cards met live chart-thumbnails** — fintwo zou dit moeten overnemen. In plaats van Horizon-pagina met Tab-1/Tab-2, een library waar je vragen kiest. Vraag-format is sterker dan feature-format omdat het de gebruiker dwingt te bedenken wat ze willen weten.
- 🟢🟢 **Categorisering per thema, niet per modulestructuur** — Boldin groepeert "Net Worth" rapportages onder zowel New Reports als Savings and Withdrawals. fintwo neigt naar strikte module-grenzen; deze cross-categorisering helpt discoverability.
- 🟢🟡 **Featured Report-block** — één rapportage per moment uitlichten als entry. fintwo zou dit als rotatie kunnen hebben (week-thema, of trending).

---

## Sectie 3: Lifetime Cash Flow (`/planner/insights/lifetime-cash-flow`)

**Functionaliteit**:
Drie weergaves van dezelfde data, op één pagina:
1. **Macro line-chart** — Income (oranje) vs Expenses (zwart/blauw) over 40+ jaar
2. **Sankey breakdown voor één jaar** — met year-slider (zelfde patroon als dashboard)
3. **Projected Cash Flow Table** — jaartabel met Year, Age, Income, Expenses, Surplus/Gap, Savings

**Visueel ontwerp**:
- Section-headings linksuitgelijnd in donker teal serif
- Beschrijvende intro-zin onder elke section: "A cash flow chart makes your money movement visible so you can quickly spot gaps, pressure points, and specific levers to improve your plan."
- Tabel: tabular-nums, alternating row backgrounds heel subtiel

**Visualisatie & data-presentatie**:
- Combinatie van **macro (line) + micro (Sankey) + detail (tabel)** in één scroll-flow is enorm krachtig
- Year-slider scrubt door beide: Sankey én... (eigenlijk alleen Sankey, line is statisch over hele leven)
- Dramatische orange spike op het einde (longevity-event, einde levensduur) is direct te zien

**Interactie & flow**:
- Slider drag/click verandert Sankey
- Tabel onder is volledig — geen pagination

**Screenshots**: `05-lifetime-cash-flow.png`

**Observaties**:
- 🔴🟢 **Macro-chart + interactive Sankey + jaartabel als drie-luiker** — de gebruiker kan kiezen welk niveau ze willen zien. fintwo Horizon zou hier een variant van moeten hebben: lijngrafiek voor de hele projectie, Sankey voor een specifiek jaar dat ze met slider kiezen, en optioneel jaartabel.
- 🟡🟢 **Tabular-nums in tabel + currency-formatting** — fintwo doet dit al goed in widgets, maar Boldin's compleet uitgeschreven tabel (jaar voor jaar) is een goede fallback voor power-users die de raw data willen.

---

## Sectie 4: Net Worth (`/planner/insights/net-worth-current` + `/net-worth-projected`)

**Functionaliteit**:
Twee tabs:
1. **Current net worth** — vandaag-foto: $225k, monthly delta, area-chart laatste 6 maanden, breakdown per categorie (Cash, Investments, Real Estate, Debts), peer-comparison band ("Most users $100k–$2.4M"), tax-allocation donut.
2. **Projected net worth** — toekomst: stacked bar chart (Debt onder 0, Real Estate, Savings) over 40+ jaar, plus tax-allocation donut "at retirement age 67".

**Visueel ontwerp**:
- Tabs simpel onderaan h1, geen styling-spielerei
- Net worth headline: zeer grote serif "$225,000" met subtle "NO CHANGE since last month" eronder
- Donut-chart met hole-in-middle voor totaal "All Assets $125,000"

**Visualisatie & data-presentatie**:
- Stacked bar over decades is **kleur-gecodeerd** per categorie (Debt/Real Estate/Savings)
- Tax-allocation donut: kleine, focused viz (niet groot)
- **Peer comparison** band: "Where do you stand among other Boldin users?" — uniek

**Screenshots**: `06-net-worth.png`, `07-net-worth-projected.png`

**Observaties**:
- 🟢🟡 **Current vs Projected als twee tabs op één pagina** — fintwo's Kern toont al nu, en Horizon de projectie, in twee modules. Het tabs-patroon binnen één pagina is compacter en past bij "ik wil nu mijn vermogen begrijpen — wat is het nu en wat wordt het".
- 🟢🟢 **Tax-allocation donut** — relevant voor Box 3 / belasting in Nederland. fintwo zou een donut kunnen tonen die laat zien hoeveel vermogen in box 3 vs box 1 (eigen huis) zit.
- 🟢⚫ **Peer comparison "Most users $100k–$2.4M"** — interessant idee maar complex (privacy, anoniem aggregeren). Zou voor fintwo een differentiator zijn maar pas relevant bij grotere gebruikersbasis.

---

## Sectie 5: Lifetime Income Projection (`/planner/insights/lifetime-income`)

**Functionaliteit**:
- Lange uitleg-paragraaf bovenaan over wat het rapport doet
- Stacked-bar chart met 5 segment-kleuren (Expenses & Taxes rood, Net Savings Drawdown paars, Other grijs, Social Security blauw, Work groen)
- "Tips for Using the Chart" sectie met 5 leertips

**Visueel ontwerp**:
- Beschrijving is **te lang** (4 regels) — gebruikers gaan dat overslaan
- Charts zelf zijn rustig, witruimte rond bars
- Tips-sectie heeft bullet-list met conversational tone

**Visualisatie & data-presentatie**:
- **Stacked bars** zijn de visualisatie van "income over lifetime by source". Elke bar = jaar, hoogte = totaal income, segmenten = sources.
- Het rode segment "Expenses & Taxes" is feitelijk negatief (bovenop income getekend) — visueel verrassend maar geeft net-richting.
- Mogelijk **dots** boven de chart voor life-events (volgens beschrijving, niet duidelijk gezien)

**Screenshots**: `08-lifetime-income.png`

**Observaties**:
- 🟢🟢 **"Tips for Using the Chart" sectie** — proactief uitleggen wat de gebruiker moet zoeken in de visualisatie. fintwo zou dit moeten overnemen onder elke complexe chart in Horizon.
- 🟡🟡 **Lange beschrijving bovenaan** — Boldin heeft de neiging te veel uit te leggen. fintwo's editorial-finance design language zou dit korter doen — één duidelijke regel.

---

## Sectie 6: What You Need (`/planner/insights/what-you-need`)

**Functionaliteit**:
- "What you need solves for the total savings needed per year to have enough money to reach your longevity age without running out of money."
- Twee-lijn chart: groene "What you have" (area-fill) vs rode "What you need" (geen fill)
- Link naar "See more detail in Insights > Savings"

**Visueel ontwerp**:
- Minimalistisch — alleen titel, beschrijving, chart, legenda
- Groene area-fill onder "have"-lijn benadrukt het overschot

**Visualisatie & data-presentatie**:
- Klassiek **two-line chart met area-fill onder de winner** — direct visueel duidelijk dat "have" groter is dan "need"
- Y-axis: $0 tot $3.5M
- Beide lijnen hebben kleine dots per jaar (interactief?)

**Screenshots**: `09-what-you-need.png`

**Observaties**:
- 🔴🟢 **Two-line "have vs need" met area-fill is dé FIRE-visualisatie die fintwo mist** — fintwo's `computeFireProjection` rekent "vermogen-pad" en "FIRE-doel" maar laat ze niet als twee lijnen met area-fill zien. Dit is zo'n directe, krachtige visualisatie van "ben ik op koers?" — zou hero kunnen zijn op `/horizon`.
- 🟢🟡 **Lijn die aan einde naar 0 dipt** — "What you need" eindigt op $0 op longevity-leeftijd (omdat je geld op moet zijn). Dat is een duidelijke "deplete"-end-strategy. fintwo ondersteunt 3 strategieën (perpetual/legacy/deplete); deze visualisatie communiceert "deplete" perfect.

---

## Sectie 7: Surplus-Gap (`/planner/insights/surplus-gap`)

**Functionaliteit**:
- Bar chart met positieve (paars) en negatieve (rood/roze) bars per jaar
- Lifetime summary box rechts: Saved Surplus $897k, Funded Gap -$415k, Total $482k
- "Tips for Using the Chart" onder

**Visueel ontwerp**:
- Bars zijn dunner dan op andere pagina's — meer jaren tonen
- Y-axis spans ruim: -$300k tot +$50k (asymmetrisch — gaps zijn dramatisch hoger dan surplusses)

**Visualisatie & data-presentatie**:
- **Diverging bar chart** rond 0-lijn — paars omhoog, rood omlaag
- Visueel meteen duidelijk waar de pijn-jaren zitten (laatste decennia)
- **Lifetime totals** in summary-box geven raw cijfers naast visualisatie

**Screenshots**: `10-surplus-gap.png`

**Observaties**:
- 🔴🟢 **Diverging bar chart rond 0-lijn voor surplus/gap-jaren** — fintwo's Horizon laat al zien wanneer geld op is (via `runSimulation`), maar niet als een visueel patroon van "welke jaren spaar je / welke jaren teer je in?". Sterk patroon voor `/horizon` of een nieuwe widget.
- 🟢🟡 **Lifetime totals naast chart** — geen totalen verstoppen in tooltips. fintwo zou totals altijd zichtbaar moeten houden — niet alleen on-hover.

---

## Sectie 8: Monte Carlo Analysis (`/planner/explorers/monte-carlo`)

**Functionaliteit**:
- "After running 1,000 simulations, the probability that your savings will last until your goal age of 87 is **99%**."
- **Run Again** button (gebruiker krijgt agency)
- Disclaimer: "This analysis has no impact on results seen on any other page" — eerlijk

**Visueel ontwerp**:
- Header zin met groot percentage in tekst (geen extra grafische emphasis)
- "Run Again" als donker teal button — call-to-action

**Visualisatie & data-presentatie**:
- **Fan chart** — middellijn (Monte Carlo Median) met confidence-bands eromheen
- Verschillende layers: Average Assumptions (linear), Monte Carlo (binnen 1 std dev), Monte Carlo (binnen 2 std dev), Monte Carlo Median
- Y-axis tot $11M — laat range van uitkomsten zien

**Screenshots**: `11-monte-carlo.png`

**Observaties**:
- 🔴🟢 **Fan chart met confidence-bands** — fintwo heeft `runBacktest` met named-paths (best/worst/median) maar geen continue confidence-bands. Een Monte Carlo fan chart zou de belangrijkste visualisatie kunnen worden voor "kans van slagen" in Horizon.
- 🟢🟢 **"Run Again" knop** — geeft gebruiker agency; ze kunnen de simulatie herhalen met nieuwe random seeds. Verlaagt het mysterium ("waar komt 99% vandaan?"). fintwo zou dit kunnen toevoegen aan backtest-widget.
- 🟡🟢 **Eerlijke disclaimer** ("no impact on other pages") — verklaart dat dit een "wat-als" sandbox is. fintwo's modus van scenario-vs-baseline zou hier baat bij hebben.

---

## Sectie 9: My Plan Summary (`/planner/myplan/summary`)

**Functionaliteit**:
- "My Financial Journey" hero — area-chart met life-events als dots
- "Plan Completion: 1 of 7 sections complete" als grote teal hero-card
- Plan-sections grid met progress per sectie (Assets and Debts, Home & Real Estate, Income, Money Flows, Expenses & Healthcare, Estate Planning, Rate Assumptions)
- **Milestones tijdlijn** — life events met datum, leeftijd, beschrijving in 2e-persoon

**Visueel ontwerp**:
- Hero-area-chart in pastel-groen (niet hard) — voelt "journey-achtig"
- Plan Completion card: dik teal, witte tekst — staat eruit
- Section-cards: subtiel grijs met progress-indicator
- Milestones: links datum + leeftijd, rechts kop + paragraaf — chronologisch van vandaag naar longevity

**Visualisatie & data-presentatie**:
- Area-chart-met-dots is een **timeline-visualisatie** met life-events als hover-able punten
- Milestones-lijst is **narratief** — niet kale data, maar "You start Medicare", "You've reached your retirement age!"

**Screenshots**: `13-money-flows.png` (let op: bestand is My Plan Summary doordat /money-flows redirect)

**Observaties**:
- 🔴🟢 **Persoonlijke milestones-tijdlijn in 2e persoon** — "You're making plans and making stuff happen", "You've reached your retirement age!" — dit is editorial-finance op zijn best. fintwo's `/identity` of `/horizon/levensgebeurtenissen` zou hier sterk van profiteren. fintwo heeft levensgebeurtenissen in data, maar presenteert ze als configurable cashflows — niet als persoonlijke verhalen.
- 🔴🟢 **"Plan Completion" gamification** — "1 of 7 sections complete" is een glasheldere Drum-aanwijzer voor wat te doen. fintwo's onboarding-funnel mist dit overzicht. Past bij `/identity/voortgang` of als hero op identity-overzicht.
- 🟢🟡 **Progress-per-sectie cards** — elke sectie laat zien hoe ver je bent (bijv. "0 of 5 complete"). Vergelijkbaar met fintwo's koppelingen-progress maar uitgebreider.

---

## Sectie 10: What If Explorer (`/planner/explorers/what-if`)

**Functionaliteit**:
- 6 pre-built "What If I..." radio-toggles:
  - Model stages of retirement spending
  - Stop working 3 years earlier than planned
  - Increase pre-retirement savings to 15%
  - Live 5 years longer than expected
  - Take out a $50k loan
  - Have an unexpected $50k expense in 5 years
- **Savings Projection** chart bovenin — bar chart, baseline + alternatieve scenario side-by-side wanneer toggle aan
- "**Next Steps**" sectie: actionable instructie + CTA "Model Work Income Scenario" — leidt naar daadwerkelijke configuratie

**Visueel ontwerp**:
- Cards met radio-buttons: schoon, simpel
- Geselecteerde card: groene rand, andere grijs
- Chart: dark teal bars (baseline), lichtere teal voor scenario

**Visualisatie & data-presentatie**:
- **Side-by-side bar comparison**: meerdere bar-paren per jaar — direct vergelijken
- Geen tooltip nodig om verschil te zien, gewoon visueel evident

**Interactie & flow**:
- Toggle — chart updates instant
- "Next Steps" CTA verandert per toggle
- "Model Work Income Scenario" gaat van *hypothesis* naar *configuratie* in plan

**Screenshots**: `14-what-if-explorer.png`, `15-what-if-toggled.png`

**Observaties**:
- 🔴🟢 **Pre-built common what-ifs als entry-point** — geen scenario-builder forceren. Boldin geeft 6 voorgebakken vragen die de meeste mensen hebben. fintwo's testfase zou hier echt van profiteren. Past in Horizon als segmented-control of als entry op een "What If" pagina.
- 🟢🟢 **Side-by-side baseline + scenario in chart** — geen baseline tonen zou onhoudbaar zijn want gebruikers verliezen referentiekader. fintwo zou dit moeten overnemen in scenario-vergelijking.
- 🟢🟢 **"Next Steps" CTA** — niet alleen tonen, maar ook actionable maken. "Wil je dit echt? Klik hier om scenario te bouwen." fintwo's Vrijheidsscenario's zouden hier een vergelijkbare flow kunnen hebben.

---

## Sectie 11: Coach (`/planner/coach`)

**Functionaliteit**:
- "Digital Coach Suggestions" — gepersonaliseerde to-dos
- Filter chips: Plan Accuracy (2), Strategy Ideas (0), Actions (3), Your Key Dates (0), Scenarios Suggestions (1)
- Status-buckets: To-do (5), Completed (0), Ignored (0) — collapsible
- Right sidebar met sales: "Meet 1:1 With a Planning Coach", "Gain Professional Expertise" (CFP)

**Visueel ontwerp**:
- Filter chips: subtiel, met counts in haakjes
- To-do cards: ⚡ icoon + titel + "NEW" chip rechts

**Observaties**:
- 🟢🟢 **Filter-by-categorie + status-buckets (To-do/Completed/Ignored)** — fintwo heeft een coach via /identity/gids (concept-flip-cards) maar geen state-tracking. Een Coach-tab met persoonlijke to-dos die je kan markeren als done/ignored is laagdrempelig en concreet.
- 🟢🟡 **"NEW"-chip op recente suggesties** — kleine attentie-pull. fintwo gebruikt "NEW" sporadisch; consistenter zijn zou helpen.

---

## Sectie 12: Financial Wellness (`/planner/wellness`)

**Functionaliteit**:
- Wellness Scorecard: horizontale stacked bar met 5 segmenten (kleurgecodeerd: groen/geel/rood/blauw/gestreept)
- Categorie-cards eronder met emoji + count: 😊 Excelling 11, 🙂 Progressing 2, 😞 Vulnerable 1, ℹ️ Informational 4, ∅ No Data 1
- Metric Watchlist: customizable selectie (max 19 uit library)
- Voorgeselecteerde metrics: Savings rate (10.0% PROGRESSING), Total debt ratio (20.6% EXCELLING), Next month's cash flow ($1.2k EXCELLING)
- "+ Add metric to Watchlist" card als laatste

**Visueel ontwerp**:
- Stacked bar bovenaan is **horizontaal**, niet vertical — past bij dashboard-stijl
- Status-badges per metric: groen pill voor EXCELLING, geel voor PROGRESSING, rood voor VULNERABLE
- Add-card heeft dashed border (placeholder-stijl)

**Visualisatie & data-presentatie**:
- **Horizontale stacked bar als scorekaart** — toont relatieve verdeling van metrics over status-categorieën in één oogopslag
- Emoji's als status-indicators is informeel maar werkt

**Screenshots**: `17-financial-wellness.png`

**Observaties**:
- 🔴🟢 **Emoji-status-categorieën (😊/🙂/😞/ℹ️/∅)** — direct leesbaar, vriendelijk, niet stigmatiserend ("Vulnerable" niet "Bad"). fintwo's vermogenstaat zou hier baat bij hebben — 3 emoji's per metric (op koers / aandacht / probleem).
- 🟢🟢 **Customizable Watchlist** — gebruiker kiest wat ze willen volgen, niet wat fintwo vooronderstelt. Dit past bij fintwo's widget-prefs maar dan met een metric-library specifiek voor financial-wellness.
- 🟢🟡 **Horizontal stacked bar bovenaan** — als macroweergave werkt dit beter dan een donut-chart of staafje per categorie. fintwo's `Identity > overzicht` zou hier een vergelijkbaar overzicht kunnen tonen.

---

## Sectie 13: Scenario Manager (`/planner/scenario-manager`)

**Functionaliteit**:
- Up to 10 scenarios, "9 LEFT" indicator
- Tabel: SCENARIOS, RETIRING (years/age), NET WORTH AT RETIREMENT, UPDATED
- "Compare Scenarios" banner: select up to 3 to compare
- "Watch Demo" CTA — onboarding-help

**Visueel ontwerp**:
- Tabel-stijl rij voor elke scenario
- Star-icoon + BASELINE chip voor active scenario
- "Add New Scenario" knop met "9 LEFT" chip — scarcity-indicator

**Observaties**:
- 🟡🟢 **Schaarste-indicator "9 LEFT"** — kleine UX-detail dat de limiet duidelijk maakt zonder modal. fintwo zou dit kunnen toepassen op portfolios, holdings, scenarios.
- 🟢🟢 **Up to 3 scenarios side-by-side vergelijken** — fintwo's Horizon heeft scenario's maar de UX van "kies welke 2-3 ik nu wil zien" is minder uitgewerkt.

---

## Vergelijking met fintwo

### Waar Boldin sterker is

1. **Sankey diagrams als hoofdvisualisatie** — fintwo heeft geen flow-charts. Boldin gebruikt ze op dashboard én in Lifetime Cash Flow. Voor money-flow-storytelling zijn ze onverslaanbaar.
2. **Insights Library als entry-point** — fintwo's Horizon is monolithischer. Boldin's "kies een vraag, krijg een rapport" is laagdrempelig.
3. **Pre-built What If toggles** — fintwo dwingt scenario-creatie; Boldin laat je beginnen met 6 common what-ifs.
4. **Plan Completion gamification** — fintwo heeft impliciete onboarding maar niet expliciet "X of Y complete".
5. **Personal milestones-timeline in 2e persoon** — Boldin's "You start Medicare in 2046" is editorial gold; fintwo presenteert dit als configurable cashflow-list.
6. **Globale scenario-context in topbar (BASELINE chip)** — fintwo's scenario's leven in Horizon; Boldin maakt het werkmodus.
7. **Tax-allocation donut** — toont hoe assets verdeeld zijn over tax-treatments. Voor NL is dat box 1 (eigen huis), box 2 (aanmerkelijk belang), box 3 (sparen/beleggen).
8. **AI assistant pane (Ask Boldin)** — chat-style retirement advisor. fintwo heeft niets vergelijkbaars.

### Waar fintwo sterker is

1. **Kleur-systeem en module-architectuur** — fintwo's `--ink` / `--module-active-*` design tokens en strikte Kern/Wil/Horizon module-scheiding zijn schoner dan Boldin's "alles is één lange sidebar". Boldin's sidebar heeft 14+ sub-items per groep — overweldigend.
2. **Editorial copy** — fintwo's "Geld is opgeslagen tijd"-premise en `formatFreedomTimeString` zijn veel **persoonlijker en culturele specifieker** dan Boldin's algemene retirement-talk. Boldin doet "Welcome, jp" maar verder klinisch.
3. **Mobile-first stack-shell** — fintwo's per-tab stack-architectuur (Bitvavo-stijl) is veel doordachter dan Boldin's responsive desktop-only feel. Boldin's mobile-experience zag ik niet maar de desktop-layout (driekoloms dashboard) zou op mobile moeilijk werken.
4. **Box 3 / NL fiscale modellen** — fintwo's `BOX3_TARIEF`, `NL_FICTIEF_BELEGGINGEN`, `NL_SWR` zijn NL-specifiek. Boldin is Amerikaans-only (Roth, Social Security, IRMAA, Medicare).
5. **Module-fallbacks** — fintwo's bewuste "modules schakelbaar + fallbacks" architectuur ontbreekt bij Boldin (alles is altijd aan).
6. **Editorial-design language** — fintwo's design-principes (whitespace, beperkt kleur, hierarchie) zijn strenger dan Boldin's "alles op de pagina"-stijl.

### Wat fintwo van Boldin moet *niet* overnemen

- **Sales/upsell embedded in plan-views** — "Get an expert review from a CFP" tussen je dashboard-widgets is afleidend. fintwo is geen advisor-broker.
- **Dashboard met 8+ widgets in 2 kolommen + pagination + videos + podcast + classes** — te druk. fintwo's filosofie van rust en focus is sterker.
- **14 sub-items in één sidebar-groep (Insights)** — overweldigend. fintwo's 5-modules met sub-routes is rustiger.
- **Lange uitleg-paragrafen bovenaan elke pagina** — "What you need solves for the total savings needed per year to have enough money to reach your longevity age without running out of money..." (3 zinnen). fintwo's editorial-finance is korter en sterker.

---

## Aanbevolen features voor fintwo-backlog

(Worden parallel toegevoegd via `feature_create_bulk` met categorie `Inspiratie - Boldin`)

### Tier 1 — Hoog-impact, direct overneembaar
1. **Sankey income/outflow visualisatie met year-slider** — voor `/core` (huidig jaar) of `/horizon` (lifetime, scrubbable)
2. **"What If I..." pre-built scenario-toggles** — voor `/horizon/scenarios` of nieuwe `/horizon/wat-als`-pagina
3. **Insights Library als vraag-gedreven entry** — herinrichting van `/horizon` overzicht
4. **Two-line "What you have" vs "What you need" met area-fill** — hero op `/horizon` of `/horizon/vrijheidsscenarios`
5. **Persoonlijke milestones-tijdlijn in 2e persoon** — voor `/horizon/levensgebeurtenissen` of `/identity`-overzicht
6. **Plan Completion gamification ("X of Y secties klaar")** — voor `/identity` of `/identity/voortgang`

### Tier 2 — Aanpassing voor fintwo
7. **Financial Wellness Scorecard met emoji-status-categorieën** — voor `/identity` overzicht of nieuwe `/identity/wellness`
8. **Customizable metric-watchlist** — uitbreiding van `widget_prefs` voor wellness-metrics
9. **Globale scenario-chip in topbar** — feature-flag-gated, voor power-users
10. **Surplus-Gap diverging bar chart** — als widget op dashboard of in Horizon
11. **Tax-allocation donut (NL-Box context)** — voor `/core` (Box 3 vs Box 1) of `/identity/instellingen`
12. **"Tips for Using the Chart" sectie onder complexe charts** — pattern voor alle Horizon-grafieken
13. **Coach to-dos met categorieën en status-tracking (To-do/Completed/Ignored)** — uitbreiding van /identity/gids of nieuwe `/identity/coach`
14. **Monte Carlo fan chart met "Run Again"** — uitbreiding van bestaande backtest-widget in Horizon
15. **Pre-built scenario-templates ("Stop met werken 3 jaar eerder")** — laagdrempelige scenario-creatie

### Tier 3 — Inspiratie, langetermijn
16. **AI assistant pane ("Vraag fintwo")** — chat met suggested prompts (bv. "wanneer ben ik FIRE?", "wat als ik €10k extra spaar?")
17. **Peer comparison ("hoe sta je vergeleken met andere fintwo-gebruikers")** — alleen relevant bij grotere user-base
18. **Macro line + interactive Sankey + jaartabel als drie-luiker** — voor uitgebreide cash-flow-pagina

---

## Verificatie

- [x] Rapport bestaat op `docs/reviews/external-boldin-2026-05-08.md` met executive summary
- [x] 13 hoofdsecties bezocht en gedocumenteerd (Dashboard, Insights Library, Lifetime Cash Flow, Net Worth, Lifetime Income Projection, What You Need, Surplus Gap, Monte Carlo, My Plan Summary, What If Explorer, Coach, Financial Wellness, Scenario Manager)
- [x] Screenshots opgeslagen in `docs/reviews/external-boldin-2026-05-08/` (18 screenshots, .png)
- [x] Vergelijking met fintwo per sterk/zwak punt
- [x] Geen privacy-issue: gebruiker gaf expliciet toestemming voor screenshots
- [ ] Features in fintwo-backlog (volgende stap)

---

## Aanbeveling aan gebruiker

1. **Wachtwoord wijzigen** voor het Boldin-account, want het stond in de chat-transcript van deze sessie.
2. Als beginnerssel voor implementatie: kies één van Tier 1 features (Sankey of What-If toggles zijn beide hoog-impact en goed isoleerbaar).
3. Overweeg de **Insights Library** als herinrichting van Horizon — fundamentele structuurkeuze, niet een widget-toevoeging.

---

# Aanvullingen — diepe duik (sessie 2, 2026-05-08)

Vier extra observatie-gebieden waar screenshot-analyse niet voldeed: de twee topbar-popovers, de AI-assistent in actie, scenario-aanmaak flow, en mobile-view.

## Sectie 14: Topbar "Adjust your scenario's forecast" popover

**Functionaliteit**:
Compacte popover met **twee onafhankelijke toggles**:
1. **View projections in:** segmented control [Today's Dollars] / [Future Dollars] (gekozen) — bepaalt of bedragen in koopkracht-vandaag of nominale toekomst-dollars worden getoond.
2. **Rates: Inflation and Returns:** segmented control [Optimistic ↗] / [Average ~] / [Pessimistic ↘] — kiest tussen drie pre-built rate-sets.

Beschrijving in popover: "Toggle between projections and rates of returns to automatically adjust your scenario's forecast."

**Visualisatie & data-presentatie**:
- Kleine richtings-icoontjes naast de drie rate-keuzes (chart-up, sinus, chart-down)
- Active state met groene rand en achtergrondtint
- Geen sliders, alleen segmented control — eenvoudig

**Screenshots**: `19-adjust-forecast-popover.png`

**Observaties**:
- 🔴🟢 **Today's Dollars vs Future Dollars toggle** — fintwo's `formatCurrency` en alle FIRE-projecties tonen nu altijd nominale bedragen. Een toggle om te switchen tussen "in vandaag's koopkracht" en "in toekomst-euros" zou de begripskloof bij `/horizon`-projecties enorm verkleinen. Hoort thuis als topbar-toggle of binnen Horizon settings.
- 🟢🟢 **Optimistic / Average / Pessimistic als pre-built rate-sets** — fintwo heeft `expected_return + inflation_rate` configureerbaar in `/identity/instellingen` Sectie C, maar geen one-click presets. Een topbar-toggle waarmee de gebruiker snel "best/avg/worst case" kan switchen versnelt scenario-exploratie.
- 🟡🟢 **Compactheid van twee toggles in één popover** — twee orthogonale concepten (formaat vs aanname-set) helder gescheiden. fintwo's settings hebben deze niet bij elkaar; in topbar-popover zou het wel passen.

---

## Sectie 15: Topbar "Assumptions" popover

**Functionaliteit**:
Bredere popover met **drie configureerbare assumptions** en twee deeplinks:
1. **Retirement Age**: huidige waarde "67y0m, Feb 2048" met edit-icoon
2. **Withdrawal Strategy**: 3-tab segmented control [Spending Needs (active) | Max Spending | Fixed Percentage] + Edit-link
3. **Budgeter Scenario**: dropdown "Basic Budgeter" + Edit-link
4. **Edit Rate Assumptions** link (chevron — naar diepere config)
5. **All system assumptions** link (external icon — naar settings-pagina)

**Visualisatie & data-presentatie**:
- Witte popover, secties gescheiden door subtiele dividers
- Active tab in segmented control: groene background, donker tekst
- Inactive tabs: grijze tekst, geen background
- Edit-links in groen, klein, rechts-uitgelijnd

**Screenshots**: `20-assumptions-popover.png`

**Observaties**:
- 🔴🟢 **Topbar Assumptions popover als "snel-aanpassen"** — fintwo heeft `expected_return`, `inflation_rate`, `FireEndStrategy`, `RetirementExpenseMethod` in profile, maar verspreid over `/identity/instellingen`. Deze topbar-popover **bundle most-changed assumptions** en geeft links naar diepere config. Past in fintwo als topbar-iconknop in de **shell-architectuur** (`<AppHeader>` of `<Sidebar>`).
- 🟢🟢 **Withdrawal Strategy als 3-mode segmented control** — Boldin's modes zijn:
  - **Spending Needs** = uitgeven wat je nodig hebt
  - **Max Spending** = max uitgeven met behoud van succeskans
  - **Fixed Percentage** = klassiek 4%-regel
  
  fintwo's `FireEndStrategy` (perpetual/legacy/deplete) is een ander concept (eindstrategie-vermogen), niet hoe-spendeer-je. **Beide concepten verdienen een UI** — fintwo heeft alleen de eerste.
- 🟡🟢 **Edit-links direct in popover** — geen "klik om te configureren", maar inline edit naast elke setting. Snelheid voor power-users.

---

## Sectie 16: Ask Boldin AI in actie (deep-dive)

**Functionaliteit**:
- Rechter slide-in pane (als compact) of fullscreen-modal (na expand)
- Chat-history sidebar (in expanded mode): "TODAY" sectie met eerdere vragen, "New chat" knop bovenaan
- Suggested prompts roteren per sessie (vandaag zag ik: "What's the best Social Security claiming strategy for me?", "Might I benefit from Roth conversions?", "What's my safe withdrawal rate?")
- Voice-input ("Start recording")
- Per-bericht reacties: copy, 👍, 👎
- Disclaimer "Results aren't guaranteed. See disclosures"

**Interactie & flow van een vraag** ("What's my safe withdrawal rate?"):

1. Gebruiker klikt prompt → vraag verschijnt als grijze bubble rechts
2. AI toont **agent-style tool-use steps** als checklijst:
   - ✓ Reviewing your plan
   - ✓ Calculating spending guardrails
   - ✓ Running get wellness summary
   - ✓ Running forecast
3. AI antwoord verschijnt als markdown:
   - Header: "Why we use Guardrails instead of a flat %:"
   - Body: "A static '4% rule' often fails to account for other income like Social Security or the 'retirement hatchet'..."
   - Specifieke cijfers: "your projected **$787,643 in savings at retirement**", "**$3,200 a month**"
   - Bold-tekst: "your **safe spending target is $6,340 per month** (in today's dollars)"
   - **Inline link** naar relevant in-app page: "track these targets and set up alerts ... on the [Spending Guardrails] page"
   - Proactieve follow-up: "Since you have so much extra room in your budget, have you thought about what you'd like to do with that additional $3,200 a month—perhaps more travel or a bigger legacy for heirs?"

**Visualisatie & data-presentatie**:
- Tool-use als checklist met groene vinkjes — gebruiker ziet WAT de AI doet
- Bedragen vetgedrukt voor scanbaar
- Inline links navigeren naar gerelateerde pagina's binnen Boldin
- Antwoord eindigt vaak met **vraag terug** — gespreks-momentum

**Screenshots**: `21-ask-boldin-empty.png`, `22-ask-boldin-response.png`, `23-ask-boldin-response-full.png`, `24-ask-boldin-expanded.png`

**Observaties**:
- 🔴🟢 **Agent-style tool-use checklist tijdens generatie** — gebruiker ziet "Reviewing your plan", "Calculating spending guardrails", "Running forecast" — dat zijn TOOL-CALLS van de agent. Volledig compatibel met **Anthropic Claude API met tool-use**. fintwo zou dit kunnen bouwen met Claude tools die `runSimulation`, `computeFireRange`, `runBacktest`, `loadDashboardData` aanroepen.
- 🔴🟢 **Inline links naar in-app pagina's** — "track these targets ... on the [Spending Guardrails] page" — niet alleen tekst, maar bruikbare diepe-link. Tool-use kan output produceren met fintwo's eigen routes (`/horizon/levensgebeurtenissen`, `/core/budgets`, etc).
- 🔴🟢 **Proactieve follow-up vraag** — "have you thought about what you'd like to do with that additional $3,200 a month?" — dit creëert **gespreksmomentum**. Niet één-vraag-één-antwoord, maar een dialoog.
- 🟢🟢 **Tool-use transparant tonen verlaagt zorg over hallucinaties** — gebruiker ziet dat de AI rekent op zijn echte plan-data, niet uit duim zuigt. Belangrijke trust-builder.
- 🟢🟢 **Chat-history per sessie + "New chat" knop** — gebruiker kan terug naar vorige conversaties of vers beginnen. Standaard chat-UX maar in financiële context belangrijk.
- 🟡🟢 **Suggested prompts roteren** — bij eerste sessie: tax-minimization / retire-early / part-time work. Tweede sessie: SS-claim / Roth / safe-withdrawal. Houdt entry-point fris en personaliseert.
- 🟡🟢 **Feedback per bericht (👍/👎)** — Boldin verzamelt RLHF-data om de AI te verbeteren. Voor fintwo: vergelijkbaar feedback-flow, maar mogelijk privacy-zorg in NL (data-locatie van LLM-provider).

---

## Sectie 17: Scenario-aanmaak flow

**Functionaliteit**:
Klik op "Add New Scenario" in Scenario Manager opent een **slide-in panel rechts** met formulier:
- **Scenario name** (text input, leeg)
- **Notes** (textarea, leeg)
- **Import data from** (dropdown — default "My retirement plan", de baseline)
- **Create New Scenario** button (disabled tot naam ingevuld)
- **Cancel** button

**Visueel ontwerp**:
- Slide-in van rechts, takes ~30% van breedte
- Velden in standard input-stijl
- Disabled CTA in lichtgroen-grijs (uitgeschakeld), Cancel als secundair white-bordered

**Screenshots**: `25-scenario-add-modal.png`

**Observaties**:
- 🔴🟢 **GEEN templates bij scenario-aanmaak** — Boldin biedt alleen leeg starten of importeren-van-baseline. Geen "Stop 3 jaar eerder met werken"-templates. Dit **bevestigt een differentiator-kans voor fintwo**: pre-built templates bij `/horizon/vrijheidsscenarios > Nieuw` zijn écht onderscheidend.
- 🟡🟡 **Notes-veld** — Boldin heeft een notitie-veld per scenario. fintwo's vrijheidsscenario's kunnen dit ook overwegen voor power-users die meerdere scenario's bijhouden.
- 🟢🟢 **Import-from-dropdown** — als je meerdere scenarios hebt, kun je vanaf elk daarvan een nieuwe variatie maken (niet alleen vanaf baseline). Subtiel maar handig voor "stack scenarios" werkflow.

---

## Sectie 18: Mobile-view (375x812)

**Functionaliteit & layout**:
- **Topbar** vereenvoudigt: hamburger, logo, Assumptions-icoon, Ask-knop, profile (geen scenario-chip zichtbaar)
- **Hamburger menu** = volledige sidebar als drawer-overlay (slides in van links). Scenario-chip bovenaan in drawer.
- **Dashboard** = alle widgets in **één lange single-column scroll** (totale hoogte ~9151px)
- **Geen bottom-nav, geen tabs, geen secties-shortcut** — pure scroll
- Charts adapten goed — full-width, schaalbaar
- **Tabellen truncaten kolommen** — Lifetime Cash Flow tabel toont op mobile alleen Year/Age/Income/Expenses; Surplus/Gap en Savings vallen buiten beeld
- AI Ask-knop blijft prominent in topbar

**Screenshots**: `26-mobile-dashboard.png`, `27-mobile-menu.png`, `28-mobile-lifetime-cash-flow.png`

**Observaties**:
- 🔴⚫ **Geen mobile-specifieke nav-architectuur** — Boldin heeft géén bottom-nav, geen tab-systeem, geen per-tab stacks. Pure scroll + hamburger drawer. fintwo's per-tab stack-shell + mobile-bottom-bar is **fundamenteel beter** voor mobile-UX. Niet overnemen.
- 🟢🟢 **Charts adapten elegant** — Sankey, line-charts, bar-charts blijven leesbaar op 375px. Goed bewijs dat fintwo's chart-keuzes (line/bar/area) ook mobile-friendly kunnen zijn.
- 🔴🟡 **Tabellen truncaten zonder waarschuwing** — Lifetime Cash Flow tabel-kolommen vallen weg op mobile zonder horizontale scroll-indicator. fintwo zou hier beter doen met **collapsible mobile-row** of **swipeable column-set**.
- 🟡⚫ **Single-column scroll = lang** — 9151px totale dashboard-hoogte op mobile is overweldigend. fintwo's "rust en focus" filosofie + per-tab stacks vermijden dit.
- 🟢🟢 **Sankey blijft krachtig op mobile** — bevestigt dat de aanbevolen Sankey-feature (#1) ook in fintwo's mobile-stack-shell zal werken.

---

## Bijgewerkte top-leerpunten (na sessie 2)

Toevoegingen op de oorspronkelijke top-7:

8. **🔴🟢 Topbar "Assumptions"-popover als snel-aanpassen** — drie meest-gebruikte assumptions (retirement age, withdrawal strategy, budgeter scenario) in één popover, met links naar diepere config. fintwo's setting-architectuur ondersteunt dit; alleen UI ontbreekt.

9. **🔴🟢 "Today's Dollars vs Future Dollars" toggle** — fintwo toont nu nominale bedragen overal. Een real/nominal toggle in topbar of per Horizon-pagina is een major begripshulp.

10. **🔴🟢 Optimistic/Average/Pessimistic rate-presets** — pre-built return/inflation-sets als one-click toggle ipv per-veld editing. Past in `/identity/instellingen` Sectie C of als topbar.

11. **🔴🟢 AI-assistent met tool-use transparency + inline page-links** — als fintwo AI gaat bouwen, **toon de tool-calls als checklist** ("Berekenen FIRE-projectie", "Lopen vermogenspad") en laat antwoorden verwijzen naar fintwo's eigen routes. Volledig haalbaar met Anthropic Claude API.

12. **🟡🟢 Scenario-aanmaak met templates** — Boldin doet dit NIET, fintwo kan hier echt onderscheidend zijn met "Stop X jaar eerder", "Spaar Y% meer" templates die direct cashflows aanpassen.

## Bijgewerkte features-lijst

Het bestand `docs/reviews/external-boldin-2026-05-08-features.md` blijft de bron-van-waarheid. Aanvullingen die uit deze diepe duik komen, voeg toe:

### 19. Topbar Assumptions-popover (sessie 2 toevoeging)
- **category**: Inspiratie - Boldin
- **name**: Topbar Assumptions popover voor snel-aanpassen
- **description**: Compacte popover toegankelijk via icoon in `<AppHeader>` met de 3 meest-gewijzigde assumptions: pensioenleeftijd, withdrawal-strategy, expense-method. Plus deeplinks naar `/identity/instellingen` voor diepere config. Verlaagt drempel om scenario-aannames aan te passen zonder navigatie.
- **steps**:
  1. Bouw `<AssumptionsPopover>` component met segmented controls
  2. Hergebruik bestaande state uit profile (`expected_return`, `inflation_rate`, `FireEndStrategy`)
  3. Plaats icoon-knop in `<AppHeader>` rechts van de actieve module-tabs
  4. Edit-links naar `/identity/instellingen#fire`

### 20. Today's Dollars / Future Dollars toggle (sessie 2 toevoeging)
- **category**: Inspiratie - Boldin
- **name**: Real/Nominal toggle voor Horizon-projecties
- **description**: Toggle in topbar of in Horizon-pagina-header om FIRE-projecties te switchen tussen "in vandaag's koopkracht" (deflated) en "in toekomst-euros" (nominal). Verkleint begripskloof bij grote projecties (€2M in 2050 voelt alarmerend, maar in vandaag's koopkracht is het misschien €1.1M).
- **steps**:
  1. Wijzig `formatCurrency` om optionele `displayMode: 'real' | 'nominal'` te accepteren
  2. Voor real: deflateer met `inflation_rate` van profile vanaf today
  3. Persistente toggle in `useHorizonViewMode` context-hook
  4. Toggle-UI in topbar of als segmented control op `/horizon`-pagina-header

### 21. Optimistic/Average/Pessimistic rate-presets (sessie 2 toevoeging)
- **category**: Inspiratie - Boldin
- **name**: Pre-built rate-sets als one-click toggle
- **description**: Drie voorgebakken return/inflation-sets: optimistisch (return 7%, inflation 1.5%), gemiddeld (return 5%, inflation 2%), pessimistisch (return 3%, inflation 3%). Toggle wijzigt project-input zonder profile-edit nodig. Voor power-users die snel scenarios willen exploreren.
- **steps**:
  1. Definieer `RATE_PRESETS` constant met 3 sets
  2. UI: segmented control in topbar Assumptions-popover (#19)
  3. Override `resolveFireParams` met preset-rates in computation context
  4. Persisted in session/scenario, niet profile

### 22. AI-assistent met tool-use transparency (sessie 2 update)
- **category**: Inspiratie - Boldin
- **name**: AI-pane met agent-style tool-use checklist
- **description**: Update van #16 in eerste lijst. Specifiek: toon tool-calls als checklist tijdens AI-generatie ("✓ Berekenen FIRE-projectie", "✓ Analyseren vermogenspad"). Antwoorden bevatten **inline links** naar fintwo's eigen routes. Maakt gebruik van Anthropic Claude API met tool-use.
- **steps**:
  1. Definieer fintwo-tools voor Claude: `runSimulation`, `computeFireRange`, `loadDashboardData`, `getRecentEvents`
  2. Stream tool-call events naar UI als progress-checklist
  3. Format response met markdown + inline links naar `/horizon/...`, `/core/...` routes
  4. Suggested prompts roteren op basis van plan-state (sparende user → "spaar-vragen", FIRE-bereikende user → "inkomstenstrategie")
  5. Per-bericht 👍/👎 feedback met opt-in voor verbetering

### 23. Real-time gegenereerde proactieve follow-up vragen (sessie 2 toevoeging)
- **category**: Inspiratie - Boldin
- **name**: AI vraagt proactieve follow-up na elk antwoord
- **description**: Sub-feature van #22. Na het beantwoorden van de vraag genereert AI een vervolg-vraag op basis van de plan-data ("Met deze extra €3.200/maand, heb je nagedacht over reizen of een nalatenschap?"). Maakt het tot een gesprek ipv een query-antwoord pattern.
- **steps**:
  1. Add system-prompt clause: "After answering, suggest one concrete follow-up question based on insight from the answer"
  2. Render follow-up als clickable chip onder antwoord (auto-fills input)

---

## Definitieve verificatie (sessie 2)

- [x] Rapport bevat alle 13 oorspronkelijke secties + 5 sessie-2 secties (18 totaal)
- [x] 28 screenshots in `docs/reviews/external-boldin-2026-05-08/`
- [x] Top-leerpunten uitgebreid met 5 sessie-2 toevoegingen (totaal 12)
- [x] Features-lijst uitgebreid met 5 nieuwe items (totaal 23 features in `docs/reviews/external-boldin-2026-05-08-features.md` — moet nog appended worden)
- [x] Privacy: gebruiker gaf toestemming voor screenshots
- [x] Browser gesloten
