import type { CheckReportData, ReportProjectionPoint } from '@/lib/check/types'

/**
 * Realistische "Sanne"-fixture (34 jaar) voor de preview/validatie van de
 * rapport-render zónder werkende backend/DB. Waarden sporen met het canonieke
 * ontwerp `vrijheidsrapport.html`. Wordt geserveerd op `?preview=1` of in dev
 * wanneer er geen token is — NOOIT in productie met een geldig token.
 */

// ── Projectie-reeksen ───────────────────────────────────────────────────────
// V_op: opgebouwd besteedbaar vermogen 34→58, stijgend tot het rond 52 het
// scalaire vrijheidsniveau (€640k) raakt. Daarna loopt het door tot ~58.
const vOp: ReportProjectionPoint[] = (() => {
  const pts: ReportProjectionPoint[] = []
  let v = 70_240
  for (let age = 34; age <= 58; age++) {
    pts.push({ age, value: Math.round(v) })
    // jaarlijkse groei: rendement + inleg, oplopend richting FIRE
    v = v * 1.058 + 13_500
  }
  return pts
})()

// Scenario-reeksen: zelfde inleg, rendement −2pp / +2pp t.o.v. basis (5,8%).
function vOpAtReturn(annualGrowth: number): ReportProjectionPoint[] {
  const pts: ReportProjectionPoint[] = []
  let v = 70_240
  for (let age = 34; age <= 58; age++) {
    pts.push({ age, value: Math.round(v) })
    v = v * annualGrowth + 13_500
  }
  return pts
}
const vOpLow = vOpAtReturn(1.038)
const vOpHigh = vOpAtReturn(1.078)

// Levenspad: netto vermogen 34→90, inclusief decumulatie na FIRE (52),
// piek rond 58, lichte daling, AOW+pensioen vlakt af op 68. `returnDelta` (in
// fracties, bv. -0.02 / +0.02) verschuift het rendement in elke fase — zo
// genereren we de ±2%-scenariobanden over de HELE lijn (opbouw + afbouw).
function makeLifePath(returnDelta = 0): ReportProjectionPoint[] {
  const pts: ReportProjectionPoint[] = []
  let v = 87_400 // netto vermogen incl. huis
  for (let age = 34; age <= 90; age++) {
    pts.push({ age, value: Math.round(v) })
    if (age < 52) {
      v = v * (1.052 + returnDelta) + 16_000 // opbouwfase
    } else if (age < 58) {
      v = v * (1.05 + returnDelta) - 8_000 // net na FIRE groeit belegd deel nog harder
    } else if (age < 68) {
      v = v * (1.028 + returnDelta) - 24_000 // decumulatie
    } else {
      v = v * (1.02 + returnDelta) - 6_000 // AOW + pensioen zet verval bijna stil
    }
    if (v < 0) v = 0
  }
  return pts
}
const lifePath = makeLifePath(0)
const lifePathLow = makeLifePath(-0.02)
const lifePathHigh = makeLifePath(0.02)

