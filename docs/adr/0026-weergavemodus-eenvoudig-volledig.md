---
id: 0026-weergavemodus-eenvoudig-volledig
title: Weergavemodus "Eenvoudig ⇄ Volledig" — server-side scalar pref + palet-commando
status: aanvaard
date: 2026-06-22
elements: [do-meta, app-comp]
---

## Context

TriFinity-pagina's hebben een "diepte"-laag (secundaire KPI's, detail-secties, uitleg) die voor
beginners overweldigend is maar voor gevorderden waardevol. We willen één profiel-brede voorkeur
die deze diepte-laag standaard inklapt ("Eenvoudig") of openzet ("Volledig"), cross-device en zonder
flash.

De app kent al drie aparte zichtbaarheid/voorkeur-machines: privacy-masking en insight-zichtbaarheid
(beide localStorage, apparaat-lokaal) en status-banner-minimaliseren + appearance (beide server-side,
own-row op `profiles`). Een nieuwe modus moet bij het JUISTE patroon aansluiten en geen vierde variant
uitvinden.

## Besluit

- **Opslag = server-side scalar.** Eén kolom `profiles.display_mode text default 'simple'` met
  `check (display_mode in ('simple','full'))`. Scalar (geen jsonb) omdat het één globale waarde is,
  geen per-route-map. Geen nieuwe RLS-policy: de bestaande own-row policy (`auth.uid() = id`) dekt de
  kolom. Geschreven via `PUT /api/display-mode` met de anon RLS-client (`.eq('id', user.id)`), nooit
  service-role.
- **Eén bron van waarheid.** Alle consumers lezen `useDisplayMode()` (`lib/hooks/use-display-mode.tsx`).
  Geen tweede leespad (geen localStorage-spiegel, geen prop-drilling van de raw waarde) — dat zou de
  drift introduceren die CLAUDE.md verbiedt. De provider wordt met `initialMode` uit een server-prop
  geseed (layout-render) zodat SSR == client → geen flash. Persist = optimistisch + fire-and-forget
  PUT met rollback (page-status-stijl).
- **Toggle = ⌘K-palet-commando.** Eén actie `action:toggle-display-mode`, exacte spiegel van
  `action:toggle-privacy`, met dynamisch label. Geen TopBar-knop of `/mijn`-instelling in v1.
- **Default 'simple' voor nieuwe accounts; bestaande accounts gebackfilled naar 'full'.** Een kale
  NOT NULL DEFAULT zou alle bestaande gebruikers in Eenvoudig zetten; de migratie backfillt daarom
  bestaande rijen naar 'full' zodat alleen nieuwe accounts Eenvoudig starten.
- **Mechanisme-only (v1).** De gedeelde `DepthSection`-component wordt opgeleverd maar nog op geen
  pagina ingehangen — pagina-omzetting (te beginnen met de tweede laag van `/overzicht`) is een
  vervolgkaart.

## Gevolgen

- Het zichtbare effect volgt pas wanneer pagina's `DepthSection` gaan gebruiken; v1 levert het schone,
  geteste contract (kolom, hook-API, palet-actie) vóórdat UI erop leunt.
- De ERD beweegt vanzelf mee na `npm run arch:diagram` (nieuwe `profiles.display_mode`-kolom).
- `display_mode` is orthogonaal aan `widget_prefs` en `use-insight-visibility`: het stuurt de diepte-
  laag aan, niet welke widgets aanstaan of welke insight-cards apparaat-lokaal zijn weggeklikt.

## Aanvulling — 9 augustus 2026 (vindbaarheid, fase 1 eenvoudige weergave)

Het UX-onderzoek van 8 aug 2026 (`docs/eenvoudige-weergave-audit.md`) legde bloot dat het besluit
"geen `/mijn`-instelling in v1" in de praktijk betekende: **niemand kon de keuze vinden**. Nieuwe
accounts starten op 'simple' en wisten niet dat er meer was; bestaande accounts stonden na de
backfill op 'full' en wisten niet dat het rustiger kon. ⌘K is een expert-ingang, geen ontdekpad.

