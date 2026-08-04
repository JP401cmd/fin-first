# UX-review TriFinity — juli 2026 (Fase 0–4)

> Grondige drie-laags review: **Level A** gebruiksvriendelijkheid (Nielsen), **Level B** consistentie t.o.v. het design system, **Level C** UI/UX-kwaliteit. Methode: statische code-review per kernflow en per dimensie (13 parallelle review-agents); geen draaiende app — contrast-ratio's en runtime-gedrag zijn niet live geverifieerd. Scope: de canonieke app (46 pagina's onder /overzicht, /toekomst, /mijn, /berichten, /nieuws, /rapportages) + shell + onboarding; legacy `/core`-`/horizon`-routes alleen waar een kernflow er doorheen loopt. Beheer en marketing buiten scope (opdrachtgever-besluit, Fase 0).

**Kern-userflows (rode draad):** ① First-run (signup → onboarding → eerste /overzicht) · ② Cashflow-ritme (bank/import → categoriseren → budget) · ③ Vermogen & schulden (quick-add → detail/herwaarderen → /overzicht) · ④ Toekomst plannen (tijdas → wat-als → doel) · ⑤ Signaal→actie (bericht/krant/tip → aanbeveling → actie/Will-chat).

**Totalen:** 123 bevindingen — Level A: 55 (17×S1, 30×S2, 8×S3) · Level B: 33 (8×S1, 17×S2, 8×S3) · Level C: 35 (4×S1, ±22×S2, ±9×S3). Geen S0.

**Severity:** S0 blokkerend · S1 ernstig (grote frictie kernflow) · S2 hinderlijk (workaround bestaat) · S3 cosmetisch.
**Prioriteit:** P0 direct fixen · P1 deze iteratie · P2 backlog · P3 nice-to-have. `P1*` = uitvoering wacht op een opdrachtgever-besluit (zie VRAAG-bundel).

---

## 1. Overkoepelend beeld

1. **Stil falen is het grootste usability-probleem.** Schrijfacties in de kernlus (actie voltooien, aanbeveling accepteren, scenario opslaan, auth bij netwerkfout) falen zonder enige melding — de gebruiker denkt dat het gelukt is.
2. **Twee design-era's.** De editorial-laag (`components/editorial/**`) en de token-architectuur zijn schoon; de oudere `components/app/**`-laag handhaaft de regels niet (~880 rounded-hits, hardcoded groen/rood wint 2,5:1 van de semantische tokens, 8 knop-recepten, 18/23 modals buiten de driewegregel).
3. **Gebouwd-maar-niet-geadopteerd.** FormError (2 bestanden), PageSkeleton (0), FinTable (deels), useFlashChange (alleen /core), sleep-affordance (1 van 3 tabellen) — de canon bestaat, de uitrol stokte.
4. **De filosofie is copy, nog geen cijferlaag.** "Elke euro > €100 krijgt zijn vrijheidstijd-equivalent" is buiten Horizon/onboarding niet ingelost; schulden-/budget-koppen dragen de filosofie als tagline boven tabellen met kale euro's. /overzicht — de belangrijkste pagina — heeft geen dominant hoofdcijfer (H1 = begroeting; 13 concurrerende signalen).
5. **Structurele oorzaak van modal-drift is documentatie:** CLAUDE.md's modal-conventie leest als toestemming voor custom `fixed inset-0 z-[70]`-overlays, terwijl de ui-ux-skill dat verbiedt.

---

## 2. P0 — direct fixen (13)

| # | Level | Scherm/component | Bevinding | Sev | Voorstel | Acceptatiecriteria |
|---|---|---|---|---|---|---|
| E-01 | A | Actiebord (`action-board.tsx:89-153`) | Status wijzigen/toewijzen/aanmaken faalt stil (alleen console.error) | S1 | ToastProvider-error op elk `!res.ok`/catch-pad | Elke mislukte schrijfactie toont binnen 1s een NL-foutmelding met retry-mogelijkheid; state rolt zichtbaar terug |
| E-03 | A | Will-chat (`chat-panel.tsx:570-618`) | Actie-toevoegen/aanbeveling-beslissen in chat faalt stil | S1 | Lokale error-state op de kaart ("Kon niet opslaan — probeer opnieuw") | Mislukte kaart-actie is visueel onderscheidbaar van niet-geklikt; retry werkt |
| A-02 | A | Auth-pagina's (signup/login/forgot/reset) | Geen try/catch om Supabase-calls: netwerkfout → knop eeuwig disabled | S1 | try/catch/finally + netwerk-copy (referentie: onboarding/page.tsx:1002-1081) | Netwerkfout toont melding; knop wordt weer bruikbaar; submit opnieuw mogelijk |
| A-03 | A | Auth-pagina's | Rauwe Engelse Supabase-errors getoond | S1 | NL-vertaaltabel per errorcode | Bekende foutcodes → NL-copy (wat + hoe fix); onbekend → generieke NL-fallback |
| A-04 | A | Auth-pagina's | Foutmelding zonder `role="alert"` | S1 | Spiegel onboarding-patroon | Fouten worden door screenreader aangekondigd (assertive) |
| A-01 | A | auth/callback (`route.ts:11-19`) | Verlopen confirm-/resetlink → kale redirect zonder melding | S1 | `?confirm_error=1` + banner op /login (patroon `isExpired` bestaat) | Verlopen link toont uitleg + her-verstuur-pad |
| B-01 | A | cash-account-view:2029 | Transactierij `<div onClick>` — toetsenbord-onbereikbaar | S1 | `<button type="button">` zoals transacties-feed:385 al doet | Rij focusbaar, Enter/Space opent, zichtbare focus-ring |
| B-02 | A | cash-account-view:2060 | "Categorie bevestigen" 16×16px op mobiel | S1 | `min-h-[44px] min-w-[44px]` klikzone (icoon klein) | Tap-target ≥44px, gemeten incl. padding |
| D-01 | A | whatif-sliders:162-170 | 4 range-inputs zonder accessible name | S1 | `aria-label={label}` + `aria-valuetext={formatValue(value)}` | Screenreader benoemt parameter + waarde + eenheid per slider |
| E-02 | A | Will-chat berichtenlijst | Geen `aria-live` — AI-antwoorden onhoorbaar | S1 | `aria-live="polite"` + `aria-relevant="additions"` op container; assertive op foutbanner | Nieuwe berichten worden aangekondigd; streaming geeft geen dubbel-voorleesruis |
| F-01 | A | FloatingNavButton:64 | Focus-ring inkt-op-inkt (contrast ≈1:1) | S1 | `focus-visible:outline-[var(--paper)]` op beide pill-knoppen | Zichtbare focus-indicator ≥3:1 tegen achtergrond |
| F-02 | A | ToastProvider:150 | Toast (`top-4 z-[100]`) dekt mobiele TopBar af | S1 | `top-14 lg:top-4` (+ safe-area) — TopBar-hoogte canoniek kiezen | Toast overlapt titel/back-knop niet op 360-430px viewports |
| N-07 | C | 5× `future/*-sheet.tsx` | Formulier-paneel zonder `max-h`/`overflow-y-auto` — opslaan-knop kan buiten beeld vallen | S2 | `max-h-[92vh] overflow-y-auto` conform publish-curation-sheet:153 | Op 375×667 en met toetsenbord open blijft de opslaan-knop bereikbaar |

