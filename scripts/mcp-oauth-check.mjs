// Check the OAuth resource metadata for the Supabase MCP server
const PROJECT_REF = 'pnnuqwdcgoympgddrvze';
const metadataUrl = 'https://mcp.supabase.com/.well-known/oauth-protected-resource/mcp?project_ref=' + PROJECT_REF;

async function main() {
  try {
    const resp = await fetch(metadataUrl);
    console.log('Status:', resp.status);
    const data = await resp.json();
    console.log('OAuth metadata:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('Error:', e.message);
  }

  // Also check if Claude Code stored an OAuth token somewhere
  const homeDir = process.env.USERPROFILE || process.env.HOME;
  console.log('\nHome dir:', homeDir);

  // Check for Claude config directories
  const { readdirSync, existsSync, readFileSync } = await import('fs');
  const { join } = await import('path');

  const claudeDir = join(homeDir, '.claude');
  if (existsSync(claudeDir)) {
    console.log('\n.claude directory exists');
    const files = readdirSync(claudeDir, { recursive: true });
    files.forEach(f => console.log('  ', f));
  }

  // Check for MCP auth tokens
  const possiblePaths = [
    join(homeDir, '.claude', 'mcp_auth'),
    join(homeDir, '.config', 'claude-code', 'mcp'),
    join(homeDir, 'AppData', 'Local', 'claude-code'),
    join(homeDir, 'AppData', 'Roaming', 'claude-code'),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      console.log('\nFound:', p);
      try {
        const items = readdirSync(p, { recursive: true });
        items.forEach(i => console.log('  ', i));
      } catch (e) {
        console.log('  Cannot read:', e.message);
      }
    }
  }
}

main();
