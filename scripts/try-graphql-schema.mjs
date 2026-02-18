// Use GraphQL introspection to check database schema
// This is another way to verify what tables/types exist
const ref = 'pnnuqwdcgoympgddrvze';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// GraphQL introspection to get all types (which map to tables)
const introspectionQuery = `
{
  __schema {
    types {
      name
      kind
      fields {
        name
        type {
          name
          kind
        }
      }
    }
  }
}
`;

try {
  const r = await fetch(`https://${ref}.supabase.co/graphql/v1`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: introspectionQuery }),
  });

  const data = await r.json();
  if (data.data && data.data.__schema) {
    const types = data.data.__schema.types;

    // Filter for our table types (they don't start with __ and aren't built-in)
    const tableTypes = types.filter(t =>
      !t.name.startsWith('__') &&
      t.kind === 'OBJECT' &&
      !['Query', 'Mutation', 'Subscription', 'Node', 'PageInfo'].includes(t.name) &&
      !t.name.endsWith('Connection') &&
      !t.name.endsWith('Edge') &&
      !t.name.endsWith('DeleteResponse') &&
      !t.name.endsWith('InsertResponse') &&
      !t.name.endsWith('UpdateResponse') &&
      !t.name.endsWith('Filter') &&
      !t.name.endsWith('OrderBy') &&
      !t.name.endsWith('Mutation')
    );

    console.log('Table-like types found:');
    for (const t of tableTypes.sort((a,b) => a.name.localeCompare(b.name))) {
      const fields = (t.fields || []).map(f => f.name).join(', ');
      console.log(`  ${t.name}: ${fields}`);
    }

    // Specifically check for our required tables
    const requiredTables = ['badges', 'user_badges', 'user_streaks', 'user_feature_visits', 'holdings', 'holding_transactions', 'next_step_completions'];
    console.log('\nRequired tables check:');
    for (const table of requiredTables) {
      const found = types.some(t => t.name.toLowerCase() === table.toLowerCase() || t.name.toLowerCase() === table.replace(/_/g, ''));
      console.log(`  ${table}: ${found ? 'FOUND' : 'NOT FOUND'}`);
    }

    // Check net_worth_snapshots fields
    const nws = types.find(t => t.name === 'net_worth_snapshots');
    if (nws) {
      console.log('\nnet_worth_snapshots fields:', (nws.fields || []).map(f => f.name).join(', '));
    }
  }
} catch(e) {
  console.log('Error:', e.message);
}
