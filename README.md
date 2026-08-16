# windows-bash

让 **Windows 上 Git Bash 成为 DeepSeek Harness 唯一终端工具** 的插件(bundle + agent preset)。

官方 dsh 在 Windows 上默认**只给 PowerShell**(`dsh-base` 用 `process.platform` 表达式在 win32 禁用 bash、启用 pwsh);本插件把这一默认翻转成 **只有 git bash**。macOS / Linux 上官方默认本来就是 bash-only,插件是 no-op。

与 `dsh-bash-terminal`(可切换 PowerShell / Git Bash / WSL)不同,本插件是"**唯一**"语义:PowerShell 从运行时和模型工具面彻底移除。

## 组件

| 组件 | 说明 |
|---|---|
| `cordis.patch.yml` | bundle patch(`dsh.bundle.patch`):宿主平面翻转——`tool-bash` 启用、`tool-pwsh` 禁用;执行器 `bash-sandbox` 启用、`pwsh-sandbox` 禁用;win32 沙箱默认 `danger-full-access` + 审批 `never`(带 `DSH_PERMISSION_MODE` 逃生口,非 Windows 不动) |
| `presets/standard-bash` `code-bash` `cordis-bash` | bash-only 派生预设(官方预设 + 两行翻转),因为 bundle patch 无法修改 dsh 内置预设文件 |
| `scripts/install.ps1` | 把三个预设以 junction 形式安装到 `$DSH_HOME\.agent-presets\`(支持 `-Uninstall`) |
| `scripts/build-presets.mjs` | 从 pristine `@deepseek-ai/dsh` 源重新生成派生预设(上游升级时用) |
| `scripts/check-rows.mjs` | 契约测试:预设与 patch 的 bash-only 不变量 |

## 工作机制(两层,缺一不可)

1. **宿主平面(bundle patch)**:`exec_command/bash` 工具的执行器是 `bash-sandbox`(内部 `spawn 'bash'`,Windows 上即 PATH 里的 git bash);`pwsh-sandbox` 被禁用,PowerShell 在运行时不存在。
2. **会话平面(派生预设)**:web 界面(`dsh-web-app`)把宿主平面的 `tool-bash`/`tool-pwsh` 同时禁用、让每个会话由 preset 挂载工具。所以模型侧"只看到 bash"必须由预设文件完成——这正是官方预设文件被本地改过的原因;本插件把它变成**可分发、不依赖改官方文件**的派生预设。

## 安装

```powershell
# 1) 宿主平面(bundle patch)
dsh plugin --profile web add github:bainianlaoyao/windows-bash   # GitHub 分发
dsh plugin --profile web add windows-bash                        # npm 分发(已发布;预构建安装免 allowBuilds)
#    或手动把 cordis.patch.yml 里的 6 行补进 profile 的 cordis.patch.yml

# 2) 会话平面(三个 bash-only 预设,junction 安装,不复制代码)
powershell -ExecutionPolicy Bypass -File scripts/install.ps1

# 3) 重启 dsh,新建会话,选择 standard-bash / code-bash / cordis-bash 预设
```

前置条件:已安装 [Git for Windows](https://git-scm.com)(`bash` 在 PATH 中)。

npm 包名与仓库名相同:`windows-bash`(`dsh.profile.bundles` 里加入 `"windows-bash"` 后 `pnpm install` 亦可)。

## 卸载

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Uninstall
# bundle 行从 profile 补丁层手动删除
```

## 测试

```bash
node scripts/check-rows.mjs   # 契约:三个预设 + patch 的 bash-only 不变量
```

## 升级 dsh 后

`node scripts/build-presets.mjs --src <pristine agent-presets 目录>` 重新生成派生预设并提交;宿主平面补丁行无需改动(目标行 id 由官方包提供)。

## 安全

见 [SECURITY.md](./SECURITY.md)——重要:win32 默认沙箱为 `danger-full-access` 且审批为 `never`,这是 git bash cygwin 运行时的硬性要求。

## 许可

MIT。派生预设来自 DeepSeek Harness agent presets(MIT,Copyright (c) 2026 DeepSeek),各预设目录内附 `LICENSE.deepseek-harness`。