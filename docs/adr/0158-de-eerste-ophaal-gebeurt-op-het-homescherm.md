---
id: 0158-de-eerste-ophaal-gebeurt-op-het-homescherm
title: 'De eerste ophaal gebeurt op het homescherm, ná de rondleiding — en het budget vraagt daarna één keer om koppeling'
status: aanvaard
date: 2026-09-17
elements: [t-bankconnect, do-transactie, as-import, sp-budget, sp-registreren]
---

# 0158 — De eerste ophaal op het homescherm

Vult het gat dat ADR 0156 openliet en begrenst de uitzondering op ADR 0069.

## Context

Sinds ADR 0156 eindigt de onboarding met een budgetstap en een bankstap. Een
nieuwe gebruiker komt daarmee de app binnen met een ingericht budget en een
gekoppelde bank — en toch met een leeg scherm. Twee oorzaken, beide bewust:

- **De koppeling levert alleen een saldo.** `GET /api/bank-connect/callback`
  haalt nooit transacties op (ADR 0069). `POST /api/bank-connect/sync` is de
  enige route die dat doet, en die werd uitsluitend door een knop gestart: de
  headerknop, ⌘K, de rekeningdetail, het sync-rapport en "Synchroniseer nu" op
  de success-pagina. Geen van die vijf komt een onboarding-gebruiker tegen.
- **Een budget zonder gekoppelde uitgaven blijft leeg.** De sync categoriseert
  wél meteen bij het wegschrijven (`categorizeTransaction` zet `budget_id` +
  `category_source`), maar wat de deterministische regels niet herkennen blijft
  liggen. Daar bestaat gereedschap voor — `AICategorizeSheet` met "Vraag Fin" en
  de Sleepmodus — maar niets wees de nieuwe gebruiker erheen.

De onboarding zelf is geen werkbare plek voor die ophaal. Ze leeft in de
route-group `(onboarding)`, buiten de `GlobalSyncProvider`, en sluit af met een
harde `window.location.assign('/dashboard')` die een lopende fetch afkapt. Een
ophaal die daar start sneuvelt stil halverwege. Bovendien is de samenvattingsstap
geen betrouwbaar aanhaakpunt: gaat de bankkoppeling via hetzelfde tabblad, dan
zijn na terugkeer de sessie-antwoorden weg en wordt de samenvatting overgeslagen
(ADR 0156, aanvulling 17 sep).

## Besluit

**1. De eerste ophaal start automatisch en eenmalig, zodra de gebruiker de app
binnenkomt.** `components/sync/eerste-sync-na-onboarding.tsx` hangt in de
`(app)`-layout binnen de `GlobalSyncProvider` en start dezelfde ronde als de
syncknop — dezelfde rem, dezelfde toasts, dezelfde `router.refresh()`. Er komt
geen tweede sync-pad en geen tweede leesronde: hij gebruikt
`loadGlobalSyncTargets`.

   In de praktijk is dat het homescherm (de onboarding navigeert naar
   `/dashboard`, dat de proxy naar `home_screen` vertaalt), maar de trigger
   hangt bewust aan de **layout** en niet aan één route: `home_screen` is
   instelbaar, en wie de app binnen het venster op een diepe route heropent
   hoort zijn transacties net zo goed te krijgen. De prijs is dat de
   voortgangsstrip en de toasts ook op zo'n route kunnen verschijnen. Dat is
   aanvaard: het gebeurt hooguit één keer, binnen 24 uur na de onboarding, en
   `router.refresh()` reconcilieert alleen servercomponenten — open formulieren
   en lokale clientstate blijven staan.

**2. Hij wacht tot het stil is.** De rondleiding van ADR 0130 start op ~400 ms
en claimt het aandachtsregister (ADR 0134). Een banksync eindigt met toasts en
een `router.refresh()`, en de tour mikt op `data-tour`-selectors die daarbij
kunnen verspringen. De trigger vuurt daarom pas als `useAttentionQuiet()` vals
is. Dat kost niets: de tour legt de schermen uit, niet de cijfers, en wie 'm
overslaat (één tik) krijgt de sync meteen.

**3. Geen eigen "al gedaan"-vlag.** De voorwaarde dooft zichzelf uit twee
bestaande feiten: de afrondingsmarkering van ADR 0156 verloopt na 24 uur, en
een geslaagde sync zet `last_synced_at`, waarna de trigger geen koppeling
zonder dat stempel meer vindt. De markering krijgt er wél één veld bij
(`bankKoppelingen`, zie punt 4) — geschreven door dezelfde route, in dezelfde
sleutel. Bewust geen zevende sleutel op `module_guide_state`: ADR 0130
waarschuwt in zijn gevolgen dat de niet-atomaire read-modify-writes op die
kolom elkaar kunnen overschrijven.

