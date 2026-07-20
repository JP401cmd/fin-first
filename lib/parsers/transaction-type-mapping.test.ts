/**
 * Regressie voor WF-CASH-23: de bank-eigen transactietypecode (MT940 SWIFT-code
 * zoals "NTRF", OFX <TRNTYPE> zoals "DEBIT"/"CREDIT") MOET in `bank_code` landen,
 * NIET in `transaction_type`. De DB-kolom `transactions.transaction_type` heeft een
 * CHECK-constraint op een vaste enum (NULL | transfer | joint_transfer | salary |
 * refund | other); een rauwe bankcode daarin doet de import 100% falen op de commit.
 *
 * Sample-content overgenomen uit lib/uat/acceptance/cash-checks.ts (WF-CASH-23).
 */

import { describe, it, expect } from 'vitest'
import { parseMT940 } from './mt940'
import { parseOFX } from './ofx'

/** Spiegelt de DB CHECK-constraint transactions_transaction_type_check. */
const ALLOWED_TRANSACTION_TYPES = new Set(['transfer', 'joint_transfer', 'salary', 'refund', 'other'])

const MT940 = [
  ':20:STMT20260705',
  ':25:NL00TEST0123456789',
  ':28C:00001/001',
  ':60F:C260601EUR1250,00',
  ':61:2606100610D45,00NTRFNONREF//BANKREF001',
  ':86:/NAME/Albert Heijn/IBAN/NL91ABNA0417164300/EREF/AH-BOODSCHAPPEN-JUNI',
  ':61:2606200620C2500,00NTRFNONREF//BANKREF002',
  ':86:/NAME/Werkgever BV/IBAN/NL02RABO0123456789/RREF/SALARIS-JUNI-2026',
  ':61:2607010701D850,00NTRFNONREF//BANKREF003',
  ':86:/NAME/Woonstichting Ymere/IBAN/NL55INGB0000012345/EREF/HUUR-JULI-2026',
  ':62F:C260701EUR2855,00',
].join('\n')

const OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>EUR
<BANKACCTFROM>
<BANKID>TESTNL2A</BANKID>
<ACCTID>NL00TEST0123456789</ACCTID>
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260601
<DTEND>20260701
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260610
<TRNAMT>-45.00
<FITID>BANKREF001B
<NAME>Albert Heijn
<MEMO>AH-BOODSCHAPPEN-JUNI-OFX
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260620
<TRNAMT>2500.00
<FITID>BANKREF002B
<NAME>Werkgever BV
<MEMO>SALARIS-JUNI-2026-OFX
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`

describe('WF-CASH-23 · bank-transactietypecode → bank_code (niet transaction_type)', () => {
  it('MT940: transaction_type blijft binnen de CHECK-enum en de SWIFT-code landt in bank_code', async () => {
    const rows = await parseMT940(MT940)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      // Mag de DB-CHECK nooit schenden.
      expect(row.transaction_type === null || ALLOWED_TRANSACTION_TYPES.has(row.transaction_type)).toBe(true)
      // De bank-eigen code (NTRF) mag niet verloren gaan: hij hoort in bank_code.
      expect(row.bank_code).toBeTruthy()
      expect(row.bank_code).toMatch(/^N?[A-Z]{3,4}$/)
    }
  })

  it('OFX: transaction_type blijft binnen de CHECK-enum en TRNTYPE landt in bank_code', async () => {
    const rows = await parseOFX(OFX)
    expect(rows.length).toBe(2)
    for (const row of rows) {
      expect(row.transaction_type === null || ALLOWED_TRANSACTION_TYPES.has(row.transaction_type)).toBe(true)
    }
    expect(rows.map((r) => r.bank_code)).toEqual(['DEBIT', 'CREDIT'])
  })
})
