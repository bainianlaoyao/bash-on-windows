#!/usr/bin/env node
/**
 * Contract check for windows-bash:
 *
 *  1. every preset variant's agent.cordis.yml parses and satisfies the
 *     bash-only invariants (tool-bash active everywhere, tool-pwsh disabled),
 *  2. cordis.patch.yml parses and carries the four host-plane flips plus the
 *     win32-scoped sandbox/approval defaults,
 *  3. no duplicate row ids within any file.
 *
 * The custom `!!js` tag is registered the way the dsh loader does (YAML
 * scalar holding a JS expression), so stock expressions parse as strings.
 *
 * Usage: node scripts/check-rows.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const JsExprType = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  construct: (data) => data,
})
const schema = yaml.DEFAULT_SCHEMA.extend([JsExprType])
const load = (text) => yaml.load(text, { schema })

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const ids = (rows) => rows.map((r) => r.id).filter(Boolean)
const duplicate = (list) => list.filter((v, i) => list.indexOf(v) !== i)

// ── preset variants ─────────────────────────────────────────────────────────
for (const variant of ['standard-bash', 'code-bash', 'cordis-bash']) {
  const file = join(root, 'presets', variant, 'agent.cordis.yml')
  const rows = load(await readFile(file, 'utf8'))
  assert.ok(Array.isArray(rows), `${variant}: top-level list`)
  const dup = duplicate(ids(rows))
  assert.deepEqual(dup, [], `${variant}: duplicate row ids ${dup}`)

  const bash = rows.find((r) => r.id === 'tool-bash')
  const pwsh = rows.find((r) => r.id === 'tool-pwsh')
  assert.ok(bash, `${variant}: tool-bash row exists`)
  assert.ok(pwsh, `${variant}: tool-pwsh row exists`)
  assert.ok(!bash.disabled, `${variant}: tool-bash NOT disabled`)
  assert.equal(pwsh.disabled, true, `${variant}: tool-pwsh disabled: true`)
  console.log(`OK presets/${variant}/agent.cordis.yml (${rows.length} rows)`)
}

// ── bundle patch ────────────────────────────────────────────────────────────
const patch = load(await readFile(join(root, 'cordis.patch.yml'), 'utf8'))
assert.ok(Array.isArray(patch), 'patch: top-level list')
const dupPatch = duplicate(ids(patch))
assert.deepEqual(dupPatch, [], `patch: duplicate row ids ${dupPatch}`)
const byId = new Map(patch.map((r) => [r.id, r]))
for (const [id, want] of [
  ['tool-bash', false],
  ['tool-pwsh', true],
  ['bash-sandbox', false],
  ['pwsh-sandbox', true],
]) {
  const row = byId.get(id)
  assert.ok(row, `patch: row ${id} present`)
  assert.equal(row.disabled, want, `patch: ${id}.disabled === ${want}`)
}
for (const id of ['sandbox-policy', 'approval']) {
  const row = byId.get(id)
  assert.ok(row, `patch: row ${id} present`)
  const expr = id === 'sandbox-policy' ? row.config?.mode : row.config?.policy
  assert.equal(typeof expr, 'string', `patch: ${id} carries a !!js expression`)
  assert.ok(expr.includes("process.platform === 'win32'"), `patch: ${id} is win32-scoped`)
}
console.log('OK cordis.patch.yml (host-plane flips + win32-scoped sandbox/approval)')

console.log('check-rows: ALL PASS')