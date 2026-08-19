#!/usr/bin/env node
/**
 * Regenerate the bash-only preset variants (presets/standard-bash|code-bash|cordis-bash)
 * from a pristine @deepseek-ai/dsh release, applying the same two-line flip the
 * bundle patch performs on the host plane:
 *
 *   tool-bash : remove `disabled: !!js process.platform === 'win32'` (bash everywhere)
 *   tool-pwsh : `disabled: !!js process.platform !== 'win32'` -> `disabled: true`
 *
 * Output files are committed, so this script only needs to run when
 * upstream preset files change (dsh upgrade).
 *
 * Usage:
 *   node scripts/build-presets.mjs [--src <agent-presets dir>]
 *
 * --src defaults to DSH_PRESET_SRC, then ./node_modules/@deepseek-ai/dsh/config/agent-presets
 * (fetch a pristine copy with `npm pack @deepseek-ai/dsh@<version>` and point --src at it).
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const argv = process.argv.slice(2)
const srcFlag = argv.indexOf('--src')
const candidates = [
  srcFlag >= 0 ? argv[srcFlag + 1] : undefined,
  process.env.DSH_PRESET_SRC,
  join(repoRoot, 'node_modules/@deepseek-ai/dsh/config/agent-presets'),
]
const src = candidates.find((p) => p && existsSync(p))
if (!src) {
  console.error('agent-presets source not found. Pass --src <dir> or set DSH_PRESET_SRC.')
  process.exit(1)
}

const VARIANTS = ['standard', 'code', 'cordis']

const FLIPS = [
  {
    id: 'tool-bash',
    from: "- id: tool-bash\n  name: '@deepseek-ai/dsh-tool-bash'\n  disabled: !!js process.platform === 'win32'\n",
    to: "- id: tool-bash\n  name: '@deepseek-ai/dsh-tool-bash'\n",
  },
  {
    id: 'tool-pwsh',
    from: "- id: tool-pwsh\n  name: '@deepseek-ai/dsh-tool-pwsh'\n  disabled: !!js process.platform !== 'win32'\n",
    to: "- id: tool-pwsh\n  name: '@deepseek-ai/dsh-tool-pwsh'\n  disabled: true\n",
  },
]

const BANNER = `# bash-on-windows variant: Git Bash is the ONLY terminal tool on every platform;
# pwsh is fully disabled. Regenerated from the pristine @deepseek-ai/dsh agent
# preset by scripts/build-presets.mjs (byte-identical to stock apart from the
# shell section). Requires the bash-on-windows bundle patch for the
# executor/sandbox plane (danger-full-access on win32 — confined modes kill
# git-bash at startup).

`

for (const variant of VARIANTS) {
  const file = join(src, variant, 'agent.cordis.yml')
  let text = await readFile(file, 'utf8')
  for (const flip of FLIPS) {
    const count = text.split(flip.from).length - 1
    assert.equal(count, 1, `${variant}: expected exactly one "${flip.id}" block, found ${count}`)
    text = text.replace(flip.from, flip.to)
  }
  const bashLine = text.indexOf('- id: tool-bash')
  assert.ok(bashLine >= 0, `${variant}: tool-bash row present`)
  text = text.slice(0, bashLine) + BANNER + text.slice(bashLine)
  const outDir = join(repoRoot, 'presets', `${variant}-bash`)
  mkdirSync(outDir, { recursive: true })
  await writeFile(join(outDir, 'agent.cordis.yml'), text)
  console.log(`wrote presets/${variant}-bash/agent.cordis.yml`)
}
console.log('preset build: ALL PASS')