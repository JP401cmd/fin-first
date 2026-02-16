/**
 * Test script for API schema validation.
 * Tests the same validation logic used in production API routes.
 * This runs locally without needing the server, avoiding turbopack issues.
 */

var VALID_STEP_KEYS = [
  'import_transactions', 'set_budgets', 'add_assets', 'register_debts',
  'complete_profile', 'create_snapshot', 'set_goals',
];

function validateHoldingsPost(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return { valid: false, status: 400, error: 'Request body moet een JSON-object zijn' };
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0)
    return { valid: false, status: 400, error: 'Naam is verplicht en moet een niet-lege string zijn' };
  if (body.units !== undefined && body.units !== null) {
    var n = Number(body.units);
    if (isNaN(n) || n < 0) return { valid: false, status: 400, error: 'Units moet een positief getal zijn' };
  }
  if (body.avg_purchase_price !== undefined && body.avg_purchase_price !== null) {
    var n2 = Number(body.avg_purchase_price);
    if (isNaN(n2) || n2 < 0) return { valid: false, status: 400, error: 'Gemiddelde aankoopprijs moet een positief getal zijn' };
  }
  if (body.current_price !== undefined && body.current_price !== null) {
    var n3 = Number(body.current_price);
    if (isNaN(n3) || n3 < 0) return { valid: false, status: 400, error: 'Huidige prijs moet een positief getal zijn' };
  }
  if (body.ticker !== undefined && body.ticker !== null && typeof body.ticker !== 'string')
    return { valid: false, status: 400, error: 'Ticker moet een string zijn' };
  if (body.isin !== undefined && body.isin !== null && typeof body.isin !== 'string')
    return { valid: false, status: 400, error: 'ISIN moet een string zijn' };
  if (body.asset_type !== undefined && body.asset_type !== null && typeof body.asset_type !== 'string')
    return { valid: false, status: 400, error: 'Asset type moet een string zijn' };
  return { valid: true, status: 200 };
}

function validateBadgesEvaluate(body) {
  if (body !== null && body !== undefined && (typeof body !== 'object' || Array.isArray(body)))
    return { valid: false, status: 400, error: 'Request body moet een JSON-object zijn of leeg' };
  return { valid: true, status: 200 };
}

function validateNextStepsComplete(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return { valid: false, status: 400, error: 'Request body moet een JSON-object zijn' };
  if (!body.step_key || typeof body.step_key !== 'string' || body.step_key.trim().length === 0)
    return { valid: false, status: 400, error: 'step_key is verplicht en moet een niet-lege string zijn' };
  if (!VALID_STEP_KEYS.includes(body.step_key))
    return { valid: false, status: 400, error: 'Ongeldige step_key: "' + body.step_key + '". Geldige waarden: ' + VALID_STEP_KEYS.join(', ') };
  return { valid: true, status: 200 };
}

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write('  PASS: ' + name + '\n');
  } catch (e) {
    failed++;
    process.stdout.write('  FAIL: ' + name + ' - ' + e.message + '\n');
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected)
    throw new Error((msg || '') + ' Expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
}

