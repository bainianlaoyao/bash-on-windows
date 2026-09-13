# bash-on-windows

DeepSeek Harness 插件(bundle + agent preset):让 **Windows 上可用的 bash 工具限制为 Git Bash**,并**禁用 PowerShell**。

## 组件

| 组件 | 说明 |
|---|---|
| `cordis.patch.yml` | bundle patch(`dsh.bundle.patch`):宿主平面翻转——`tool-bash` 启用、`tool-pwsh` 禁用;执行器 `bash-sandbox` 启用、`pwsh-sandbox` 禁用;win32 沙箱默认 `danger-full-access` + 审批 `never`(带 `DSH_PERMISSION_MODE` 逃生口,非 Windows 不动);挂载 `plugins/escalation-inert.mjs` |
| `plugins/escalation-inert.mjs` | 独立插件:full-access 部署下对模型隐藏 shell/fs 工具的 `sandbox_permissions`/`justification` 升级字段,并把同模式升级回声运行时置为无操作——**不修改任何官方包**(等价于过去直接改 npx-cache 里 harness 核心的做法,现在以可安装插件交付) |
| `presets/standard-bash` `code-bash` `cordis-bash` | bash-only 派生预设(官方预设 + 两行翻转),因为 bundle patch 无法修改 dsh 内置预设文件 |
| `scripts/install.ps1` | 把三个预设以 junction 形式安装到 `$DSH_HOME\.agent-presets\`(支持 `-Uninstall`) |
| `scripts/build-presets.mjs` | 从 pristine `@deepseek-ai/dsh` 源重新生成派生预设(上游升级时用) |
| `scripts/check-rows.mjs` | 契约测试:预设与 patch 的 bash-only 不变量 + escalation-inert 的 strip/sanitize/族门逻辑 |

## 工作机制(三层)

1. **宿主平面(bundle patch)**:`exec_command/bash` 工具的执行器是 `bash-sandbox`(内部 `spawn 'bash'`,Windows 上即 PATH 里的 git bash);`pwsh-sandbox` 被禁用,PowerShell 在运行时不存在。
2. **会话平面(派生预设)**:web 界面(`dsh-web-app`)把宿主平面的 `tool-bash`/`tool-pwsh` 同时禁用、让每个会话由 preset 挂载工具。所以模型侧"只看到 bash"必须由预设文件完成——这正是官方预设文件被本地改过的原因;本插件把它变成**可分发、不依赖改官方文件**的派生预设。
3. **升级词惰性化(escalation-inert)**:`danger-full-access` 部署从不拒命令,`sandbox_permissions`/`justification` 是模型习惯性回声的噪音字段,且同模式回声曾导致每次调用硬失败("not strictly wider")。该插件在 `system-prompt/assemble` 里把这两个字段从模型可见目录剥离(参数是逐次 structuredClone,注册表 schema 不受影响),并在 `tools/execute` 里把同模式回声参数替换为净化副本——官方审批路径永远看不到无操作请求,而真实加宽请求(请求模式 ≠ 当前模式)原样走审批。等价于以前的 harness 核心补丁,但**不改任何官方包、升级 dsh 不会丢**。

## 安装

```powershell
# 1) 宿主平面(bundle patch)
dsh plugin --profile web add github:bainianlaoyao/bash-on-windows   # GitHub 分发
dsh plugin --profile web add dsh-bash-on-windows                    # npm 分发(已发布;预构建安装免 allowBuilds)
#    或手动把 cordis.patch.yml 里的 6 行补进 profile 的 cordis.patch.yml

# 2) 会话平面(三个 bash-only 预设,junction 安装,不复制代码)
powershell -ExecutionPolicy Bypass -File scripts/install.ps1

# 3) 重启 dsh,新建会话,选择 standard-bash / code-bash / cordis-bash 预设
```

前置条件:已安装 [Git for Windows](https://git-scm.com)(`bash` 在 PATH 中)。

npm 包名:`dsh-bash-on-windows`(仓库名 `bash-on-windows`;`dsh.profile.bundles` 里加入 `"dsh-bash-on-windows"` 后 `pnpm install` 亦可)。

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

## 相关插件

同一作者的其它 dsh 插件，均已收录于 [dsh 插件市场](https://awesome-dsh-plugin.com/)：

- [`dsh-codex-mode`](https://github.com/bainianlaoyao/dsh-codex-harness) —— 面向 GPT 系模型的 Codex 形状编码预设：`exec_command` / `write_stdin` / `apply_patch` / `view_image`、OpenAI Chat Completions 与 Responses 两条路由，外加图形化子代理类型。其预设同样只挂 `tool-bash`。
- [`dsh-llm-api-pool`](https://github.com/bainianlaoyao/dsh-llm-api-pool) —— 聚合多个 OpenAI 兼容 API key，按余额热切换。
- [`dsh-session-robustness`](https://github.com/bainianlaoyao/dsh-session-robustness) —— 让长会话保持可恢复。
- [`dsh-easy-archive`](https://github.com/bainianlaoyao/easy-archive) —— 工作区侧边栏行内两步归档会话。

## 许可

MIT。派生预设来自 DeepSeek Harness agent presets(MIT,Copyright (c) 2026 DeepSeek),各预设目录内附 `LICENSE.deepseek-harness`。