/**
 * Test transaction dataset.
 * ~90 realistic Dutch transactions across 3 months.
 * Budget slugs match the structure in budget-data.ts BUDGET_SLUGS.
 */

import { BUDGET_SLUGS } from '@/lib/budget-data'

export type TestTransaction = {
  date: string
  amount: number
  description: string
  counterparty_name: string
  counterparty_iban: string | null
  budgetSlug: string
  is_income: boolean
}

const S = BUDGET_SLUGS

export function getTestTransactions(): TestTransaction[] {
  return [
    // ============ FEBRUARI 2026 ============
    // Inkomen
    { date: '2026-02-01', amount: 2800, description: 'Salaris februari 2026', counterparty_name: 'Werkgever BV', counterparty_iban: 'NL91ABNA0417164300', budgetSlug: S.SALARIS_UITKERING, is_income: true },
    { date: '2026-02-05', amount: 200, description: 'Zorgtoeslag februari', counterparty_name: 'Belastingdienst Toeslagen', counterparty_iban: 'NL86INGB0002445588', budgetSlug: S.TOESLAGEN_KINDERBIJSLAG, is_income: true },
    { date: '2026-02-10', amount: 167, description: 'Voorlopige teruggave IB 2025', counterparty_name: 'Belastingdienst', counterparty_iban: 'NL86INGB0002445588', budgetSlug: S.TERUGGAVE_BELASTING, is_income: true },

    // Vaste lasten
    { date: '2026-02-01', amount: -750, description: 'Huur februari 2026', counterparty_name: 'Woningcorporatie De Woonplaats', counterparty_iban: 'NL39RABO0300065264', budgetSlug: S.HUUR_HYPOTHEEK, is_income: false },
    { date: '2026-02-01', amount: -200, description: 'Termijnbedrag energie feb', counterparty_name: 'Vattenfall', counterparty_iban: 'NL20INGB0001234567', budgetSlug: S.GAS_WATER_LICHT, is_income: false },
    { date: '2026-02-01', amount: -115, description: 'Zorgverzekering feb', counterparty_name: 'Zilveren Kruis', counterparty_iban: 'NL93ABNA0585927836', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { date: '2026-02-01', amount: -35, description: 'Inboedelverzekering feb', counterparty_name: 'Centraal Beheer', counterparty_iban: 'NL75ABNA0500100200', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { date: '2026-02-15', amount: -50, description: 'Gemeentelijke belasting feb', counterparty_name: 'Gemeente Amsterdam', counterparty_iban: 'NL45BNGH0285000522', budgetSlug: S.GEMEENTELIJKE_LASTEN, is_income: false },

    // Boodschappen
    { date: '2026-02-03', amount: -67.43, description: 'Albert Heijn 1234 Amsterdam', counterparty_name: 'Albert Heijn', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2026-02-06', amount: -45.20, description: 'Jumbo Amsterdam Centrum', counterparty_name: 'Jumbo', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2026-02-10', amount: -82.15, description: 'Albert Heijn 1234 Amsterdam', counterparty_name: 'Albert Heijn', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2026-02-14', amount: -35.60, description: 'Lidl Amsterdam Oost', counterparty_name: 'Lidl', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2026-02-17', amount: -71.88, description: 'Albert Heijn 1234 Amsterdam', counterparty_name: 'Albert Heijn', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2026-02-21', amount: -55.30, description: 'Jumbo Amsterdam Centrum', counterparty_name: 'Jumbo', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2026-02-25', amount: -48.92, description: 'Albert Heijn 1234 Amsterdam', counterparty_name: 'Albert Heijn', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },

    // Huishouden & verzorging
    { date: '2026-02-08', amount: -23.45, description: 'Kruidvat Amsterdam Oost', counterparty_name: 'Kruidvat', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false },
    { date: '2026-02-19', amount: -31.20, description: 'Action Amsterdam CS', counterparty_name: 'Action', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false },

    // Kinderen
    { date: '2026-02-01', amount: -50, description: 'BSO maandbijdrage feb', counterparty_name: 'Kinderopvang Pinokkio', counterparty_iban: 'NL55RABO0150000001', budgetSlug: S.KINDEREN_SCHOOL, is_income: false },

    // Medisch
    { date: '2026-02-12', amount: -38.50, description: 'Apotheek De Gaper', counterparty_name: 'Apotheek De Gaper', counterparty_iban: null, budgetSlug: S.MEDISCHE_KOSTEN, is_income: false },

    // Vervoer
    { date: '2026-02-05', amount: -45.20, description: 'Shell Amsterdam Zuid', counterparty_name: 'Shell', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false },
    { date: '2026-02-18', amount: -35.00, description: 'NS Reizigers dagkaart', counterparty_name: 'NS Reizigers', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false },
    { date: '2026-02-01', amount: -70, description: 'Autoverzekering feb', counterparty_name: 'ANWB Verzekeringen', counterparty_iban: 'NL02ABNA0450884700', budgetSlug: S.AUTO_VASTE_LASTEN, is_income: false },
    { date: '2026-02-22', amount: -28.50, description: 'Q-Park Centrum 3 uur', counterparty_name: 'Q-Park', counterparty_iban: null, budgetSlug: S.AUTO_ONDERHOUD, is_income: false },
    { date: '2026-02-09', amount: -15.90, description: 'Swapfiets maandabonnement', counterparty_name: 'Swapfiets', counterparty_iban: 'NL22RABO0300000001', budgetSlug: S.FIETS_DEELVERVOER, is_income: false },

    // Leuke dingen
    { date: '2026-02-07', amount: -42.50, description: 'Restaurant De Kas Amsterdam', counterparty_name: 'Restaurant De Kas', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { date: '2026-02-14', amount: -28.90, description: 'Thuisbezorgd.nl bestelling', counterparty_name: 'Thuisbezorgd', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { date: '2026-02-21', amount: -24.00, description: 'Cafe De Witte Aap Rotterdam', counterparty_name: 'Cafe De Witte Aap', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { date: '2026-02-07', amount: -12.99, description: 'Netflix maandabonnement', counterparty_name: 'Netflix', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { date: '2026-02-07', amount: -9.99, description: 'Spotify Premium', counterparty_name: 'Spotify', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { date: '2026-02-15', amount: -29.90, description: 'Basic-Fit maandabonnement', counterparty_name: 'Basic-Fit', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { date: '2026-02-16', amount: -89.00, description: 'Booking.com weekenduitje', counterparty_name: 'Booking.com', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { date: '2026-02-20', amount: -59.95, description: 'Zalando bestelling kleding', counterparty_name: 'Zalando', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },

    // Sparen & schulden
    { date: '2026-02-01', amount: -100, description: 'Overboeking spaarrekening', counterparty_name: 'Spaarrekening', counterparty_iban: 'NL11RABO0100000002', budgetSlug: S.SPAREN_NOODBUFFER, is_income: false },
    { date: '2026-02-01', amount: -80, description: 'Maandelijkse inleg Meesman', counterparty_name: 'Meesman Indexbeleggen', counterparty_iban: 'NL15RABO0300000003', budgetSlug: S.INVESTEREN_FIRE, is_income: false },
    { date: '2026-02-01', amount: -60, description: 'Aflossing persoonlijke lening', counterparty_name: 'ING Financieringen', counterparty_iban: 'NL20INGB0001234568', budgetSlug: S.SCHULDEN_AFLOSSINGEN, is_income: false },
    { date: '2026-02-01', amount: -20, description: 'Extra aflossing hypotheek feb', counterparty_name: 'ABN AMRO Hypotheken', counterparty_iban: 'NL02ABNA0450884701', budgetSlug: S.EXTRA_AFLOSSING_HYPOTHEEK, is_income: false },

    // ============ JANUARI 2026 ============
    // Inkomen
    { date: '2026-01-01', amount: 2800, description: 'Salaris januari 2026', counterparty_name: 'Werkgever BV', counterparty_iban: 'NL91ABNA0417164300', budgetSlug: S.SALARIS_UITKERING, is_income: true },
    { date: '2026-01-05', amount: 200, description: 'Zorgtoeslag januari', counterparty_name: 'Belastingdienst Toeslagen', counterparty_iban: 'NL86INGB0002445588', budgetSlug: S.TOESLAGEN_KINDERBIJSLAG, is_income: true },
    { date: '2026-01-20', amount: 195, description: 'Verkoop Marktplaats fiets', counterparty_name: 'J. de Vries', counterparty_iban: 'NL55INGB0001234500', budgetSlug: S.OVERIGE_INKOMSTEN, is_income: true },

    // Vaste lasten
    { date: '2026-01-01', amount: -750, description: 'Huur januari 2026', counterparty_name: 'Woningcorporatie De Woonplaats', counterparty_iban: 'NL39RABO0300065264', budgetSlug: S.HUUR_HYPOTHEEK, is_income: false },
    { date: '2026-01-01', amount: -210, description: 'Termijnbedrag energie jan', counterparty_name: 'Vattenfall', counterparty_iban: 'NL20INGB0001234567', budgetSlug: S.GAS_WATER_LICHT, is_income: false },
    { date: '2026-01-01', amount: -115, description: 'Zorgverzekering jan', counterparty_name: 'Zilveren Kruis', counterparty_iban: 'NL93ABNA0585927836', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { date: '2026-01-01', amount: -35, description: 'Inboedelverzekering jan', counterparty_name: 'Centraal Beheer', counterparty_iban: 'NL75ABNA0500100200', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { date: '2026-01-15', amount: -50, description: 'Gemeentelijke belasting jan', counterparty_name: 'Gemeente Amsterdam', counterparty_iban: 'NL45BNGH0285000522', budgetSlug: S.GEMEENTELIJKE_LASTEN, is_income: false },

    // Boodschappen
    { date: '2026-01-04', amount: -72.30, description: 'Albert Heijn 1234 Amsterdam', counterparty_name: 'Albert Heijn', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2026-01-07', amount: -38.90, description: 'Lidl Amsterdam Oost', counterparty_name: 'Lidl', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2026-01-11', amount: -91.45, description: 'Albert Heijn 1234 Amsterdam', counterparty_name: 'Albert Heijn', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2026-01-14', amount: -28.70, description: 'Aldi Amsterdam West', counterparty_name: 'Aldi', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2026-01-18', amount: -65.55, description: 'Jumbo Amsterdam Centrum', counterparty_name: 'Jumbo', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2026-01-22', amount: -54.80, description: 'Albert Heijn 1234 Amsterdam', counterparty_name: 'Albert Heijn', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2026-01-28', amount: -42.10, description: 'Dirk van den Broek', counterparty_name: 'Dirk', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },

    // Huishouden
    { date: '2026-01-12', amount: -18.90, description: 'Hema Amsterdam Oost', counterparty_name: 'Hema', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false },
    { date: '2026-01-25', amount: -42.30, description: 'Etos schoonmaakartikelen', counterparty_name: 'Etos', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false },

    // Kinderen
    { date: '2026-01-01', amount: -50, description: 'BSO maandbijdrage jan', counterparty_name: 'Kinderopvang Pinokkio', counterparty_iban: 'NL55RABO0150000001', budgetSlug: S.KINDEREN_SCHOOL, is_income: false },

    // Vervoer
    { date: '2026-01-08', amount: -52.30, description: 'Shell Amsterdam Zuid', counterparty_name: 'Shell', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false },
    { date: '2026-01-22', amount: -24.50, description: 'OV-chipkaart opladen', counterparty_name: 'OV-chipkaart', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false },
    { date: '2026-01-01', amount: -70, description: 'Autoverzekering jan', counterparty_name: 'ANWB Verzekeringen', counterparty_iban: 'NL02ABNA0450884700', budgetSlug: S.AUTO_VASTE_LASTEN, is_income: false },
    { date: '2026-01-09', amount: -15.90, description: 'Swapfiets maandabonnement', counterparty_name: 'Swapfiets', counterparty_iban: 'NL22RABO0300000001', budgetSlug: S.FIETS_DEELVERVOER, is_income: false },

    // Leuke dingen
    { date: '2026-01-10', amount: -55.00, description: 'Restaurant Italiano Amsterdam', counterparty_name: 'Restaurant Italiano', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { date: '2026-01-17', amount: -22.50, description: 'Uber Eats bestelling', counterparty_name: 'Uber Eats', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { date: '2026-01-07', amount: -12.99, description: 'Netflix maandabonnement', counterparty_name: 'Netflix', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { date: '2026-01-07', amount: -9.99, description: 'Spotify Premium', counterparty_name: 'Spotify', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { date: '2026-01-15', amount: -29.90, description: 'Basic-Fit maandabonnement', counterparty_name: 'Basic-Fit', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { date: '2026-01-24', amount: -14.50, description: 'Pathe bioscoop Amsterdam', counterparty_name: 'Pathe', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { date: '2026-01-19', amount: -45.00, description: 'H&M kleding', counterparty_name: 'H&M', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },

    // Sparen
    { date: '2026-01-01', amount: -100, description: 'Overboeking spaarrekening', counterparty_name: 'Spaarrekening', counterparty_iban: 'NL11RABO0100000002', budgetSlug: S.SPAREN_NOODBUFFER, is_income: false },
    { date: '2026-01-01', amount: -80, description: 'Maandelijkse inleg Meesman', counterparty_name: 'Meesman Indexbeleggen', counterparty_iban: 'NL15RABO0300000003', budgetSlug: S.INVESTEREN_FIRE, is_income: false },
    { date: '2026-01-01', amount: -60, description: 'Aflossing persoonlijke lening', counterparty_name: 'ING Financieringen', counterparty_iban: 'NL20INGB0001234568', budgetSlug: S.SCHULDEN_AFLOSSINGEN, is_income: false },
    { date: '2026-01-01', amount: -20, description: 'Extra aflossing hypotheek jan', counterparty_name: 'ABN AMRO Hypotheken', counterparty_iban: 'NL02ABNA0450884701', budgetSlug: S.EXTRA_AFLOSSING_HYPOTHEEK, is_income: false },

    // ============ DECEMBER 2025 ============
    // Inkomen
    { date: '2025-12-01', amount: 2800, description: 'Salaris december 2025', counterparty_name: 'Werkgever BV', counterparty_iban: 'NL91ABNA0417164300', budgetSlug: S.SALARIS_UITKERING, is_income: true },
    { date: '2025-12-05', amount: 200, description: 'Zorgtoeslag december', counterparty_name: 'Belastingdienst Toeslagen', counterparty_iban: 'NL86INGB0002445588', budgetSlug: S.TOESLAGEN_KINDERBIJSLAG, is_income: true },
    { date: '2025-12-15', amount: 167, description: 'Voorlopige teruggave IB 2024', counterparty_name: 'Belastingdienst', counterparty_iban: 'NL86INGB0002445588', budgetSlug: S.TERUGGAVE_BELASTING, is_income: true },

    // Vaste lasten
    { date: '2025-12-01', amount: -750, description: 'Huur december 2025', counterparty_name: 'Woningcorporatie De Woonplaats', counterparty_iban: 'NL39RABO0300065264', budgetSlug: S.HUUR_HYPOTHEEK, is_income: false },
    { date: '2025-12-01', amount: -220, description: 'Termijnbedrag energie dec', counterparty_name: 'Vattenfall', counterparty_iban: 'NL20INGB0001234567', budgetSlug: S.GAS_WATER_LICHT, is_income: false },
    { date: '2025-12-01', amount: -115, description: 'Zorgverzekering dec', counterparty_name: 'Zilveren Kruis', counterparty_iban: 'NL93ABNA0585927836', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { date: '2025-12-01', amount: -35, description: 'Inboedelverzekering dec', counterparty_name: 'Centraal Beheer', counterparty_iban: 'NL75ABNA0500100200', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { date: '2025-12-15', amount: -50, description: 'Gemeentelijke belasting dec', counterparty_name: 'Gemeente Amsterdam', counterparty_iban: 'NL45BNGH0285000522', budgetSlug: S.GEMEENTELIJKE_LASTEN, is_income: false },

    // Boodschappen (december: hogere uitgaven vanwege feestdagen)
    { date: '2025-12-02', amount: -85.40, description: 'Albert Heijn 1234 Amsterdam', counterparty_name: 'Albert Heijn', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2025-12-06', amount: -52.70, description: 'Jumbo Amsterdam Centrum', counterparty_name: 'Jumbo', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2025-12-10', amount: -68.30, description: 'Albert Heijn 1234 Amsterdam', counterparty_name: 'Albert Heijn', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2025-12-15', amount: -42.90, description: 'Lidl Amsterdam Oost', counterparty_name: 'Lidl', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2025-12-20', amount: -95.60, description: 'Albert Heijn kerst boodschappen', counterparty_name: 'Albert Heijn', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },
    { date: '2025-12-23', amount: -110.25, description: 'Jumbo kerstinkopen', counterparty_name: 'Jumbo', counterparty_iban: null, budgetSlug: S.BOODSCHAPPEN, is_income: false },

    // Huishouden
    { date: '2025-12-08', amount: -28.90, description: 'Kruidvat Amsterdam Oost', counterparty_name: 'Kruidvat', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false },

    // Kinderen
    { date: '2025-12-01', amount: -50, description: 'BSO maandbijdrage dec', counterparty_name: 'Kinderopvang Pinokkio', counterparty_iban: 'NL55RABO0150000001', budgetSlug: S.KINDEREN_SCHOOL, is_income: false },

    // Medisch
    { date: '2025-12-18', amount: -45.00, description: 'Tandarts controle + reiniging', counterparty_name: 'Tandarts Praktijk Zuid', counterparty_iban: null, budgetSlug: S.MEDISCHE_KOSTEN, is_income: false },

    // Vervoer
    { date: '2025-12-05', amount: -48.70, description: 'Shell Amsterdam Zuid', counterparty_name: 'Shell', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false },
    { date: '2025-12-01', amount: -70, description: 'Autoverzekering dec', counterparty_name: 'ANWB Verzekeringen', counterparty_iban: 'NL02ABNA0450884700', budgetSlug: S.AUTO_VASTE_LASTEN, is_income: false },
    { date: '2025-12-12', amount: -185.00, description: 'Garage APK keuring + reparatie', counterparty_name: 'Garage Van Dijk', counterparty_iban: null, budgetSlug: S.AUTO_ONDERHOUD, is_income: false },
    { date: '2025-12-09', amount: -15.90, description: 'Swapfiets maandabonnement', counterparty_name: 'Swapfiets', counterparty_iban: 'NL22RABO0300000001', budgetSlug: S.FIETS_DEELVERVOER, is_income: false },

    // Leuke dingen (december: meer uitgaven feestdagen)
    { date: '2025-12-13', amount: -75.00, description: 'Restaurant kerstdiner', counterparty_name: 'Restaurant Het Gouden Hoofd', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { date: '2025-12-24', amount: -35.50, description: 'Deliveroo kerstavond', counterparty_name: 'Deliveroo', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { date: '2025-12-07', amount: -12.99, description: 'Netflix maandabonnement', counterparty_name: 'Netflix', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { date: '2025-12-07', amount: -9.99, description: 'Spotify Premium', counterparty_name: 'Spotify', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { date: '2025-12-15', amount: -29.90, description: 'Basic-Fit maandabonnement', counterparty_name: 'Basic-Fit', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { date: '2025-12-19', amount: -89.00, description: 'Wehkamp kerstcadeaus', counterparty_name: 'Wehkamp', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    { date: '2025-12-22', amount: -35.00, description: 'Bol.com cadeau bestelling', counterparty_name: 'Bol.com', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },

    // Sparen
    { date: '2025-12-01', amount: -100, description: 'Overboeking spaarrekening', counterparty_name: 'Spaarrekening', counterparty_iban: 'NL11RABO0100000002', budgetSlug: S.SPAREN_NOODBUFFER, is_income: false },
    { date: '2025-12-01', amount: -80, description: 'Maandelijkse inleg Meesman', counterparty_name: 'Meesman Indexbeleggen', counterparty_iban: 'NL15RABO0300000003', budgetSlug: S.INVESTEREN_FIRE, is_income: false },
    { date: '2025-12-01', amount: -60, description: 'Aflossing persoonlijke lening', counterparty_name: 'ING Financieringen', counterparty_iban: 'NL20INGB0001234568', budgetSlug: S.SCHULDEN_AFLOSSINGEN, is_income: false },
    { date: '2025-12-01', amount: -20, description: 'Extra aflossing hypotheek dec', counterparty_name: 'ABN AMRO Hypotheken', counterparty_iban: 'NL02ABNA0450884701', budgetSlug: S.EXTRA_AFLOSSING_HYPOTHEEK, is_income: false },
  ]
}
