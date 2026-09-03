# E2e-smoke op een vers account — uitvoeringsplan (voorbereid 3 sep 2026)

Launch-audit NO-GO 3/4 (`docs/launch-audit-2026-07.md`, rij C/AC3). Notion-kaart
"Launch-audit · e2e-smoke op vers account (NO-GO 3/4)",
page-ID `3abf9e8d568a819e8b2df70a39008fa8`.

**Status: nog niet uitgevoerd.** Dit document is het geautomatiseerde/statische
deel van de kaart — een concreet, stapsgewijs uitvoeringsplan met verwachte
uitkomst per stap. Een echte live-run tegen productie (registratie, een
inlogsessie in een browser, productie-authdata muteren) vereist middelen die
in een autonome achtergrond-run niet veilig beschikbaar zijn: een mailbox om
de bevestigingslink te lezen, een levende browsersessie tegen de productie-URL,
en expliciete toestemming om productie-accountdata te muteren. Dat is bewust
niet in deze run uitgevoerd — zie "Correctie op de goedgekeurde Optie B"
hieronder voor waarom ook de eerder goedgekeurde snelkoppeling niet zomaar kan.

## Correctie op de goedgekeurde Optie B (belangrijk — lees dit eerst)

De kaart-`Notities` (3 sep 2026, nieuwste besluit) koos **Optie B**: een
account aanmaken via `POST /api/admin/test-users/create` in plaats van
Optie A (echte `/signup` + mailbevestiging), omdat de SMTP-kaart nog niet
volledig landde.

**Geverifieerd tegen de broncode (`app/api/admin/test-users/create/route.ts` +
`lib/test-personas.ts`, 3 sep 2026): die route maakt géén vers account.** Ze
loopt uitsluitend over de vaste `TEST_USER_ACCOUNTS`-lijst — de vijf
`<persona>@test.trifinity.nl`-adressen — en zet ze op een **hardcoded, gedeeld
wachtwoord** dat letterlijk in de routecode staat (zie
`app/api/admin/test-users/create/route.ts`; de waarde wordt hier bewust niet
herhaald — deze repo is publiek). Dat zijn precies de
accounts die de instructie voor deze kaart met naam uitsluit: *"de vijf
`@test.trifinity.nl`-accounts staan met een publiek wachtwoord in de repo —
gebruik die niet als 'vers account'."* Optie B zoals letterlijk goedgekeurd
voert dus **hetzelfde manco opnieuw in** dat de audit net probeert te bewijzen
dat niet gebeurt, en levert bovendien geen "vers" account op (dezelfde vijf
accounts bestaan al, met bekende, gelekte credentials).

Er is nu geen route die een **losstaand, opgeroepen e-mailadres** als
service-role admin-account aanmaakt (`auth.admin.createUser` met een
door-de-aanroeper opgegeven adres). Drie eerlijke vervolgen, geen van drie
uitgevoerd door deze run:

1. **Wachten op SMTP (Optie A alsnog)** — zodra de SMTP-productieconfig-kaart
   volledig landt (rij E in de audit staat nu op "console-acties open"), is
   een echte `/signup`-registratie met een leesbaar mailadres de zuiverste
   proef: die bewijst ook de mailketen zelf, wat het hele punt van de audit is.
2. **Een nieuwe, smalle admin-route bouwen** die één opgegeven e-mailadres
   aanmaakt (`email_confirm:true`, willekeurig eenmalig wachtwoord, geen
   koppeling aan `TEST_USER_ACCOUNTS`) — dekt onboarding→data→schermen zonder
   de mailketen, zonder de vijf gelekte accounts te hergebruiken. Dit is een
   kleine, geïsoleerde routewijziging; niet in deze run gebouwd omdat de kaart
   een **executie**-taak is (audit afvinken), geen bouwtaak, en het bouwen
   van een nieuwe productie-endpoint zonder owner-akkoord een aparte afweging
   is (nieuw admin-schrijfpad met service-role).
3. **De eigenaar voert de live-run zelf uit**, begeleid door de stappen
   hieronder, met een mailadres dat hij kan lezen.

## Stap-voor-stap (met verwachte uitkomst)

Voer uit tegen de productie-URL (`https://fin-first.vercel.app`, of de actieve
Vercel-preview). Vereist: een superadmin-account voor de allowlist-stap, en
een mailadres dat de uitvoerder kan lezen.

