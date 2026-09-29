// ── Sjablooncatalogus v2 van de Krant: de teksten, en alleen de teksten ──────
//
// Dit bestand is het MERKSTEM-OPPERVLAK `krant-sjablonen` (scripts/merkstem/
// scan.mjs) en de bron van het attest (lib/krant/sjablonen-attest.json): elke
// tekst hier draagt een sha256 in dat attest, en sjablonen-attest.test.ts
// weigert een tekst die er niet in staat. Wijzig je hier een woord, dan
// hoort de catalogus opnieuw door merkstem en compliance-check
// (`node scripts/krant/attest-sjablonen.mjs`), en vervalt de herbevestiging
// van de eigenaar (B38 voorwaarde 2).
//
// Bewust ZONDER imports en zonder logica: het attest-script laadt dit bestand
// rechtstreeks in Node (type-stripping), en een tekstbestand zonder gedrag is
// precies wat een toets moet kunnen lezen.
//
// v2 (28-09-2026, Krant 1C · compliance-check B38): ALLE tekst die de lezer
// ziet staat hier — ook de fragmenten (banden, bereiken, veldnamen, het
// partnerfragment) die in v1 in sjablonen.ts en matcher.ts stonden en dus
// buiten het attest vielen. sjablonen-bron.test.ts bewaakt dat die twee
// bestanden geen lezerstekst meer dragen.
//
// De regels waar elke tekst aan voldoet — de compliance-check toetst ze, de
// Wft-woordenlijst (wft-woordenlijst.ts) vangt de bekende vormen in code:
//   · inzicht, geen advies: de som op jouw band, nooit "doe X"
//   · geen gebiedende wijs richting de lezer; een deadline is beschrijvend
//   · geen aanbieders of producten bij naam
//   · gevoeligheid (B5) zegt expliciet dat het geen voorspelling is
//   · "voor jou" / "geldt ook voor jou" alleen bij een BEVESTIGDE
//     doelgroepregel; een thema alleen geeft "Over jouw situatie" met de reden
//     uit de raakt-regel die 'ja' gaf en zonder bedrag (B37)
//   · geen passendheidstaal ("past bij jou", "geschikt voor jou")
//   · alleen euro's (B2, ADR 0172): geen dagen, dagtarief of vrijheidstijd —
//     de bewuste uitzondering op "geld levert tijd op" voor dit oppervlak
//   · je/jij, kort, concreet; kansen, niet schaarste
//
// Slots staan als `{naam}`; de renderer (sjablonen.ts) vult ze en weigert
// een sjabloon waarvan een slot leeg blijft. Bedragen komen daar altijd via
// formatCurrency (hele euro's), de AOW-leeftijd via formatAowAge.
//
// euro-only (B2, ADR 0172).

export const SJABLOON_VERSIE = 2