## 3. P1 — deze iteratie (selectie; volledige lijst in bijlage)

| # | Level | Scherm | Bevinding | Sev | Voorstel | Acceptatiecriteria |
|---|---|---|---|---|---|---|
| E-04 | A | TipsLijst:99-103 | Accept/uitstel/afwijzen faalt stil | S2 | Toast-error op decide()-catch | Mislukte beslissing zichtbaar + opnieuw mogelijk |
| B-03 | A | Import-wizard | Geen weg terug van stap 2 naar 1 | S1 | "Terug"-knop met behoud van geparsede rijen | Terug zonder dataverlies; opnieuw bestand kiezen kan |
| B-04/B-05/C-08 | A | Bank-connect, import, asset/debt-panes, revalue | Rauwe `err.message` naar gebruiker | S2 | Vaste NL-copy per actie; technisch → console/telemetry | Geen Engelse/Postgres-strings in UI |
| C-01/C-04 | A | Herwaarderen + categorie-pagina's | Landt na save/bewerken stilzwijgend in legacy `/core`-boom | S1/S2 | `returnTo`/basePath-prop i.p.v. hardcoded pad (senior-dev oordeel) | Gebruiker keert terug naar de route waar hij vandaan kwam; URL blijft canoniek |
| C-02 | A | Holding-detail | Koers zonder tijdstempel/sync-status | S1 | "Bijgewerkt op d MMM HH:mm" uit broker-sync | Elk koersgetal heeft zichtbare versheid |
| I-05 | B | cash-account-view, budget-plan-editor e.a. | 5× kale `window.confirm` + 1 eigen inline-confirm | S1 | Vervang door `ShellOverlay kind="confirm"` | Geen window.confirm meer in scope; focus-trap + Esc werken |
| K-05 | B | lib/nav-config.ts | 11 routes (rapportages-familie + 4 cashflow-subroutes) buiten de titel-SSoT | S2 | Toevoegen aan `EXTRA_ROUTE_TITLES`; dode "Tijdas"-regel weg | `resolveRouteTitle()` dekt alle 46 canonieke routes; vitest-guard toegevoegd |
| H-07 | B | doelen-widget, berichten, budgets, transacties | First-use empty states zonder CTA | S1 | WidgetEmpty + action-prop | Elke lege lijst: kop + zin + 1 CTA |
| F-04/F-05 | A | not-found.tsx / error.tsx | Dubbele identieke CTA; off-brand generiek foutscherm | S2 | Editorial restyle (Kicker + Playfair + ink-knop); dubbele CTA weg | Fout-/404-schermen volgen de krant-taal; één primaire CTA |
| E-06/E-07/C-06/B-08 | A | Bell-badge, notificatie-item, transactieform, potlood-knop | A11y-microgebreken (accessible name, focus, labels) | S2 | Per stuk eenregelige fix (zie bijlage) | aria-labels dragen tellingen; alle velden gelabeld; focus zichtbaar |
| A-05/A-07/A-08/A-09/A-10 | A | Auth-pagina's | Wachtwoordeisen onzichtbaar, form vóór sessie-check, 36px-knoppen, 1px focus | S2 | Hint-tekst, skeleton-guard, `min-h-11`, ring-2 | Zie per item bijlage |
| P-03 | C | overzicht-hero/empty-states.tsx | Eerste /overzicht na onboarding: rounded + amber/violet-hardcode + stone-900-CTA breekt de krant-stijl binnen de eerste minuut | S1 | Mechanische class-vervanging naar module-tokens + ink/paper | First-run empty state visueel identiek aan design-taal (scherp, tokens) |
| D-05 | A | pension-pdf-upload | Error-state belooft retry die niet bestaat | S2 | Bestand in state bewaren + echte "Opnieuw proberen"-knop | Retry verstuurt zonder opnieuw slepen |
| G-07 | B | holding-transaction-log, dividend-tracker, horizon-client e.a. | Hardcoded groen/rood 2,5:1 dominant over `text-positive`/`text-negative` | S1 | Sweep naar tokens; buy/sell-kleurenkaarten herontwerpen | 0 hardcoded semantische kleuren op kernschermen; visueel identiek gedrag |