| # | Stap | Verwachte uitkomst |
|---|---|---|
| 1 | Log in als superadmin, ga naar `/beheer/allowlist`, voeg het verse mailadres toe. | Adres verschijnt in de lijst; bevestiging "`<adres>` staat nu op de lijst." |
| 2 | Ga (uitgelogd, of in een incognito-sessie) naar `/signup` en registreer met dat adres + een sterk, eenmalig wachtwoord. | Scherm "Controleer je e-mail" — geen foutmelding van de allowlist-hook (die zou wijzen op een gemiste stap 1). |
| 3 | Open de mailbox, klik de bevestigingslink. | Redirect naar `/auth/callback` → daarna naar `/onboarding`; sessie actief (geen herhaalde login gevraagd). |
| 4 | Loop de onboarding-stappen (11, `app/(onboarding)/onboarding/page.tsx`) door tot minstens de helft. | Elke stap accepteert invoer en gaat door naar de volgende zonder foutmelding. |
| 5 | **Regressie-check**: ververs de pagina (F5) midden in de flow. | De ingevoerde antwoorden blijven staan (server-side concept via `/api/onboarding/draft`) en er verschijnt de herstel-melding (`DRAFT_RESTORED_NOTICE`) — geen leeg formulier, geen verloren voortgang. **Statisch al gedekt**: `draft-restore-race.test.tsx` (WF-START-23) pint exact dit gedrag en staat groen (16/16 tests, 3 bestanden, geverifieerd 3 sep 2026 — zie Verificatie hieronder). De live stap is een bevestiging, geen eerste bewijs. |
| 6 | Rond onboarding af. | Redirect naar het homescherm (`/overzicht` tenzij anders gekozen); geen placeholder-nulrecords op het profiel (statisch gedekt door `no-placeholder-assets.test.ts`, ook groen). |
| 7 | Voeg één bezitting toe via quick-add. | Bezitting verschijnt in `/core/assets` met het juiste bedrag; geen console-error. |
| 8 | Importeer een kleine bank-CSV (3–5 transacties) via `/core/cash/import`. | Transacties verschijnen op `/core/cash`; totalen kloppen met de CSV; geen dubbele import bij een herhaalde upload van hetzelfde bestand (dedup-key, zie `import-specialist`-agentbrief). |
| 9 | Bezoek `/overzicht`, `/toekomst`, `/berichten`, `/mijn`. | Elke pagina rendert echte cijfers (geen NaN/"€ 0,00" op alles), geen error-envelope, geen onafgevangen console-error. `/berichten` en `/nieuws` mogen leeg zijn (crons liggen stil sinds 29 juli — lege staat is dan geen faal, zie eerdere analyse). |
| 10 | Log uit, navigeer naar een beveiligde route (`/toekomst`). | Redirect naar `/login?redirectTo=/toekomst` (zelfde assertie als de bestaande `smoke.spec.ts`). |
| 11 | Rond af: verslag (dit bestand aanvullen met datum/resultaat/screenshots), audit-rij C/AC3 → ✅, en het testaccount **verwijderen** (self-service `/api/account/delete`) of **promoveren** tot een nieuw `REGRESSION_TEST_EMAIL`-account met een privé wachtwoord (nooit in de repo). | Audit-blocker weg; geen extra publiek testaccount bijgekomen. |

## Verificatie uitgevoerd in deze run (3 sep 2026)

Alleen het statisch verifieerbare deel — geen live account aangemaakt, geen
productiedata gemuteerd:

- `npx vitest run "app/(onboarding)/onboarding/draft-restore-race.test.tsx" "app/api/onboarding/save-own-data/no-placeholder-assets.test.ts" "app/api/onboarding/save-own-data/route.test.ts"`
  → **3 bestanden, 16 tests, alle groen** (6,5s). Dit is de bestaande statische
  dekking van precies het reload-scenario dat stap 5 hierboven live herhaalt.
- Broncode-check van `app/api/admin/test-users/create/route.ts` +
  `lib/test-personas.ts` → bevestigt de correctie hierboven.

## Openstaand

- Live-uitvoering (stappen 1–11) — wacht op eigenaarskeuze tussen de drie
  vervolgen hierboven.
- `docs/launch-audit-2026-07.md` rij C/AC3 blijft ⏳ tot een live run
  daadwerkelijk groen is.