process.stdout.write('\n=== Test 1: POST /api/holdings with missing required fields → expect 400 ===\n');
test('Empty body → 400', function() {
  var r = validateHoldingsPost({});
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
  assertEqual(r.error, 'Naam is verplicht en moet een niet-lege string zijn');
});
test('No name field → 400', function() {
  var r = validateHoldingsPost({ units: 10 });
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('Empty name string → 400', function() {
  var r = validateHoldingsPost({ name: '' });
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('Name with only spaces → 400', function() {
  var r = validateHoldingsPost({ name: '   ' });
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('Null body → 400', function() {
  var r = validateHoldingsPost(null);
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('Array body → 400', function() {
  var r = validateHoldingsPost([1, 2, 3]);
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});

process.stdout.write('\n=== Test 2: POST /api/holdings with invalid types → expect 400 ===\n');
test('Units as string "abc" → 400', function() {
  var r = validateHoldingsPost({ name: 'VWRL', units: 'abc' });
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
  assertEqual(r.error, 'Units moet een positief getal zijn');
});
test('Units as negative number → 400', function() {
  var r = validateHoldingsPost({ name: 'VWRL', units: -5 });
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('avg_purchase_price as "not-number" → 400', function() {
  var r = validateHoldingsPost({ name: 'VWRL', avg_purchase_price: 'not-number' });
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('current_price as negative → 400', function() {
  var r = validateHoldingsPost({ name: 'VWRL', current_price: -10 });
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('Ticker as number → 400', function() {
  var r = validateHoldingsPost({ name: 'VWRL', ticker: 12345 });
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('ISIN as boolean → 400', function() {
  var r = validateHoldingsPost({ name: 'VWRL', isin: true });
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('Valid holding → 200', function() {
  var r = validateHoldingsPost({ name: 'VWRL ETF', units: 10, avg_purchase_price: 85.50, ticker: 'VWRL' });
  assertEqual(r.status, 200);
  assertEqual(r.valid, true);
});

process.stdout.write('\n=== Test 3: POST /api/badges/evaluate with invalid body → expect 400 ===\n');
test('Array body → 400', function() {
  var r = validateBadgesEvaluate([1, 2]);
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('String body → 400', function() {
  var r = validateBadgesEvaluate('invalid');
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('Number body → 400', function() {
  var r = validateBadgesEvaluate(42);
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('Null body → 200 (body optional)', function() {
  var r = validateBadgesEvaluate(null);
  assertEqual(r.status, 200);
  assertEqual(r.valid, true);
});
test('Empty object body → 200', function() {
  var r = validateBadgesEvaluate({});
  assertEqual(r.status, 200);
  assertEqual(r.valid, true);
});

process.stdout.write('\n=== Test 4: POST /api/next-steps/complete with missing step_key → expect 400 ===\n');
test('Empty body → 400', function() {
  var r = validateNextStepsComplete({});
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
  assertEqual(r.error, 'step_key is verplicht en moet een niet-lege string zijn');
});
test('Missing step_key → 400', function() {
  var r = validateNextStepsComplete({ other_field: 'value' });
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('Empty step_key → 400', function() {
  var r = validateNextStepsComplete({ step_key: '' });
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('Invalid step_key → 400', function() {
  var r = validateNextStepsComplete({ step_key: 'invalid_key' });
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('Null step_key → 400', function() {
  var r = validateNextStepsComplete({ step_key: null });
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});
test('Numeric step_key → 400', function() {
  var r = validateNextStepsComplete({ step_key: 42 });
  assertEqual(r.status, 400);
  assertEqual(r.valid, false);
});

process.stdout.write('\n=== Test 5: Verify error messages are descriptive ===\n');
test('Holdings: missing name has Dutch error message', function() {
  var r = validateHoldingsPost({});
  if (!r.error.includes('Naam')) throw new Error('Expected error to mention "Naam"');
  if (!r.error.includes('verplicht')) throw new Error('Expected error to mention "verplicht"');
});
test('Holdings: invalid units has Dutch error message', function() {
  var r = validateHoldingsPost({ name: 'Test', units: 'xyz' });
  if (!r.error.includes('Units')) throw new Error('Expected error to mention "Units"');
  if (!r.error.includes('getal')) throw new Error('Expected error to mention "getal"');
});
test('Next-steps: missing step_key has Dutch error message', function() {
  var r = validateNextStepsComplete({});
  if (!r.error.includes('step_key')) throw new Error('Expected error to mention "step_key"');
  if (!r.error.includes('verplicht')) throw new Error('Expected error to mention "verplicht"');
});
test('Next-steps: invalid key lists valid values', function() {
  var r = validateNextStepsComplete({ step_key: 'bad_key' });
  if (!r.error.includes('Geldige waarden')) throw new Error('Expected error to list valid values');
  if (!r.error.includes('import_transactions')) throw new Error('Expected error to list "import_transactions"');
});
test('Valid next-step → 200', function() {
  var r = validateNextStepsComplete({ step_key: 'import_transactions' });
  assertEqual(r.status, 200);
  assertEqual(r.valid, true);
});

process.stdout.write('\n=== Results ===\n');
process.stdout.write('Passed: ' + passed + ', Failed: ' + failed + '\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.stdout.write('All tests passed!\n');
}
