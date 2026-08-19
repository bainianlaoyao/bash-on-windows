#!/usr/bin/env node
/**
 * Contract check for bash-on-windows:
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
import { fileURLToPath, pathToFileURL } from 'node:url'
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
const insertRows = patch.filter((r) => r.insert !== undefined).flatMap((r) => r.insert)
const inertRow = insertRows.find((r) => r.id === 'escalation-inert')
assert.ok(inertRow, 'patch: escalation-inert insert row present')
assert.equal(inertRow.name, './plugins/escalation-inert.mjs', 'patch: escalation-inert points at the plugin file')
console.log('OK cordis.patch.yml (host-plane flips + win32-scoped sandbox/approval + escalation-inert)')

// ── escalation-inert plugin ─────────────────────────────────────────────────
const plugin = await import(pathToFileURL(join(root, 'plugins', 'escalation-inert.mjs')).href)
assert.equal(plugin.name, 'escalation-inert')
assert.deepEqual(plugin.inject, [], 'plugin: no mount-time dependencies')

// stripEscalation: removes the two fields + trims the description paragraph
const tool = {
  name: 'bash',
  description:
    'Execute a bash command (`bash -c`) and return its stdout/stderr. Long output is truncated to its tail.' +
    ' Attempting a command the sandbox may deny is safe and expected: retry with `sandbox_permissions` + justification.',
  parameters: {
    command: { type: 'string', required: true },
    description: { type: 'string', required: true },
    timeoutMs: { type: 'number' },
    workdir: { type: 'string' },
    run_in_background: { type: 'boolean' },
    sandbox_permissions: { type: 'string', enum: ['workspace-write', 'danger-full-access'] },
    justification: { type: 'string' },
  },
}
const stripped = plugin.stripEscalation(tool)
assert.deepEqual(Object.keys(stripped.parameters), ['command', 'description', 'timeoutMs', 'workdir', 'run_in_background'], 'strip: escalation params removed')
assert.ok(!stripped.description.includes('Attempting a command'), 'strip: escalation paragraph trimmed')
assert.deepEqual(stripped.parameters.command, tool.parameters.command, 'strip: other params untouched')

// stripEscalation: untouched when the tool carries no escalation fields
const plain = { name: 'read_image', description: 'x', parameters: { path: { type: 'string' } } }
assert.equal(plugin.stripEscalation(plain), plain, 'strip: no-field tool returned as-is')

// sanitizeEscalationArgs: same-mode echo becomes a no-op pair drop
const same = { command: 'ls', sandbox_permissions: 'danger-full-access', justification: 'noise' }
assert.deepEqual(plugin.sanitizeEscalationArgs(same, 'danger-full-access'), { command: 'ls' }, 'sanitize: same-mode echo dropped')
// sanitizeEscalationArgs: a genuinely wider request passes through
const wider = { command: 'rm -rf x', sandbox_permissions: 'danger-full-access', justification: 'real need' }
assert.equal(plugin.sanitizeEscalationArgs(wider, 'workspace-write'), wider, 'sanitize: wider request untouched')
// sanitizeEscalationArgs: no escalation args passes through
const none = { command: 'ls' }
assert.equal(plugin.sanitizeEscalationArgs(none, 'danger-full-access'), none, 'sanitize: no-escalation call untouched')

// hidingFor: family gates follow each seam's default mode
const hiddenCtx = { get: (k) => (k === 'shell' || k === 'fs' ? { sandboxMode: 'danger-full-access' } : undefined) }
const confinedCtx = { get: (k) => (k === 'shell' || k === 'fs' ? { sandboxMode: 'workspace-write' } : undefined) }
const mixedCtx = { get: (k) => (k === 'shell' ? { sandboxMode: 'danger-full-access' } : k === 'fs' ? { sandboxMode: 'workspace-write' } : undefined) }
assert.equal(plugin.hidingFor(hiddenCtx, 'bash'), true, 'hiding: bash hidden under full-access shell')
assert.equal(plugin.hidingFor(hiddenCtx, 'pwsh'), true, 'hiding: pwsh hidden under full-access shell')
assert.equal(plugin.hidingFor(hiddenCtx, 'write'), true, 'hiding: fs hidden under full-access fs')
assert.equal(plugin.hidingFor(confinedCtx, 'bash'), false, 'hiding: bash visible under confined shell')
assert.equal(plugin.hidingFor(mixedCtx, 'bash'), true, 'hiding: bash hidden when shell full access')
assert.equal(plugin.hidingFor(mixedCtx, 'edit'), false, 'hiding: fs visible when fs confined')
console.log('OK plugins/escalation-inert.mjs (strip + sanitize + family gates)')

console.log('check-rows: ALL PASS')