export const SJABLONEN = {
  // ── Direct: een som op jouw band ──────────────────────────────────────────
  /** Box 3: {spaargeld} {beleggingen} {partner} {bedrag} {richting} {jaar} */
  'direct-box3': [
    'Met {spaargeld} spaargeld en {beleggingen} beleggingen{partner} komt dit voor jou neer op {bedrag} per jaar {richting} box 3-heffing vanaf {jaar}.',
    'Vanaf {jaar} is dit voor jou {bedrag} per jaar {richting} box 3-heffing, gerekend op {spaargeld} spaargeld en {beleggingen} beleggingen{partner}.',
  ],
  /** Box 1: {inkomen} {bedrag} {richting} {jaar} */
  'direct-box1': [
    'Bij een netto inkomen van {inkomen} per maand betekent dit vanaf {jaar} {bedrag} per jaar {richting} inkomstenbelasting.',
    'Voor een netto inkomen van {inkomen} per maand komt dit vanaf {jaar} neer op {bedrag} per jaar {richting} belasting.',
  ],
  /** AOW-leeftijd: {geboortejaar} {oud} {nieuw} {maanden} */
  'direct-aow': [
    'Voor wie in {geboortejaar} is geboren gaat de AOW-leeftijd van {oud} naar {nieuw}: {maanden} later.',
    'Jouw AOW-leeftijd schuift hiermee van {oud} naar {nieuw}: {maanden} later.',
  ],
  /** Studieschuld: {schuld} {bedrag} {richting} {jaar} — de rente staat in de terugbetaalfase vijf jaar vast, dus met voorwaarde. */
  'direct-studieschuld': [
    'Als jouw rente vanaf {jaar} opnieuw wordt vastgesteld, is dat op een studieschuld van {schuld} {bedrag} per jaar {richting} rente.',
    'Voor jouw studieschuld ({schuld}) betekent de nieuwe rente {bedrag} per jaar {richting} aan rente, zodra jouw rente opnieuw wordt vastgesteld.',
  ],
  /** Eigen risico: {oud} {nieuw} {bedrag} {richting} */
  'direct-eigen-risico': [
    'Het verplicht eigen risico gaat van {oud} naar {nieuw}: hoogstens {bedrag} per jaar {richting} zorgkosten.',
    'Voor jou is het verschil hoogstens {bedrag} per jaar {richting}: het eigen risico gaat van {oud} naar {nieuw}.',
  ],

  // ── Gevoeligheid (B5): blootstelling, geen voorspelling ───────────────────
  /** Spaarrente: {stap} {spaargeld} {bedrag} */
  'gevoeligheid-spaarrente': [
    'Elke {stap} spaarrente is op {spaargeld} spaargeld {bedrag} per jaar. Of jouw bank meebeweegt, staat hier niet.',
    'Op {spaargeld} spaargeld scheelt elke {stap} {bedrag} per jaar. Wat jouw bank doet, weet alleen jouw bank.',
  ],
  /** Hypotheekrente: {stap} {schuld} {bedrag} — bruto, vóór renteaftrek; ook juist bij een variabele rente. */
  'gevoeligheid-hypotheekrente': [
    'Bij een restschuld van {schuld} is elke {stap} hypotheekrente {bedrag} per jaar aan rente, vóór eventuele renteaftrek. Of en wanneer jouw rente meebeweegt, staat hier niet.',
    'Elke {stap} hypotheekrente is op jouw restschuld ({schuld}) {bedrag} per jaar, vóór eventuele renteaftrek. Wat jouw rente doet, staat hier niet.',
  ],
  /** Studieschuld zonder canonieke huidige rente (terugval, keuze 11): {stap} {schuld} {bedrag} */
  'gevoeligheid-studieschuld': [
    'Elke {stap} rente is op een studieschuld van {schuld} {bedrag} per jaar. Welke rente het wordt, staat hier niet.',
  ],

  // ── Zonder bedrag: "Over jouw situatie" (B37) ──────────────────────────────
  /** Kop van het blok met berichten zonder bedrag. */
  'raakt-kop': ['Over jouw situatie'],
  /** Deel 1 — de reden uit de raakt-regel die voor dit profiel 'ja' gaf: {reden} */
  'raakt-reden': ['Volgens je profiel {reden}.'],
  /** Deel 2 — het onderwerp (thema); het jaar alleen als het in de duiding gegrond is: {onderwerp} {jaar} */
  'raakt-onderwerp': ['Dit bericht gaat over {onderwerp}.'],
  'raakt-onderwerp-jaar': ['Dit bericht gaat over {onderwerp}, vanaf {jaar}.'],
  /** Deel 3 — het slot, naar de grond: een bevestigde doelgroepregel … */
  'raakt-doelgroep': ['Dat geldt ook voor jou. Wat het in euro’s doet, rekent de Krant hier niet uit.'],
  /** … of alleen een thema dat het profiel raakt. */
  'raakt-thema': ['Of en hoeveel het jou raakt, rekent de Krant hier niet uit.'],

  /** Wat mist, bij een rekenend mechanisme: {velden} */
  'wat-mist-bedrag': ['Met {velden} in je profiel kan de Krant hier een bedrag bij zetten.'],
  /** Wat mist, bij een onbevestigde doelgroep of een mechanisme zonder som: {velden} */
  'wat-mist-raakt': ['Met {velden} in je profiel kan de Krant zien of dit jou raakt.'],

  /** Voorbehoud vóór de regel als het artikel een voorstel of een verwachting is (soort uit de duiding). */
  'voorbehoud-voorstel': ['Als dit voorstel doorgaat:'],
  'voorbehoud-verwachting': ['Als deze verwachting uitkomt:'],

  // ── Deadlines, beschrijvend — nooit gebiedend: {datum} ─────────────────────
  'deadline-aanvraag': ['De aanvraag moet vóór {datum} binnen zijn.'],
  'deadline-aangifte': ['De aangifte moet vóór {datum} zijn gedaan.'],
  'deadline-bezwaar': ['Bezwaar maken kan tot {datum}.'],
  'deadline-einde-regeling': ['De regeling loopt tot {datum}.'],

  // ── Niet op jou afgestemd ─────────────────────────────────────────────────
  /** Het algemene katern (B7); in de tijdlijn alleen onder minder dan vijf berichten (U13). */
  'algemeen-kop': ['Ook in het nieuws'],
  'algemeen-label': ['Niet op jouw situatie afgestemd.'],
  /** Algemeen kwalitatief nieuws naast de tijdlijn (B37). Geen reden, geen bedrag. */
  'achtergrond-kop': ['Achtergrond'],
  'achtergrond-label': ['Uitleg bij het nieuws, niet op jouw situatie afgestemd.'],
  /** Een lege editie of verversing is een geldige uitkomst. */
  'editie-leeg': ['Er is nu geen nieuws dat de Krant aan jouw situatie kan koppelen.'],

  // ── Redenen: één per raakt-regel in themas.ts (sleutel in matcher.ts) ─────
  // De bedragen zijn de GRENS van de regel, niet de band van de lezer: zo blijft
  // het label waar over de hele band. "beleg je" / "spaar je" nooit: dat raakt
  // de Wft-woordenlijst — "heb je beleggingen".
  'reden-spaargeld-50k': ['heb je € 50.000 of meer spaargeld'],
  'reden-spaargeld-5k': ['heb je € 5.000 of meer spaargeld'],
  'reden-beleggingen-25k': ['heb je € 25.000 of meer aan beleggingen'],
  'reden-beleggingen': ['heb je beleggingen'],
  'reden-tweede-woning': ['heb je een tweede woning'],
  'reden-pensioen-werkgever': ['bouw je pensioen op via je werk'],
  'reden-lijfrente': ['heb je een lijfrente'],
  'reden-geboren-tot-1970': ['ben je in 1970 of eerder geboren'],
  'reden-met-pensioen': ['ben je met pensioen'],
  'reden-huur': ['huur je je woning'],
  'reden-koopwoning': ['heb je een koopwoning'],
  'reden-koopplan': ['wil je binnen twee jaar een huis kopen'],
  'reden-kinderen-onder-18': ['heb je kinderen onder de 18'],
  'reden-kinderen': ['heb je kinderen'],
  'reden-studieschuld': ['heb je een studieschuld'],
  'reden-studie': ['studeer je'],
  'reden-ondernemer': ['ben je ondernemer'],
  /** Gevoelig (compliance-keuze 4): alleen achter "waarom zie ik dit?", nooit in de zichtbare regel. */
  'reden-inkomen-3250': ['is je netto inkomen lager dan € 3.250 per maand'],
  'reden-inkomen-1750': ['is je netto inkomen lager dan € 1.750 per maand'],
  'reden-uitkering': ['heb je een uitkering'],
  'reden-krediet': ['heb je een lening of krediet'],

  // ── Onderwerpen: één per thema in themas.ts ───────────────────────────────
  'onderwerp-box3-vermogen': ['de belasting op spaargeld en beleggingen (box 3)'],
  'onderwerp-inkomstenbelasting': ['de inkomstenbelasting (box 1)'],
  'onderwerp-pensioenopbouw': ['aanvullend pensioen'],
  'onderwerp-aow': ['de AOW'],
  'onderwerp-huur': ['huren'],
  'onderwerp-eigen-woning': ['de eigen woning en de hypotheek'],
  'onderwerp-huis-kopen': ['een huis kopen'],
  'onderwerp-toeslagen': ['toeslagen'],
  'onderwerp-kinderen': ['regelingen voor ouders en kinderen'],
  'onderwerp-studieschuld': ['studiefinanciering en studieschuld'],
  'onderwerp-zorgkosten': ['zorgkosten'],
  'onderwerp-sparen-rente': ['sparen en spaarrente'],
  'onderwerp-beleggen': ['beleggen'],
  'onderwerp-ondernemers': ['ondernemen'],
  'onderwerp-minimumloon-uitkering': ['het minimumloon en uitkeringen'],
  'onderwerp-consumptief-krediet': ['lenen en krediet'],

  // ── Fragmenten die de renderer samenstelt (v1: in sjablonen.ts/matcher.ts) ─
  /** Banden en bereiken: {bedrag} {lo} {hi} */
  'fragment-vanaf': ['{bedrag} of meer'],
  'fragment-onder': ['minder dan {bedrag}'],
  'fragment-tussen': ['{lo} tot {hi}'],
  'fragment-geen': ['geen'],
  'fragment-minstens': ['minstens {bedrag}'],
  'fragment-hoogstens': ['hoogstens {bedrag}'],
  /** Maanden en stappen: {aantal} {getal} */
  'fragment-maand': ['1 maand'],
  'fragment-maanden': ['{aantal} maanden'],
  'fragment-procentpunt': ['{getal} procentpunt'],
  /** Een opsomming: {eerdere} {laatste} */
  'fragment-opsomming': ['{eerdere} en {laatste}'],
  /** Box 3 met fiscaal partner. */
  'fragment-partner': [' (samen met je fiscale partner)'],
  /** Profielvelden, voor "wat mist". */
  'veld-geboortejaar': ['je geboortejaar'],
  'veld-huishouden': ['je huishouden'],
  'veld-kinderen': ['je kinderen'],
  'veld-werk': ['je werk'],
  'veld-inkomen': ['je inkomen'],
  'veld-wonen': ['je woonsituatie'],
  'veld-hypotheek_restschuld': ['je hypotheekschuld'],
  'veld-hypotheek_rentevast': ['je rentevaste periode'],
  'veld-woonplan': ['je woonplan'],
  'veld-spaargeld': ['je spaargeld'],
  'veld-beleggingen': ['je beleggingen'],
  'veld-beleggingen_vorm': ['de vorm van je beleggingen'],
  'veld-schulden': ['je schulden'],
  'veld-pensioen_werkgever': ['je pensioenopbouw'],
  'veld-pensioen_lijfrente': ['je lijfrente'],
} as const

export type SjabloonId = keyof typeof SJABLONEN
