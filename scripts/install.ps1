# bash-on-windows - local deployment script (Windows junctions, no code copy).
#
# Serves the bash-only preset variants from the repo through junctions, so
# edits in the repo take effect without re-copying:
#
#   $DSH_HOME/.agent-presets/standard-bash -> <repo>/presets/standard-bash
#   $DSH_HOME/.agent-presets/code-bash     -> <repo>/presets/code-bash
#   $DSH_HOME/.agent-presets/cordis-bash   -> <repo>/presets/cordis-bash
#
# The host-plane flip (executor + sandbox/approval) is NOT applied here: it
# ships as the bundle patch (cordis.patch.yml). Install it with
#   dsh plugin --profile web add github:bainianlaoyao/bash-on-windows
# or copy the rows from cordis.patch.yml into the profile's cordis.patch.yml.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/install.ps1 [-DshHome <path>]
#   powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Uninstall
param(
    [string]$DshHome = "$env:USERPROFILE\.dsh",
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PresetNames = @('standard-bash', 'code-bash', 'cordis-bash')

function New-Junction([string]$Link, [string]$Target) {
    if (Test-Path $Link) {
        $item = Get-Item $Link -Force
        if ($item.LinkType -ne 'Junction') {
            throw "Refusing to replace non-junction path: $Link"
        }
        Write-Host "  junction already present: $Link"
        return
    }
    New-Item -ItemType Junction -Path $Link -Target $Target | Out-Null
    Write-Host "  junction: $Link -> $Target"
}

function Remove-Junction([string]$Link) {
    if (Test-Path $Link) {
        $item = Get-Item $Link -Force
        if ($item.LinkType -ne 'Junction') {
            throw "Not a junction, refusing to remove: $Link"
        }
        Remove-Item $Link -Force
        Write-Host "  removed junction: $Link"
    }
}

if ($Uninstall) {
    Write-Host "Removing bash-on-windows preset junctions..."
    foreach ($name in $PresetNames) {
        Remove-Junction (Join-Path $DshHome ".agent-presets\$name")
    }
    Write-Host "Done. The bundle patch rows in the profile are untouched; remove them manually if desired."
    exit 0
}

if (-not (Test-Path $DshHome)) {
    throw "DSH home not found: $DshHome"
}

Write-Host "Installing bash-on-windows presets into $DshHome (repo: $Repo)"
foreach ($name in $PresetNames) {
    New-Junction (Join-Path $DshHome ".agent-presets\$name") (Join-Path $Repo "presets\$name")
}

$hasBash = (Get-Command bash -ErrorAction SilentlyContinue) -ne $null
if (-not $hasBash) {
    Write-Warning "git bash not found on PATH - install Git for Windows (https://git-scm.com) and re-run this terminal."
}

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Host plane: dsh plugin --profile web add github:bainianlaoyao/bash-on-windows"
Write-Host "     (or copy the rows from cordis.patch.yml into the profile patch layer)."
Write-Host "  2. Restart dsh, then create a session with the 'standard-bash' / 'code-bash' / 'cordis-bash' preset."
Write-Host "  3. Regression: cd $Repo ; node scripts/check-rows.mjs"