**4. De uitzondering op ADR 0069 is begrensd — en die begrenzing moet in code
staan, niet in een redenering.** ADR 0069 verbiedt een eerste ophaal zolang het
correctiemoment leeft: de actie op `/core/cash/connect/success` waarmee een
verkeerd gelande koppeling te verhangen is, die verdwijnt zodra
`last_synced_at` staat. Dat is onherstelbaar — her-attributie van al
geïmporteerde transacties bestaat niet.

   Voor een onboarding-koppeling bestond dat correctiemoment feitelijk al niet:
   de callback stuurt die gebruiker naar `/onboarding`, niet naar de
   success-pagina, en hij wees zijn doelrekening al aan in `TargetAccountChoice`
   (`target_asset_id`, ADR 0156 §5). Daar verandert deze trigger dus niets aan.

   **Maar de trigger start een GLOBALE ronde**, en die raakt élke actieve
   koppeling — ook één die de gebruiker binnen hetzelfde 24-uursvenster ergens
   ánders legde, en waarvan het correctiemoment wél leeft. Het faalpad is
   concreet: de bank-callback is een server-redirect, dus een tweede koppeling
   geeft een volledige pagina-load en daarmee een verse module-scope waarin de
   eenmalig-per-tab-vlag opnieuw op vals staat. Zonder grens zou de trigger dan
   op de success-pagina vuren terwijl de gebruiker naar de verhang-knop kijkt.

   **De grens hangt daarom aan de kóppeling, niet aan gebruikerstoestand.**
   `POST /api/onboarding/afronding` legt bij `bank: 'gekoppeld'` server-side
   vast wélke `bank_connection_accounts` op dat moment bestonden
   (`bankKoppelingen` in dezelfde markering; de client levert geen ids aan, net
   als bij de budget-telling in die route — ADR 0058). De trigger geeft
   uitsluitend díe ids door aan `triggerGlobalSync`. Een koppeling die later
   ontstaat komt er structureel niet in — er is geen toestand waarin ze
   alsnog meelift.

   Een eerdere opzet toetste "heeft de gebruiker nog niets gesynchroniseerd?"
   en was aantoonbaar lek: een onboarding-koppeling die kapot of zonder drager
   landt krijgt **nooit** een `last_synced_at` (`planBankSyncs` slaat 'm over),
   dus die poort bleef 24 uur openstaan — juist bij de gebruiker bij wie de
   eerste koppeling misging.

   Daar bovenop, als tweede slot: **de trigger vuurt nooit op
   `/core/cash/connect*`**, de plek waar de verhang-actie staat.

   **Fail-safe bij een markering van vóór dit besluit:** die draagt de ids nog
   niet, en levert dus géén automatische ophaal. Beter een gemiste ophaal (de
   syncknop staat er nog) dan een gesloten correctiemoment.

   **Herzieningsmoment.** Gaat de bankstap van de onboarding ooit wél via de
   success-pagina lopen, of wordt her-attributie van geïmporteerde transacties
   gebouwd, dan vervalt de grond onder deze uitzondering en hoort punt 1 opnieuw
   gewogen te worden.

**5. Het budget vraagt daarna één keer om koppeling.**
`components/app/budget-transacties-aanbod.tsx` verschijnt bij het eerste bezoek
aan `/overzicht/budget`, maar **alleen als er transacties zonder budget staan**.
Twee knoppen: "Nu koppelen" opent de bestaande `AICategorizeSheet`, "Later"
sluit af. Geen tweede koppel-UI, geen tweede telling — het aanbod consumeert
`allTimeUncatCount`, dat `BudgetsClient` al bijhoudt.

**6. De AI-vraag wordt niet in de popup herhaald.** Staat AI uit — de default
voor een nieuw account sinds ADR 0155 — dan toont de sheet zelf al
`AiSubscriptionUpsell`, die sinds ADR 0157 de `BetaAddonDialog` opent, mét de
zin dat de Sleepmodus en handmatig indelen zonder abonnement werken. Het aanbod
hoeft daar dus niets over te zeggen en doet dat bewust niet: één plek waar de
app over de AI-keuze praat.

## Gevolgen

- **Geen migratie, geen nieuwe API-route, geen rekenmotor.** Eén id erbij op de
  dichte allowlist `COACHMARK_IDS` (`budget-transacties-koppelen`), één veld in
  een bestaande jsonb-markering, één leeshelper, twee componenten.
- **Het aanbod en `BudgetKoppelNudge` sluiten elkaar per constructie uit.** Die
  buurman op dezelfde pagina eist nul transacties (`budgets-loader.tsx`); dit
  aanbod eist er minstens één zonder budget. Ze kunnen nooit samen verschijnen.
- **Hooguit één poging per paginalading, binnen een venster van 24 uur.** De
  eenmaligheid is module-scoped en dus per tab; een soft-navigatie start dus
  geen tweede ronde, een harde herlading wel. Uitzondering: valt de leesronde
  om vóórdat er ook maar één koppeling is aangeraakt, dan gaat de vlag terug —
  anders zou één netwerkhapering de eerste ophaal voor de hele sessie
  afkappen. De echte ondergrens bij herhaald falen is daarmee de dagrem met
  reserve uit `planBankSyncs` (drie verzoeken blijven voor de handmatige knop),
  niet de uur-rem: `lastAttemptedAt` is browsersessie-state en overleeft een
  paginalading niet. Een kapotte autorisatie (`link-broken`) wordt sowieso
  overgeslagen.
- **De telling van ongekoppelde transacties hertelt nu per serverronde.**
  `BudgetsClient` deed dat alleen bij mount, en `router.refresh()` remount geen
  clientcomponenten — dus na een automatische ophaal bleef de teller op de
  waarde van ervóór staan. Dat had twee zichtbare gevolgen tegelijk: het aanbod
  uit punt 5 verscheen nooit voor precies de gebruiker voor wie het bedoeld is,
  en de actiestrip meldde "Alles gekoppeld" boven een budget vol ongekoppelde
  transacties. De staleness bestond al; dit besluit maakte haar routine.
- **Fouten in de ronde zelf blijven zichtbaar** (`triggerGlobalSync` toast per
  koppeling); alleen het mislukken van de leesronde faalt stil — een
  foutmelding voor een handeling die de gebruiker niet aanvroeg is verwarrend,
  en de handmatige knop staat er nog.
- **Egress**: de trigger doet zijn leesronde uitsluitend voor wie binnen 24 uur
  na de onboarding met een gekoppelde bank binnenkomt. Voor alle andere renders
  kost dit niets — `readAfrondingBankGekoppeld` leest de
  `module_guide_state` die al in de main-batch profile-select zit.
- **Afgevallen alternatieven**: een blokkerend wachtscherm in de bankstap (de
  harde navigatie kapt de fetch af, en de samenvatting is geen betrouwbaar
  aanhaakpunt); een server-side job (bestaat niet, en zou een nieuw pad zijn);
  de sync meteen starten met uitgestelde refresh (vraagt een snede in
  `global-sync-provider.tsx`, dat óók de gewone syncknop draagt); een
  feature-visit-slug voor het aanbod (vraagt een extra telling in de loader,
  terwijl de client het aantal al heeft).
- **Verwant**: ADR 0069 (begrensde uitzondering), ADR 0072 (omvang van de
  eerste ophaal — ongewijzigd), ADR 0130 (rondleiding, aandachtsvolgorde),
  ADR 0134 (aandachtsregister), ADR 0155/0157 (AI-keuze), ADR 0156 (de stappen
  die dit gat openlieten).

## Addendum — 19 september 2026: kopij hernoemd naar "categoriseren" (B-059)

Een testgebruiker meldde dat de app twee woorden door elkaar gebruikt voor
dezelfde handeling. Dit besluit beschreef het aanbod nog met "Nu koppelen",
"Transacties koppelen" en "Alles gekoppeld" — terwijl de sheet die eronder
opengaat "Transacties categoriseren" heet, de buurman op dezelfde pagina
"Bank koppelen" zegt (een ándere handeling) en de rest van de app
"categoriseren / zonder categorie" gebruikt.

De norm is nu: de handeling heet **categoriseren**, het resultaat
**gecategoriseerd**, het restant **zonder categorie**. Het woord "koppelen"
blijft gereserveerd voor verbindingen naar buiten (bank, broker, rekening) of
tussen objecten (hypotheek↔woning, budget↔spaardoel, grenzenpot↔budget). Het
aanbod draagt bovendien één zin die de twee woordwerelden verbindt en uitlegt
wat het oplevert: "Categoriseren is elke transactie bij het juiste budget
zetten. Daarmee zie je per budget wat erin en eruit gaat."

Alleen kopij, geen gedragswijziging. Twee dingen zijn bewust NIET hernoemd:
het coachmark-id `budget-transacties-koppelen` (opgeslagen sleutel op de
profielrij én lid van de dichte allowlist in `app/api/coachmark/route.ts` —
hernoemen laat het aanbod terugkomen bij iedereen die het al had weggeklikt)
en de componentnaam `BudgetKoppelNudge`, die daadwerkelijk over het koppelen
van een bank gaat.
