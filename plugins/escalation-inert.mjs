/**
 * escalation-inert — bash-on-windows companion plugin
 *
 * In a `danger-full-access` deployment the sandbox never denies anything, so
 * the model-facing escalation vocabulary (`sandbox_permissions` +
 * `justification`) on the bash/pwsh/fs tools is pure echo noise: models
 * habitually over-specify the widest enum value, and a same-mode request used
 * to hard-fail every call ("not strictly wider than the current mode").
 *
 * This plugin delivers the equivalent of a harness-core patch as an
 * installable layer — NO official package is touched:
 *
 *  1. `system-prompt/assemble` (outermost listener): whenever a tool family's
 *     DEFAULT sandbox mode is `danger-full-access`, strip the two fields from
 *     the assembled tool catalog and trim the escalation paragraph from the
 *     tool description. The assembled `parameters` are per-assembly
 *     `structuredClone` snapshots (dsh-system-prompt), so the registered
 *     schemas in the tool registry stay untouched — only what the model sees
 *     changes.
 *  2. `tools/execute` (outermost listener): when a call still carries
 *     `sandbox_permissions` equal to the session's STANDING mode (a stale
 *     echo of the now-hidden field, or any same-mode echo in a confined
 *     deployment), replace the deep-frozen args with a sanitized copy so the
 *     official escalation path never sees a no-op request it would reject.
 *     A genuinely wider request (`requested !== standing`) passes through
 *     unchanged and keeps the official approval flow.
 *
 * The per-family gate mirrors the patched harness-core logic: bash/pwsh hide
 * under `ctx.shell.sandboxMode === 'danger-full-access'`, read/write/edit
 * under `ctx.fs.sandboxMode === 'danger-full-access'`, and any other tool
 * carrying the fields hides when either seam is full access.
 *
 * Mount: host plane via the bundle patch (`cordis.patch.yml` insert row).
 * Agent-scoped waterfalls deliver to host listeners — the same mechanism
 * `dsh-tool-call-timeout-policy` uses for its `tools/execute` hook.
 *
 * Editing this file under a RUNNING dsh requires bumping the module-cache
 * key in `cordis.patch.yml` (`name: './plugins/escalation-inert.mjs?v=2'`).
 */

export const name = 'escalation-inert'

/** Services are read lazily at event time; nothing must exist at mount. */
export const inject = []

const ESCALATION_PARAMS = new Set(['sandbox_permissions', 'justification'])

/** The model-facing escalation paragraph appended to bash/pwsh descriptions. */
const ESCALATION_PARAGRAPH_MARKER = ' Attempting a command the sandbox may deny is safe and expected'

/** Family gate: which seam's default decides hiding for a tool name. */
export function hidingFor(ctx, toolName) {
  const shellMode = ctx.get('shell')?.sandboxMode
  const fsMode = ctx.get('fs')?.sandboxMode
  const shellHidden = shellMode === 'danger-full-access'
  const fsHidden = fsMode === 'danger-full-access'
  if (toolName === 'bash' || toolName === 'pwsh') return shellHidden
  if (toolName === 'read' || toolName === 'write' || toolName === 'edit') return fsHidden
  return shellHidden || fsHidden
}

/** Rebuild one assembled tool without the escalation vocabulary. */
export function stripEscalation(tool) {
  const params = tool.parameters
  if (params === null || typeof params !== 'object' || !('sandbox_permissions' in params)) return tool
  const parameters = {}
  for (const [key, value] of Object.entries(params)) {
    if (!ESCALATION_PARAMS.has(key)) parameters[key] = value
  }
  let description = tool.description
  const marker = typeof description === 'string' ? description.indexOf(ESCALATION_PARAGRAPH_MARKER) : -1
  if (marker >= 0) description = description.slice(0, marker)
  return { ...tool, description, parameters }
}

/**
 * Drop same-mode escalation echoes from a call's arguments. Returns the
 * original object when nothing matches (a genuinely wider request, or no
 * escalation args at all).
 */
export function sanitizeEscalationArgs(args, standingMode) {
  if (args === null || typeof args !== 'object' || !('sandbox_permissions' in args)) return args
  if (args.sandbox_permissions !== standingMode) return args
  const clean = {}
  for (const [key, value] of Object.entries(args)) {
    if (!ESCALATION_PARAMS.has(key)) clean[key] = value
  }
  return clean
}

export function apply(ctx) {
  // Strip the escalation vocabulary from the model-visible tool catalog.
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    const shellHidden = ctx.get('shell')?.sandboxMode === 'danger-full-access'
    const fsHidden = ctx.get('fs')?.sandboxMode === 'danger-full-access'
    if (!shellHidden && !fsHidden) return assembled
    const tools = assembled.tools.map((tool) => (hidingFor(ctx, tool.name) ? stripEscalation(tool) : tool))
    return { ...assembled, tools }
  }, { prepend: true })

  // Neutralize same-mode escalation echoes before the official tool body runs.
  ctx.on('tools/execute', (exec, next) => {
    const args = exec?.arguments
    if (args === null || typeof args !== 'object' || !('sandbox_permissions' in args)) return next()
    const standing = ctx.get('sandboxPolicy')?.resolve({ session: exec.agent?.session })?.mode
    if (typeof standing !== 'string') return next()
    const clean = sanitizeEscalationArgs(args, standing)
    if (clean !== args) exec.arguments = clean
    return next()
  }, { prepend: true })
}
