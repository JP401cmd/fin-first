import { NextResponse } from 'next/server'
import { sanitizeForAI, sanitizeTransaction, birthDateToAge } from '@/lib/ai/sanitize'

interface TestResult {
  name: string
  pass: boolean
  input: string
  output: string
}

export async function GET() {
  const results: TestResult[] = []

  // Test 1: IBAN replacement
  {
    const input = 'Betaling van NL99RABO0123456789 naar NL44INGB0001234567'
    const output = sanitizeForAI(input)
    results.push({
      name: 'IBAN wordt vervangen door [IBAN]',
      pass: output.includes('[IBAN]') && !output.includes('NL99RABO') && !output.includes('NL44INGB'),
      input,
      output,
    })
  }

  // Test 2: BSN replacement
  {
    const input = 'BSN van de klant is 123456789 voor de aanvraag'
    const output = sanitizeForAI(input)
    results.push({
      name: 'BSN-patroon wordt vervangen door [BSN]',
      pass: output.includes('[BSN]') && !output.includes('123456789'),
      input,
      output,
    })
  }

  // Test 3: Email replacement
  {
    const input = 'Stuur een mail naar jan.devries@gmail.com voor bevestiging'
    const output = sanitizeForAI(input)
    results.push({
      name: 'Email wordt vervangen door [EMAIL]',
      pass: output.includes('[EMAIL]') && !output.includes('jan.devries@gmail.com'),
      input,
      output,
    })
  }

  // Test 4: Transaction sanitisation — only category + amount
  {
    const tx = {
      amount: 45.99,
      is_income: false,
      category: 'boodschappen',
      description: 'Albert Heijn Kerkstraat PIN 3847',
      counterparty_name: 'Albert Heijn B.V.',
      date: '2026-02-15',
    }
    const sanitized = sanitizeTransaction(tx)
    const descGone = !('description' in sanitized) || !(sanitized as Record<string, unknown>).description
    const counterpartyGone = !('counterparty_name' in sanitized) || !(sanitized as Record<string, unknown>).counterparty_name
    results.push({
      name: 'Transactie: alleen categorie + bedrag overblijft',
      pass:
        sanitized.amount === 45.99 &&
        sanitized.category === 'boodschappen' &&
        descGone &&
        counterpartyGone &&
        sanitized.month === '2026-02',
      input: JSON.stringify(tx),
      output: JSON.stringify(sanitized),
    })
  }

  // Test 5: Birth date → age
  {
    const dob = '1990-06-15'
    const age = birthDateToAge(dob)
    const now = new Date()
    const expectedAge = now.getMonth() > 5 || (now.getMonth() === 5 && now.getDate() >= 15) ? now.getFullYear() - 1990 : now.getFullYear() - 1990 - 1
    results.push({
      name: 'Geboortedatum wordt omgezet naar leeftijd',
      pass: age === expectedAge,
      input: dob,
      output: `${age} jaar (verwacht: ${expectedAge})`,
    })
  }

  // Test 5b: Birth date in text replaced with age
  {
    const input = 'Gebruiker geboren op 1990-06-15 in Amsterdam'
    const output = sanitizeForAI(input, { dateOfBirth: '1990-06-15' })
    results.push({
      name: 'Geboortedatum in tekst wordt leeftijd',
      pass: !output.includes('1990-06-15') && output.includes('jaar'),
      input,
      output,
    })
  }

  // Test 6: Full name → 'gebruiker'
  {
    const input = 'Het vermogen van Jan de Vries bedraagt €150.000'
    const output = sanitizeForAI(input, { names: ['Jan de Vries'] })
    results.push({
      name: 'Volledige naam wordt vervangen door gebruiker',
      pass: output.includes('gebruiker') && !output.includes('Jan de Vries'),
      input,
      output,
    })
  }

  // Test 6b: Partner name → 'partner'
  {
    const input = 'Jan de Vries en Maria de Vries hebben samen €200.000'
    const output = sanitizeForAI(input, { names: ['Jan de Vries', 'Maria de Vries'] })
    results.push({
      name: 'Partner naam wordt vervangen door partner',
      pass: output.includes('gebruiker') && output.includes('partner') && !output.includes('Maria'),
      input,
      output,
    })
  }

  // Test 7: Financial amounts are NOT filtered
  {
    const input = 'Netto vermogen: €150.000,00 met 7,5% rendement en ratio 0.04'
    const output = sanitizeForAI(input)
    results.push({
      name: 'Financiele bedragen, percentages en ratios blijven behouden',
      pass:
        output.includes('€150.000,00') &&
        output.includes('7,5%') &&
        output.includes('0.04'),
      input,
      output,
    })
  }

  // Test 8: Phone number replacement
  {
    const input = 'Bel 06 12345678 of +31 20 1234567'
    const output = sanitizeForAI(input)
    results.push({
      name: 'Telefoonnummers worden vervangen',
      pass: output.includes('[TELEFOON]') && !output.includes('06 12345678'),
      input,
      output,
    })
  }

  // Test 9: Street address replacement
  {
    const input = 'Woonachtig op Kerkstraat 42 in het centrum'
    const output = sanitizeForAI(input)
    results.push({
      name: 'Straatnamen worden vervangen door [ADRES]',
      pass: output.includes('[ADRES]') && !output.includes('Kerkstraat 42'),
      input,
      output,
    })
  }

  // Test 10: IBAN with spaces
  {
    const input = 'Rekening NL 99 RABO 0123 4567 89'
    const output = sanitizeForAI(input)
    results.push({
      name: 'IBAN met spaties wordt ook vervangen',
      pass: output.includes('[IBAN]'),
      input,
      output,
    })
  }

  return NextResponse.json({ results, passing: results.filter((r) => r.pass).length, total: results.length })
}
