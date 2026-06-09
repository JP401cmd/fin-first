import { describe, it, expect } from 'vitest'
import { parseCSV } from './csv'
import { CSV_PRESETS } from './index'

const ING = CSV_PRESETS.find((p) => p.id === 'ing')!

const RABO = CSV_PRESETS.find((p) => p.id === 'rabobank')!

const PAYPAL = CSV_PRESETS.find((p) => p.id === 'paypal')!

const HEADER =
  '"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Naam uiteindelijke partij","Naam initiërende partij","BIC tegenpartij","Code","Batch ID","Transactiereferentie","Machtigingskenmerk","Incassant ID","Betalingskenmerk","Omschrijving-1","Omschrijving-2","Omschrijving-3","Reden retour","Oorspr bedrag","Oorspr munt","Koers"'

const INCASSO =
  '"NL60RABO0330370596","EUR","RABONL2U","014705","2026-01-19","2026-01-19","-4,99","+936,35","LU89751000135104200E","PayPal Europe","","","PPLXLUL2","ei","","1047645677604","5W5J224MY3Z9C","LU96ZZZ0000000000000000058","","1047645677604/PAYPAL"," ","","","","",""'

const FX =
  '"NL60RABO0330370596","EUR","RABONL2U","012384","2024-02-05","2024-02-05","-1,09","+9852,07","","Passaggio Free Flow","","","","bc","","","","","","Bavois, 1372, CHE, 04-02-2024 10:25"," ","","","1,00","CHF","0,93457"'

describe('parseCSV ING preset — nieuwe velden zijn null zonder kolomconfiguratie', () => {
  const ING_HEADER = 'Datum;Naam / Omschrijving;Rekening;Tegenrekening;Code;Af Bij;Bedrag (EUR);Mutatiesoort;Mededelingen'
  const ING_ROW    = '20260101;Albert Heijn;NL60RABO0330370596;NL92ABNA0311015505;ba;Af;12,50;Betaalautomaat;Boodschappen'

  it('velden running_balance, creditor_id, fx_amount, fx_currency, fx_rate, transaction_type, bank_code, bank_seq zijn null', async () => {
    const txns = await parseCSV([ING_HEADER, ING_ROW].join('\n'), ING)
    expect(txns).toHaveLength(1)
    const t = txns[0]
    expect(t.running_balance).toBeNull()
    expect(t.creditor_id).toBeNull()
    expect(t.fx_amount).toBeNull()
    expect(t.fx_currency).toBeNull()
    expect(t.fx_rate).toBeNull()
    expect(t.transaction_type).toBeNull()
    expect(t.bank_code).toBeNull()
    expect(t.bank_seq).toBeNull()
  })
})

describe('parseCSV rabobank extra velden', () => {
  it('mapt Code naar bank_code, Saldo, Incassant ID; transaction_type is null', async () => {
    const txns = await parseCSV([HEADER, INCASSO].join('\n'), RABO)
    expect(txns).toHaveLength(1)
    const t = txns[0]
    expect(t.bank_code).toBe('ei')
    expect(t.transaction_type).toBeNull()
    expect(t.running_balance).toBeCloseTo(936.35)
    expect(t.creditor_id).toBe('LU96ZZZ0000000000000000058')
    expect(t.fx_amount).toBeNull()
  })

  it('mapt FX-velden bij vreemde valuta; bank_code correct; transaction_type is null', async () => {
    const txns = await parseCSV([HEADER, FX].join('\n'), RABO)
    const t = txns[0]
    expect(t.bank_code).toBe('bc')
    expect(t.transaction_type).toBeNull()
    expect(t.fx_amount).toBeCloseTo(1.0)
    expect(t.fx_currency).toBe('CHF')
    expect(t.fx_rate).toBeCloseTo(0.93457)
  })
})

describe('parseCSV PayPal — Type-kolom landt in source_type', () => {
  // PayPal-kolommen: Datum(0), Tijd(1), Tijdzone(2), Naam(3), Type(4), Status(5),
  // Valuta(6), Bruto(7), Kosten(8), Netto(9), Saldo(10), Ref(11), Transactie-ID(12)
  const PP_HEADER = '"Datum","Tijd","Tijdzone","Naam","Type","Status","Valuta","Bruto","Kosten","Netto","Saldo","Ref","Transactie-ID"'
  const PP_WITHDRAW = '"05/03/2026","12:00:00","CET","","Algemene opname","Voltooid","EUR","-50,00","0,00","-50,00","10,00","","REF1"'
  const PP_PAYMENT = '"06/03/2026","13:00:00","CET","Bol.com","Algemene betaling","Voltooid","EUR","-30,00","0,00","-30,00","-20,00","","REF2"'

  it('leest Type in source_type (opname = verschuiving, betaling = uitgave)', async () => {
    const txns = await parseCSV([PP_HEADER, PP_WITHDRAW, PP_PAYMENT].join('\n'), PAYPAL)
    expect(txns).toHaveLength(2)
    expect(txns[0].source_type).toBe('Algemene opname')
    expect(txns[0].amount).toBeCloseTo(-50)
    expect(txns[1].source_type).toBe('Algemene betaling')
    expect(txns[1].counterparty_name).toBe('Bol.com')
  })

  it('niet-PayPal presets laten source_type null', async () => {
    const [t] = await parseCSV([HEADER, INCASSO].join('\n'), RABO)
    expect(t.source_type).toBeNull()
  })
})

