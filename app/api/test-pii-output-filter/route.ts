import { maskPIIInOutput, maskPIIInObject } from '@/lib/ai/pii-output-filter'

/**
 * Test endpoint for PII output filter verification.
 * Tests IBAN masking, BSN masking, and financial amount preservation.
 */
export async function GET() {
  const tests = [
    // IBAN tests
    {
      name: 'Dutch IBAN masked',
      input: 'Je rekening NL91ABNA0417164300 is actief.',
      expected_contains: '****',
      expected_not_contains: 'NL91ABNA',
    },
    {
      name: 'IBAN with spaces masked',
      input: 'Naar NL91 ABNA 0417 1643 00 overmaken.',
      expected_contains: '****',
      expected_not_contains: 'NL91',
    },
    {
      name: 'German IBAN masked',
      input: 'Betaling naar DE89370400440532013000.',
      expected_contains: '****',
      expected_not_contains: 'DE89',
    },
    // BSN tests
    {
      name: 'BSN masked',
      input: 'BSN: 123456789 is geregistreerd.',
      expected_contains: '****',
      expected_not_contains: '123456789',
    },
    // Financial amounts preserved
    {
      name: 'Euro amount preserved (€ prefix)',
      input: 'Je spaart €1.234,56 per maand.',
      expected_contains: '€1.234,56',
      expected_not_contains: '****',
    },
    {
      name: 'Percentage preserved',
      input: 'Rendement van 7,5% per jaar.',
      expected_contains: '7,5%',
      expected_not_contains: '****',
    },
    {
      name: 'Normal text unchanged',
      input: 'Je vrijheidstijd is 14 jaar en 3 maanden.',
      expected_contains: '14 jaar en 3 maanden',
      expected_not_contains: '****',
    },
    // Mixed content
    {
      name: 'IBAN masked but amount preserved in mixed text',
      input: 'Overboek €500 naar NL91ABNA0417164300 voor je spaardoel.',
      expected_contains: '€500',
      expected_not_contains: 'NL91ABNA',
    },
  ]

  const results = tests.map((test) => {
    const output = maskPIIInOutput(test.input)
    const containsExpected = output.includes(test.expected_contains)
    const doesNotContainBad = !output.includes(test.expected_not_contains)
    return {
      name: test.name,
      pass: containsExpected && doesNotContainBad,
      input: test.input,
      output,
      expected_contains: test.expected_contains,
      expected_not_contains: test.expected_not_contains,
    }
  })

  // Test maskPIIInObject
  const objectTest = maskPIIInObject({
    headline: 'Rente op NL91ABNA0417164300 stijgt',
    summary: 'BSN 123456789 niet nodig',
    amount: 1234,
    nested: { text: 'Veilig €500,00' },
  })

  const objectPass =
    objectTest.headline.includes('****') &&
    !objectTest.headline.includes('NL91') &&
    objectTest.summary.includes('****') &&
    !objectTest.summary.includes('123456789') &&
    objectTest.amount === 1234 &&
    objectTest.nested.text === 'Veilig €500,00'

  const allPass = results.every((r) => r.pass) && objectPass
  const passCount = results.filter((r) => r.pass).length + (objectPass ? 1 : 0)
  const totalCount = results.length + 1

  return Response.json({
    allPass,
    summary: `${passCount}/${totalCount} tests passing`,
    results,
    objectTest: { pass: objectPass, output: objectTest },
  })
}
