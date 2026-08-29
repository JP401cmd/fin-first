#!/usr/bin/env node
/**
 * check-self-modification — pre-push-gate tegen een STILLE `.claude/`-wijziging.
 *
 * AANLEIDING. De zelfmodificatie-gate ("een agent wijzigt `.claude/` alleen na
 * expliciet akkoord van de eigenaar") stond tot nu toe uitsluitend geschreven in
 * `.claude/commands/trifinity-drain.md` en `trifinity-next.md` — en het akkoord
 * zelf werd gelezen uit de Notion-property `Antwoord gebruiker`. Beide kanalen
 * zijn agent-schrijfbaar: `.claude/**` schrijft de agent met Edit/Write, en
 * `notion-update-page` staat op de allow-lijst en wordt in stap 0 (de claim)
 * verplicht gebruikt. **Consent-kanaal en werk-kanaal waren letterlijk hetzelfde
 * kanaal met hetzelfde recht.** Een regel die alleen in `.claude/` staat, bewaakt
 * zichzelf niet.
 *
 * WAT DEZE GATE WEL DOET. Hij verplaatst de waarneming naar het moment waarop de
 * eigenaar aantoonbaar aanwezig is: de push. Raakt een te pushen commit een
 * getrackt bestand onder `.claude/`, dan moet zijn onderwerpregel met
 * `self-improve:` beginnen. Zo niet, dan stopt de push en staat er zwart-op-wit
 * wélke commit wélk bestand raakte. Zelfmodificatie kan daarmee niet meer
 * meeliften op een gewone feature-commit (de klassieke `git add -A`-vergissing,
 * vandaar ook de bestaande regel "stage per pad").
 *
 * WAT DEZE GATE NIET IS (belangrijk, want anders wordt hij als bewijs gelezen):
 *  a. Geen PREVENTIE. Hij verhindert de edit niet, hij maakt hem zichtbaar.
 *     Preventie zit op platformniveau: Claude Code behandelt `.claude` als
 *     protected path (writes worden nooit auto-approved, `permissions.allow`
 *     pre-approvet ze niet), en een deny-regel in `~/.claude/settings.json`
 *     blokkeert in élke modus. Dat is laag 2 van het voorstel en is bewust NIET
 *     gebouwd — zie de kaart.
 *  b. Geen slot. `git push --no-verify` slaat elke hook over. CLAUDE.md verbiedt
 *     dat al ("Never skip hooks"), maar dat blijft een regel, geen mechanisme.
 *  c. Geen oordeel over de INHOUD. Een `self-improve:`-prefix zegt dat de
 *     wijziging als zelfmodificatie is aangemerkt, niet dat de eigenaar hem
 *     goedkeurde. De prefix dwingt af dat de wijziging apart en benoemd landt;
 *     het akkoord blijft mensenwerk.
 *
 * Kortom: detectie op het moment van pushen, niet een bewijs van instemming.
 * Precies daarom staat hij hier — in `scripts/` + `.husky/pre-push`, buiten
 * `.claude/` — en niet als zoveelste zin in een command-definitie.
 *
 * SCOPE. Alleen de commits die deze push zou meesturen: `HEAD --not --remotes`.
 * Historie die al op een remote staat blijft ongemoeid (die is niet meer terug
 * te draaien en zou de gate bij de eerste run rood laten starten — een gate die
 * rood start, wordt uitgezet). Er is dus bewust géén RESIDUE-/allowlist nodig.
 *
 * Daarnaast rapporteert hij ONGECOMMITTE `.claude/`-wijzigingen als
 * WAARSCHUWING (exit 0). Dat is de tweede helft van de afspraak: elke run sluit
 * af met `git status --porcelain -- .claude/` in de eindsamenvatting, zodat een
 * zelfmodificatie ook zichtbaar is vóórdat er überhaupt een commit bestaat.
 *
 * Run:  npm run check:self-modification   (of: node scripts/check-self-modification.mjs)
 *       node scripts/check-self-modification.mjs --list          (alleen tonen, exit 0)
 *       node scripts/check-self-modification.mjs --range A..B    (expliciet bereik)
 */

import { execFileSync } from 'node:child_process'

/** Onderwerpregels die als zelfmodificatie zijn aangemerkt. */
const SELF_IMPROVE_SUBJECT = /^self-improve(\([^)]*\))?!?:\s*\S/

/** Alles onder dit pad telt als eigen configuratie. */
const CLAUDE_ROOT = '.claude/'

/**
 * `.claude/worktrees/**` is de plek waar Claude Code zijn eigen git-worktrees
 * neerzet (isolation: "worktree"). Het staat in .gitignore en is untracked, dus
 * git levert het hier nooit aan — deze uitsluiting is een expliciete vangnet-
 * regel voor het geval dat ooit verandert, niet iets wat vandaag werk doet.
 */
const EXCLUDED_SUBTREES = ['.claude/worktrees/']

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
}