describe('parseCSV PayPal — datumscheidingsteken-tolerantie (NL-export)', () => {
  // PayPal NL exporteert datums vaak als DD-MM-YYYY (koppelteken), terwijl de preset
  // DD/MM/YYYY aangeeft. parseDate moet beide scheidingstekens aankunnen i.p.v. de
  // hele import te laten crashen op een ontbrekende '/'.
  const PP_HEADER = '"Datum","Tijd","Tijdzone","Naam","Type","Status","Valuta","Bruto","Kosten","Netto","Saldo","Ref","Transactie-ID"'

  it('parseert DD-MM-YYYY ook onder de DD/MM/YYYY-preset', async () => {
    const row = '"19-03-2026","13:00:00","CET","Bol.com","Algemene betaling","Voltooid","EUR","-30,00","0,00","-30,00","-20,00","","REF9"'
    const txns = await parseCSV([PP_HEADER, row].join('\n'), PAYPAL)
    expect(txns).toHaveLength(1)
    expect(txns[0].date).toBe('2026-03-19')
  })

  it('parseert enkel-cijferige dag/maand met koppelteken (5-3-2026)', async () => {
    const row = '"5-3-2026","13:00:00","CET","Bol.com","Algemene betaling","Voltooid","EUR","-30,00","0,00","-30,00","-20,00","","REF10"'
    const txns = await parseCSV([PP_HEADER, row].join('\n'), PAYPAL)
    expect(txns).toHaveLength(1)
    expect(txns[0].date).toBe('2026-03-05')
  })

  it('blijft DD/MM/YYYY met schuine streep ondersteunen', async () => {
    const row = '"06/03/2026","13:00:00","CET","Bol.com","Algemene betaling","Voltooid","EUR","-30,00","0,00","-30,00","-20,00","","REF11"'
    const txns = await parseCSV([PP_HEADER, row].join('\n'), PAYPAL)
    expect(txns).toHaveLength(1)
    expect(txns[0].date).toBe('2026-03-06')
  })

  it('slaat een rij met onbruikbare datum over zonder de import te laten crashen', async () => {
    const bad = '"onbekend","13:00:00","CET","X","Algemene betaling","Voltooid","EUR","-1,00","0,00","-1,00","0,00","","REFX"'
    const txns = await parseCSV([PP_HEADER, bad].join('\n'), PAYPAL)
    expect(txns).toHaveLength(0)
  })
})

describe('parseCSV — stabiele import_hash + Volgnr in bank_seq', () => {
  // Identieke datum/bedrag/Omschrijving-1, alleen Volgnr (kolom 3) verschilt.
  const ROW_A = '"NL60RABO0330370596","EUR","RABONL2U","000000000000000001","2026-03-01","2026-03-01","-10,00","+100,00","","Albert Heijn","","","","bc","","","","","","ARNHEM, 6826MJ, NLD, 10:43"," ","","","","",""'
  const ROW_B = '"NL60RABO0330370596","EUR","RABONL2U","000000000000000002","2026-03-01","2026-03-01","-10,00","+90,00","","Albert Heijn","","","","bc","","","","","","ARNHEM, 6826MJ, NLD, 10:43"," ","","","","",""'

  it('import_hash is stabiel: gelijke datum/bedrag/omschrijving → zelfde hash, ongeacht Volgnr', async () => {
    const [a] = await parseCSV([HEADER, ROW_A].join('\n'), RABO)
    const [b] = await parseCSV([HEADER, ROW_B].join('\n'), RABO)
    // Stabiele hash zorgt dat re-import-detectie (date|amount|description) betrouwbaar blijft
    // en bestaande rijen geen migratie-gat krijgen.
    expect(a.import_hash).toBe(b.import_hash)
  })

  it('Volgnr landt in bank_seq → distinct-maar-identieke transacties zijn onderscheidbaar', async () => {
    const [a] = await parseCSV([HEADER, ROW_A].join('\n'), RABO)
    const [b] = await parseCSV([HEADER, ROW_B].join('\n'), RABO)
    expect(a.bank_seq).toBe('000000000000000001')
    expect(b.bank_seq).toBe('000000000000000002')
    // Zelfde hash + verschillende bank_seq = verschillende samengestelde sleutel
    // (user_id, import_hash, coalesce(bank_seq, '')) → beide kunnen naast elkaar bestaan.
    expect(a.bank_seq).not.toBe(b.bank_seq)
  })

  it('zelfde rij → zelfde import_hash én zelfde bank_seq (re-import wordt herkend)', async () => {
    const [a] = await parseCSV([HEADER, ROW_A].join('\n'), RABO)
    const [a2] = await parseCSV([HEADER, ROW_A].join('\n'), RABO)
    expect(a.import_hash).toBe(a2.import_hash)
    expect(a.bank_seq).toBe(a2.bank_seq)
  })

  it('preset zonder uniqueRefColumn (ING) → bank_seq null, stabiele hash', async () => {
    const IH = 'Datum;Naam / Omschrijving;Rekening;Tegenrekening;Code;Af Bij;Bedrag (EUR);Mutatiesoort;Mededelingen'
    const R = '20260301;Albert Heijn;NL60RABO0330370596;NL92ABNA0311015505;ba;Af;10,00;Betaalautomaat;Boodschappen'
    const [x] = await parseCSV([IH, R].join('\n'), ING)
    const [y] = await parseCSV([IH, R].join('\n'), ING)
    expect(x.import_hash).toBe(y.import_hash)
    expect(x.bank_seq).toBeNull()
  })
})
