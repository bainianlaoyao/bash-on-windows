# Security

windows-bash 会在 **Windows** 上修改 DeepSeek Harness 的默认凭证/沙箱策略。安装前请阅读本节。

## 改动一览(仅 win32)

| 设置 | 官方默认 | windows-bash |
|---|---|---|
| 终端工具 | 仅 PowerShell (pwsh) | 仅 Git Bash (bash) |
| `sandbox-policy.mode` | `workspace-write` | `danger-full-access` |
| `approval.policy` | `ask` | `never`(full-access 时) |

macOS / Linux 不受影响:官方默认就是 bash-only + `workspace-write`,本插件的补丁行在这些平台是 no-op。

## 为什么必须放开沙箱

Git Bash 的 cygwin 运行时在受控沙箱模式(workspace-write / read-only)下会**启动即失败**(signal/pipe 通道损坏)。只有 `danger-full-access` 下 git bash 才能正常运行。这是运行机制约束,不是本插件额外引入的权限。

## 逃生通道

- 设置环境变量 `DSH_PERMISSION_MODE=workspace-write`(或 `read-only`)启动 dsh,可恢复官方沙箱/审批默认值——但此时 git bash 可能在受控模式下无法启动(回到官方 pwsh 行为需要同时移除插件的 pwsh 禁用行)。
- 非 Windows 平台永远不受本插件沙箱默认值影响。

## 风险声明

`danger-full-access` + `approval: never` 意味着模型在 Windows 上拥有工作区无限制读写且**不弹审批**。仅在可信机器、可信模型配置下启用。发布本插件即视为同意该默认值;如需严格审批,请自行在 profile 补丁层覆盖 `approval.policy` 为 `ask`。

## 报告问题

安全相关 issue 请直接开 GitHub issue(建议加密细节走邮件,见仓库主页)。