export const SAMPLE_REPORT: CheckReportData = {
  generatedAt: '2026-06-17T09:00:00.000Z',
  masthead: {
    displayName: 'Sanne',
    age: 34,
    dateLabel: '17 juni 2026',
  },
  lifeGrid: {
    endAge: 90,
    age: 34,
    alreadyFundedYears: 3.1,
    grindYears: 15,
    freeYears: 38,
    fireAge: 52,
    fireReachable: true,
  },
  snapshot: {
    netWorth: 87_400,
    netWorthFreedom: { years: 3, months: 1, totalDays: 1126 },
    netWorthFreedomLabel: '3 jaar & 1 maand',
    // Vrijheidsvermogen: het €-bedrag waaróp de vrijheidstijd rust (FIRE-eligible,
    // huis voor 50% meegerekend) — lager dan het headline netto vermogen.
    // = netWorth (87.400) − 50% van de netto huiswaarde (17.160) = 87.400 − 8.580.
    freedomBaseEur: 78_820,
    savingsRatePct: 24,
    savingsMonthly: 780,
    bufferMonths: 5.2,
    emergencyFund: 16_640,
    netMonthlyIncome: 3_250,
    monthlyExpenses: 2_470,
    expenseToIncomePct: 76,
  },
  dualBars: [
    { name: 'Beleggingen', bucket: 'beleggingen', eur: 31_600, pctOfTotal: 36, freedomLabel: '13,4 mnd', countsForFire: true },
    { name: 'Pensioen', bucket: 'pensioen', eur: 22_000, pctOfTotal: 25, freedomLabel: '9,3 mnd', countsForFire: true },
    { name: 'Cash', bucket: 'cash', eur: 16_640, pctOfTotal: 19, freedomLabel: '7,0 mnd', countsForFire: true },
    { name: 'Huis (netto)', bucket: 'huis', eur: 17_160, pctOfTotal: 20, freedomLabel: '3,5 mnd · telt voor 50% mee', countsForFire: false },
  ],
  monthBalance: {
    savingsRatePct: 24,
    rows: [
      { label: 'Netto inkomen', perMonth: 3_250, perYear: 39_000, freedomPerYearLabel: null, kind: 'income' },
      { label: '— Wonen (hypotheek + VvE)', perMonth: 1_180, perYear: 14_160, freedomPerYearLabel: '6,1 mnd', kind: 'expense' },
      { label: '— Vaste lasten overig', perMonth: 1_290, perYear: 15_480, freedomPerYearLabel: '6,6 mnd', kind: 'expense' },
      { label: '— Vrij besteedbaar', perMonth: 0, perYear: 0, freedomPerYearLabel: null, kind: 'free' },
      { label: 'Overschot → sparen', perMonth: 780, perYear: 9_360, freedomPerYearLabel: null, kind: 'total' },
    ],
  },
  health: {
    score: 72,
    label: 'Gezond',
    copy: 'Een 72 betekent: je fundament staat. Rondkomen en buffer zijn op orde, geen dure schuld die aan je rendement knaagt, je vrijheidsopbouw loopt. De winst zit nu in <em>versnellen</em>, niet repareren — daarover gaan Wills zetten.',
    pillars: [
      { id: 'savings_rate', name: 'Spaarquote', score: 82, status: 'green', note: '24%' },
      { id: 'emergency_fund', name: 'Noodfonds', score: 78, status: 'green', note: '5,2 mnd' },
      { id: 'debt_service_ratio', name: 'Schuldenlast', score: 64, status: 'amber', note: '39%' },
      { id: 'debt_ratio', name: 'Schuldratio', score: 60, status: 'amber', note: '72%' },
      { id: 'fire_progress', name: 'FIRE-voortgang', score: 41, status: 'amber', note: '41%' },
      { id: 'asset_concentration', name: 'Vermogensspreiding', score: 70, status: 'green', note: '45% in 1 type' },
    ],
  },
  benchmark: {
    sourceBadge: 'Geraamd (CBS-basis)',
    rows: [
      { label: 'Spaarquote', you: 24, youDisplay: '24%', average: 13, averageDisplay: 'gem. 13%', better: true },
      { label: 'Buffer (mnd)', you: 5.2, youDisplay: '5,2', average: 3.0, averageDisplay: 'gem. 3,0', better: true },
      { label: 'Vermogen / leeftijd', you: 87_000, youDisplay: '€87k', average: 76_000, averageDisplay: 'gem. €76k', better: true },
      { label: 'Gezondheidsgetal', you: 72, youDisplay: '72', average: 59, averageDisplay: 'gem. 59', better: true },
    ],
  },
  kruising: {
    vOp,
    crossing: { age: 52, value: 640_000 },
    fireReachable: true,
    startYear: 2026,
    endYear: 2050,
    realReturnPct: 4,
    savingsRatePct: 24,
    scenarios: [
      {
        label: '−2% rendement',
        returnDeltaPct: -2,
        vOp: vOpLow,
        crossing: { age: 56, value: 660_000 },
      },
      {
        label: '+2% rendement',
        returnDeltaPct: 2,
        vOp: vOpHigh,
        crossing: { age: 49, value: 625_000 },
      },
    ],
  },
  savingsHistory: {
    available: true,
    targetPct: 24,
    note: '% van netto inkomen · stippellijn = doel 24%',
    bars: [
      { month: 'jul', pct: 18 },
      { month: 'aug', pct: 21 },
      { month: 'sep', pct: 19 },
      { month: 'okt', pct: 24 },
      { month: 'nov', pct: 22 },
      { month: 'dec', pct: 26 },
      { month: 'jan', pct: 23 },
      { month: 'feb', pct: 24 },
      { month: 'mrt', pct: 28 },
      { month: 'apr', pct: 24 },
      { month: 'mei', pct: 27 },
      { month: 'jun', pct: 24 },
    ],
  },
  twoFutures: {
    fireAge: 52,
    fireYear: 2044,
    yearsUntilFire: 18,
    stopToday: { years: 3, months: 1, totalDays: 1126 },
    stopTodayLabel: '3 jr 1 mnd',
    stayFreeYears: 38,
  },
  fireCards: [
    { key: 'stop', value: '3 jr', sub: '& 1 mnd vrij' },
    { key: 'koers', value: '~9 dg', sub: 'vrijheid / maand' },
    { key: 'onderweg', value: '41%', sub: 'van doelvermogen' },
    { key: 'passief', value: '€2.340', sub: 'netto/mnd, geïndexeerd' },
  ],
  sensitivity: [
    { lever: 'Spaarquote 24% → 28%', effectLabel: '−1 jr 4 mnd', better: true },
    { lever: 'Reëel rendement 4% → 5%', effectLabel: '−2 jr 7 mnd', better: true },
    { lever: 'Uitgaven +€200/mnd', effectLabel: '+2 jr 1 mnd', better: false },
    { lever: 'Eenmalig +€20k beleggen', effectLabel: '−1 jr 0 mnd', better: true },
  ],
  withdrawalStrategies: [
    { strategy: 'Vast 3,5% (SWR)', year1: 22_400, sustainableUntil: '95+', risk: 'green', riskLabel: 'laag' },
    { strategy: 'VPW (herrekend)', year1: 24_100, sustainableUntil: 'levenslang', risk: 'amber', riskLabel: 'variabel' },
    { strategy: 'Guyton-Klinger', year1: 23_200, sustainableUntil: '95+', risk: 'green', riskLabel: 'laag' },
  ],
  lifePath: {
    points: lifePath,
    scenarios: [
      { label: '−2% rendement', returnDeltaPct: -2, points: lifePathLow },
      { label: '+2% rendement', returnDeltaPct: 2, points: lifePathHigh },
    ],
    fireAge: 52,
    endAge: 90,
    peakNote:
      'Je vermogen piekt rond je 58e — nét na je vrijheidsmoment blijft je belegd deel nog harder groeien dan je eraan onttrekt. Daarna daalt de lijn licht, tot AOW en pensioen op je 68e het verval bijna stilzetten. Je eindigt ruim met buffer.',
    markers: [
      { name: 'Box 3 op werkelijk rendement', type: 'natuurlijk', age: 36, year: 2028, effect: 'echt i.p.v. fictief rendement belast', illustrative: false },
      { name: 'Salarissprong (+15%)', type: 'leven', age: 40, year: 2032, effect: '+€95/mnd spaarruimte', illustrative: true },
      { name: 'FIRE-moment bereikt', type: 'leven', age: 52, year: 2044, effect: 'inkomen wordt optioneel', illustrative: false },
      { name: 'Hypotheek volledig afgelost', type: 'natuurlijk', age: 58, year: 2050, effect: 'lasten −€820/mnd', illustrative: false },
      { name: 'AOW + pensioen gaat in', type: 'natuurlijk', age: 68, year: 2060, effect: '+€1.850/mnd inkomen', illustrative: false },
    ],
  },
  will: {
    intro:
      'Hé Sanne. Je staat er goed voor — fundament op orde, koers helder. Geen reparatiewerk, alleen versnelling. Ik koos drie zetten die elk meetbaar tijd opleveren, niet alleen geld. Geen advies, wél inzicht: jij beslist. De groene blokjes laten zien hoeveel dagen vrijheid elke zet je per jaar oplevert.',
    moves: [
      {
        title: 'Laat je bufferoverschot werken',
        body: 'Je buffer dekt 5,2 maanden — comfortabel, maar het deel boven 4 maanden (±€4.800) staat stil terwijl inflatie eraan knaagt. Breng het naar je beleggingsdeel en het groeit mee richting je vrijheid.',
        gainLabel: '~6 dagen vrijheid / jaar',
        gainDays: 6,
        kind: 'freedom-days',
      },
      {
        title: 'Los je duurste schuldpost eerst af',
        body: 'Eén post heeft een rente hoger dan je verwachte beleggingsrendement. Elke euro die je daar aflost levert gegarandeerd meer op dan elke euro die je belegt — het enige zekere rendement dat bestaat.',
        gainLabel: '~11 dagen vrijheid / jaar',
        gainDays: 11,
        kind: 'freedom-days',
      },
      {
        title: 'Til je spaarquote van 24% naar 28%',
        body: 'Vier procentpunt klinkt klein, maar over 18 jaar schuift het je vrijheidsmoment 16 maanden naar voren. Eén automatische verhoging bij je volgende salarisstap doet het meeste werk — je merkt het amper.',
        gainLabel: '↑ vrijheid ~16 maanden eerder',
        kind: 'fire-months',
      },
    ],
  },
  houseInclusion: {
    weightPct: 50,
    note: 'We rekenen je eigen woning voor 50% mee in je vrijheid (de helft die je kunt verzilveren of verkleinen). In de app stel je dit nauwkeuriger in — bijvoorbeeld verkopen, een opeethypotheek of helemaal niet meerekenen.',
  },
  news: {
    sourceNote:
      'Algemeen financieel nieuws · gebaseerd op de laatste bronnen · bijgewerkt 17 juni 2026',
    items: [
      {
        category: 'fiscaal',
        headline: 'Box 3 schuift definitief naar werkelijk rendement',
        summary:
          'Vanaf 2028 betaal je belasting over je écht behaalde rendement in plaats van een fictief percentage. Voor spaarders met veel cash kan dat gunstig uitpakken.',
        sourceName: 'Rijksoverheid',
        sourceUrl: 'https://www.rijksoverheid.nl/onderwerpen/box-3',
        dateLabel: '14 juni 2026',
        impact:
          'Heb je veel spaargeld? Dan kan je belastingdruk dalen — dat scheelt direct in wat je netto overhoudt om vrijheid mee op te bouwen.',
      },
      {
        category: 'rente',
        headline: 'Spaarrente zakt verder nu de ECB de rente verlaagt',
        summary:
          'Grootbanken volgen het rentebesluit en verlagen hun spaartarieven. Geld dat je niet als buffer nodig hebt, levert op een spaarrekening steeds minder op.',
        sourceName: 'De Nederlandsche Bank',
        sourceUrl: 'https://www.dnb.nl/',
        dateLabel: '11 juni 2026',
        impact:
          'Buffer die je niet nodig hebt, brokkelt langzaam af tegen inflatie. Beleggen of aflossen levert je vrijheidsjaren mogelijk sneller op.',
      },
      {
        category: 'woningmarkt',
        headline: 'Hypotheekrente stabiliseert na maanden van stijging',
        summary:
          'De gemiddelde 10-jaarsrente blijft deze maand vlak. Voor wie vervroegd aflost verandert er weinig aan de afweging beleggen versus aflossen.',
        sourceName: 'Nibud',
        sourceUrl: 'https://www.nibud.nl/',
        dateLabel: '9 juni 2026',
        impact:
          'Een vlakke rente maakt de keuze beleggen-versus-aflossen rustiger: geen haast, wél het moment om te kijken wat jouw euro’s het hardst laat werken.',
      },
    ],
  },
  cta: {
    signupHref: '/signup?check=preview',
    perks: [
      { title: 'Live volgen', body: 'Vermogen, buffer en vrijheids-% bewegen mee, automatisch bijgewerkt.' },
      { title: "Scenario's", body: 'Schuif aan de knoppen en zie direct wat het doet met je vrijheidsmoment.' },
      { title: 'Will als coach', body: "Stel je vragen, krijg warme uitleg — op het moment dat je 't nodig hebt." },
      { title: 'Banken koppelen', body: 'Koppel je rekeningen en je spaarquote vult zich met je echte maandlijn.' },
      { title: 'Je dossier blijft', body: 'Dit rapport wordt je startpunt — geen leeg scherm, maar precies deze cijfers.' },
    ],
  },
  disclaimers: {
    wft: 'Dit rapport biedt inzicht en algemene tips, geen persoonlijk financieel advies in de zin van de Wft. De berekeningen tonen scenario\'s op basis van je eigen invoer en kunnen afwijken van je werkelijke situatie. Rendementen uit het verleden bieden geen garantie voor de toekomst.',
    avg: 'Je gegevens zijn versleuteld opgeslagen. Niet-geconverteerde aanvragen worden na 90 dagen automatisch verwijderd.',
  },
}
