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
 * (pensioen-ingangsleeftijd-klem) en 21 (noodfonds-prefill). Geen enkele van
 * deze criteria vereist Supabase/auth — allemaal pure functies op letterlijke
 * getallen uit het UAT-plan.
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
    when: 'De gebruiker opent /overzicht/cashflow na activatie.',
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
    then: 'Bij succes navigatie naar het veilige redirect-doel (redirectTo indien aanwezig en veilig, anders /overzicht); onveilige redirectTo-waarden vallen terug op /overzicht.',
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
    then: 'Beveiligde routes → login-redirect met `redirectTo` (en terugkeer na inloggen); /check en /check/rapport blijven publiek bereikbaar; ingelogd op /, /login, /signup, /forgot-password → automatische redirect naar /overzicht; een beveiligde API-route geeft uitgelogd JSON 401, geen HTML-redirect.',
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
    then: 'De popup verschijnt éénmalig (localStorage-flag `trifinity_onboarding_welcome_seen`) en komt bij verversen niet terug; bij een herstelbaar concept verschijnt de popup bewust niet.',
    assertion: {
      kind: 'ui-only',
      source: 'components/onboarding/welcome-popup.tsx + localStorage-flag, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-START-18',
    scenarioId: 'UAT-START-18',
    titel: 'Onboarding volledig doorlopen en in de app landen',
    kriticiteit: 'KERN',
    given: 'Testpersoon "Jan de Vries": netto maandinkomen €3.000, maanduitgaven €2.100, bezittingen (Betaalrekening €2.500 + Spaargeld €18.000 + Beleggingen €12.000 = €32.500), schulden (Studieschuld €9.000).',
    when: 'De gebruiker doorloopt de stappen "inkomen"/"uitgaven" (spaarquote-preview), "uitgaven na pensioen" (prefill), "spaardoel" (Noodfonds-preset) en "klaar" (recap).',
    then: 'Spaarquote-preview = 30%. Pensioen-uitgaven-prefill = €20.160/jaar (80% × €2.100 × 12). Noodfonds-prefill = €12.600 (6× €2.100, al een veelvoud van €100). Recap netto vermogen = €32.500 − €9.000 = €23.500. De meelopende vrijheidstijd-teller staat na de derde bezitting op 1j 3m over €32.500 en blijft daar staan als de studieschuld erbij komt — de intake-grondslag telt de eigen woning niet mee en trekt schulden er niet af, zodat het getal tijdens het invullen nooit daalt (bevinding H12). Ná activatie moet /overzicht/cashflow exact dezelfde 30% spaarquote tonen (SSoT-eis, zelfde motor als WF-START-10).',
    assertion: {
      kind: 'exact',
      expected:
        'spaarquotePreview=30; pensioenPrefill=20160; noodfondsPrefill=12600; nettoVermogenRecap=23500; vrijheidsteller=1j 3m; tellerBedrag=32500',
      source: 'components/onboarding/onboarding-inkomen.tsx (previewRate-formule, gemirrord) + lib/onboarding/retirement-prefill.ts#computeRetirementPrefill + lib/onboarding-presets.ts#computeNoodfondsTarget + netWorthForKlaar (app/(onboarding)/onboarding/page.tsx, gemirrord) + lib/freedom-ticker.ts#computeFreedomTicker — zie start-checks.ts',
    },
  },
  {
    workflow: 'WF-START-19',
    scenarioId: 'UAT-START-19',
    titel: 'Bezittingen en schulden toevoegen tijdens onboarding (huis + hypotheek-koppeling)',
    kriticiteit: 'KERN',
    given: 'Testpersoon "Eva Jansen": Betaalrekening €1.800, Spaargeld €10.000, Eigen huis €340.000 met gekoppelde hypotheek €280.000 (rente 3,2%, maandlast €1.100), Autolening/private lease €8.000.',
    when: 'De gebruiker doorloopt de bezittingen- en schulden-secties en bekijkt de sectie-review + de klaar-stap-recap.',
    then: 'Totaal bezittingen = €1.800 + €10.000 + €340.000 = €351.800. Totaal schulden = €280.000 (hypotheek) + €8.000 (autolease) = €288.000. Netto vermogen = €351.800 − €288.000 = €63.800. De schulden-sectie stelt hoogstens vier gerichte ja/nee-vragen (hypotheek, studielening, persoonlijke lening, autolening) en sluit af met één aanvinkraster voor de rest van de catalogus. Elke schuldsoort die al via een bezitting gekoppeld is wordt overgeslagen — hier dus de hypotheekvraag, omdat de hypotheek al via de bezittingen-stap gekoppeld is (en zo ook de autoleningvraag zodra de autolease aan een voertuig hangt).',
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
    given: 'De pensioen-stap (groep 5/8): schatting-pad met ingangsleeftijd-invoer, geklemd tussen 50 en 75, met de AOW-leeftijd van de gebruiker als fallback (placeholder + hint tonen die leeftijd; een inschat-hulp kan het bedrag vullen uit bruto jaarsalaris × jaren opbouw).',
    when: 'De gebruiker vult een geldige ingangsleeftijd binnen het bereik (75, de bovengrens) resp. laat het veld leeg/ongeldig in.',
    then: 'Een geldige waarde binnen [50,75] (bv. 75) wordt ongewijzigd overgenomen; een ontbrekende/ongeldige waarde valt terug op de AOW-leeftijd van de gebruiker (uit `aow_leeftijd` o.b.v. geboortedatum, bv. 68); zonder geboortedatum/AOW-rijen blijft 67 de laatste fallback.',
    assertion: {
      kind: 'exact',
      expected: 'ingangsleeftijdGeldig=75; ingangsleeftijdAowFallback=68; ingangsleeftijdDefault=67',
      source: 'app/(onboarding)/onboarding/page.tsx buildPensionParseResult(p, fallbackAge) — leeg/ongeldig → geklemde AOW-fallback, anders 67 (gemirrord) — zie start-checks.ts',
    },
  },
  {
    workflow: 'WF-START-21',
    scenarioId: 'UAT-START-21',
    titel: 'Spaardoel kiezen of overslaan tijdens onboarding',
    kriticiteit: 'BELANGRIJK',
    given: 'Netto maandinkomen €2.800, maanduitgaven €1.900, spaardoel-stap (groep 6/8).',
    when: 'De gebruiker kiest de preset "Noodfonds".',
    then: 'Prefill-bedrag = 6× €1.900 = €11.400 (al een veelvoud van €100, geen afronding zichtbaar); bij een leeg/0-bedrag wordt bij opslaan géén doel weggeschreven (stil overgeslagen).',
    assertion: {
      kind: 'exact',
      expected: 'noodfondsPrefill=11400',
      source: 'lib/onboarding-presets.ts#computeNoodfondsTarget({monthlyIncome:2800, monthlyExpenses:1900})',
    },
  },
  {
    workflow: 'WF-START-22',
    scenarioId: 'UAT-START-22',
    titel: 'Velden uitstellen met "Later invullen" (defer-pad)',
    kriticiteit: 'BELANGRIJK',
    given: 'Onboarding op de inkomen-stap, evt. met al ingevuld bedrag.',
    when: 'De gebruiker klikt "Later invullen" (inkomen) en/of "Sla over →" (spaardoel).',
    then: 'De overgeslagen velden worden als deferred fields opgeslagen (`profiles.feature_preferences.deferred_onboarding_fields`) en voeden na onboarding de coach-bubble; "Later invullen" wist bewust ook een reeds ingevuld bedrag.',
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
    then: 'Herstel-melding "Verder waar je was" (neutraal, geen groen vinkje), terug op de opgeslagen stap MÉT alle eerder gegeven antwoorden — naam, geboortedatum, bedragen, bezittingen en schulden staan er weer (concept op de eigen profielrij, ADR 0122). Alleen een geüpload pensioenoverzicht komt niet terug (ADR 0115: dat blijft op het toestel) en de melding zegt dat met zoveel woorden. De finish-guard stuurt een afrondpoging met een nog lege verplichte naam/geboortedatum terug naar die stap.',
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
    given: 'Volledig ingevulde onboarding op de klaar-stap; netwerk/server faalt bij het afronden.',
    when: 'De gebruiker klikt "Begin met TriFinity" terwijl de opslag faalt, herstelt de oorzaak en klikt "Opnieuw proberen".',
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
    when: 'De vers-geonboarde gebruiker klikt "Ga naar je toekomst"; de reeds-geonboarde gebruiker opent handmatig /onboarding; een niet-geonboarde gebruiker opent direct een app-route.',
    then: 'Harde navigatie naar /toekomst zonder terug-flits naar /onboarding; een reeds-geonboarde gebruiker die /onboarding opent → redirect naar /overzicht; een niet-geonboarde gebruiker die een app-route opent → redirect naar /onboarding. Op het successcherm zelf staat sinds APP-2 (nazorg eenvoudige weergave, 11 aug 2026) één regel die de weergavekeuze noemt: "Rustig beginnen of meteen alle detail? Je weergave kies je later bij Mijn → Uiterlijk." Twee eigenschappen daarvan zijn te toetsen en bewust zo: de regel is GEEN link (klikken doet niets — een soft-navigation hiernaast zou de `clearLocalStorage()` + harde navigatie van de CTA omzeilen), en hij is NIET modus-afhankelijk (de `DisplayModeProvider` hangt alleen in de (app)-groep, dus buiten die groep zou elke modus-tekst op de \'simple\'-fallback landen — ADR 0026). De cijfers zelf zijn al gedekt door WF-START-18/19; hier telt alleen de landing/poort-navigatie.',
    assertion: {
      kind: 'ui-only',
      source: 'window.location.assign + onboarding-poort in app/(app)/layout.tsx + components/onboarding/onboarding-success.tsx (statische copy), geen eigen berekening',
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
]

export const START_ACCEPTANCE: AcceptanceSet = {
  zone: 'START',
  criteria,
}
