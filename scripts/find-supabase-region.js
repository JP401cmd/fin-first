// Find the correct region and connection endpoint for the Supabase project
var ref = 'pnnuqwdcgoympgddrvze';
var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';
var dns = require('dns');

async function main() {
  // Resolve the Supabase hostname to find the region
  process.stdout.write('=== DNS Resolution ===\n');

  var hostnames = [
    ref + '.supabase.co',
    'db.' + ref + '.supabase.co',
  ];

  for (var i = 0; i < hostnames.length; i++) {
    try {
      var result = await new Promise(function(resolve, reject) {
        dns.resolve4(hostnames[i], function(err, addresses) {
          if (err) reject(err);
          else resolve(addresses);
        });
      });
      process.stdout.write(hostnames[i] + ' -> ' + result.join(', ') + '\n');
    } catch(e) {
      process.stdout.write(hostnames[i] + ' -> ' + e.message + '\n');
    }

    // Also try CNAME
    try {
      var cname = await new Promise(function(resolve, reject) {
        dns.resolveCname(hostnames[i], function(err, addresses) {
          if (err) reject(err);
          else resolve(addresses);
        });
      });
      process.stdout.write('  CNAME: ' + cname.join(', ') + '\n');
    } catch(e) {
      // skip
    }
  }

  // Check pooler hostnames in different regions
  var regions = [
    'aws-0-eu-central-1',
    'aws-0-eu-west-1',
    'aws-0-eu-west-2',
    'aws-0-us-east-1',
    'aws-0-us-west-1',
    'aws-0-ap-southeast-1',
  ];

  process.stdout.write('\n=== Pooler DNS Resolution ===\n');
  for (var j = 0; j < regions.length; j++) {
    var poolerHost = regions[j] + '.pooler.supabase.com';
    try {
      var result2 = await new Promise(function(resolve, reject) {
        dns.resolve4(poolerHost, function(err, addresses) {
          if (err) reject(err);
          else resolve(addresses);
        });
      });
      process.stdout.write(poolerHost + ' -> ' + result2.join(', ') + '\n');
    } catch(e) {
      process.stdout.write(poolerHost + ' -> ' + e.code + '\n');
    }
  }

  // Check the Supabase REST API response headers for region info
  process.stdout.write('\n=== REST API headers ===\n');
  try {
    var r = await fetch('https://' + ref + '.supabase.co/rest/v1/', {
      headers: { 'apikey': anonKey }
    });
    var headers = {};
    r.headers.forEach(function(value, key) {
      headers[key] = value;
    });
    process.stdout.write('Response headers:\n');
    Object.keys(headers).forEach(function(k) {
      if (k.match(/cf-|server|x-|content-profile|via|region/i)) {
        process.stdout.write('  ' + k + ': ' + headers[k] + '\n');
      }
    });
  } catch(e) {
    process.stdout.write('Error: ' + e.message + '\n');
  }
}

main().catch(function(e) { console.error(e); });
