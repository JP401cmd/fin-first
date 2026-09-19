/**
 * Acceptatiecriteria — domein Publiek, registratie & onboarding (WF-START-01..26 /
 * UAT-START-01..26).
 *
 * Spiegelt exact de aanpak van `budget.ts`/`schuld.ts`/`toek.ts`/`bezit.ts`. Bron:
 * `docs/uat/uat-plan.md` Deel 1 (workflow-definities WF-START-01..26) + Deel 2 §2.8
 * (UAT-START-01..26, met uitgewerkte "Berekening verwachting"-secties voor de
 * rekenende scenario's).
 *
 * KERN-BEVINDING (bepaalt exact vs. ui-only): START is overwegend een
 * publieke/auth/onboarding-flow-zone — de meeste workflows zijn navigatie,
 * formulieren en server-redirects zonder eigen berekening ('ui-only'). Een
 * kleine kern is wél 'exact' herleidbaar op synthetische testpersonen uit het
 * UAT-plan zelf (Sanne Bakker — Vrijheidscheck; Jan de Vries — volledige
 * onboarding; Eva Jansen — bezittingen/schulden incl. huis+hypotheek):
 * WF-START-04 (prijs-constante), 06 (Vrijheidscheck-preview-cijfers), 08
 * (rapportcijfers — netto vermogen + canonieke buffer-maanden), 10
 * (spaarquote-conversie na activatie), 18 (spaarquote-preview + prefills +
 * recap-netto-vermogen), 19 (bezittingen/schulden-optelsom), 20
 * (pensioen-ingangsleeftijd-klem) en 28 (stap "Jouw
 * plan": validatie/route-toets/concept-herstel van stop-anker × eind-vorm, ADR
 * 0129 — pure functies uit plan-draft.ts, onboarding-plan.ts en
 * draft-persistence.ts). Geen enkele van deze criteria vereist Supabase/auth —
 * allemaal pure functies op letterlijke getallen uit het UAT-plan.
 *
 * De onboarding-stap "Spaardoel" is op 19-09-2026 geschrapt (ADR 0162,
 * eigenaarsbesluit B-056): WF-START-21/UAT-START-21 bestaan niet meer — de
 * standaard-invoerroute voor doelen is voortaan /toekomst/doelen. `TOTAL_GROUPS`
 * ging van 9 naar 8 groepen; alle "groep n/9"-vermeldingen hieronder zijn
 * bijgewerkt naar "n/8" (met de groepnummers zoals `STEP_GROUP_INDEX` ze nu
 * kent: naam/geboortedatum 1, inkomen/uitgaven/uitgaven_pensioen 2, bezittingen
 * 3, schulden 4, pensioen 5, eindstrategie 6, saving/budget/bank 7, klaar/success 8).
 *
 * TWEE "INLINE CLIENT-CALC"-workflows zonder los-exporteerbare pure functie
 * (spiegelt de figures-strip-mirror in `schuld-checks.ts` en de
 * spaardoel-mirror in `budget-checks.ts`): WF-START-06 (buffer-dekking in
 * `step-buffer.tsx`, jaarpreview in `step-inkomen.tsx`) en WF-START-19/18
 * (netto-vermogen-recap `netWorthForKlaar` in `app/(onboarding)/onboarding/page.tsx`)
 * — hier wordt de exacte formule MET bronregel-verwijzing gemirrord in
 * `start-checks.ts`, niet herïmplementeerd met eigen aannames.
 *
 * Het gezondheidsgetal en het vrijheids-% in het Vrijheidsrapport (WF-START-08)
 * zijn BEWUST NIET als hard cijfer opgenomen: het UAT-plan zelf noemt ze
 * "niet met de hand te herleiden tot op de euro" (horizon-kernel resp. een
 * gewogen 7-indicatoren-samenstelling) — daarom assert dit criterium alleen de
 * wél exact narekenbare onderdelen (netto vermogen, canonieke buffer-maanden).
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-START-01',
    scenarioId: 'UAT-START-01',
    titel: 'Landingspagina verkennen en doorklikken naar een startpunt',
    kriticiteit: 'BELANGRIJK',
    given: 'Uitgelogde browser, open de landingspagina (/).',
    when: 'De bezoeker klikt de hero-CTA\'s ("Vrijheidsrapport", "Ontdek hoe het werkt", "Begin gratis") en de filosofie-/prijs-deeplinks.',
    then: 'Elke CTA landt op de juiste route (/check, /functies, /signup, /veiligheid#methodologie, /prijzen); een ingelogde gebruiker die / opent wordt naar /overzicht teruggestuurd.',
    assertion: {
      kind: 'ui-only',
      source: 'zuivere navigatie/redirect-mapping, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-02',
    scenarioId: 'UAT-START-02',
    titel: 'Navigeren door de marketing-site (header en footer, desktop en mobiel)',
    kriticiteit: 'BELANGRIJK',
    given: 'Uitgelogde browser, open /functies.',
    when: 'De bezoeker navigeert via het wordmark, de desktop-nav, het mobiele hamburger-menu en footer-links.',
    then: 'Elke link landt op de juiste (deeplinked) route; een ingelogde gebruiker ziet i.p.v. "Inloggen"/"Begin gratis" een accountknop die naar /overzicht linkt.',
    assertion: {
      kind: 'ui-only',
      source: 'navigatie zonder cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-03',
    scenarioId: 'UAT-START-03',
    titel: 'Functies bekijken via pijler-deeplinks en de FAQ raadplegen',
    kriticiteit: 'OVERIG',
    given: 'Uitgelogde browser, open /functies.',
    when: 'De bezoeker springt naar de pijler-secties (#inzicht/#grip/#nu/#toekomst) en klapt onafhankelijk meerdere FAQ-items open/dicht.',
    then: 'Elke sectie is bereikbaar; FAQ-items klappen onafhankelijk van elkaar open/dicht.',
    assertion: {
      kind: 'ui-only',
      source: 'scroll/deeplink + disclosure-gedrag, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-04',
    scenarioId: 'UAT-START-04',
    titel: 'Prijzen vergelijken (Gratis versus Pro)',
    kriticiteit: 'OVERIG',
    given: 'De prijsteaser op /, de kaarten op /prijzen en de add-on-catalogus in de app (`/mijn/account`) moeten dezelfde prijs tonen.',
    when: 'De bezoeker vergelijkt de "Pro — €9/maand"-vermelding op de marketingpagina\'s met de commerciële catalogus die de app zelf gebruikt.',
    then: 'De AI-add-on (de in-app tegenhanger van de marketing-"Pro") heeft `priceEur = 9` in `ADDON_PLANS` — dezelfde €9 als op de landingspagina en /prijzen.',
    assertion: {
      kind: 'exact',
      expected: 'priceEur=9',
      source: "lib/subscription-catalog.ts#ADDON_PLANS.find(p => p.tier === 'ai').priceEur — canonieke commerciële catalogus, dezelfde bron als /mijn/account",
    },
  },
  {
    workflow: 'WF-START-05',
    scenarioId: 'UAT-START-05',
    titel: 'Vertrouwens- en juridische informatie lezen en contact opnemen',
    kriticiteit: 'OVERIG',
    given: 'Uitgelogde browser.',
    when: 'De bezoeker opent /veiligheid, /privacy, /wft en /contact en bekijkt de e-mailkaart.',
    then: 'Elke pagina laadt; /privacy en /wft tonen de concept-banner; de e-mailkaart op /contact is GEEN mailto-link maar toont de invulplek "[support-e-mailadres — volgt]" met de uitleg dat TriFinity nog geen eigen domein heeft.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/privacy/page.tsx + app/voorwaarden/page.tsx + app/contact/page.tsx (statische content) + lib/legal-contact.ts#LEGAL_CONTACT (address = null ⇒ placeholder i.p.v. mailto), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-06',
    scenarioId: 'UAT-START-06',
    titel: 'De Vrijheidscheck invullen en het rapport aanvragen',
    kriticiteit: 'KERN',
    given: 'Testpersoon "Sanne Bakker": netto maandinkomen €3.200, maanduitgaven €2.200 (Wonen €1.000 + Vaste lasten €700 + Vrij besteedbaar €500), buffer €6.600, bezittingen Spaargeld €15.000 + Beleggingen €8.000 (in die volgorde toegevoegd).',
    when: 'De bezoeker doorloopt stap ② (inkomen), ④ (buffer) en ⑤ (bezittingen) van de Vrijheidscheck-wizard.',
    then: 'Jaarpreview inkomen = €38.400. Buffer-dekking = 3,0 maanden. De live vrijgekocht-teller staat na de buffer-stap op 0 jaar/3 maanden en na de bezittingen-stap op 1 jaar/1 maand.',
    assertion: {
      kind: 'exact',
      expected: 'jaarInkomen=38400; bufferMaanden=3; tickerNaBufferJaren=0; tickerNaBufferMaanden=3; tickerNaBezitJaren=1; tickerNaBezitMaanden=1',
      source: 'components/check/intake/steps/step-inkomen.tsx (jaarpreview, gemirrord) + step-buffer.tsx (bufferdekking, gemirrord) + lib/format.ts#dailyExpenseRate/calculateFreedomTime (live vrijgekocht-teller, useFreedomTicker in check-wizard.tsx) — zie start-checks.ts',
    },
  },
  {
    workflow: 'WF-START-07',
    scenarioId: 'UAT-START-07',
    titel: 'De Vrijheidscheck onderbreken en later hervatten',
    kriticiteit: 'BELANGRIJK',
    given: 'Stappen ① t/m ③ van de check zijn ingevuld en de tab is gesloten zonder af te ronden.',
    when: 'De bezoeker opent /check opnieuw in dezelfde browser.',
    then: 'De wizard toont direct de eerstvolgende onvoltooide stap (④) met alle eerder ingevulde waarden intact (localStorage `vrijheidscheck_draft`); zonder opslagmogelijkheid (privé-modus) start de wizard stil weer bij stap ①.',
    assertion: {
      kind: 'ui-only',
      source: 'localStorage-herstel (lib/check/use-check-draft.ts), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-08',
    scenarioId: 'UAT-START-08',
    titel: 'Het Vrijheidsrapport lezen',
    kriticiteit: 'KERN',
    given: 'Sanne\'s ingevulde check (zie WF-START-06): Noodfonds €6.600 (cash), Spaargeld €15.000 (savings), Beleggingen €8.000 (investment), geen schulden, geen eigen woning, netto maandinkomen €3.200, maanduitgaven €2.200.',
    when: 'De bezoeker opent het Vrijheidsrapport (/check/rapport?token=...) en leest "Foto van nu" en het gezondheidsgetal.',
    then: 'Netto vermogen (FIRE-eligible, geen huis om te wegen) = €29.600 (exacte som). Canonieke buffer-dekking (`computeEmergencyFundMonths`, ALLEEN liquide types savings/checking/cash — Beleggingen telt niet mee) meet tegen de NORM-grondslag netto maandsalaris: 21.600/3.200 = 6,75 maandsalarissen, tegen een norm van 3. Bewust anders dan de 3,0-maanden-preview uit WF-START-06 (die deelde alleen het buffer-veld door de maanduitgaven, vóór de overige bezittingen bekend waren). Vrijheids-% en gezondheidsgetal zijn NIET hand-narekenbaar (horizon-kernel resp. 7-indicator-samenstelling) — alleen richting/orde-grootte toetsbaar, geen exact cijfer.',
    assertion: {
      kind: 'exact',
      expected: 'netWorth=29600; bufferMaandenCanoniek=6.75',
      source: 'lib/housing-strategy.ts#getFireEligibleNetWorth(29600, {eigenHuisValue:0, mortgageBalance:0}, {mode:"exclude_from_fire"}) + lib/health-score-input.ts#computeEmergencyFundMonths — zie start-checks.ts',
    },
  },
  {
    workflow: 'WF-START-09',
    scenarioId: 'UAT-START-09',
    titel: 'Het rapport downloaden als PDF',
    kriticiteit: 'OVERIG',
    given: 'Sanne\'s rapport is open.',
    when: 'De bezoeker klikt "Download als PDF".',
    then: 'De browser-printdialoog opent op een schone printweergave (interactieve chrome verborgen); zelfde cijfers als WF-START-08.',
    assertion: {
      kind: 'ui-only',
      source: 'window.print + print-stylesheet, geen eigen berekening',
    },
  },
  {
    workflow: 'WF-START-10',
    scenarioId: 'UAT-START-10',
    titel: 'Vanuit het rapport een account maken en de check activeren (conversie)',
    kriticiteit: 'KERN',
    given: 'Sanne\'s geactiveerde account: netMonthlyIncome €3.200 (bron: manual), estimatedMonthlyExpenses €2.200 (bron: manual), geen schulden.',
    when: 'De gebruiker opent /overzicht/budget/transacties na activatie (waar het grondslagblok sinds ADR 0135 woont).',
    then: 'Effectief jaarinkomen = €38.400; effectieve spaarquote = 31,25%; jaarlijks spaarbedrag = €12.000 — moet exact overeenkomen met wat de gebruiker later zelf narekent (SSoT-eis, zelfde motor als WF-START-18). DEZE DRIE GETALLEN ZIJN INVARIANT over de grondslag-tak die `resolveSavingsSource` sinds ADR 0103 draagt: Sanne staat op manual/manual, dus met én zonder het optionele `basis`-blok komt de uniforme (I − E) / I = (3.200 − 2.200) / 3.200 op 31,25% uit. De check-funnel zelf (`lib/check/build-report.ts`) blijft bewust op de legacy-tak — daar vult de gebruiker de bedragen zelf in.',
    assertion: {
      kind: 'exact',
      expected: 'effectiveAnnualIncome=38400; effectiveSavingsRatePct=31.25; baseAnnualSavings=12000',
      source: 'lib/savings-source.ts#resolveSavingsSource({incomeSource:"manual", expensesSource:"manual", netMonthlyIncome:3200, estimatedMonthlyExpenses:2200, ...})',
    },
  },
  {
    workflow: 'WF-START-11',
    scenarioId: 'UAT-START-11',
    titel: 'Registreren zonder check',
    kriticiteit: 'KERN',
    given: 'Uitgelogde browser, open /signup.',
    when: 'De bezoeker registreert met e-mail + wachtwoord (6+ tekens).',
    then: 'Succes-scherm "Controleer je e-mail"; na bevestiging en `onboarding_completed=false` stuurt de app-layout naar /onboarding.',
    assertion: {
      kind: 'ui-only',
      source: 'supabase.auth.signUp + onboarding-poort, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-12',
    scenarioId: 'UAT-START-12',
    titel: 'Inloggen',
    kriticiteit: 'KERN',
    given: 'Bestaand account met bekend wachtwoord.',
    when: 'De gebruiker vult e-mail + wachtwoord in en klikt "Inloggen" (evt. met `?redirectTo=`).',
    then: 'Bij succes navigatie naar het veilige redirect-doel (redirectTo indien aanwezig en veilig, anders /dashboard — het "ga naar home"-doel dat de middleware naar het gekozen homescherm vertaalt, profiles.home_screen, default /overzicht); onveilige redirectTo-waarden vallen terug op datzelfde /dashboard.',
    assertion: {
      kind: 'ui-only',
      source: 'signInWithPassword + lib/safe-redirect.ts, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-13',
    scenarioId: 'UAT-START-13',
    titel: 'Wachtwoord vergeten: resetlink aanvragen',
    kriticiteit: 'BELANGRIJK',
    given: 'Bestaand of onbekend e-mailadres, open /forgot-password.',
    when: 'De gebruiker vult het e-mailadres in en klikt "Verstuur resetlink".',
    then: 'Hetzelfde bevestigingsscherm verschijnt ongeacht of het e-mailadres bestaat (privacy-gedrag, geen lek).',
    assertion: {
      kind: 'ui-only',
      source: 'resetPasswordForEmail, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-14',
    scenarioId: 'UAT-START-14',
    titel: 'Nieuw wachtwoord instellen',
    kriticiteit: 'BELANGRIJK',
    given: 'Geldige recovery-sessie op /reset-password.',
    when: 'De gebruiker vult een nieuw wachtwoord (6+ tekens, twee keer gelijk) in en slaat op.',
    then: 'Succes-scherm met automatische doorverwijzing naar /overzicht; zonder geldige recovery-sessie toont de pagina "Link verlopen of ongeldig".',
    assertion: {
      kind: 'ui-only',
      source: 'updateUser + sessie-check, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-15',
    scenarioId: 'UAT-START-15',
    titel: 'Uitloggen',
    kriticiteit: 'BELANGRIJK',
    given: 'Ingelogde gebruiker (app-navigatie of marketing-header-accountmenu).',
    when: 'De gebruiker klikt "Uitloggen".',
    then: '/logout beëindigt de sessie en stuurt door naar / (of /login?blocked=1 bij een blokkade-redirect); een beveiligde pagina is daarna niet meer bereikbaar zonder opnieuw in te loggen.',
    assertion: {
      kind: 'ui-only',
      source: 'signOut + router.replace, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-16',
    scenarioId: 'UAT-START-16',
    titel: 'Routebescherming ervaren (heen én terug)',
    kriticiteit: 'BELANGRIJK',
    given: 'Afwisselend uitgelogde en ingelogde staat.',
    when: 'De tester opent beveiligde routes uitgelogd, publieke check-routes uitgelogd, en publieke auth-pagina\'s ingelogd; roept een beveiligde API-route uitgelogd rechtstreeks aan.',
    then: 'Beveiligde routes → login-redirect met `redirectTo` (en terugkeer na inloggen); /check en /check/rapport blijven publiek bereikbaar; ingelogd op /, /login, /signup, /forgot-password of /dashboard → automatische redirect naar het gekozen homescherm (profiles.home_screen; default /overzicht, keuze "budget" → /overzicht/budget); een beveiligde API-route geeft uitgelogd JSON 401, geen HTML-redirect.',
    assertion: {
      kind: 'ui-only',
      source: 'proxy.ts + lib/supabase/proxy.ts publieke/beschermde padenlijst, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-17',
    scenarioId: 'UAT-START-17',
    titel: 'Welkomstpopup bij eerste binnenkomst in onboarding',
    kriticiteit: 'OVERIG',
    given: 'Verse reset via "Onboarding starten", eerste bezoek aan /onboarding zonder herstelbaar concept.',
    when: 'De gebruiker landt op /onboarding en sluit de popup (knop of ESC).',
    then: 'De popup verschijnt éénmalig (localStorage-flag `trifinity_onboarding_welcome_seen`) en komt bij verversen niet terug; bij een herstelbaar concept verschijnt de popup bewust niet. INHOUD sinds 19-09-2026 (B-052; van 17 t/m 19 sep stonden hier vier waardes, daarvóór twee alinea\'s proza): na de kop "Welkom bij TriFinity" en de tagline "Geld is opgeslagen tijd." staan twee regels — "TriFinity telt op wat je hebt en wat er elke maand omgaat, en rekent dat om naar tijd: de datum waarop werken een keuze wordt. Fin laat zien wat één keuze met die datum doet." en "We beginnen met een korte onboarding: een paar vragen, in een paar minuten klaar. Alles wat je invult, kun je later nog aanpassen." — en de CTA "Start de onboarding →". De vier waardes (Wat je hebt / Wat er omgaat / Waar het op uitloopt / Waar je op kunt sturen) staan NIET meer in de popup; ze leven in `lib/onboarding/waardes.ts` en horen op het successcherm ná de onboarding (W-015). De kicker-streep en de italic-em dragen het getrokken accent van déze gebruiker (WF-START-39): de popup portalt naar `document.body` en krijgt die vars expliciet mee via de `colorVars`-prop, dus de popup staat nooit in de standaardkleuren terwijl het scherm eronder de getrokken kleuren draagt. Er is geen sluit-X; sluiten kan alleen via "Start de onboarding →" of ESC; de popup past op 390×844 zonder interne scroll (de begroeting staat boven de vouw).',
    assertion: {
      kind: 'ui-only',
      source: 'components/onboarding/welcome-popup.tsx (twee-regelige kopij, CTA, colorVars-prop, focus-trap + scrollTop-reset) + lib/onboarding/waardes.ts (verhuisde WAARDES, consument W-015) + localStorage-flag in app/(onboarding)/onboarding/page.tsx, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-18',
    scenarioId: 'UAT-START-18',
    titel: 'Onboarding volledig doorlopen en in de app landen',
    kriticiteit: 'KERN',
    given: 'Testpersoon "Jan de Vries": netto maandinkomen €3.000, maanduitgaven €2.100, bezittingen (Betaalrekening €2.500 + Spaargeld €18.000 + Beleggingen €12.000 = €32.500), schulden (Studieschuld €9.000).',
    when: 'De gebruiker begint bij "naam" — de AI-keuze is met ADR 0157 uit de onboarding gehaald (WF-START-30 speelt nu pas in de app) — en doorloopt de stappen "inkomen"/"uitgaven" (spaarquote-preview), "uitgaven na pensioen" (prefill), "Jouw plan" (standaardpad — twee vragen, zie WF-START-28) en "klaar" (recap). De stap "Spaardoel" bestaat sinds 19-09-2026 niet meer (ADR 0162) — doelen leg je voortaan vast via /toekomst/doelen. Na "Begin met TriFinity" volgt sinds ADR 0156 NIET direct het successcherm: ná de opslag komen eerst de afrondingsstappen budget (WF-START-31..33) en bank (WF-START-34..36) in groep 7/8, pas daarna het successcherm (groep 8/8) en de landing in de app.',
    then: 'Spaarquote-preview = 30%. Pensioen-uitgaven-prefill = €20.160/jaar (80% × €2.100 × 12). Recap netto vermogen = €32.500 − €9.000 = €23.500. De meelopende vrijheidstijd-teller staat na de derde bezitting op 1j 3m over €32.500 en blijft daar staan als de studieschuld erbij komt — de intake-grondslag telt de eigen woning niet mee en trekt schulden er niet af, zodat het getal tijdens het invullen nooit daalt (bevinding H12). Ná activatie moet het grondslagblok op /overzicht/budget/transacties exact dezelfde 30% spaarquote tonen (SSoT-eis, zelfde motor als WF-START-10).',
    assertion: {
      kind: 'exact',
      expected:
        'spaarquotePreview=30; pensioenPrefill=20160; nettoVermogenRecap=23500; vrijheidsteller=1j 3m; tellerBedrag=32500',
      source: 'components/onboarding/onboarding-inkomen.tsx (previewRate-formule, gemirrord) + lib/onboarding/retirement-prefill.ts#computeRetirementPrefill + netWorthForKlaar (app/(onboarding)/onboarding/page.tsx, gemirrord) + lib/freedom-ticker.ts#computeFreedomTicker — zie start-checks.ts',
    },
  },
  {
    workflow: 'WF-START-19',
    scenarioId: 'UAT-START-19',
    titel: 'Bezittingen en schulden toevoegen tijdens onboarding (huis + hypotheek-koppeling)',
    kriticiteit: 'KERN',
    given: 'Testpersoon "Eva Jansen": Betaalrekening €1.800, Spaargeld €10.000, Eigen huis €340.000 met gekoppelde hypotheek €280.000 (rente 3,2%, maandlast €1.100), Autolening/private lease €8.000.',
    when: 'De gebruiker doorloopt de bezittingen- en schulden-secties en bekijkt de sectie-review + de klaar-stap-recap.',
    then: 'Totaal bezittingen = €1.800 + €10.000 + €340.000 = €351.800. Totaal schulden = €280.000 (hypotheek) + €8.000 (autolease) = €288.000. Netto vermogen = €351.800 − €288.000 = €63.800. De schulden-sectie opent sinds 19-09-2026 (B-054, ADR 0164 — herziening van H13) direct op ÉÉN aanvinkraster met de volledige catalogus: de vier meest voorkomende soorten (hypotheek, studielening, persoonlijke lening, autolening) vooraan onder "Meest voorkomend", de rest onder "Andere schulden"; geen ja/nee-kopvragen meer, dus 1 scherm bij "geen schulden". Elke schuldsoort die al via een bezitting gekoppeld is staat uitgeschakeld in het raster mét herkomst ("al opgegeven via je woning") — hier dus de hypotheek-tegel, en zo ook de autolening-tegel zodra de autolease aan een voertuig hangt. Per aangevinkt type opent de gedeelde QuickAddWizard; ná elke toevoeging volgt "Nog een …?" zodat meerdere schulden van hetzelfde type kunnen.',
    assertion: {
      kind: 'exact',
      expected: 'totaalBezittingen=351800; totaalSchulden=288000; nettoVermogen=63800',
      source: 'directe optelsom (netWorthForKlaar-mirror, app/(onboarding)/onboarding/page.tsx) op de Eva-fixture — zie start-checks.ts',
    },
  },
  {
    workflow: 'WF-START-20',
    scenarioId: 'UAT-START-20',
    titel: 'Pensioen opgeven tijdens onboarding (schatting, upload of overslaan)',
    kriticiteit: 'KERN',
    given: 'De pensioen-stap (groep 5/8): schatting-pad met ingangsleeftijd-invoer, geklemd tussen 50 en 75, met de AOW-leeftijd van de gebruiker als fallback (placeholder + hint tonen die leeftijd). Een inschat-hulp kan het bedrag vullen uit bruto jaarsalaris × jaren opbouw; zijn geboortedatum én netto maandinkomen bekend, dan staat daar de knop "Schat het voor me" (B-055, 19-09-2026) die beide velden zichtbaar en bewerkbaar vóórvult (bruto = exacte Box 1-inversie van het netto, jaren = leeftijd − 25).',
    when: 'De gebruiker vult een geldige ingangsleeftijd binnen het bereik (75, de bovengrens) resp. laat het veld leeg/ongeldig in; en klikt in de inschat-hulp op "Schat het voor me" en daarna "Neem over".',
    then: 'Een geldige waarde binnen [50,75] (bv. 75) wordt ongewijzigd overgenomen; een ontbrekende/ongeldige waarde valt terug op de AOW-leeftijd van de gebruiker (uit `aow_leeftijd` o.b.v. geboortedatum, bv. 68); zonder geboortedatum/AOW-rijen blijft 67 de laatste fallback. De inschat-hulp toont het bedrag afgerond op €25 als "bruto per maand aan werkgeverspensioen" en zegt in een aparte zin "Dit is niet je AOW" met het SVB-AOW-bedrag als contrast; na "Neem over" draagt het bedragveld het label "(schatting)", dat verdwijnt zodra de gebruiker zelf typt. Zonder geboortedatum of inkomen is er geen knop (wel de handmatige hulp).',
    assertion: {
      kind: 'exact',
      expected: 'ingangsleeftijdGeldig=75; ingangsleeftijdAowFallback=68; ingangsleeftijdDefault=67',
      source: 'app/(onboarding)/onboarding/page.tsx buildPensionParseResult(p, fallbackAge) — leeg/ongeldig → geklemde AOW-fallback, anders 67 (gemirrord) — zie start-checks.ts',
    },
  },
  {
    workflow: 'WF-START-29',
    scenarioId: 'UAT-START-29',
    titel: '"Schat het voor me": een geschat bedrag dat zich als schatting bekendmaakt',
    kriticiteit: 'KERN',
    given: 'Onboarding met een ingevulde geboortedatum, op de inkomen-stap; het bedrag is niet bekend bij de gebruiker.',
    when: 'De gebruiker klikt "Schat het voor me" op het inkomen-scherm én op het uitgaven-scherm, rondt de onboarding af, bekijkt /overzicht en /overzicht/belasting, en vervangt daarna het bedrag door een eigen bedrag via het grondslagblok op /overzicht/budget/transacties of via /mijn/profiel.',
    then: 'De knop vult het veld ZICHTBAAR met het CBS-cohortbedrag van zijn leeftijdsband (25–35 → €3.075 inkomen, €2.800 uitgaven) met de regel "Geschat op basis van je leeftijd"; de uitgavenschatting volgt een zélf getypt inkomen via de referentie-spaarquote. Het eindscherm toont het dagtarief én "zo bouw je er X per maand bij" — óók zonder bezittingen (criterium 4), met de kicker "Netto/mnd · geschat". Na afronden staat `profiles.income_source`/`expenses_source` op \'estimate\' (NIET \'manual\'), zodat het label meereist (spaarquote-widget, cashflow-instellingenblok, dagtarief-voetnoot "een schatting op basis van je leeftijd") én een bankkoppeling of budget de gok vanzelf verdringt. Vult de gebruiker een eigen bedrag in, dan wordt de bron \'manual\' en verdwijnt het voorbehoud op álle oppervlakken tegelijk (criterium 3). "Later invullen" blijft bestaan en wist ook de schattingsmarkering.',
    assertion: {
      kind: 'ui-only',
      source: 'lib/benchmark/cohort-estimate.ts (estimateCohortIncomeExpenses/cohortExpensesFromIncome — dezelfde afleiding als computeReferencePeer) + app/api/onboarding/save-own-data/route.ts (estimatedFields → income_source/expenses_source = \'estimate\') + lib/expense-rate.ts (fallbackSource \'cohort\') + lib/format.ts#formatFreedomRateFootnote. Cijfers vergrendeld in lib/benchmark/cohort-estimate.test.ts en lib/expense-rate.cohort.test.ts; hier is de toets de doorwerking op het scherm.',
    },
  },
  {
    workflow: 'WF-START-22',
    scenarioId: 'UAT-START-22',
    titel: 'Velden uitstellen met "Later invullen" (defer-pad)',
    kriticiteit: 'BELANGRIJK',
    given: 'Onboarding op de inkomen-stap, evt. met al ingevuld bedrag; en de bezittingen-sectie.',
    when: 'De gebruiker klikt "Later invullen" (inkomen) en/of rondt de bezittingen-sectie af zonder een bezitting toe te voegen. De stap "Spaardoel" bestaat sinds ADR 0162 (19-09-2026) niet meer — het bijbehorende defer-pad ("Sla over →") is dus vervallen; `DeferredFieldKey` kent de waarde `spaardoel` alleen nog als legacy-waarde voor bestaande profielen/concepten van vóór die datum.',
    then: 'De overgeslagen velden worden als deferred fields opgeslagen (`profiles.feature_preferences.deferred_onboarding_fields`) en voeden na onboarding de coach-bubble; "Later invullen" wist bewust ook een reeds ingevuld bedrag; het afronden van de bezittingen-sectie zonder enige bezitting zet automatisch de deferred-key `assets`.',
    assertion: {
      kind: 'ui-only',
      source: 'DEFER_FIELD-dispatch + coachDeferredFields, geen cijfermatige uitkomst (afwezigheid van data, geen berekening)',
    },
  },
  {
    workflow: 'WF-START-23',
    scenarioId: 'UAT-START-23',
    titel: 'Onboarding onderbreken en hervatten (concept-herstel)',
    kriticiteit: 'BELANGRIJK',
    given: 'Enkele stappen ingevuld (incl. naam, geboortedatum, inkomen, een bezitting), tab gesloten of pagina ververst zonder af te ronden.',
    when: 'De gebruiker opent /onboarding opnieuw.',
    then: 'Herstel-melding "Verder waar je was" (neutraal, geen groen vinkje), terug op de opgeslagen stap MÉT alle eerder gegeven antwoorden — naam, geboortedatum, bedragen, bezittingen en schulden staan er weer (concept op de eigen profielrij, ADR 0122). Alleen een geüpload pensioenoverzicht komt niet terug (ADR 0115: dat blijft op het toestel) en de melding zegt dat met zoveel woorden. Een concept van vóór 5 sep 2026 met `fire_end_strategy: "pensioen"` komt terug als anker AOW × eind-vorm deplete in de stap "Jouw plan" (exact getoetst in WF-START-28). De finish-guard stuurt een afrondpoging met een nog lege verplichte naam/geboortedatum terug naar die stap. Een concept dat niet verder kwam dan `naam` — of dan de inmiddels verwijderde AI-keuzestap (`lastStep` = `ai_keuze`, ADR 0155 → 0157; die heelt naar `naam`) — telt — zonder andere keuzes — níet als hervatbaar: geen herstel-melding. Hervatten ná de opslag (open budget-/bankstap) is geen concept-herstel maar de afrondingsmarkering — zie WF-START-37.',
    assertion: {
      kind: 'ui-only',
      source: 'app/(onboarding)/onboarding/draft-persistence.ts (serializeDraft/sanitizeStoredDraft/firstIncompleteRequiredStep) + app/api/onboarding/draft/route.ts + app/(onboarding)/onboarding/page.tsx (restoreChecked-poort: persisteren mag pas ná de restore-poging), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-24',
    scenarioId: 'UAT-START-24',
    titel: 'Fout bij het afronden van onboarding herstellen (retry)',
    kriticiteit: 'BELANGRIJK',
    given: 'Volledig ingevulde onboarding op de laatste vraag (eindstrategie); netwerk/server faalt bij het opslaan. Sinds 17-09-2026 (ADR 0156) start de opslag na die vraag; budget, bank en de samenvatting met "Begin met TriFinity" volgen pas daarna.',
    when: 'De gebruiker klikt "Verder" op de laatste vraag terwijl de opslag faalt, herstelt de oorzaak en klikt "Opnieuw proberen".',
    then: 'Sticky foutbanner met leesbare oorzaak (timeout/netwerk/serverfout); alle ingevulde data blijft intact; retry hergebruikt dezelfde idempotency-key (geen dubbele bezittingen/doelen); voortgangsbalk blijft op max 90% tot een geslaagde poging.',
    assertion: {
      kind: 'ui-only',
      source: 'handleSaveOwnData + idempotency-key (app/(onboarding)/onboarding/page.tsx), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-25',
    scenarioId: 'UAT-START-25',
    titel: 'Uitloggen vanuit onboarding',
    kriticiteit: 'OVERIG',
    given: 'Onboarding gestart, enkele stappen ingevuld.',
    when: 'De gebruiker klikt de tekstknop "Uitloggen" rechtsboven.',
    then: 'Het onboarding-concept op de eigen profielrij wordt gewist (DELETE /api/onboarding/draft) én de schrijver verzegeld, zodat een nog lopende gedebouncede schrijf het niet opnieuw aanmaakt; de sessie wordt beëindigd en de gebruiker landt op /login. Bij opnieuw inloggen komt hij terug in /onboarding zonder hersteld concept. De knop is bewust verborgen op het opslag-/succes-scherm.',
    assertion: {
      kind: 'ui-only',
      source: 'handleLogout (app/(onboarding)/onboarding/page.tsx) + createDraftWriter#clear (app/(onboarding)/onboarding/draft-transport.ts), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-26',
    scenarioId: 'UAT-START-26',
    titel: 'Overgang onboarding → app (landing en poorten)',
    kriticiteit: 'BELANGRIJK',
    given: 'Een vers-geonboarde gebruiker en een reeds-geonboarde gebruiker.',
    when: 'De vers-geonboarde gebruiker klikt "Naar je overzicht"; de reeds-geonboarde gebruiker opent handmatig /onboarding; een niet-geonboarde gebruiker opent direct een app-route.',
    then: 'Harde navigatie naar /dashboard zonder terug-flits naar /onboarding — de middleware vertaalt /dashboard naar het gekozen homescherm (profiles.home_screen, standaard /overzicht), dus de landing is het EIGEN hoofdscherm en niet een vaste route (ADR 0130); een reeds-geonboarde gebruiker die /onboarding opent → redirect naar /dashboard (de middleware vertaalt naar het gekozen homescherm); een niet-geonboarde gebruiker die een app-route opent → redirect naar /onboarding. Op het successcherm zelf staat sinds APP-2 (nazorg eenvoudige weergave, 11 aug 2026) één regel die de weergavekeuze noemt: "Rustig beginnen of meteen alle detail? Je weergave kies je later bij Mijn → Weergave en uiterlijk." Twee eigenschappen daarvan zijn te toetsen en bewust zo: de regel is GEEN link (klikken doet niets — een soft-navigation hiernaast zou de `clearLocalStorage()` + harde navigatie van de CTA omzeilen), en hij is NIET modus-afhankelijk (de `DisplayModeProvider` hangt alleen in de (app)-groep, dus buiten die groep zou elke modus-tekst op de \'simple\'-fallback landen — ADR 0026). Sinds W-015 (19 sep 2026) toont het scherm bovendien de VIER WAARDES uit `lib/onboarding/waardes.ts` (Wat je hebt · Wat er omgaat · Waar het op uitloopt · Waar je op kunt sturen), elk met een kicker-streep in zijn eigen accent — 2×2 op desktop, één kolom op mobiel. Ze vervangen de "TriFinity bestaat uit twee modules"-alinea en de twee feature-kaarten: die indeling bestaat sinds 15 sep niet meer (het menu is plat). De waardes zijn STATISCH — bewust geen eigen cijfer, want op het bank-herlaadpad (`recapAvailableRef === false`) zijn de sessie-antwoorden weg. De kleuren komen uit de page-wrapper (`stepTintStyle`), dus ze volgen de accentkeuze van deze gebruiker; er is géén `colorVars`-prop. De cijfers zelf zijn al gedekt door WF-START-18/19; hier telt alleen de landing/poort-navigatie plus de aanwezigheid van die zes vaste tekstblokken.',
    assertion: {
      kind: 'ui-only',
      source: 'window.location.assign + onboarding-poort in app/(app)/layout.tsx + components/onboarding/onboarding-success.tsx (statische copy, vier waardes uit lib/onboarding/waardes.ts) + components/onboarding/onboarding-success.test.tsx, geen eigen berekening',
    },
  },
  {
    workflow: 'WF-START-27',
    scenarioId: 'UAT-START-27',
    titel: 'De rapportuitkomst delen zonder bedragen (ADR 0067)',
    kriticiteit: 'BELANGRIJK',
    given: 'Sanne\'s rapport is open (zie WF-START-08); netWorthFreedom is geen tekort en niet oneindig, dus de knop "Delen" staat naast "Download als PDF".',
    when: 'De bezoeker klikt "Delen"; de dialoog toont de op canvas getekende deelkaart (1200×630) en de acties "Delen" (native share, met de kaart als bestand waar de browser dat ondersteunt), "Tekst kopiëren" en "Afbeelding opslaan".',
    then: 'De deelkaart, de gekopieerde tekst én de meegegeven link bevatten UITSLUITEND de vrijheidstijd van het rapport ("X jaar en Y maanden") — geen €, geen %, geen ander ingevoerd of afgeleid gegeven (inkomen, vermogen, geboortejaar). De link is `<origin>/check`, parameterloos (geen token, geen querystring) — de ontvanger doet de check zelf; er wordt niets opgeslagen (momentopname, `lead_intakes` blijft ongemoeid). Staat netWorthFreedom op tekort of op nul jaar-en-nul-maanden, dan retourneert `selectShareFreedom` `null` en verschijnt de knop "Delen" niet.',
    assertion: {
      kind: 'consistency',
      source: 'lib/check/share-freedom.ts#selectShareFreedom is de enige functie die het volledige rapport ziet en reduceert het tot {years, months}; buildFreedomShareText/buildFreedomCardCopy/ShareButton.tsx werken uitsluitend op dat object. A=B-toets (gedeelde payload bevat geen ander cijfer dan years/months, en bij deficit/infinite/nul geen deel-knop) i.p.v. een hard cijfer — bewaakt door lib/check/__tests__/share-freedom.test.ts',
    },
  },
  {
    workflow: 'WF-START-28',
    scenarioId: 'UAT-START-28',
    titel: 'Stap "Jouw plan": stopmoment en eind-vorm kiezen tijdens onboarding (ADR 0129)',
    kriticiteit: 'KERN',
    given: 'De laatste inhoudelijke onboarding-stap (vii., kicker "Toekomst"; intern nog de stap "Jouw plan", maar de zichtbare kop is sinds W-011 (19 sep 2026) vraag 1 zelf — "Wanneer wil je stoppen met werken?", dezelfde constante als in Voorkeuren; het deck kondigt vraag 2 aan en vraag 1 heeft daarom GÉÉN eigen h2 meer, de tegelgroep draagt die zin als aria-label. Vóór 5 sep 2026 heette dit de eindstrategie-stap met één FIRE-vs-pensioen-keuze.) Twee vragen, letterlijk uit lib/horizon/plan-draft.ts (dezelfde strings als Voorkeuren en de strategie-modal): (1) "Wanneer wil je stoppen met werken?" — de kop van de stap — met drie tegels — "Zo vroeg als het kan" (anker solved, standaard), "Op mijn AOW-leeftijd" (aow) en "Op een leeftijd die ik kies" (age + veld "Stopleeftijd (halve jaren)", 18–100); het anker `now` wordt in de onboarding bewust NIET aangeboden. (2) "Tot welke leeftijd moet je geld reiken, en wat moet er dan nog over zijn?" — éérst het veld "Tot welke leeftijd moet je geld reiken?" (50–120, standaard 90), dán de kop "Wat moet er dan nog over zijn?" met drie tegels — "Niets, het mag op zijn" (deplete, standaard), "Een bedrag voor later of voor anderen" (legacy + veld "Bedrag dat over moet blijven"), "Mijn vermogen mag niet slinken" (perpetual). Feitenpaneel: "90 jaar" als standaard-eindleeftijd.',
    when: 'De gebruiker (a) klikt direct "Verder" (standaardpad solved × deplete × 90); (b) kiest "Op mijn AOW-leeftijd"; (c) kiest "Op een leeftijd die ik kies" en vult 62,5 in; (d) vult onder dat anker 90 (= eindleeftijd), niets, of 62,3 in en klikt "Verder"; (e) kiest "Een bedrag voor later of voor anderen" met een leeg bedrag resp. "250.000"; (f) kiest "Mijn vermogen mag niet slinken"; (g) hervat een concept van vóór 5 sep 2026 met `fire_end_strategy: "pensioen"`.',
    then: '(a) Geen veld verplicht; de save (`POST /api/onboarding/save-own-data`) lost het plan één keer op via `resolveOnboardingPlanColumns` en schrijft fire_stop_anchor=solved, fire_end_strategy=deplete, fire_end_age=90, fire_stop_age=null (beide write-plekken, dezelfde vijf kolommen). (b) fire_stop_anchor=aow, eind-vorm blijft deplete — de AOW-toets (eindleeftijd > AOW-leeftijd) draait hier NIET: de onboarding kent de AOW-tabel niet, die toets zit alleen in Voorkeuren (WF-TOEK-24). (c) Bij het aanklikken van "age" vult `defaultStopAge` het veld vooraf met huidige leeftijd + 5 in halve jaren, geklemd vóór de eindleeftijd (bij 40 jaar → 45; zonder geboortedatum 60) — bewust geen vaste 58/65; 62,5 is geldig en wordt als fire_stop_age=62.5 weggeschreven. (d) "Verder" wordt geblokkeerd: rode banner "Controleer de gemarkeerde velden om door te gaan" plus de fout onder het veld — bij stop ≥ eind "Je stopleeftijd moet vóór de eindleeftijd van je plan (90) liggen.", bij leeg "Kies een stopleeftijd.", bij 62,3 "In stappen van een half jaar."; de route weigert stop ≥ eind óók met een 400 (STOP_AGE_BEFORE_END_AGE_ERROR) — nergens een stille klem of afronding. (e) Een leeg bedrag onder legacy blokkeert met "Een bedrag boven nul." (leeg → NaN, géén stille €0); "250.000" wordt als 250000 gelezen en alleen onder legacy meegestuurd als fire_legacy_amount. (f) Het eindleeftijd-veld verdwijnt en er staat één zin: "Dan rekent de app zonder eindleeftijd: je leeft van wat je vermogen oplevert."; onder deplete en legacy blijft het veld zichtbaar. (g) `sanitizeStoredDraft` herstelt het oude label als anker aow + eind-vorm deplete (het label wordt nooit meer als eind-vorm doorgegeven); stuurt een oude client het label alsnog mee, dan vertaalt de route het identiek naar aow/deplete/90/null. De cijfers van de overige stappen veranderen niet (WF-START-18); het plan werkt door in /toekomst en Voorkeuren (WF-TOEK-24).',
    assertion: {
      kind: 'exact',
      expected:
        'standaard=solved/deplete/90/null; aow=aow/deplete/90/null; standaardStopleeftijdBij40=45; ageGeldig=ok/age/deplete/90/62.5; ageStopNaEind=Je stopleeftijd moet vóór de eindleeftijd van je plan (90) liggen.|route400; ageLeeg=Kies een stopleeftijd.; ageGeenHalfJaar=In stappen van een half jaar.; legacyLeeg=Een bedrag boven nul.; legacy=ok/250000; perpetualEindleeftijdVeld=verborgen; depleteEindleeftijdVeld=zichtbaar; conceptPensioen=aow/deplete; routePensioen=aow/deplete/100/null',
      source: 'lib/horizon/plan-draft.ts#validatePlanDraft + defaultStopAge + endFormShowsEndAge (kopij STOP_ANCHOR_OPTIONS/END_FORM_OPTIONS; STOP_ANCHOR_QUESTION is sinds W-011 ook de shell-kop van de stap) + components/onboarding/onboarding-eindstrategie.tsx#planDraftFromOnboarding (leeg bedrag → NaN) + lib/onboarding-plan.ts#resolveOnboardingPlanColumns (route-toets, legacy-label → anker) + app/(onboarding)/onboarding/draft-persistence.ts#sanitizeStoredDraft (concept-herstel) — zie start-checks.ts',
    },
  },
  {
    workflow: 'WF-START-30',
    scenarioId: 'UAT-START-30',
    titel: 'AI aanzetten bij het eerste gebruik: kiezen, weigeren en terugdraaien (ADR 0155 + 0157)',
    kriticiteit: 'KERN',
    given: 'Een vers, zojuist geonboard account (`ai_enabled` false, `ai_consent_at` NULL, `active_subscriptions` leeg). De onboarding stelt géén AI-vraag meer (ADR 0157: ze gebruikt zelf geen AI; de eerste stap is "naam"), en de app-shell toont geen keuze-overlay zolang de `ai`-add-on ontbreekt.',
    when: 'De gebruiker (a) opent in de app een AI-ingang (Fin-chat, briefing, "Vraag Fin" bij transacties, vaste-kostenanalyse, nieuws, pensioen-PDF); (b) klikt daar op "AI aanzetten" en bevestigt zonder de schakelaar aan te zetten; (c) zet de schakelaar aan, leest de verklaring en bevestigt; (d) zet AI later op /mijn/account uit — óf logt in met een bestaand account dat de `ai`-add-on al heeft maar waarvan `ai_consent_at` NULL is.',
    then: '(a) De ingang toont de gedeelde upsell "… werkt als je AI aanzet" met de beta-uitleg uit betaAddonNotice ("Straks wordt AI een abonnement van €9 per maand …", prijs uit de catalogus) en een knop, nooit een rauwe fout. (b) De popup (BetaAddonDialog) opent met de schakelaar UIT (role switch, aria-checked false) en zónder privacyverklaring; "AI aanzetten" is disabled tot de schakelaar aan staat. (c) De verklaring (AiConsentFacts) klapt open zodra de schakelaar aan gaat, met de regel "Met “AI aanzetten” geef je Fin toestemming …"; `POST /api/beta/addon` {tier ai, active true, source interstitial} schrijft éérst `consent_events` (granted) + de profielrij (`ai_enabled=true`) en pas dán `ai` in `active_subscriptions` (+ regel in tier_assignments_log met "(beta-keuze)"); daarna ververst de shell en toont de upsell "AI staat aan. Probeer het opnieuw." in plaats van een tweede knop. Bij een fout blijft de popup staan met `role="alert"` en is er niets geschreven. Overzicht, budget, toekomst, belasting en doelen werken zonder AI volledig; de pensioenstap in de onboarding biedt alleen XML/JSON. (d) "AI uitzetten" haalt de add-on weg en legt withdrawn vast. Het bestaande account MÉT add-on en zonder keuze krijgt éénmalig de vergrendelde keuze-overlay (ShellOverlay confirm, `lockedOpen`); een account zónder add-on krijgt die overlay níet.',
    assertion: {
      kind: 'ui-only',
      source: 'app/api/beta/addon/route.ts (toestemming → add-on, eigen rij, zod-strict, vlag BETA_SELF_SERVE_ADDONS) + lib/ai/consent-record.ts (volgorde event → profiel) + components/app/beta-addon/beta-addon-choice.tsx + components/app/ai-subscription-upsell.tsx (de ~15 AI-ingangen) + app/(app)/layout.tsx (overlay alleen met ai-add-on) — gedrag/tekst-toets; bewaakt door app/api/beta/addon/route.test.ts, app/api/consent/ai/route.test.ts en de componenttests',
    },
  },
  {
    workflow: 'WF-START-31',
    scenarioId: 'UAT-START-31',
    titel: 'Budget inrichten: template of leeg beginnen, Eigen rekening verplicht en onwijzigbaar (ADR 0156)',
    kriticiteit: 'KERN',
    given: 'De afrondingsstap "budget" (groep 7 "Je budget", ná `POST /api/onboarding/save-own-data` — die opslag wist eerdere budgetten, dus deze stap draait bewust NA de opslag). De gebruiker kiest tussen de drie bestaande templates (nibud/minimalistisch/uitgebreid) of "Leeg beginnen"; de gedeelde `BudgetTreeEditor` (ook gebruikt door de in-app planeditor) toont daarna de boom.',
    when: 'De gebruiker kiest template "nibud" met een netto-inkomen van €3.000, resp. kiest "Leeg beginnen", en probeert vervolgens in de boom de post "Eigen rekening" (hoofd- én deelbudget) te hernoemen of te verwijderen.',
    then: 'Zowel `buildTemplateDraft(\'nibud\', 3000)` als `buildEmptyDraft()` bevatten de post Eigen rekening (`eigen-rekening` + `eigen-rekening-sub`, via `ensureEigenRekening`, idempotent). `isProtectedBudget` markeert beide slugs als beschermd — de boom sluit hernoemen/verwijderen daarvan uit, exact dezelfde regel als in de in-app planeditor (`components/app/budget-plan/budget-tree-editor.tsx`, `EIGEN_REKENING_UITLEG`). Een gewoon budget (bv. "Boodschappen") is niet beschermd.',
    assertion: {
      kind: 'exact',
      expected: 'leegBevatEigenRekening=true; templateBevatEigenRekening=true; eigenRekeningBeschermd=true; eigenRekeningSubBeschermd=true; boodschappenBeschermd=false',
      source: 'lib/budget-templates/template-draft.ts#buildEmptyDraft/buildTemplateDraft/ensureEigenRekening/isProtectedBudget — zie start-checks.ts; UI-toepassing in components/app/budget-plan/budget-tree-editor.tsx (gedeeld met de onboarding-stap, ADR 0156 besluit 3+4)',
    },
  },
  {
    workflow: 'WF-START-32',
    scenarioId: 'UAT-START-32',
    titel: 'Budget-categorieën bewerken tijdens de onboarding-afrondingsstap en opslaan',
    kriticiteit: 'BELANGRIJK',
    given: 'De budget-afrondingsstap met een gekozen template of "Leeg beginnen" geladen in de gedeelde `BudgetTreeEditor`. Kop fase 1 is sinds W-012 (19 sep 2026) "Stel je budgetten in"; het deck van fase 2 vertelt sinds W-013 wáár de bedragen vandaan komen — één tekst voor beide startpunten, met de inkomenszin in voorwaardelijke vorm ("Koos je een opzet, dan zijn de bedragen al ingevuld als vaste verdeling van je netto-inkomen — een startpunt, geen maat voor jou") zodat hij onder "Leeg beginnen" niets belooft. Bewust GÉÉN templatenaam en geen Nibud-verwijzing: de percentages zijn de eigen sleutel van de app, niet de Nibud-referentiecijfers uit `nibud_reference_data`. Het bedrag zelf staat in het feitenpaneel, niet in het deck.',
    when: 'De gebruiker voegt een categorie toe, hernoemt er één en verwijdert een derde (niet Eigen rekening), en klikt "Budget opslaan".',
    then: '"Budget opslaan" is uitgeschakeld zolang een categorie geen naam heeft; bij een geldige boom stuurt de knop `computeBudgetPlanDiff(origineel, draft, origineleBedragen)` naar `POST /api/budgets/plan` — DEZELFDE functie en route als de in-app planeditor (WF-BUDGET-06, SSoT-eis: geen tweede diff-implementatie voor de onboarding-variant). Bij succes gaat de flow naar de bank-stap (`finishBudgetStep(\'opgeslagen\')` → `POST /api/onboarding/afronding` met `stap:\'bank\', budget:\'opgeslagen\'`).',
    assertion: {
      kind: 'consistency',
      source: 'lib/budget-plan-diff.ts#computeBudgetPlanDiff (zelfde functie/A=B-toets als WF-BUDGET-06) + components/onboarding/onboarding-budget.tsx (opslag-knop disabled-conditie, POST /api/budgets/plan) + lib/onboarding/afronding.ts#withAfrondingVoortgang(stap:"bank")',
    },
  },
  {
    workflow: 'WF-START-33',
    scenarioId: 'UAT-START-33',
    titel: 'Budget-stap overslaan met frictie ("Ik doe dit later")',
    kriticiteit: 'BELANGRIJK',
    given: 'De budget-afrondingsstap, geen primaire overslaan-knop naast "Budget opslaan" — alleen een rustige tekstlink.',
    when: 'De gebruiker klikt "Ik doe dit later".',
    then: 'Een bevestigingsoverlay (ShellOverlay kind="confirm") opent met primair "Toch een budget kiezen" (sluit de overlay, blijft op de stap) en secundair "Later doen" (gaat door: `finishBudgetStep(\'overgeslagen\')` → `POST /api/onboarding/afronding` met `stap:\'bank\', budget:\'overgeslagen\'`, geen budgetten weggeschreven). Geen verplichte reden op dit pad (anders dan bij de bank-stap, WF-START-36) — het overslaan zelf is de enige keuze.',
    assertion: {
      kind: 'ui-only',
      source: 'components/onboarding/onboarding-budget.tsx (skip-overlay, ModalFooter primary/secondary) + lib/onboarding/afronding.ts#withAfrondingVoortgang, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-34',
    scenarioId: 'UAT-START-34',
    titel: 'Bank koppelen tijdens de onboarding-afrondingsstap: rekeningkeuze zonder dubbele rekening',
    kriticiteit: 'KERN',
    given: 'De bank-afrondingsstap (`OnboardingBank`, hergebruikt van `/core/cash/connect`). Stap A verplicht: een doelrekening kiezen vóór de bankkeuze — de onboarding heeft net een companion-loze betaalrekening (cash-bezit) aangemaakt. `GET /api/bank-connect/accounts` levert die terug in `assets` (companion-loze cash-bezittingen), naast eventuele bestaande `bank_accounts`-rijen in `accounts`.',
    when: '(a) Precies één cash-bezit met `account_type=\'checking\'` en geen `bank_accounts`-rijen (het standaardgeval ná onboarding) — `preselectTarget` bepaalt de voorselectie. (b) Twee of meer betaalrekening-kandidaten. (c) De gebruiker rondt de koppeling af met een gekozen cash-bezit als doel. (d) Het account heeft de `connected`-add-on nog niet en de gebruiker klikt "Koppel mijn bank" (ADR 0157).',
    then: '(a) Voorselecteert automatisch dat ene cash-bezit (`{kind:\'asset\', id:...}`) — de gebruiker hoeft niet te kiezen. (b) Geen stille voorkeur (`{kind:\'none\'}`): de gebruiker kiest zelf. Zonder kandidaten (`accounts.length + assets.length === 0`) valt de keuze terug op "nieuwe rekening aanmaken" (`{kind:\'new\'}`). (c) `POST /api/bank-connect/auth-link` accepteert het gekozen cash-bezit als `target_asset_id`, maakt de companion-rij server-side aan (`ensureCompanionForCashAsset`/`syncBankAccountCompanion`) en loopt daarna hetzelfde doelrekening-pad als een gewone rekening — er ontstaat GEEN tweede cash-bezit naast de betaalrekening uit de onboarding. (d) `auth-link` antwoordt 403 `connected_required` zonder pending-rij; de popup "Wil je je bank koppelen?" opent met de beta-uitleg ("Straks wordt de bankkoppeling een abonnement …") en een schakelaar die uit staat; na aanzetten en "Aanzetten en verder" schrijft `POST /api/beta/addon` `connected` op de eigen rij en start de koppeling direct opnieuw. Hetzelfde geldt in de wizard op /core/cash/connect; herstellen van een bestaande koppeling vraagt de keuze niet.',
    assertion: {
      kind: 'exact',
      expected: 'preselectEenBetaalrekening=asset; preselectTweeBetaalrekeningen=none; preselectGeenKandidaten=new',
      source: 'components/onboarding/onboarding-bank.tsx#preselectTarget — zie start-checks.ts; server-kant: app/api/bank-connect/auth-link/route.ts (target_asset_id-tak, ensureCompanionForCashAsset) + app/api/bank-connect/accounts/route.ts (assets-lijst uit loadCompanionlessCashAssets)',
    },
  },
  {
    workflow: 'WF-START-35',
    scenarioId: 'UAT-START-35',
    titel: 'Terugkeer naar de onboarding na de bankkoppelpoging (gelukt, mislukt of onderbroken)',
    kriticiteit: 'BELANGRIJK',
    given: 'De onboarding is al opgeslagen (`onboarding_completed=true`) en de afrondingsmarkering staat open op `bank` (`profiles.module_guide_state[\'onboarding:afronding\']`, 24 uur geldig). De koppelpoging start vanuit de bank-afrondingsstap.',
    when: 'De TrueLayer-callback keert terug met `?bank_connected=1` resp. `?bank_error=1` in hetzelfde tabblad; of de gebruiker sluit het koppelvenster zonder af te ronden.',
    then: 'De callback-route herkent via `hoortBijOnboarding` (`!onboarding_completed || readOpenAfronding(...) !== null`) dat deze gebruiker terug moet naar de onboarding — óók al staat `onboarding_completed` al op `true` — en redirect naar `/onboarding?bank_connected=1` resp. `?bank_error=1` i.p.v. het in-app succesvenster. De onboarding-pagina leest die query-parameters, zet de bank-stap op `connected`/`error` en toont het bijbehorende resultaat; bij afbreken zonder terugkeer-parameter blijft de stap gewoon op "rekening kiezen" staan zodat de gebruiker opnieuw kan proberen.',
    assertion: {
      kind: 'ui-only',
      source: 'app/api/bank-connect/callback/route.ts#hoortBijOnboarding (readOpenAfronding) + components/onboarding/onboarding-bank.tsx (result-prop \'connected\'|\'error\'|null), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-36',
    scenarioId: 'UAT-START-36',
    titel: 'Bank-stap overslaan met verplichte reden',
    kriticiteit: 'BELANGRIJK',
    given: 'De bank-afrondingsstap, alleen een tekstlink "Ik doe dit later" (geen primaire overslaan-knop naast "Koppelen").',
    when: 'De gebruiker klikt de link; het bevestigingsoverlay toont drie redenen ("Ik wil eerst rondkijken" / "Mijn bank staat er niet tussen" / "Ik koppel liever niet") zonder voorselectie.',
    then: '"Later doen" (secundaire knop) blijft uitgeschakeld tot er een reden gekozen is — anders dan bij de budget-stap (WF-START-33) is hier een reden VERPLICHT. Bij een gekozen reden gaat `finishBankStep({overgeslagen: reden})` naar `POST /api/onboarding/afronding` met `stap:\'klaar\', bank:{overgeslagen: reden}` en eindigt de flow op het successcherm; "Toch koppelen" (primair) sluit het overlay zonder actie.',
    assertion: {
      kind: 'ui-only',
      source: 'components/onboarding/onboarding-bank.tsx (SKIP_LABELS/BANK_SKIP_REDENEN, ModalFooter secondary.disabled=!skipReden) + lib/onboarding/afronding.ts#BANK_SKIP_REDENEN, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-37',
    scenarioId: 'UAT-START-37',
    titel: 'Afronding hervatten na tussentijds afsluiten, en de markering niet heropenbaar ná "klaar" (ADR 0156)',
    kriticiteit: 'KERN',
    given: 'Een reeds-opgeslagen onboarding (`onboarding_completed=true`) met de afrondingsmarkering nog open op `budget` resp. `bank`, gezet ≤24 uur geleden. Losse gevallen: (a) de markering is geopend en nog nooit doorgeschoven; (b) de budgetstap is net afgerond (`withAfrondingVoortgang({stap:\'bank\', budget:\'opgeslagen\'})`); (c) de bankstap is afgerond (`withAfrondingVoortgang({stap:\'klaar\', bank:\'gekoppeld\'})`); (d) dezelfde `\'klaar\'`-markering krijgt nog een `POST /api/onboarding/afronding`-aanroep; (e) de markering is verlopen (26 uur oud).',
    when: 'De gebruiker sluit de app/tab halverwege en opent later opnieuw `/onboarding` (of `/dashboard`, dat via de app-layout terugstuurt).',
    then: '(a) `readOpenAfronding` levert `\'budget\'` — de onboarding-pagina hervat op de budget-stap. (b) Ná de voortgang levert `readOpenAfronding` `\'bank\'` — de gebruiker hervat daar, budgetten blijven zoals opgeslagen. (c) Ná `stap:\'klaar\'` levert `readOpenAfronding` `null` — geen hervatting meer, de gebruiker gaat gewoon naar `/dashboard`. (d) Een POST tegen een `\'klaar\'`-markering is een no-op (`open:false`, de route heropent nooit een gesloten markering — ADR 0156 besluit 2). (e) Een verlopen markering (> `AFRONDING_GELDIG_MS` = 24u) levert ook `null`: geen hervatting, de welkomstgids neemt budget en rekening dan over (`hasBudgets`/`hasBankConnection`).',
    assertion: {
      kind: 'exact',
      expected: 'open=budget; naBudget=bank; naBank=null; klaarPostIsNoOp=true; verlopenNa24u=null',
      source: 'lib/onboarding/afronding.ts#readOpenAfronding + withAfrondingVoortgang + AFRONDING_GELDIG_MS — zie start-checks.ts; route-toets (no-op) in app/api/onboarding/afronding/route.ts',
    },
  },
  {
    workflow: 'WF-START-38',
    scenarioId: 'UAT-START-38',
    titel: 'Het stapscherm: eerst de vraag, dan pas de voortgang (volgordewissel 17-09-2026)',
    kriticiteit: 'BELANGRIJK',
    given: 'Een willekeurige inhoudelijke onboarding-stap (bv. "bezittingen" of "schulden", groep 4/8 resp. 5/8) met genoeg ingevulde regels om het scherm te laten scrollen. Tot 17-09-2026 was de volgorde omgekeerd: een full-bleed sticky voortgangsbalk bovenaan het scherm, daarboven een gecentreerde 4xl merknaam-kop.',
    when: 'De tester bekijkt de volgorde van de elementen, scrollt binnen de stap naar beneden, klikt de terug-affordance, en loopt door de stapgroepen heen.',
    then: 'VOLGORDE: (1) een kleine masthead-rij van 44px hoog — merknaam links (klein, `text-base sm:text-lg`, met de punt in het accent van deze stap) en "Uitloggen" rechts; dat is een `<p>`, géén `<h1>` meer. (2) De vraag: kicker-streep + romeinse nummering, de kop met italic-em, en het deck. (3) DAARONDER pas de voortgangsrij: terug-knop · balk (2px, gevuld in `--module-active-*`) · stand "n/9" (ook in het accent) · en op een tweede regel de vrijheidsteller, wanneer die er is. STICKY: de voortgangsrij plakt bij scrollen aan de bovenkant van de formulierkolom (`sticky top-0 z-30`, halfdoorzichtige achtergrond) — dat is geen detail, want deze terug-knop is de ENIGE stap-terug die de onboarding heeft (de sticky CTA-bar onderaan draagt alleen "Verder"); zonder sticky scrolt de uitgang op een lange stap uit beeld. ACCENT PER STAPGROEP: `--module-active-*` staat niet meer vast op `kern` maar op het accent van de hefboom waar de vraag over gaat (`STEP_ACCENT`): naam/geboortedatum/eindstrategie → fin, inkomen/uitgaven/uitgaven_pensioen → horizon, bezittingen/pensioen → kern, schulden → wil. Kicker-streep, italic-em, balk en de merknaam-punt kleuren dus mee bij elke stapwissel. De cijfers en validaties van de stappen zelf veranderen niet (WF-START-18/19/28).',
    assertion: {
      kind: 'ui-only',
      source: 'components/onboarding/onboarding-shell.tsx (OnboardingProgressBar onder de header, sticky-className, backSlot) + components/onboarding/progress-bar.tsx (geen eigen sticky/full-bleed meer, module-active fill + stand) + app/(onboarding)/onboarding/page.tsx (STEP_ACCENT/moduleActiveVars, masthead-rij als <p>), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-39',
    scenarioId: 'UAT-START-39',
    titel: 'Vier willekeurige accentkleuren bij de eerste binnenkomst in de onboarding',
    kriticiteit: 'OVERIG',
    given: 'Drie accounts: (a) een vers account zonder `profiles.module_colors` en met `onboarding_completed = false`; (b) een account dat al minstens één van de vier kleuren heeft staan; (c) een account met `onboarding_completed = true` en zonder kleuren (bv. een openstaande afrondingsstap of een redirect).',
    when: 'Elk van de drie opent /onboarding; daarna bekijkt de tester /mijn/uiterlijk en de app-shell.',
    then: '(a) De onboarding trekt vier accenten met `randomModuleColors()`: één willekeurig startpunt op de gedeelde `ACCENT_RING` (18 tinten) plus de vaste tetrad-afstanden [0,4,9,13], zodat de vier tinten altijd rond de hele kleurencirkel liggen met minimaal 80° ertussen — nooit twee buurtinten die op één scherm niet uit elkaar te houden zijn. Ze worden meteen best-effort weggeschreven met `PUT /api/appearance` ({module_colors}); mislukt dat (offline/500), dan blijft de onboarding in die kleuren staan, komt er GEEN melding, en valt de rest van de app terug op de standaardset. (b) Geen trekking — de bestaande kleuren worden per sleutel over de standaardset heen gelegd, zodat een onvolledige rij niet met een verse trekking wordt overschreven. (c) Geen trekking: wie de onboarding al af heeft mag niet ineens een andere app-kleur krijgen. Alle achttien ringtinten halen minimaal 4,55:1 tegen papier (WCAG AA), dus elke uitkomst is leesbaar; op /mijn/uiterlijk blijven de vier vrij te wijzigen. Dat de accenten dicht bij een stoplichtkleur mogen liggen is sinds 8-09-2026 bewust (eigenaarsbesluit): er geldt geen chroma-plafond meer op deze ring.',
    assertion: {
      kind: 'consistency',
      source: 'lib/color-palette.ts#randomModuleColors/ACCENT_RING/ACCENT_TETRAD_OFFSETS + app/(onboarding)/onboarding/page.tsx (heeftKleuren-poort, PUT /api/appearance) — A=B-toets: de vier getrokken tinten komen uit ACCENT_RING en liggen op de tetrad-afstanden; contrast en spreiding zijn gepind in lib/color-palette.random-accents.test.ts en components/mijn/module-accent-picker.test.tsx, geen eigen cijfer hier',
    },
  },
  {
    workflow: 'WF-START-40',
    scenarioId: 'UAT-START-40',
    titel: 'De eerste ophaal gebeurt op het homescherm, ná de rondleiding (ADR 0158)',
    kriticiteit: 'KERN',
    given: 'Een gebruiker die de onboarding zojuist afrondde MÉT een gekoppelde bank: `POST /api/onboarding/afronding` legde bij `stap:\'klaar\', bank:\'gekoppeld\'` server-side vast wélke actieve `bank_connection_accounts` op dat moment bestonden (`bankKoppelingen` in dezelfde markering; de client levert die ids niet aan). De markering is ≤24 uur oud. Losse gevallen: (a) het standaardgeval; (b) de gebruiker legt binnen datzelfde venster ergens anders een tweede koppeling en staat op /core/cash/connect/success; (c) een markering van vóór ADR 0158, die de ids nog niet draagt; (d) de bankstap is overgeslagen.',
    when: 'De gebruiker komt de app binnen (in de praktijk /dashboard → het gekozen homescherm) en laat de rondleiding van ADR 0130 lopen of tikt hem weg.',
    then: '(a) `EersteSyncNaOnboarding` hangt in de (app)-layout bínnen de `GlobalSyncProvider` en start ná ~2s stilte — pas als `useAttentionQuiet()` vals is, dus de rondleiding gaat vóór — dezelfde ronde als de syncknop (`loadGlobalSyncTargets` + `triggerGlobalSync`): dezelfde dagrem, dezelfde toasts per koppeling, dezelfde `router.refresh()`. Géén tweede sync-pad, géén tweede leesronde, géén eigen "al gedaan"-vlag: hij dooft uit doordat de markering na 24 uur verloopt en een geslaagde sync `last_synced_at` zet. Per browsertab vuurt hij hoogstens één keer (module-scoped vlag), maar valt de leesronde om vóórdat er één koppeling is aangeraakt, dan gaat die vlag terug — anders kapt één hapering de eerste ophaal voor de hele sessie af. (b) De ronde raakt UITSLUITEND de ids uit de markering: een koppeling die later ontstaat zit er structureel niet in, en bovendien vuurt de trigger nooit op een pad onder /core/cash/connect — dáár leeft het correctiemoment van ADR 0069 (een verkeerd gelande koppeling verhangen), dat onherroepelijk sluit zodra er transacties zijn. (c) en (d) leveren een lege lijst en dus GEEN automatische ophaal — fail-safe: liever een gemiste ophaal (de syncknop staat er nog) dan een gesloten correctiemoment. Fouten ín de sync blijven zichtbaar via de gewone toasts; alleen het omvallen van de leesronde faalt stil.',
    assertion: {
      kind: 'consistency',
      source: 'A=B-toets tussen de gesynchroniseerde set en de markering: components/sync/eerste-sync-na-onboarding.tsx (filter op `koppelingen.includes(bank.connectionAccountId)`, useAttentionQuiet-poort, KOPPELWIZARD-uitsluiting) leest wat app/api/onboarding/afronding/route.ts server-side schreef via lib/onboarding/afronding.ts#readOnboardingBankKoppelingen (24u-venster, ontbrekend veld → leeg) en start app/(app)/layout.tsx\'s bestaande GlobalSyncProvider-ronde — geen eigen cijfer; de leesfunctie is gepind in lib/onboarding/afronding.test.ts',
    },
  },
]

export const START_ACCEPTANCE: AcceptanceSet = {
  zone: 'START',
  criteria,
}
