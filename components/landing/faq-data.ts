/**
 * FAQ-data van de marketing-site, verdeeld per pagina. Elke vraag staat
 * op precies één pagina zodat de JSON-LD FAQPage-schema's elkaar nooit
 * dupliceren (Google-richtlijn).
 *
 * Productowner-beslissingen verwerkt: bankkoppeling in ontwikkeling,
 * freemium met Pro €9, gratis-tier zonder hard AI-quotum (jun 2026):
 * bibliotheek gratis, eigen AI-rekenhulpen op maat = Pro.
 */

export interface Vraag {
  q: string
  a: string
}

/** Vragen over hoe het product werkt → /functies */
export const FAQ_FUNCTIES: Vraag[] = [
  {
    q: 'Kan ik mijn bankrekeningen koppelen?',
    a:
      'Automatische bankkoppeling is in ontwikkeling. Voorlopig kun je transacties handmatig invoeren of als CSV-bestand importeren — alle gangbare NL-banken (ING, Rabobank, ABN AMRO, bunq, ASN, SNS, RegioBank, Knab, Triodos) worden ondersteund.',
  },
  {
    q: 'Hoeveel werk is het opzetten?',
    a:
      'Binnen ±5 minuten heb je een eerste vrijheidsgetal: vul je spaargeld, eventuele schulden en je maandlasten in (schatten mag). Je hoeft niet alles in één keer in te voeren — de app rekent met wat je hebt en je verfijnt later.',
  },
  {
    q: 'Werkt het als ik ook een BV heb?',
    a:
      'TriFinity is een app voor privé-gebruik; je BV staat erin als bezitting, niet als zakelijke boekhouding. Voor privé-keuzes met BV-impact (agio storten (eigen vermogen in de BV inbrengen) vs. privé beleggen, dividend-uitkeerstrategie, lijfrente vs. ETF) zijn er specialist-rekenhulpen in de Pro-tier — box 2 / box 3 / VPB-tarieven instelbaar.',
  },
]

/** Vragen over abonnement en kosten → /prijzen */
export const FAQ_PRIJZEN: Vraag[] = [
  {
    q: 'Heb ik een creditcard nodig?',
    a:
      'Nee. Een gratis account vraagt geen betaalgegevens. Pas als je voor Pro kiest reken je af — en ook dat zeg je maandelijks op.',
  },
  {
    q: 'Blijft Gratis echt gratis?',
    a:
      'Ja. Wie met Gratis begint, houdt het gratis-account — ook ná de introductie van Pro, zolang je wilt. Geen trial-countdown, geen verplichte upgrade.',
  },
  {
    q: 'Wat als ik geen partner heb?',
    a:
      'De app werkt volledig single-user. Huishouden-modus (privé / samen / partner-perspectief) is een Pro-feature voor wie de financiën met een partner deelt. Solo-gebruikers missen niets essentieels.',
  },
  {
    q: 'Kan ik opzeggen?',
    a:
      'Ja, op elk moment. Bij opzegging download je al je data als JSON of CSV — geen vendor-lock-in.',
  },
]

/** Vragen over data en vertrouwen → /veiligheid */
export const FAQ_VEILIGHEID: Vraag[] = [
  {
    q: 'Hoe veilig is mijn data?',
    a:
      'Je financiële gegevens leven EU-hosted op Supabase (Frankfurt), versleuteld in rust en transport. Geen verkoop aan derden, geen marketing-pixels, geen advertentienetwerken — ons businessmodel is jouw abonnement, niet jouw data. Alleen voor de AI-functies sturen we strikt-noodzakelijke context naar onze AI-subprocessor — nooit je volledige dataset, nooit voor advertenties of verkoop aan derden.',
  },
  {
    q: 'Is dit financieel advies?',
    a:
      'Nee. TriFinity is een educatief reken-instrument, geen advies in de zin van de Wft. Geen koop- of verkoopaanbevelingen, geen productpromotie. Voor product-keuzes of fiscale planning blijft een erkend adviseur de aangewezen route.',
  },
]
