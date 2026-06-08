import { describe, it, expect } from 'vitest'
import { parseCSV } from './csv'
import { CSV_PRESETS } from './index'

const ING = CSV_PRESETS.find((p) => p.id === 'ing')!

const RABO = CSV_PRESETS.find((p) => p.id === 'rabobank')!

const HEADER =
  '"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Naam uiteindelijke partij","Naam initiërende partij","BIC tegenpartij","Code","Batch ID","Transactiereferentie","Machtigingskenmerk","Incassant ID","Betalingskenmerk","Omschrijving-1","Omschrijving-2","Omschrijving-3","Reden retour","Oorspr bedrag","Oorspr munt","Koers"'

const INCASSO =
  '"NL60RABO0330370596","EUR","RABONL2U","014705","2026-01-19","2026-01-19","-4,99","+936,35","LU89751000135104200E","PayPal Europe","","","PPLXLUL2","ei","","1047645677604","5W5J224MY3Z9C","LU96ZZZ0000000000000000058","","1047645677604/PAYPAL"," ","","","","",""'

const FX =
  '"NL60RABO0330370596","EUR","RABONL2U","012384","2024-02-05","2024-02-05","-1,09","+9852,07","","Passaggio Free Flow","","","","bc","","","","","","Bavois, 1372, CHE, 04-02-2024 10:25"," ","","","1,00","CHF","0,93457"'

describe('parseCSV ING preset — nieuwe velden zijn null zonder kolomconfiguratie', () => {
  const ING_HEADER = 'Datum;Naam / Omschrijving;Rekening;Tegenrekening;Code;Af Bij;Bedrag (EUR);Mutatiesoort;Mededelingen'
  const ING_ROW    = '20260101;Albert Heijn;NL60RABO0330370596;NL92ABNA0311015505;ba;Af;12,50;Betaalautomaat;Boodschappen'

  it('velden running_balance, creditor_id, fx_amount, fx_currency, fx_rate, transaction_type, bank_code zijn null', async () => {
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

describe('parseCSV import_hash — Volgnr-entropie', () => {
  // Identieke datum/bedrag/Omschrijving-1, alleen Volgnr (kolom 3) verschilt.
  const ROW_A = '"NL60RABO0330370596","EUR","RABONL2U","000000000000000001","2026-03-01","2026-03-01","-10,00","+100,00","","Albert Heijn","","","","bc","","","","","","ARNHEM, 6826MJ, NLD, 10:43"," ","","","","",""'
  const ROW_B = '"NL60RABO0330370596","EUR","RABONL2U","000000000000000002","2026-03-01","2026-03-01","-10,00","+90,00","","Albert Heijn","","","","bc","","","","","","ARNHEM, 6826MJ, NLD, 10:43"," ","","","","",""'

  it('verschillend Volgnr → verschillende import_hash (échte distinct-transacties botsen niet)', async () => {
    const [a] = await parseCSV([HEADER, ROW_A].join('\n'), RABO)
    const [b] = await parseCSV([HEADER, ROW_B].join('\n'), RABO)
    expect(a.import_hash).not.toBe(b.import_hash)
  })

  it('zelfde Volgnr → zelfde import_hash (re-import-detectie blijft werken)', async () => {
    const [a] = await parseCSV([HEADER, ROW_A].join('\n'), RABO)
    const [a2] = await parseCSV([HEADER, ROW_A].join('\n'), RABO)
    expect(a.import_hash).toBe(a2.import_hash)
  })

  it('preset zonder uniqueRefColumn (ING) → ongewijzigd gedrag (backward-compat)', async () => {
    const IH = 'Datum;Naam / Omschrijving;Rekening;Tegenrekening;Code;Af Bij;Bedrag (EUR);Mutatiesoort;Mededelingen'
    const R = '20260301;Albert Heijn;NL60RABO0330370596;NL92ABNA0311015505;ba;Af;10,00;Betaalautomaat;Boodschappen'
    const [x] = await parseCSV([IH, R].join('\n'), ING)
    const [y] = await parseCSV([IH, R].join('\n'), ING)
    expect(x.import_hash).toBe(y.import_hash)
  })
})