**P1\* — status na Spoor 0 (12 jul 2026, zie §8):** H-01 **besloten** (ink-standaard + module-CTA op grote momenten) · H-06 **besloten** (ShellOverlay-plicht + sticky footer-knoppen + pill verbergen) · I-03 **besloten** (toast-standaard) · P-01/P-02 **vervallen** (vrijheidstijd blijft in Horizon/onboarding) · L-01/M-02 **vervallen** (/overzicht blijft zoals het is) · K-07 **besloten** (back-links weg) · E-05 **besloten** (undo) · J-05 **besloten** (advies → tips).

## 4. P2 — backlog (thematisch)

- **Token/stijl-sweeps:** G-02 rounded-sweep (~880, top: horizon-client 44, budgets-client 42, holdings-client 39) · G-05 schaduwen (45×) · G-01/G-03/G-04 freedom-card (hardcoded module-kleuren + canvas-fonts; respecteert accentkeuze niet) · nieuw `--warning`/`--positive-bg`-tokenpaar (na besluit).
- **Component-adoptie:** I-02 FormError + blur-validatie uitrollen · F-03/B-09 PageSkeleton per route-loading.tsx · H-04 FinTable-migratie (monthly-table, historical-comparison) · H-05 KassabonTable → KassabonShell+ReceiptRow · H-02 rounded-2xl-kaarten → CardEditorial · H-03 FiguresStrip-consolidatie rapportages/vermogen · I-06 InfoTooltip → InlineInfoDisclosure/GlossaryTerm.
- **Terminologie (J):** "Assetklasse"→Bezittingscategorie (J-01) · crypto-wizard "assets"→bezittingen (J-02) · aria "asset-groepen"→vermogensgroepen (J-03) · "potjes" vs budgetten (J-04, besluit) · "aanbevelingen"-CTA → tips + route /overzicht/tips i.p.v. /will (J-06) · "Verbind"→"Koppel" (J-07) · Title Case-cluster (J-08).
- **Structuur:** K-01 box1-kop gelijktrekken met box2/3; cashflow/budget + vaste-lasten PageOpening geven · K-02 Toekomst-hub dubbele hero ontstapelen; Mijn-hub sectie-ritme (besluit: settings-type?) · K-04 PageInfoButton-dekking + derde offset-variant saneren (besluit: welke pagina's) · K-06 drie sectiekop-mechanismen consolideren.
- **Interactie/motion:** O-01 widgets → useInViewAnimation (patroon bestaat in animated-progress-bar) · O-02 useFlashChange op vrijheid-strip/budgetten/wat-als · O-05 active-states + transition op save-knoppen (evt. `.btn-primary`-utility) · O-06 reduced-motion-vangnet · I-04 filter-state → URL + chips.
- **Dichtheid/responsive:** M-08 DensityToggle-patroon (4 lijsten >20 rijen) · M-09/M-10 tabular-nums + dag-headers · M-12 box1-tekstmuur opsplitsen · M-01 Katern I ontdichten · M-05/M-06 checkins/feedback-leegtes verrijken · N-01/N-06 sleep-hints · N-03/N-04 grid-cols-3 mobiele fallbacks · N-05 chat-pin resize-gedrag (besluit) · D-02/D-03/D-04 scenario-reset/persist/±20%-hint · B-06/B-07/B-10/B-11 import-verfijning · E-09 technische details achter beheer-vlag (besluit) · A-06 consent bij signup (compliance, besluit) · P-04 onboarding-foutbanner restyle · P-05 LevelUpCelebration (besluit) · F-06 focus bij stack-navigatie · C-03/C-05/C-07 copy/validatie/hints.

## 5. P3 — nice-to-have

M-11 zebra-striping · O-03 explainer-choreografie canoniseren of normaliseren · O-04 LeverageCard hover-lift · O-07 fadeUp breder · L-03 exit-links kleur/hiërarchie · L-05 masthead vs taaktitel (besluit) · B-12 sync-knop 44px · A-12/A-13 spinner/success-aria · E-08 textarea-focus na Wft · D-06 `.slider-module`-class · N-02 sleep-hint-gedrag uniformeren · J-08-restjes · rapportages/berichten masthead-normalisatie (K-01-rest) · P-06 Will-greeting toon + typo.

---

## 6. Top 5 quick wins (hoge impact, lage inspanning)

1. **Stille-fout-bundel** (E-01, E-03, E-04, D-03): ToastProvider bestaat — alleen aanroepen op bestaande catch-paden. Herstelt vertrouwen in de hele Will-lus in één werkblok.
2. **Auth-hardening-bundel** (A-01…A-05, A-07…A-10): referentie-implementatie staat al in onboarding; kopieerwerk. Beschermt het eerste contactmoment.
3. **A11y-microfixes** (D-01, F-01, E-06, B-08, C-06, A-12): stuk voor stuk eenregelig (aria-label, focus-outline, htmlFor) — samen halen ze de ergste WCAG-gaten uit de kernflows.
4. **Nav-config aanvullen** (K-05): 11 regels in `EXTRA_ROUTE_TITLES` + 1 dode regel weg; herstelt de single source of truth + mobiele titels.
5. **Sheet-hoogtevangnet + tap-targets** (N-07, B-02): `max-h-[92vh] overflow-y-auto` op 5 sheets en 44px-klikzones — mechanisch, direct mobiel voelbaar.

## 7. Top 3 structurele issues (ontwerpbeslissing nodig)

1. **De filosofie-cijferkloof** (P-01, P-02, L-01, M-02). "Geld = tijd" leeft in koppen, niet in cijfers; /overzicht mist het hoofdcijfer-anker en stapelt 13 signalen. Beslissing: wélk getal ankert /overzicht (vrijheidstijd? netto vermogen? gezondheid?) en welke bedragen krijgen inline tijd-equivalent. Daarna één uitrolronde over bezittingen/schulden/budget/transacties.
2. **De canon-tegenspraak** (H-06, H-01, + adoptiegat I-02/F-03/H-04). CLAUDE.md sanctioneert custom overlays die de skill verbiedt; er is geen Button-primitive dus 8 recepten. Beslissing: canon aanscherpen (CLAUDE.md-tekst), Button-primitive + uitzonderingslijst vastleggen, dan migratiesweeps.
3. **De feedback-architectuur** (I-03, F-05, P-04, P-05). Vier opslaan-patronen, één generiek foutscherm voor de hele app, geen mijlpaal-vieringen. Beslissing: één feedback-hiërarchie (wat krijgt toast/banner/inline/celebration) — daarna mechanische uitrol.

## 8. Besluiten Spoor 0 (opdrachtgever, 12 jul 2026)

**Richting:**
1. **/overzicht blijft zoals het is** — begroeting + kaarten, geen hoofdcijfer-anker; de huidige dichtheid is geaccepteerd → L-01 en M-02 **vervallen** (bewuste keuze).
2. **Vrijheidstijd-vertaling blijft beperkt** tot Toekomst/Horizon en onboarding → P-01 en P-02 **vervallen**; de spec-belofte "elk bedrag > €100 krijgt een tijd-equivalent" wordt bewust bijgesteld naar deze scope.
3. **Opslaan-feedback-standaard = korte toast** ("Genoteerd"), met 'ongedaan maken' waar mogelijk (I-03) → uitrol in Spoor 2/3.
4. **Mijlpalen worden gevierd, ingetogen** — krant-waardig celebration-patroon bij échte mijlpalen (eerste bezitting, doel 100%), nooit bij routine, geen confetti-regen (P-05) → Spoor 4.

**Design-canon:**
5. **Knoppen: 2 gesanctioneerde varianten** — inkt-zwart als standaard, module-kleur-CTA uitsluitend op grote momenten (onboarding-afronding, module-activatie, doel vastleggen). De overige 6 recepten migreren (H-01). ADR bij implementatie.
6. **Modals: één systeem (ShellOverlay) + uitzonderingslijst** (chat, command-palette, share, sleepmodus, sessie-timeout); CLAUDE.md-conventie aanscherpen (H-06). **Nieuwe standaard: sticky actieknoppen onderin elke sheet/venster, óók op klein scherm — en de FloatingNavButton wordt verborgen zolang een overlay open is.** ADR bij implementatie.
7. **Tokens toevoegen**: `--warning`-set + `--positive-bg`/`--negative-bg`-tinten; daarna de kleur-sweep (G-01/G-07).
8. **Toekomst-back-links weghalen** — shell regelt terugnavigatie; `ToekomstSubpageShell` migreren (K-07).
9. **PageInfoButton op álle inhoudspagina's** (cijfers/uitleg); pure instellingen-schermen niet (K-04).
10. **Mijn-hub blijft bewust simpel** settings-overzicht — vastgelegd als standaard, geen actie (K-02-Mijn).

**Flows:**
11. **Tips krijgen 'ongedaan maken'** na accepteren én negeren (E-05).
12. **Wat-als-reset: direct, met 5s undo-toast** + subtiel signaal wanneer bewaren op de achtergrond mislukt (D-02/D-03).
13. **Onboarding blijft 11 stappen** — bewust één vraag per scherm, geen actie (A-11).
14. **Import krijgt een terug-knop** met behoud van ingelezen rijen (B-03).
15. **DensityToggle (ruim/compact)** als gedeeld patroon op de 4 langste lijsten (M-08).
16. **Check-ins-leegte verrijken** (mini-trend + volgende check-in); **feedback-pagina blijft kaal** (M-05 ja, M-06 vervalt).

**Vertrouwen/compliance:**
17. **Registratie: zin met links** naar voorwaarden/privacy onder de knop — geen verplicht vinkje (A-06).
18. **"Vraag Will om advies" → "tips"** (J-05).
19. **Technische foutdetails in de chat: alleen voor beheerders** (E-09).
20. **"Budgetten" overal; "potjes" verdwijnt** (J-04).

**Mandaat — zelf af te handelen volgens de rapport-aanbevelingen (kort vastleggen per keuze):** L-05 (taaktitel prominenter naast de masthead), N-02 (scroll-detectie verplicht voor de sleep-hint), N-05 (chatpaneel responsieve breedte + lospinnen onder md), G-04 (freedom-card-fonts via FontFace laden), F-05 (editorial foutscherm met per-module terugkeer-CTA), C-07 (uitleg-hints bij jargon-velden), O-03 (explainer-choreografie als erkende variant vastleggen), K-02-Toekomst (dubbele hero ontstapelen).

## 9. Plan van aanpak (voorstel — geen Notion-registratie)

**Spoor 0 — Beslisronde. ✔ Afgerond 12 jul 2026** — alle besluiten staan in §8. De canon-besluiten (5 t/m 8) krijgen een ADR bij implementatie.

**Spoor 1 — P0: vertrouwensherstel. ✔ Afgerond 13 jul 2026** (bug-fix-pijplijn, 4 parallelle agents).
W1.1 Stille faalpaden (E-01 ✔ / E-03 ✔ / E-04 ✔ / D-03-catch ✔) · W1.2 Auth-hardening (A-01…A-05, A-07…A-10 ✔; nieuw `lib/auth-errors.ts`) · W1.3 A11y-kern (D-01 ✔, B-01 ✔, E-02 ✔, E-06 ✔, E-07 ✔, C-06 ✔, F-01 ✔) · W1.4 Mobiel (B-02 ✔, F-02 ✔, N-07 ✔). Bewijs: tsc exit 0, 53/53 nieuwe/geraakte tests (meerdere rood→groen), volledige suite 6.722 passed / 0 failed; code-review GO; security-gate SHIP-MET-OPMERKING. Review-verfijningen doorgevoerd: foutbanner uit de polite live-regio getild, persist-toast-guard reset na herstel, copy geüniformeerd. **Restpunten:** (1) visuele spotcheck op smal viewport (F-01/F-02/B-02/N-07) nog te doen bij eerstvolgende chromedev-run; (2) pre-existing account-enumeratie bij signup → apart backlog-item (server-side fix); (3) chat-panel/horizon-client/holding-transaction-log bevatten meeliftend ongecommit werk van andere sessies — bij commit isoleren.

**Spoor 2 — P1: kernflow-frictie. ✔ Afgerond 13 jul 2026 (commit 4d49d0b26)** — alle blokken W2.1-W2.7 gefixt; review-gates GO (budgets-seed-flits + undo-scoping in dezelfde ronde opgelost); suite 6759/0. Restpunten: B-04-serverfouten dekken alleen bekende codes; visuele checks → spotcheck-taak.
W2.1 Import & bank (B-03 terug-knop [besloten], B-04, B-05, B-07, B-10, B-11, B-06) · W2.2 Vermogen-routing + versheid (C-01, C-04 — eerst senior-dev-ontwerp `returnTo`; C-02, C-03) · W2.3 Foutscherm-familie (F-04, F-05-restyle, P-04) · W2.4 Nav-SSoT (K-05 + vitest-guard) · W2.5 Empty-state-CTA's (H-07) + P-03 first-run-restyle · W2.6 Will-lus-afronding (D-05, E-05 undo [besloten], D-02/D-03 undo-toast + faal-signaal [besloten], E-09 beheer-vlag [besloten]) · W2.7 Signup-consent-zin met links (A-06 [besloten]).

**Spoor 3 — Consistentie-sweeps. ✔ Afgerond 13 jul 2026 (commits f23ed82a9 + 9dfa0d99d)** — tokens (--warning/-bg-tinten), kleur-sweep 14 bestanden, Button-primitive + ADR 0038, overlay-standaard + pill-signaal + ADR 0039 + CLAUDE.md-aanscherping, terminologie, rounded-sweep ~312 hits (top-12), 10 overlays gemigreerd (4 bespoke = ADR-uitzondering met pill-signaal), PageSkeleton/FinTable/kassabon/confirm-adoptie, motion-dekking. Review GO; suite 6780/0. **Restpunten:** kleur-sweep-staart (±401 hits, merendeel legitiem buiten-scope — per-geval-oordeel), rounded-staart buiten top-12, donker-oppervlak-tokens (--positive-on-dark) voor freedom-card, InfoTooltip → editorial promoveren (8 consumers, mis-gescoped als duplicaat), RegelSectionLabel-consolidatie, FormError-uitrol budgets-client, ShellOverlay closeOnBackdropClick-prop voor read-only viewers, use-in-view-animation reducedMotion-flag (docstring-drift).
W3.1 Token-uitbreiding `--warning` + `--positive-bg`/`--negative-bg` [besloten] + semantische kleur-sweep (G-07) · W3.2 Rounded-sweep (G-02, per bestand scriptbaar; start bij top-10-overtreders) · W3.3 Button-primitive met 2 varianten [besloten: ink-standaard + module-CTA op grote momenten] + migratie van de overige 6 recepten (H-01, L-04) + ADR · W3.4 Modal-migratie 18 overlays → ShellOverlay + CLAUDE.md-aanscherping [besloten] — mét nieuwe standaard: sticky actieknoppen onderin elke sheet (ook mobiel) en FloatingNavButton verborgen zolang een overlay open is (H-06) + ADR · W3.5 Component-adoptie (I-02 FormError, F-03 PageSkeleton, H-04/H-05 tabellen, I-05 confirms, I-06) · W3.6 Terminologie-bundel (J-01/02/03/06/07/08 + J-04 budgetten-overal [besloten] + J-05 advies→tips [besloten]) · W3.7 Motion-dekking (O-01, O-02, O-05, O-06, D-06) + I-03-toast-standaard uitrollen [besloten]. Elke sweep: aparte branch/checkpoint, tsc + vitest + visuele spotcheck (chromedev) vóór merge.

**Spoor 4 — Verrijking. ✔ Afgerond 13 jul 2026 (commit volgt hieronder)** — box1-kerncijfer familie-conform + tekstmuur opgesplitst; SectionHeading geconsolideerd; Toekomst-hub ontstapeld via embedded-prop (legacy /horizon onaangetast); i-knop-uitrol (9 pagina's + PAGE_INFO-teksten); DensityToggle-patroon op 3 lijsten + dag-koppen holding-log; MilestoneCelebration (eerste bezitting + doel behaald, incl. opruiming 🎉-overtreding); check-ins verrijkt (cadence-helpers + sparkline + teaser). Twee stale review-premisses gecorrigeerd (K-01a/K-01b — verifieer-eerst). **Restpunten:** density op berichten-lijst, whatif-i-knop (dream-gate-oppervlak), EditorialEmptyState-primitive promoveren.
~~W4.1 Vrijheidstijd-uitrol~~ **vervallen** (besluit 2) · ~~W4.2 /overzicht-herontwerp~~ **vervallen** (besluit 1; L-02/L-03 blijven als kleine P2-kleurfixes) · W4.3 Structuur-polish (K-01, K-04 i-knop-uitrol [besloten: alle inhoudspagina's], K-06, M-12, Toekomst-hub ontstapelen [mandaat]) · W4.4 Scanbaarheid (M-08 DensityToggle [besloten], M-09/M-10) · W4.5 Celebrations — ingetogen, alleen échte mijlpalen [besloten] · W4.6 Check-ins-leegte verrijken (M-05 [besloten]; M-06 vervallen).

**Volgorde:** Spoor 0 ✔ afgerond. Spoor 1 kan direct starten (geen afhankelijkheden), daarna 2 → 3 → 4; binnen elk spoor zijn de werkblokken onafhankelijk en parallel uit te voeren. P3-items meenemen als bijvangst wanneer een sweep het bestand toch al raakt.

**Nazorg ✔ afgerond 13 jul 2026:** (1) Visuele spotcheck 375px (6✅/3❌/2⛔) — de 3 ❌'s direct gefixt in commit 72f5fa1b9: focus-regel naar @layer base (nav-pill-ring nu zichtbaar), PageInfoButton-popover viewport-clamp, root-404 editorial; bonus: 403-guard op news-peek. ⛔-rest: transacties-density + rij-focus niet toetsbaar (testaccount zonder transacties) en toast-positie — bij een account mét data alsnog checken. (2) Migratiedrift: beide 20260711*-migraties staan op remote (naams-drift, geen actie); ⚠ `20260713120000_db_slotwerk_rechten_policies` (parallelle sessie) staat NIET op remote → toepassen vóór deploy + dashboard-punt "Leaked password protection" aanzetten. (3) Enumeratie: neutrale signup-respons in commit bbf991f9d (config-onafhankelijk); dashboard: "Confirm email" aan houden.

**Definition of done per werkblok:** tsc groen · relevante vitest groen · voor zichtbare UI een chromedev-spotcheck op 360px + desktop · bevinding-ID's in de commit-message · dit document bijwerken (status-kolom) zodat het de levende bron blijft.

---

## Bijlage — volledige bevindingenlijst (per level, met bewijs)

### Level A — usability (55)

**First-run (A):**
- A-01 S1/P0 auth/callback stille redirect bij verlopen link (`app/auth/callback/route.ts:11-19`)
- A-02 S1/P0 geen try/catch auth-calls, knop blijft disabled (signup:27-43, login:27-40, forgot:19-30, reset:46-58)
- A-03 S1/P0 rauwe Engelse Supabase-errors (`setError(error.message)` 4×)
- A-04 S1/P0 foutmeldingen zonder role="alert" (4 pagina's)
- A-05 S1/P1 wachtwoordeisen niet vooraf zichtbaar (signup:114-122)
- A-06 S1/P2[VRAAG] geen privacy/voorwaarden-consent bij signup
- A-07 S2/P1 reset-form zichtbaar vóór sessie-check (reset-password:15-27)
- A-08 S2/P1 bevestigingsveld valideert alleen bij submit (reset-password:40-44)
- A-09 S2/P1 submit-knoppen ~36px (4 pagina's; `min-h-11` elders canoniek)
- A-10 S2/P1 focus-ring 1px (`focus:ring-1`)
- A-11 S2/P2[VRAAG] 11 content-stappen tot eerste waarde (onboarding:94-107, 282-298)
- A-12 S3/P2 spinner zonder role="status" (onboarding:1162-1168)
- A-13 S3/P3 success-states zonder aria-live/focus (signup:46-70, forgot:32-50)

**Cashflow (B):**
- B-01 S1/P0 transactierij div-onClick zonder toetsenbord (cash-account-view:2029-2038)
- B-02 S1/P0 bevestig-knop 16×16px (cash-account-view:2060-2069)
- B-03 S1/P1[VRAAG] import-wizard geen terug van stap 2 (core/cash/import/page.tsx)
- B-04 S2/P1 rauwe API-fout bank-connect (auth-link/route.ts:60-62 → connect/page.tsx:58)
- B-05 S2/P1 Postgres-fout in duplicaatcheck getoond (import:336)
- B-06 S2/P2 dode knop "Andere categorie kiezen" (ai-categorize-sheet:1318-1330)
- B-07 S2/P2 geen select-all bij duplicaten (import:1512-1519)
- B-08 S2/P1 potlood-knop zonder aria-label, 14px (cash-account-view:1659-1665)
- B-09 S2/P2 geen loading.tsx op cashflow-subroutes
- B-10 S2/P2 import-copy noemt alleen MT940 (import:1192)
- B-11 S2/P2 kolombadges [D][B][O] zonder legenda (import:1390-1395)
- B-12 S3/P3 sync-knop ~28px (connect/success:117-124)

**Vermogen & schulden (C):**
- C-01 S1/P1 herwaarderen → legacy /core/assets (assets-client:812; revalue:249)
- C-02 S1/P1 koers zonder tijdstempel (holdings/[id]/page.tsx:125-137)
- C-03 S2/P2 "Definitief verwijderen" bij soft-delete (asset-pane:446-465)
- C-04 S2/P1 router.replace naar legacy-boom (asset-category-page:326, debt-category-page:240)
- C-05 S2/P2 geen min/inputmode op eenheden/prijs (holding-transaction-log:661-702)
- C-06 S2/P1 labels zonder htmlFor/id (holding-transaction-log:627-716)
- C-07 S2/P2[VRAAG] WOZ/rente/jaar zonder hint (lib/asset-data.ts:656)
- C-08 S2/P1 rauwe err.message 4 plekken — DEELS DICHT (04-08-2026): asset-pane en debt-pane lopen nu via DELETE /api/{assets,debts}/[id] en tonen `data.error`; open blijven revalue:251 en holding-log:144
- C-Δ S3/P3 negatief bedrag in revalue-regex (revalue:167)

**Toekomst (D):**
- D-01 S1/P0 sliders zonder accessible name (whatif-sliders:162-170)
- D-02 S2/P2[VRAAG] scenario-reset zonder confirm/undo (horizon-client:2524, whatif-sliders:297)
- D-03 S2/P2[VRAAG] scenario-persist stil bij falen (horizon-client:2762-2768)
- D-04 S2/P2 ±20%-bereik niet uitgelegd (whatif-sliders:50-90)
- D-05 S2/P1 PDF-error belooft niet-bestaande retry (pension-pdf-upload:332-355)
- D-06 S3/P3 sliders niet op .slider-module-class (3 bestanden)

**Will-lus (E):**
- E-01 S1/P0 actiebord faalt stil (action-board:89-153)
- E-02 S1/P0 geen aria-live in chat (chat-panel:892)
- E-03 S1/P0 chat-kaart-acties falen stil (chat-panel:570-618)
- E-04 S2/P1 tips-decide faalt stil (tips-lijst:99-103)
- E-05 S2/P1[VRAAG] geen undo op tips-beslissingen
- E-06 S2/P1 bell-badge niet in accessible name (top-bar:167-175)
- E-07 S2/P1 notificatie-item zonder focus-ring (notification-item:86-95 vs globals:1579)
- E-08 S3/P3 geen re-focus na Wft-akkoord (chat-panel:405)
- E-09 S3/P2[VRAAG] rauwe serverdetails in prod-UI (chat-panel:812-824, 970-982)

**Shell/a11y (F):**
- F-01 S1/P0 focus-ring inkt-op-inkt op nav-pill (floating-nav-button:64 + globals:1579)
- F-02 S1/P0 toast overlapt mobiele TopBar (toast-provider:150 vs mobile-stack-shell:123)
- F-03 S2/P2 PageSkeleton* 0 imports; 9/9 route-skeletons ad-hoc met rounded
- F-04 S2/P1 not-found dubbele identieke CTA, off-brand (not-found:14-27)
- F-05 S2/P1[VRAAG] enige error-boundary generiek/off-brand (error.tsx:19-58)
- F-06 S3/P2 geen focus-verplaatsing bij stack-push/pop

### Level B — consistentie (33)

**Visueel (G):** G-01 S2/P2[VRAAG] freedom-card hardcoded module-kleuren + geen --warning-token (freedom-card:61-254) · G-02 S1/P2 ~880 rounded-overtredingen (top: horizon-client 44, budgets-client 42, holdings-client 39; editorial-laag: 2) · G-03 S2-S3/P2 hex-literals 70 bestanden (bill-calendar:415 gridlines → var(--rule-soft)) · G-04 S2/P2[VRAAG] freedom-card canvas system-ui i.p.v. Playfair/DM Mono · G-05 S3/P2 45 shadow-hits (toekomst-overlay 6) · G-06 S3 spacing schoon ✓ · G-07 S1/P1 hardcoded groen/rood 466/100 vs token 183/43.

**Componenten (H):** H-01 S1/P1*[VRAAG] 8 primary-knop-recepten (canoniek modal-footer:84-90; afwijkend o.a. error.tsx:48, empty-states:48, activation-button:143, onboarding-success:88) · H-02 S2/P2 rounded-2xl-kaarten (mijn/uiterlijk, notificaties, profiel, 3× loading.tsx) · H-03 S2/P2 FiguresStrip-typografie 17× handmatig in rapportages/vermogen · H-04 S2/P2 monthly-table + historical-comparison reïmplementeren FinTable · H-05 S3/P2 KassabonTable-handkopie (rapportages/[id]) · H-06 S1/P1*[VRAAG] 18/23 overlays buiten driewegregel; CLAUDE.md ↔ skill tegenspraak; 7× future/*-sheet migreerbaar · H-07 S1/P1 empty states zonder CTA (doelen-widget:90-134, berichten-client:290, budgets-client:3776, transacties-feed:282; EmptyStateCard is tweede variant) · H-08 S3 page-headers grotendeels gezond.

**Interactie (I):** I-01 S1/P0-P1 3 klik-implementaties, div-onClick op budget-tree:45/187/265, cash-account-view:1826/2029, action-card:115; 4 hover-gedragingen, geen canonieke · I-02 S2/P2 FormError slechts 2 bestanden; profiel hardcoded red/emerald; nergens blur-validatie · I-03 S2/P1*[VRAAG] 4 opslaan-feedbackpatronen (toast/inline/silent-close/alleen-error); doel-opslaan geen feedback (doel-bewerken-sheet:104-124) · I-04 S2/P2 filterstate URL vs useState gemengd; bezittingen-filter expliciet uit URL gehaald; nergens chips · I-05 S1/P1 5× window.confirm + eigen inline-confirm (household-budget-model:96, cash-account-view:945/958, budget-plan-editor:504/519, budgets-client:4067) · I-06 S3/P2 vierde info-mechanisme InfoTooltip (belasting) + 200+ title-attrs · I-07 S3 bedrag-klikbaarheid grotendeels ✓.

**Terminologie (J):** J-01 S2/P2 "Assetklasse" (holdings-heatmap:92) · J-02 S2/P2 "1. Assets"/"crypto-assets" (crypto-holdings.config:374-401) · J-03 S2/P2 aria "asset-groepen" (whatif-market-assumptions:152) · J-04 S2/P2[VRAAG] "potjes" vs "budgetten" (budgets-client:905/2394/2401) · J-05 S2/P1*[VRAAG] tooltip "advies" vs Wft-lijn (budgets-client:4151) · J-06 S2/P2 "Bekijk je aanbevelingen" → legacy /will (next-step-card:538/636) · J-07 S2/P2 "Verbind" vs "koppel" (next-step-card:266/410) · J-08 S3/P3 Title Case-cluster (discover-carousel:24-38, belasting-section:693+, scenarios-modal:136+). Aanspreekvorm "je": 100% consequent ✓.

**Structuur (K):** K-01 S2-S3/P2 opening-compliance 30/44; box1 eigen hero binnen belasting-familie; cashflow/budget+vaste-lasten geen opening; rapportages/berichten eigen (coherente) mastheads · K-02 S2/P2[VRAAG] Toekomst-hub dubbele hero; sectie-ritme hubs verschilt; Mijn kaal · K-03 S3 lijst→detail wisselend; bibliotheek eigen back-links · K-04 S2/P2[VRAAG] PageInfoButton grillig (Mijn 4/10, rapportages 1/7, 3 offset-varianten) · K-05 S2/P1 11 routes buiten nav-config-SSoT + dode "Tijdas"-regel · K-06 S2/P2 3 sectiekop-mechanismen (SectionLabel canoniek; SectionHeading gedupliceerd berichten/nieuws; RegelSectionLabel 14×) · K-07 S1/P1*[VRAAG] Toekomst 8/12 eigen back-links (ToekomstSubpageShell).

### Level C — kwaliteit (35)

**Hiërarchie (L):** L-01 S2/P1*[VRAAG] /overzicht H1=begroeting, geen hoofdcijfer-anker (overzicht-hero:276-283) · L-02 S2/P2 vaste kleur per kaart wijst nergens naar (hefboom-config:27-48 vs toekomst-nav-cards:207 dat het goed doet) · L-03 S3/P3 3 gelijkwaardige exit-links in violet op Kern-pagina (overzicht-hero:403-425) · L-04 S2/P2 toevoegen-CTA visueel niet primair (assets-client:811, debts:723) · L-05 S2/P3[VRAAG] identiek merk-wordmark als H1 op berichten én nieuws (masthead:81-87). Positief: tips-acties-page:83-93 correcte primaire CTA.

**Dichtheid (M):** M-01 S2/P2 Katern I bundelt 4 eenheden in ~1280-regel hero (horizon-client:3658-4937) · M-02 S1/P1*[VRAAG] /overzicht 13 signalen in Volledig-modus (page.tsx:41-43-comment bevestigt) · M-03 ✓ BudgetHub referentiepatroon · M-04 S3 vermogen-rapport ok · M-05 S2/P2[VRAAG] checkins-leegte zonder trend/teaser · M-06 S3/P2[VRAAG] feedback-pagina kaal · M-07 ✓ uiterlijk bewust verdund · M-08 S2/P2[VRAAG] geen dichtheids-toggle op 4 lijsten >20 rijen (holding-log ">100 rijen"-comment) · M-09 S2/P2 transacties-feed:372 bedrag mist text-right tabular-nums · M-10 S2/P2 holding-log tabular-nums + dag-headers ontbreken · M-11 S3/P3 zebra nergens · M-12 S2/P2 box1 JaarruimteUitleg 5 platte alinea's (box1:386-454) · M-13 ✓ onboarding/voorkeuren voorbeeldig.

**Responsiviteit (N):** N-01 S2/P2 historical-comparison mist sleep-hint (buurcomponent heeft 'm) · N-02 S3/P3[VRAAG] 3 sleep-hint-varianten (scroll-detectie vs always-on) · N-03 S2/P2 grid-cols-3 zonder fallback in maandstrip (cash-account-view:1393) · N-04 S3/P2 idem holding-editform (holdings-client:1582/1619) · N-05 S2/P2[VRAAG] chat-pin w-[420px] zonder resize-reset (chat-panel:841/867) · N-06 S2/P2 sim-chart jaar-tabel min-w-[780px] zonder hint · N-07 S2/P0 5/7 future-sheets zonder max-h/overflow-vangnet · N-08 ✓ net-worth-projection-chart referentie.

**Micro-interacties (O):** O-01 S2/P2 7 widgets buiten useInViewAnimation (swr-monitor, noodfonds, pensioen-aow, spaarquote, schulden, gezondheids-score, wilskracht) · O-02 S2/P2 useFlashChange alleen in /core (6 usages); niet op vrijheid-strip/budgetten/wat-als · O-03 S3/P3[VRAAG] 3 explainers eigen 2,8s-choreografie · O-04 S3/P3 LeverageCard mist hover-lift · O-05 S2/P2 geen active-state/transition op save-knoppen (budget-form:1109) · O-06 S2/P2 geen reduced-motion-vangnet voor kale transition-utilities · O-07 S3/P3 fadeUp smal toegepast. Geen decoratieve afleiders ✓; LevelUpCelebration bestaat niet (→ P-05).

**Merk & first-run (P):** P-01 S1/P1*[VRAAG] vrijheidstijd-vertaling ontbreekt buiten Horizon/onboarding (68 call-sites in 20 bestanden; 0 in assets/debts/cash/budgets/mijn/berichten/nieuws) · P-02 S1/P1* filosofie is tagline boven kale-euro-tabellen (debts:566-629, budgets-client:2056+) · P-03 S1/P1 first-run empty-states off-brand (empty-states:31-53: rounded + amber/violet-hardcode + stone-900-CTA) · P-04 S2/P2 onboarding-foutbanner off-brand (onboarding:1187-1223) · P-05 S2/P2[VRAAG] LevelUpCelebration nergens geïmplementeerd · P-06 S3/P3 Will-greeting toonbreuk + typo "financiele" (chat-panel:93).

---

*Gegenereerd 12 juli 2026 · methode: 13 parallelle review-agents (ux-review-expert) over 5 kernflows (Level A), 5 consistentie-dimensies (Level B) en 5 kwaliteitsdimensies (Level C) · statisch, geen live verificatie.*