Twee aanpassingen op het oorspronkelijke besluit:

- **De keuze staat nu óók op `/mijn/uiterlijk`** — als eerste blok (`DisplayModePicker`,
  `components/mijn/display-mode-picker.tsx`), boven palet en typografie. ⌘K blijft bestaan als
  snelkoppeling. Er komt géén tweede schrijfpad bij: de picker roept `setMode` uit `useDisplayMode()`
  aan, dus dezelfde optimistische state + `PUT /api/display-mode` met rollback.
- **De welkomstgids noemt de weergave in één regel** met een link naar `/mijn/uiterlijk`, in beide
  modi. Dit is de enige plek waar de app zélf over de modus praat.

Wat NIET verandert: de bewuste keuze uit `components/app/hide-in-simple.tsx` om **geen per-sectie-hint
of -toggle** te tonen op de pagina's zelf blijft staan. Het voorstel voor een "ontdek-voetregel" op
zwaar gereduceerde pagina's (APP-4) is expliciet afgewezen — dat zou precies de rust ondermijnen die
Eenvoudig moet leveren.

Ook achterhaald: het "mechanisme-only"-punt hierboven. Op het moment van fase 1 was `DepthSection`
nog nergens ingehangen en liep de pagina-reductie volledig via `HideInSimple` (hard verbergen). De
⌘K-omschrijving is daarop bijgesteld — "Meer/minder detail op elke pagina" in plaats van de belofte
"Diepte-secties standaard tonen of inklappen", die gedrag beschreef dat op geen enkel oppervlak
bestond. Of `DepthSection` alsnog wordt ingezet of verwijderd stond op dat moment nog open (audit
§9.1); fase 2 en 4 hebben die vraag beantwoord — zie de aanvulling hieronder.

## Aanvulling — 9 augustus 2026 (cijfernorm, fase 2 eenvoudige weergave)

Fase 2 van de audit voegt één regel toe die niet per pagina maar in de **primitive** leeft, en die
daarmee een besluit is en geen implementatiedetail.