function gitLines(args) {
  return git(args)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function isClaudePath(path) {
  if (!path.startsWith(CLAUDE_ROOT)) return false
  return !EXCLUDED_SUBTREES.some((prefix) => path.startsWith(prefix))
}

/** Bestanden die één commit aanraakt. Merges leveren bewust niets op: een merge
 *  introduceert geen nieuwe inhoud, die zit in de commits die hij samenbrengt. */
function filesInCommit(sha) {
  return gitLines(['diff-tree', '--no-commit-id', '--name-only', '-r', sha])
}

function subjectOf(sha) {
  return git(['show', '--no-patch', '--format=%s', sha]).trim()
}

function shortOf(sha) {
  return sha.slice(0, 9)
}

// ── Bereik bepalen ──────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const rangeIdx = argv.indexOf('--range')
const explicitRange = rangeIdx >= 0 ? argv[rangeIdx + 1] : null

if (rangeIdx >= 0 && !explicitRange) {
  console.error('✗ --range vereist een revisie-bereik, bv. --range origin/master..HEAD')
  process.exit(2)
}

function resolveCommits() {
  if (explicitRange) return gitLines(['rev-list', explicitRange])

  const remotes = gitLines(['remote'])
  if (remotes.length === 0) {
    // Zonder remote betekent `--not --remotes` "de hele historie". Dat is geen
    // push-bereik maar een archief; daar heeft deze gate niets te zoeken.
    console.log('✓ Zelfmodificatie-check overgeslagen: geen git-remote geconfigureerd.')
    process.exit(0)
  }
  return gitLines(['rev-list', 'HEAD', '--not', '--remotes'])
}

const commits = resolveCommits()

// ── Ongecommitte `.claude/`-wijzigingen (waarschuwing, geen blokkade) ───────

let workingTree = []
try {
  workingTree = gitLines(['status', '--porcelain', '--', CLAUDE_ROOT])
} catch {
  workingTree = []
}

function reportWorkingTree() {
  if (workingTree.length === 0) return
  console.log('⚠  Ongecommitte wijzigingen onder .claude/ (nog niet in een commit):')
  for (const line of workingTree) console.log(`   ${line}`)
  console.log('   Deze horen in een APARTE commit met onderwerp `self-improve: …`, en alleen')
  console.log('   nadat de eigenaar er expliciet ja op zei. Stage per pad — nooit `git add -A`.')
  console.log('')
}

// ── Beoordelen ──────────────────────────────────────────────────────────────

const touching = []
for (const sha of commits) {
  const files = filesInCommit(sha).filter(isClaudePath)
  if (files.length === 0) continue
  const subject = subjectOf(sha)
  touching.push({ sha, subject, files, ok: SELF_IMPROVE_SUBJECT.test(subject) })
}

if (argv.includes('--list')) {
  reportWorkingTree()
  console.log(
    `${touching.length} te pushen commit(s) raken .claude/ ` +
      `(van ${commits.length} in het push-bereik):`,
  )
  for (const c of touching) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${shortOf(c.sha)} ${c.subject}`)
    for (const f of c.files) console.log(`      ${f}`)
  }
  process.exit(0)
}

reportWorkingTree()

const violations = touching.filter((c) => !c.ok)

if (violations.length > 0) {
  console.error('✗ Zelfmodificatie zonder `self-improve:`-onderwerp in een te pushen commit.')
  console.error('')
  for (const c of violations) {
    console.error(`   ${shortOf(c.sha)}  ${c.subject}`)
    for (const f of c.files) console.error(`      ${f}`)
  }
  console.error('')
  console.error('WAAROM dit hard faalt: `.claude/**` is de configuratie waarmee de agents zichzelf')
  console.error('aansturen — commands, agents, skills. Een wijziging daarin mag alleen landen ná een')
  console.error('expliciet akkoord van de eigenaar, en zichtbaar: in een APARTE commit die zichzelf')
  console.error('als zelfmodificatie aanmerkt. Meeliften op een feature-commit maakt precies dat')
  console.error('onzichtbaar — en de instructie die de gate beschrijft, staat zélf in .claude/.')
  console.error('')
  console.error('OPLOSSING: haal de .claude/-paden uit de betreffende commit en zet ze apart:')
  console.error('   git reset <commit> -- .claude/    (stage per pad, nooit `git add -A`)')
  console.error('   git commit -m "self-improve: <wat er aan de definities verandert>"')
  console.error('Nog geen akkoord van de eigenaar? Dan hoort de wijziging er nog niet te zijn.')
  console.error('Zie .claude/skills/_shared/pijplijn-conventies.md § Zelfmodificatie van `.claude/`.')
  process.exit(1)
}

const approved = touching.length
console.log(
  approved > 0
    ? `✓ Zelfmodificatie: ${approved} commit(s) raken .claude/ en dragen alle een ` +
        '`self-improve:`-onderwerp.'
    : '✓ Zelfmodificatie: geen te pushen commit raakt .claude/.',
)
process.exit(0)
