/**
 * dependency-cruiser — architectuur-grenzen als afdwingbare lint.
 *
 * Doel: de import-/laagconventies uit CLAUDE.md mechanisch maken i.p.v. met de
 * hand bewaken. Deze tool bewaakt ALLEEN afhankelijkheden (wie mag wie
 * importeren); hardcoded getallen/kleuren horen bij een ESLint-AST-regel.
 *
 * Retrofit-model = BASELINE. Alle regels staan op `error`, maar de 297 bestaande
 * overtredingen zijn bevroren in `.dependency-cruiser-known-violations.json`. De
 * gate (`npm run arch:boundaries`, --ignore-known) faalt daardoor ALLEEN op NIEUWE
 * overtredingen — bestaande tech-debt breekt de build niet, maar groeit ook nooit.
 *
 *   - `npm run arch:boundaries`        → CI/commit-gate: alleen nieuwe overtredingen.
 *   - `npm run arch:boundaries:report` → volledige stand incl. bekende schuld.
 *   - `npm run arch:boundaries:baseline` → schuld opnieuw bevriezen (na opruimen).
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circulaire afhankelijkheid — meestal een teken van een te verweven module ' +
        '(god-component). Knip de cyclus door of hef een gedeelde kern uit.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'engine-blijft-puur',
      severity: 'error',
      comment:
        'De horizon-kernel (de ENIGE FIRE/vrijheids-rekenmotor) moet puur blijven: ' +
        'geen React/UI-imports. Zo blijft hij testbaar en herbruikbaar (consume, don\'t recompute).',
      from: { path: '^lib/horizon-kernel/', pathNot: '\\.(test|spec)\\.(ts|tsx)$' },
      to: { path: '^(react|react-dom)$|^components/|^app/' },
    },
    {
      name: 'engine-encapsulatie',
      severity: 'error',
      comment:
        'Surfaces horen de horizon-kernel te consumeren via de publieke ingang ' +
        '(lib/horizon-kernel/index of de adapter/bridge/run-unified), niet direct in ' +
        'engine/solver/gap te grijpen. Directe interne imports = drift-risico.',
      from: {
        pathNot:
          '^lib/horizon-kernel/|^lib/horizon/|\\.(test|spec)\\.(ts|tsx)$',
      },
      to: {
        path: '^lib/horizon-kernel/(engine|solver|gap)\\.ts$',
      },
    },
    {
      name: 'overlay-via-shelloverlay',
      severity: 'error',
      comment:
        'Overlays horen via <ShellOverlay>, niet direct via BottomSheet/SlideInPane ' +
        '(CLAUDE.md overlay-conventie / ADR 0039). Bestaande directe imports zijn tech-debt; ' +
        'nieuwe code hoort hier niet bij te komen.',
      from: {
        pathNot:
          'components/app/shell/shell-overlay\\.tsx$|' +
          'components/app/shell/nav-menu-sheet\\.tsx$|' +
          'components/app/bottom-sheet\\.tsx$|' +
          'components/app/shell/slide-in-pane\\.tsx$|' +
          '\\.(test|spec)\\.(ts|tsx)$',
      },
      to: {
        path:
          'components/app/bottom-sheet\\.tsx$|' +
          'components/app/shell/slide-in-pane\\.tsx$',
      },
    },
    {
      name: 'geen-prod-naar-test',
      severity: 'error',
      comment: 'Productiecode mag geen test-/spec-bestand importeren.',
      from: {
        pathNot:
          '\\.(test|spec)\\.(ts|tsx)$|' +
          '^lib/horizon-kernel/(oracle|parity)/|' +
          '^lib/horizon-kernel/(scaffold|input-from-fixture)\\.ts$',
      },
      to: { path: '\\.(test|spec)\\.(ts|tsx)$' },
    },
    {
      name: 'geen-app-naar-scripts',
      severity: 'error',
      comment:
        'App/components/lib mogen geen build-time scripts (scripts/**) importeren — die ' +
        'draaien buiten de app-runtime.',
      from: { path: '^(app|components|lib)/' },
      to: { path: '^scripts/' },
    },
    {
      name: 'niet-naar-onopgeloste-module',
      severity: 'error',
      comment:
        'Import verwijst naar een module die niet te resolven is (typefout of verwijderd bestand).',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    exclude: {
      path: 'node_modules|\\.next|^e2e/|^spikes/|^public/',
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
