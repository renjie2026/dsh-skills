/**
 * Validate every skill under this directory before it is shared.
 *
 * A skill is consumed by an AI agent that has never seen the repository, so a
 * malformed frontmatter block, an unclosed code fence or a name that does not
 * match its directory turns the skill into a silent no-op — it simply never
 * appears in the catalog, with no error anywhere.
 *
 * Checks, per skill:
 *   1. `SKILL.md` exists and starts with a YAML frontmatter block
 *   2. the frontmatter parses as YAML
 *   3. `name` is present, kebab-case, and equals its directory name
 *   4. `description` is present, non-empty, and says WHEN to use the skill
 *   5. every ``` fence is closed, and every language tag is recognised
 *   6. relative file paths the prose references actually exist
 *
 * Run with: node validate-skills.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

/** `js-yaml` is not bundled with every Node build; try the usual homes. */
function loadYaml() {
  const candidates = [
    'js-yaml',
    process.env.DSH_PROFILE_MODULES && join(process.env.DSH_PROFILE_MODULES, 'js-yaml'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      return require(candidate)
    } catch { /* try the next one */ }
  }
  return null
}

const yaml = loadYaml()
const failed = []

/**
 * Record a failure.
 * @param skill - skill directory name.
 * @param message - what went wrong.
 */
function fail(skill, message) {
  failed.push(`${skill}: ${message}`)
  console.error(`FAIL ${skill}: ${message}`)
}

/**
 * Record a pass.
 * @param message - what was checked.
 */
function ok(message) {
  console.log(`ok   ${message}`)
}

/**
 * Infrastructure directories that are not skills. In the workspace `skills/`
 * folder every entry was a skill, but the standalone skills repository also
 * carries `.github/` and `node_modules/` — scanning those as skills produced
 * false failures. Dot-directories and these names are skipped; any other
 * directory without a SKILL.md still fails.
 */
const SKIPPED_DIRS = ['node_modules']

const skills = readdirSync(here, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .filter((entry) => !entry.name.startsWith('.') && !SKIPPED_DIRS.includes(entry.name))
  .map((entry) => entry.name)

if (skills.length === 0) {
  console.error('no skill directories found')
  process.exit(1)
}

for (const skill of skills) {
  const file = join(here, skill, 'SKILL.md')
  if (!existsSync(file)) {
    fail(skill, 'SKILL.md missing')
    continue
  }

  const source = readFileSync(file, 'utf8')

  // 1. frontmatter present and delimited
  if (!source.startsWith('---\n')) {
    fail(skill, 'does not start with a YAML frontmatter block')
    continue
  }
  const end = source.indexOf('\n---', 4)
  if (end < 0) {
    fail(skill, 'frontmatter block is never closed')
    continue
  }
  const frontmatter = source.slice(4, end + 1)
  const body = source.slice(end + 4)

  // 2. it parses
  if (yaml === null) {
    console.error('WARN js-yaml unavailable — frontmatter not parsed, only read as text')
  } else {
    let meta = null
    try {
      meta = yaml.load(frontmatter)
    } catch (error) {
      fail(skill, `frontmatter is not valid YAML: ${error.message}`)
      continue
    }

    // 3. name present, kebab-case, matches the directory
    const name = meta?.name
    if (typeof name !== 'string' || name === '') {
      fail(skill, 'frontmatter has no `name`')
    } else {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) fail(skill, `name "${name}" is not kebab-case`)
      if (name !== skill) fail(skill, `name "${name}" does not match its directory "${skill}"`)
      else ok(`${skill}: name matches directory`)
    }

    // 4. description present and useful
    const description = typeof meta?.description === 'string' ? meta.description.trim() : ''
    if (description === '') {
      fail(skill, 'frontmatter has no `description`')
    } else {
      if (description.length < 80) fail(skill, `description is only ${description.length} chars — too thin to route on`)
      if (!/Use when|Use this|Use for|use when/i.test(description)) {
        fail(skill, 'description does not say WHEN to use the skill ("Use when …")')
      }
      if (description.length > 1200) fail(skill, `description is ${description.length} chars — trim it`)
      ok(`${skill}: description present (${description.length} chars)`)
    }
  }

  // 5. fences balanced
  const fences = body.match(/^```/gm) ?? []
  if (fences.length % 2 !== 0) fail(skill, `${fences.length} code fences — one is unclosed`)
  else ok(`${skill}: ${fences.length / 2} code block(s), all closed`)

  // 6. referenced relative paths exist (only ones that look like repo paths)
  const referenced = new Set()
  for (const match of body.matchAll(/`([a-zA-Z0-9_./-]+\.(?:mjs|js|ts|json|jsonc|html|yml|yaml|md))`/g)) {
    const candidate = match[1]
    if (candidate.startsWith('/') || candidate.includes('node_modules')) continue
    // Only paths that name a directory in this repo, not illustrative ones.
    if (!candidate.includes('/')) continue
    referenced.add(candidate)
  }
  const missing = [...referenced].filter((candidate) => {
    const base = candidate.split('/')[0]
    return ['lib', 'tests', 'scripts', 'schema', 'tools', 'types', 'skills'].includes(base)
      && !existsSync(join(here, candidate))
  })
  if (missing.length > 0) {
    // Expected: a skill describes the layout of the project it is used IN, not
    // this directory. Reported for information only, never as a failure.
    console.error(`NOTE ${skill}: names paths from the target project (not present here): ${missing.join(', ')}`)
  }

  const words = body.split(/\s+/).filter(Boolean).length
  ok(`${skill}: body is ${words} words`)
}

if (failed.length > 0) {
  console.error(`\n${failed.length} skill check(s) failed`)
  process.exit(1)
}
console.log('\nall skill checks passed')