**De stripnorm (APP-7): in Eenvoudig toont een `FiguresStrip` maximaal twee cellen.** De norm zit in
`components/editorial/index.tsx` (`SIMPLE_MAX_FIGURES`), niet in tientallen losse mode-ternaries op
de call-sites. Reden: de reductie liep tot nu toe per pagina, en dat liet stelselmatig achterblijvers
staan (Box 1 toonde in Eenvoudig nog vier KPI's, schulden drie) zonder dat iemand dat zag. Een norm
in de primitive vangt óók de call-sites die later worden toegevoegd — dat is precies het verschil
tussen een afspraak en een garantie. De strip forceert daarbij `cols` naar 2, zodat de reductie geen
half-lege kolomindeling oplevert.

Twee ontsnappingsluiken, allebei bewust smal:

- **`simpleFigures`** — expliciete keuze wélke twee cellen blijven staan, voor strips waar "de eerste
  twee" niet de juiste twee zijn. Zonder dit zou de norm de betekenisvolle cel kunnen wegsnijden
  (bv. een uitkomst-cel die achteraan staat).
- **`alwaysFull`** — reductie helemaal uit. Gezet op de zes design-system-previews onder
  `app/(app)/beheer/blueprints/**`, die de primitive juist in zijn volle vorm moeten tonen, en op de
  zes strips onder `app/(app)/rapportages/**`: een gegenereerd rapport- of printdocument mag geen
  cijfers verliezen omdat de lezer toevallig in Eenvoudig staat. Rapportages staan bewust buiten de
  audit-voorstellen. **Niet** gezet op `components/editorial/page-blueprints.tsx`: `PageMiniHero` is
  een compositie-helper voor échte pagina-hero's, geen preview — die hoort gewoon mee te reduceren.

Waar `alwaysFull` wél en niet tegen beschermt, preciezer dan de code-comment het zegt: alle
opt-out-oppervlakken liggen binnen `app/(app)/layout.tsx` en dus binnen de provider. `alwaysFull`
beschermt ze daar niet tegen de fallback hieronder, maar tegen de échte modus-keuze van de gebruiker.

**Bijvangst die als waarschuwing hoort te blijven staan:** `useDisplayMode()` valt búiten een
`DisplayModeProvider` terug op `'simple'` (zie de hook), en die provider hangt alleen in
`app/(app)/layout.tsx`. Elke modus-lezende component die daarbuiten rendert — in de praktijk vooral
unit-tests — krijgt dus stilzwijgend de eenvoudige tak. Tests die de volledige weergave bedoelen
moeten expliciet in een `DisplayModeProvider initialMode="full"` renderen; doen ze dat niet, dan
blijven ze groen terwijl ze de verkeerde tak asserten. Dat is geen theoretisch risico: bij fase 2
gebeurde het in meerdere bestaande suites tegelijk, en het is de reden dat `alwaysFull` bestaat.

Wat NIET verandert: de norm is **presentatie-reductie**, geen tweede rekenweg. Beide modi consumeren
dezelfde reeds berekende `FigureProps`; er wordt nergens een cijfer "vereenvoudigd herberekend"
(CLAUDE.md, consume-don't-recompute). En Volledig blijft in alle gevallen exact zoals het was.

## Aanvulling — 9 augustus 2026 (twee mechanismen, fase 3 t/m 5 eenvoudige weergave)

Fase 3 (bezittingen, belasting, toekomst), fase 4 (mijn, berichten, navigatie) en fase 5
(verkenningen) zijn opgeleverd. Eén besluit daaruit hoort in deze ADR, de rest is uitvoering.

**De open vraag uit fase 1 is beantwoord: `DepthSection` blijft, náást `HideInSimple`.** De modus
kent daarmee bewust **twee** mechanismen, en de keuze ertussen is een inhoudelijke:

- **`HideInSimple`** — hard weg in Eenvoudig. Voor *diepte*: analyses, katernen, extra grafieken.
  Wat hier verdwijnt is uitleg of verrijking; de gebruiker verliest geen ingang.
- **`DepthSection`** — ingeklapt mét behoud, één klik ertussen. Voor *bedieningsvlakken*: dingen die
  de gebruiker moet kúnnen bijstellen. Hard verbergen zou daar de enige ingang dichtzetten.

Drie oppervlakken staan sinds fase 2/4 op het tweede mechanisme: het cashflow-instellingenblok
(CF-4), "Alle meldingstypen" op `/mijn/notificaties` (MIJN-3) en de AI-uitvoeringsgroepen op
`/mijn/privacy` (MIJN-4). Sinds R5 komt daar `/toekomst/voorkeuren` bij (S7): de drie pot-regels en
de markt-aannames stonden op `HideInSimple` terwijl de kernel er onverminderd mee rekende en deze
pagina hun enige ingang is — twee `DepthSection`s ("Pot-regels", "Markt-aannames") met een leesregel
die de huidige waarde draagt. De `AfbouwOverzichtCard` op diezelfde pagina blijft `HideInSimple`:
uitkomst-analyse, geen bedieningsvlak. Ze delen één implementatieregel die hier hoort omdat hij uit het
acceptatiecriterium volgt en niet uit smaak: **`DepthSection` wordt alléén in Eenvoudig gemónt.** In
Volledig zou hij weliswaar open staan, maar mét kop-knop en kaartrand — en "Volledig blijft
ongewijzigd" betekent dat daar exact de bestaande boom rendert.

De ⌘K-sublabel "Meer/minder detail op elke pagina" dekt beide mechanismen; dat is precies waarom die
formulering het van de oude, mechanisme-specifieke tekst won.

Twee besluiten uit fase 5 zijn bewust **niet** hier vastgelegd maar als eigen ADR, omdat ze over de
informatie-architectuur gaan en niet over de weergavemodus: **ADR 0095** (tips & acties en berichten
blijven gescheiden ingangen) en **ADR 0096** (één feedback-ingang via de chat; `POST /api/feedback`
antwoordt 410). Beide zijn aanvaard en geïmplementeerd.

Tot slot een grens die tijdens fase 3 scherp werd: niet elke audit-bevinding is een modus-bevinding.
Waar iets gewoon fout of dubbel was — een permanent lege Box 2-kaart, een tabbalk die het kaartengrid
eronder exact herhaalt — is het in **beide** modi gerepareerd. De modus is een rustknop, geen
opbergplek voor UI die er sowieso niet hoorde te staan.
## Aanvulling — 28 augustus 2026 (positie van de welkomstgids + waar APP-2 landt)

> **Deels vervangen door ADR 0130 (5 sep 2026).** Besluit 1 t/m 3 hieronder — de gids in het
> `banners`-slot ná de begroeting, minimaliseren tot een punt naast de pagina-`i`, en APP-2 in de
> gids óp /overzicht — gelden niet meer: de welkomstgids woont sinds ADR 0130 in de Fin-chat en is
> van /overzicht verdwenen. De APP-2-regel zelf ("de gids is de enige plek waar de app over de
> weergavekeuze praat") blijft; de zin is met de gids meeverhuisd.

Fase 1 gaf de welkomstgids de rol van **enige plek waar de app zélf over de weergavekeuze praat**
(APP-2, de regel hierboven). Wat daarbij nooit is vastgelegd: **wáár die gids op de pagina staat en
hoe je hem wegkrijgt.** Twee bevindingen uit de schermronde van 25 aug 2026 raakten precies dat gat —
H20/S13 (de gids stond in béíde weergaven bóven de begroeting) en L11 (sluiten vergde twee
beslissingen). Omdat elke oplossing de APP-2-regel meeneemt, hoort het besluit hier.

**Besluit 1 — de gids staat ná de begroeting, in beide modi.** De eerste seconde van /overzicht
antwoordt ("zo sta je ervoor"), en vraagt daarna pas. De gids en de maandelijkse check-in renderen in
het `banners`-slot van `OverzichtHeroPrimary`, tussen de begroeting en het hefbomen-kompas; de
check-in zakt dus méé (dat overrulet bewust de plaatsing uit "beslissing 7" van 27 mei 2026, die de
check-in als top-banner zette). De positie is **geen** modus-keuze: hij is in Eenvoudig en Volledig
gelijk. Bewaakt door `components/overview/overzicht-hero.block-order.test.ts`.

De audit behandelde deze bevinding half: hoofdbevinding 2 deed dezelfde waarneming ("op mobiel is het
hele eerste scherm welkomstgids") maar koos als remedie **comprimeren** (APP-6, geleverd 9 aug).
Verplaatsen is toen niet gewogen en stond ook niet bij "afgevallen". Comprimeren en verplaatsen zijn
allebei nodig: het één gaat over omvang, het ander over hiërarchie.

**Besluit 2 — de gids volgt de meldingen-conventie: één uitgang, en die gooit niets weg.** Het kruisje
(en "Gids inklappen" / "Nee, klap in") **minimaliseert** de gids tot een klein knopje naast de
pagina-`i`, precies zoals de status-duiding-banner dat doet. Dat is cross-device onthouden in de
bestaande jsonb `profiles.module_guide_state['welcome:guide']` (veld `minimized`; géén migratie, géén
localStorage) en altijd weer te openen. De architectuur is de conventionele: één bron
(`WelcomeGuideProvider`) die de payload ophaalt en deelt met de uitgeklapte banner én het punt — geen
tweede fetch-pad. Daarmee vervalt de sessie-only sluitvlag die L11 als tussenstap invoerde.

Twee afwijkingen van de conventie, allebei bewust:

- **Geen automatische heropening bij escalatie.** De conventie laat een geminimaliseerde melding weer
  uitklappen zodra de status verergert. De gids draagt geen ernst-niveau — er is niets dat kan
  verergeren. Dezelfde lezing als `MinimizedLevel = 'info'` in `lib/page-status/display.ts`.
- **Een icoon in plaats van een gekleurd punt.** De kleur van een statuspunt dráágt de ernst; bij de
  gids zou die kleur niets betekenen en naast het echte statuspunt een alarm suggereren dat er niet
  is. Vandaar een checklist-icoon in het module-accent van de route.

**Besluit 3 — APP-2 blijft waar hij is, en wordt geen wees.** De regel over de weergavekeuze staat nog
steeds in de gids, in beide modi — alleen láger op de pagina. Minimaliseren verbergt hem tijdelijk,
maar is geen eenrichtingsdeur: één klik op het punt brengt hem terug. Dat is precies waarom
minimaliseren de voorkeur kreeg boven "automatisch verdwijnen zodra de gids af is" (optie B op kaart
S13): dáár zou APP-2 stil en definitief verdwijnen bij de gebruiker die klaar is met onboarden.
"Verberg de gids voorgoed" (`status: 'dismissed'`) doet dat wél — maar dat is een expliciete
gebruikerskeuze, en `components/onboarding/onboarding-success.tsx` draagt dezelfde zin als tweede
vindplaats.

Wat NIET verandert: de gids blijft in Eenvoudig gecomprimeerd (APP-6) en in Volledig ongewijzigd; het
blokkenaantal van de Volledige weergave blijft gelijk (besluit 9 aug 2026); er komt géén
per-sectie-hint of -toggle bij (het afgewezen APP-4). Automatisch verdwijnen zodra de gids af is
blijft mogelijk als vervolg — het predicaat `isGuideComplete()` bestaat al — maar hééft de
data-bewuste afvinking (M1) nódig, en is bewust nog niet ingezet.
## Aanvulling — 28 augustus 2026 (call-site-ternary uitfaseren; wat Eenvoudig als eerste toont)

De stripnorm hierboven (APP-7) legde vast dát een `FiguresStrip` in Eenvoudig maximaal twee cellen
toont, en waaróm die regel in de primitive hoort en "niet in tientallen losse mode-ternaries op de
call-sites". Bevinding **S11** vond de eerste zo'n ternary in het wild: `/overzicht/bezittingen`
rendeerde twee compleet losse strips (één cel in Eenvoudig, vier in Volledig), gebouwd op 22 juni
2026 — vóór het faseplan, en daarna in de audit geprezen als "wat al goed staat" zonder dat iemand
woog *welke* cel overbleef.

**Besluit — een call-site kiest niet hóéveel, alleen wélke.** De hoeveelheid is de norm in de
primitive (`SIMPLE_MAX_FIGURES`); een call-site die vindt dat "de eerste twee" niet de juiste twee
zijn, gebruikt `simpleFigures`. Twee losse `figures`-arrays achter een `mode`-ternary zijn vánnu
expliciet fout, ook als de uitkomst toevallig klopt: het is een derde reductiemechanisme naast
`HideInSimple` en `DepthSection`, het onttrekt zich aan de norm, en het maakt de keuze onzichtbaar
voor wie de primitive leest.

**De inhoudelijke les erbij, en die is breder dan de strip:** wat Eenvoudig als eerste toont moet het
**eigen antwoord** zijn, niet een hypothese. Op deze pagina overleefden twee promo-simulators
("0,5% beheerkosten kost je €51.091 over 30 jaar") terwijl het eigen portefeuillerendement uit de
strip was geknipt — een beginner kreeg dus wél het hypothetische bedrag en niet zijn eigen cijfer.
Dat is de omgekeerde volgorde van wat de modus belooft. Concreet doorgevoerd: de rendement-cel blijft
in Eenvoudig staan (met de rekenmodal-knop, die er juíst voor de beginner is), en de
beheerkosten-simulator gaat naar Volledig — daarmee is audit-item **OVZ-5** alsnog beperkt
uitgevoerd, tegen zijn eerdere "afgevallen"-status in.

Wat NIET verandert: Volledig toont exact dezelfde vier cellen als voorheen; er wordt niets
herberekend (dezelfde reeds berekende `FigureProps`, alleen minder getoond); de
samengestelde-rente-kaart blijft in beide modi — die is de enige "waarom zou ik"-motivatie voor wie
nog niet belegt.
