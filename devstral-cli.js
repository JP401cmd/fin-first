#!/usr/bin/env node

/**
 * Devstral CLI - Comprehensive CLI tool for the FIN project
 * Includes UI/UX and AI capabilities as core features
 */

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');
const figlet = require('figlet');

// Create chalk instance for colored output
const { chalkStderr } = chalk;

// Main CLI setup
program
  .name('devstral')
  .description('FIN Project CLI with UI/UX and AI capabilities')
  .version('1.0.0');

// UI/UX Commands
program
  .command('ui')
  .description('UI/UX related commands')
  .action(() => {
    console.log(chalkStderr.blue(figlet.textSync('UI/UX Core', { horizontalLayout: 'full' })));
    console.log('UI/UX capabilities:');
    console.log('  - Component generation');
    console.log('  - Theme management');
    console.log('  - Accessibility checking');
    console.log('  - Design system integration');
  });

program
  .command('ui:generate <component>')
  .description('Generate a new UI component')
  .action((component) => {
    const componentPath = path.join(__dirname, 'components', 'app', `${component}.tsx`);
    const template = `import React from 'react';

interface ${component.charAt(0).toUpperCase() + component.slice(1)}Props {
  // Add your props here
}

export const ${component.charAt(0).toUpperCase() + component.slice(1)}: React.FC<${component.charAt(0).toUpperCase() + component.slice(1)}Props> = (props) => {
  return (
    <div className="${component}">
      {/* ${component} component */}
    </div>
  );
};
`;
    
    fs.writeFileSync(componentPath, template);
    console.log(chalkStderr.green(`✓ Created component: ${componentPath}`));
  });

// AI Commands
program
  .command('ai')
  .description('AI related commands')
  .action(() => {
    console.log(chalkStderr.magenta(figlet.textSync('AI Core', { horizontalLayout: 'full' })));
    console.log('AI capabilities:');
    console.log('  - Code generation');
    console.log('  - Natural language processing');
    console.log('  - Machine learning integration');
    console.log('  - AI-powered recommendations');
  });

program
  .command('ai:analyze')
  .description('Analyze code with AI')
  .action(() => {
    console.log(chalkStderr.yellow('🤖 Analyzing code with AI...'));
    console.log('This would integrate with your AI services to analyze the codebase.');
    console.log('Features:');
    console.log('  - Code quality analysis');
    console.log('  - Security vulnerability detection');
    console.log('  - Performance optimization suggestions');
    console.log('  - Best practice recommendations');
  });

// Environment Commands
program
  .command('env:check')
  .description('Check environment variables')
  .action(() => {
    console.log(chalkStderr.cyan('🔍 Checking environment variables...'));
    execSync('node scripts/check-env.js', { stdio: 'inherit' });
  });

program
  .command('env:port')
  .description('Check available ports')
  .action(() => {
    console.log(chalkStderr.cyan('🔍 Checking ports...'));
    execSync('node scripts/check-port.js', { stdio: 'inherit' });
  });

// Database Commands
program
  .command('db:check')
  .description('Check database tables')
  .action(() => {
    console.log(chalkStderr.blue('🗃️ Checking database tables...'));
    execSync('node scripts/check-tables.js', { stdio: 'inherit' });
  });

program
  .command('db:migrate')
  .description('Apply database migrations')
  .action(() => {
    console.log(chalkStderr.blue('🗃️ Applying migrations...'));
    execSync('node scripts/apply-migration.js', { stdio: 'inherit' });
  });

// User Management Commands
program
  .command('user:create <email>')
  .description('Create a new user')
  .action((email) => {
    console.log(chalkStderr.green(`👤 Creating user: ${email}`));
    execSync(`node scripts/create-user.js ${email}`, { stdio: 'inherit' });
  });

program
  .command('user:list')
  .description('List all users')
  .action(() => {
    console.log(chalkStderr.green('👤 Listing users...'));
    execSync('node scripts/list-users.js', { stdio: 'inherit' });
  });

// Server Commands
program
  .command('server:start')
  .description('Start development server')
  .action(() => {
    console.log(chalkStderr.magenta('🚀 Starting server...'));
    execSync('npm run dev', { stdio: 'inherit' });
  });

program
  .command('server:build')
  .description('Build for production')
  .action(() => {
    console.log(chalkStderr.magenta('🏗️ Building...'));
    execSync('npm run build', { stdio: 'inherit' });
  });

// Core Commands
program
  .command('core:ui')
  .description('UI/UX core functionality')
  .action(() => {
    console.log(chalkStderr.blue(figlet.textSync('UI/UX Core', { horizontalLayout: 'full' })));
    console.log('Core UI/UX features:');
    console.log('  ✓ Component-based architecture');
    console.log('  ✓ Responsive design system');
    console.log('  ✓ Accessibility compliance');
    console.log('  ✓ Theme and styling management');
    console.log('  ✓ Animation and interaction patterns');
  });

program
  .command('core:ai')
  .description('AI core functionality')
  .action(() => {
    console.log(chalkStderr.magenta(figlet.textSync('AI Core', { horizontalLayout: 'full' })));
    console.log('Core AI features:');
    console.log('  ✓ Natural language processing');
    console.log('  ✓ Machine learning integration');
    console.log('  ✓ Predictive analytics');
    console.log('  ✓ AI-powered recommendations');
    console.log('  ✓ Automated code generation');
  });

// Help command with fancy output
program
  .command('help')
  .description('Show help with fancy output')
  .action(() => {
    console.log(chalkStderr.hex('#FFA500')(figlet.textSync('Devstral CLI', { horizontalLayout: 'full' })));
    console.log(chalkStderr.bold('FIN Project CLI with UI/UX and AI Core Capabilities\n'));
    
    console.log(chalkStderr.underline('Categories:'));
    console.log(chalkStderr.blue('🎨 UI/UX Commands:') + ' ui, ui:generate');
    console.log(chalkStderr.magenta('🤖 AI Commands:') + ' ai, ai:analyze');
    console.log(chalkStderr.cyan('🌐 Environment:') + ' env:check, env:port');
    console.log(chalkStderr.blue('🗃️ Database:') + ' db:check, db:migrate');
    console.log(chalkStderr.green('👤 User Management:') + ' user:create, user:list');
    console.log(chalkStderr.magenta('🚀 Server:') + ' server:start, server:build');
    console.log(chalkStderr.bold('💡 Core:') + ' core:ui, core:ai');
    
    console.log('\n' + chalkStderr.italic('Run any command with --help for more details'));
  });

// Parse arguments
program.parse(process.argv);

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}