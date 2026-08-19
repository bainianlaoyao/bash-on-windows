# bash-on-windows

A DeepSeek Harness plugin (bundle + agent presets): on Windows, the available bash tool is limited to **Git Bash** and **PowerShell is disabled**.

## Components

| Component | Purpose |
|---|---|
| `cordis.patch.yml` | bundle patch (`dsh.bundle.patch`): host-plane flips — `tool-bash` enabled, `tool-pwsh` disabled; executors `bash-sandbox` enabled, `pwsh-sandbox` disabled; win32 sandbox default `danger-full-access` + approval `never` (`DSH_PERMISSION_MODE` escape hatch; non-Windows untouched); mounts `plugins/escalation-inert.mjs` |
| `plugins/escalation-inert.mjs` | standalone plugin: in full-access deployments it hides the `sandbox_permissions`/`justification` escalation vocabulary on the shell/fs tools from the model and neutralizes same-mode escalation echoes at runtime — **without modifying any official package** (the equivalent of the old npx-cache harness-core patch, delivered as an installable plugin) |
| `presets/standard-bash` `code-bash` `cordis-bash` | bash-only preset variants (stock preset + two-line flip), because a bundle patch cannot modify dsh's shipped preset files |
| `scripts/install.ps1` | installs the three presets as junctions under `$DSH_HOME\.agent-presets\` (`-Uninstall` supported) |
| `scripts/build-presets.mjs` | regenerates the variants from a pristine `@deepseek-ai/dsh` source (after dsh upgrades) |
| `scripts/check-rows.mjs` | contract test: bash-only invariants of presets and patch + escalation-inert strip/sanitize/family-gate logic |

## How it works (three planes, all required)

1. **Host plane (bundle patch)**: the `bash` tool's executor is `bash-sandbox` (it spawns `bash` from PATH = Git Bash on Windows); `pwsh-sandbox` is disabled, so PowerShell does not exist at runtime.
2. **Session plane (derived presets)**: the web surface (`dsh-web-app`) disables both host shell rows and lets each session mount tools from its preset. Making the model see only bash therefore requires the preset files — which is exactly what used to be a fragile local edit of shipped files. This plugin turns it into distributable derived presets that never touch shipped files.
3. **Escalation inert (escalation-inert)**: a `danger-full-access` deployment never denies anything, so `sandbox_permissions`/`justification` are noise fields models habitually echo, and a same-mode echo used to hard-fail every call ("not strictly wider"). The plugin strips the two fields from the model-visible tool catalog in `system-prompt/assemble` (the assembled `parameters` are per-assembly `structuredClone` snapshots, so registered schemas are untouched) and replaces same-mode echo args with a sanitized copy in `tools/execute`, so the official escalation path never sees a no-op request — while genuinely wider requests (requested ≠ standing) pass through unchanged and keep the approval flow. This is the harness-core equivalent delivered as an installable plugin: no official package is modified, and a dsh upgrade cannot lose it.

## Install

```powershell
# 1) Host plane (bundle patch)
dsh plugin --profile web add github:bainianlaoyao/bash-on-windows   # GitHub distribution
dsh plugin --profile web add bash-on-windows                        # npm distribution (published; prebuilt install skips allowBuilds)
#    or copy the rows from cordis.patch.yml into the profile patch layer

# 2) Session plane (three bash-only presets, junction install, no code copy)
powershell -ExecutionPolicy Bypass -File scripts/install.ps1

# 3) Restart dsh, create a session, pick the standard-bash / code-bash / cordis-bash preset
```

Prerequisite: [Git for Windows](https://git-scm.com) installed (`bash` on PATH).

The npm package name equals the repo name: `bash-on-windows` (also installable by adding `"bash-on-windows"` to `dsh.profile.bundles` and running `pnpm install`).

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Uninstall
# remove the bundle rows from the profile patch layer manually
```

## Test

```bash
node scripts/check-rows.mjs   # contract: bash-only invariants across presets and patch
```

## After a dsh upgrade

Run `node scripts/build-presets.mjs --src <pristine agent-presets dir>` to regenerate the variants and commit them; the host-plane patch needs no changes (target row ids are provided by the official packages).

## Security

See [SECURITY.md](./SECURITY.md) — important: on win32 the default sandbox is `danger-full-access` with approval `never`; this is a hard requirement of Git Bash's cygwin runtime.

## License

MIT. The derived presets come from DeepSeek Harness agent presets (MIT, Copyright (c) 2026 DeepSeek); each preset directory carries a `LICENSE.deepseek-harness`.