# E2e-smoke op een vers account — uitvoeringsplan (voorbereid 3 sep 2026)

Launch-audit NO-GO 3/4 (`docs/launch-audit-2026-07.md`, rij C/AC3). Notion-kaart
"Launch-audit · e2e-smoke op vers account (NO-GO 3/4)",
page-ID `3abf9e8d568a819e8b2df70a39008fa8`.

**Status: nog niet uitgevoerd. Route gekozen op 26 sep 2026: de eigenaar loopt
de afvinklijst zelf (vervolg 3, zie hieronder).** Dit document is het geautomatiseerde/statische
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

## Gekozen route (26 sep 2026): de eigenaar loopt zelf

Eigenaarskeuze 26 sep 2026: **vervolg 3**. De eigenaar voert de live-run zelf
uit met onderstaande afvinklijst. Claude verwerkt de uitkomsten daarna in dit
bestand (sectie "Uitkomst live-run") en in rij C van
`docs/launch-audit-2026-07.md`. Er wordt geen nieuwe admin-route gebouwd.

**Let op de mailketen (stap 3).** Zolang er geen eigen SMTP/Resend is
ingericht, verstuurt Supabase de bevestigingsmail via de ingebouwde mailer.
Die heeft een laag uurlimiet en bezorgt standaard alleen aan adressen van
leden van het Supabase-team. Kies dus een adres dat je kunt lezen én dat
teamlid is. Het adres van je eigen TriFinity-account kan niet, want dat
bestaat al. Komt er binnen 10 minuten geen mail, noteer dat dan als
**bevinding** (de mailketen is precies wat SMTP moet oplossen). Ga daarna
verder door het account in het Supabase-dashboard handmatig te bevestigen
(Authentication → Users → het adres → "Confirm email"). Dat is een
productie-actie die je zelf doet. Noteer ook dat je hem deed, want dan is
stap 3 **niet** bewezen.

## Afvinklijst (met verwachte uitkomst)

Voer uit tegen de productie-URL `https://fin-first.vercel.app` in een
incognitovenster, en houd de browserconsole open (F12 → Console). Noteer per
stap ✅ of ❌. Maak bij een ❌ een schermafbeelding en noteer de console-melding.
Een ❌ is geen reden om te stoppen: noteer hem en ga door waar dat kan.

| ☐ | # | Stap | Verwachte uitkomst | Uitkomst |
|---|---|---|---|---|
| ☐ | 1 | Log (in een gewoon venster) in als superadmin, ga naar `/beheer/allowlist` en voeg het verse adres toe. | Het adres verschijnt in de lijst met de bevestiging "`<adres>` staat nu op de lijst." | |
| ☐ | 2 | Ga in het incognitovenster naar `/signup` en registreer met dat adres en een sterk, eenmalig wachtwoord. | Je ziet het scherm "Controleer je e-mail", zonder foutmelding van de allowlist (die zou op een gemiste stap 1 wijzen). | |
| ☐ | 3 | Open de mailbox en klik de bevestigingslink. Komt er geen mail, zie "Let op de mailketen" hierboven. | Via `/auth/callback` kom je op `/onboarding`, met een actieve sessie (niet opnieuw inloggen). | |
| ☐ | 4 | Doorloop de onboarding tot minstens groep 4 van 8 (naam → geboortedatum → inkomen → uitgaven → bezittingen → schulden). | Elke stap accepteert invoer en gaat zonder foutmelding door. | |
| ☐ | 5 | **Regressie-check:** ververs de pagina (F5) midden in de flow. | Je antwoorden staan er nog en je ziet de herstelmelding. Geen leeg formulier. Statisch al gedekt door `draft-restore-race.test.tsx` (WF-START-23), dus dit is een live bevestiging. | |
| ☐ | 6 | Rond de invulvragen af (pensioen → eindstrategie). De app slaat op, daarna volgen **budget inrichten** en **bank koppelen** (ADR 0156). Sla de bankkoppeling over. | De opslag slaagt. Budget en bank tonen zonder foutmelding, en overslaan werkt. | |
| ☐ | 7 | Op de samenvatting ("klaar"): klik "Begin met TriFinity". | Je landt op het homescherm (`/overzicht`, tenzij anders gekozen), zonder €0-placeholderrecords (statisch gedekt door `no-placeholder-assets.test.ts`). | |
| ☐ | 8 | Voeg één bezitting toe via quick-add. | De bezitting staat met het juiste bedrag in Bezittingen, zonder console-error. | |
| ☐ | 9 | Importeer een kleine bank-CSV (3–5 transacties) via `/core/cash/import`. Upload daarna **hetzelfde** bestand nog een keer. | De transacties verschijnen, de totalen kloppen met de CSV, en de tweede upload voegt niets dubbel toe. | |
| ☐ | 10 | Open een AI-functie (bv. Fin). Zonder AI-abonnement hoort de keuze "straks een abonnement, nu een keuze" te openen (ADR 0157). Kies "nee". | Je ziet de keuze met twee gelijkwaardige knoppen. Na "nee" blijft de app werken, zonder Fin. | |
| ☐ | 11 | Bezoek `/overzicht`, `/toekomst`, `/berichten`, `/nieuws` en `/mijn`. | Elke pagina rendert echte cijfers (geen NaN, niet overal "€ 0,00"), zonder foutmelding of console-error. `/berichten` en `/nieuws` mogen voor een vers account nog leeg zijn: de crons draaien weer sinds 15 sep, maar een briefing komt pas na de eerstvolgende run. | |
| ☐ | 12 | Onderaan `/mijn`: noteer het versienummer. | Het versienummer is `0.92.006` of hoger. | |
| ☐ | 13 | Log uit en ga naar `/toekomst`. | Je wordt doorgestuurd naar `/login?redirectTo=/toekomst`. | |
| ☐ | 14 | Log weer in en verwijder het account via `/mijn` (account verwijderen). Haal het adres daarna van `/beheer/allowlist`. | Het account is weg, inloggen lukt niet meer en er is geen extra testaccount bijgekomen. | |
| ☐ | 15 | Kijk als superadmin op `/beheer/errors` of er tijdens je run nieuwe foutsoorten bij zijn gekomen. | Geen nieuwe foutsoorten, of alleen soorten die je al bij een ❌ hebt genoteerd. | |

Klaar? Geef de ingevulde tabel (of alleen de ❌'s met toelichting) terug in
de sessie. Claude verwerkt ze in "Uitkomst live-run" hieronder en in rij C van
de launch-audit.

## Uitkomst live-run

_Nog niet uitgevoerd._

## Verificatie uitgevoerd in deze run (3 sep 2026)

Alleen het statisch verifieerbare deel — geen live account aangemaakt, geen
productiedata gemuteerd:

- `npx vitest run "app/(onboarding)/onboarding/draft-restore-race.test.tsx" "app/api/onboarding/save-own-data/no-placeholder-assets.test.ts" "app/api/onboarding/save-own-data/route.test.ts"`
  → **3 bestanden, 16 tests, alle groen** (6,5s). Dit is de bestaande statische
  dekking van precies het reload-scenario dat stap 5 hierboven live herhaalt.
- Broncode-check van `app/api/admin/test-users/create/route.ts` +
  `lib/test-personas.ts` → bevestigt de correctie hierboven.

## Openstaand

- Live-uitvoering (afvinklijst 1–15): de eigenaar loopt hem zelf (keuze 26 sep
  2026, vervolg 3).
- `docs/launch-audit-2026-07.md` rij C/AC3 blijft ⏳ tot een live run
  daadwerkelijk groen is.
