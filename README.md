# dsh-auto-title

给 DeepSeek Harness 的会话**自动起名**：不再是把你第一句话截断几个字塞进任务栏，而是等第一条助手回复结束后，用「项目｜具体任务」的格式取一个真正能区分会话的标题。

```text
（示意，非真实运行记录）
改前（内置行为，截断首条提问） →  改后（本插件生成）
帮我看看这个 pnpm 报错…        →  pnpm｜lockfile 供应链校验报错排查
再写一版                        →  写作｜把笔记改成一页纸说明
那个 bug 修了吗                 →  debug｜会话标题事件没触发
```

## 为什么需要它

内置的 `session-title-llm` 行在**首条人类消息**上就定型标题，内容基本等于把提问截断，于是 20 个会话里有 15 个长得一样，列表没法扫读。本插件换成在**首轮对话结束后**命名：它能同时看到「你要什么」和「最后做成了什么」，从而给出可分类的名字。

## 手动重命名（会话行的「…」菜单）

自动命名只管首轮。想给**任意一条已有会话**重新起名时，点会话行右侧的「…」菜单，里面会多出一行 **AI 重命名**（排在原生「重命名」之后）：

1. 点它 → 读取该会话的**首条人类提问**与**最近一次带文本的助手回复**，走一次辅助模型调用，弹出对话框并预填建议标题；
2. 标题可编辑，回车或点「应用」提交，Esc / 「取消」放弃；
3. 提交走的是原生用户重命名（`sessionTitle.rename`，`source.kind === 'user'`），所以这个标题**会被钉住**，之后任何自动命名都不会覆盖它。

实现上分两半：客户端 bundle 注册菜单行与 `shell.overlay` 对话框，宿主注册两个同源 HTTP 路由（`POST /dsh-auto-title/title` 生成建议、`POST /dsh-auto-title/apply` 提交），因为菜单行拿不到宿主服务。会话未打开时会被自动 resume 后再改名。

失败会以本地化文案显示在对话框里：没有人类提问（422 `empty-session`）、会话从未跑过模型且没配 `provider`/`model`（409 `no-route`）、模型没给出可用标题（502 `model-empty`）。

## 标题怎么来的

1. 会话提交人类消息后（默认只在第一条），标题服务调用本插件；节奏由 `automatic` 决定。
2. 插件**先等这轮对话的助手回复**（带文本的 `assistant/message`，或 `turn/end` 的完成/超长原因；失败或超时则以空字符串继续），最多等 `waitForReplyMs`。
3. 把「人类请求 + 助手回复」一起交给**一次**辅助模型调用（不占用会话正文的上下文预算，也不会打断当前生成）。
4. 结果做规范化：去掉引号/空白、折叠换行、去句末标点、按 `maxTitleLength` 截断。
5. 以 `{ title, messageSeqs: [触发消息 seq], model }` 交回标题服务；服务负责持久化并把新标题推给界面。

任一步失败（模型报错、超时、输出为空）都会抛出带 `code` 的错误，标题服务保持上一个标题不变——**不会把会话改成空名字**。

## 安装

```sh
dsh plugin add https://github.com/sumingwang233/dsh-auto-title
```

或在桌面端 **设置 → 插件市场 → 添加插件**，把同一个地址填进去。装完**重启 DSH 桌面端**（或重连该 profile）使新 bundle 生效。

本地开发时也可以直接从工作副本装：`dsh plugin add <本目录绝对路径>`。

> 本插件与内置的 `session-title-llm` 争用同一个槽位，所以它的 `cordis.patch.yml` 会先禁用内置行再插入自己——安装时你不需要改任何基础 bundle。

## 它会关掉内置的标题 provider

`ctx.sessionTitle` 只接受**一个** provider（第二个注册会抛错）。内置的 `session-title-llm` 行在基础 bundle 里，所以本包的 `cordis.patch.yml` 先把它禁用，再插入自己：

```yaml
- id: session-title-llm
  disabled: true

- insert:
    - id: auto-title
      name: 'dsh-auto-title'
```

因此：

- **停用本插件 = 内置标题行为自动恢复**，不需要改基础 bundle；
- 若你的 profile 里还有别的会话标题插件，两者会争抢同一个槽位，本插件会**安静地不注册**（日志 warn），不导致启动失败。

## 在桌面端使用

重启桌面端后，插件在两个地方出现：

**1. 设置侧栏 →「dsh-auto-title」（设置页）**

它是**设置导航里的一级条目**（和「内置插件」「邮件」并列），不在「插件」页里——桌面端这一版没有「插件」页。页面里可以改 `enabled`、`provider`、`model`、`language`、`maxTitleLength`、`waitForReplyMs`、`timeoutMs`，改完点保存立即生效（下一次命名就用新配置）。页面下方是**最近事件日志**：每次自动命名、每次手动 AI 重命名、每个失败原因都会记一行，可刷新、清空、一键复制——排查问题或提 issue 时直接贴这段。

日志同时镜像到 `<插件目录>/log.jsonl`（与 `settings.json` 同目录），即使设置页打不开也能用 `cat` 看到；也可以直接请求 `GET /dsh-auto-title/log?limit=100`。

**2. 会话列表每一行的「…」菜单 →「AI 重命名」**

点开后会先跑一次辅助模型，把「首条提问 + 最近几条对话」压成候选标题，在弹窗里给你改，确认后才写入。失败时弹窗直接显示原因（没有可用路由、没有人类提问、模型返回空、超时、HTTP 错误码）。

日志里常见的失败原因：

| 日志 | 含义 |
| --- | --- |
| `this session has not called a model yet` | 会话还没有模型路由，去卡片里填 `provider` / `model` |
| `HTTP 500` + `WebRoute` | 客户端与主机版本不匹配（本仓库已修；旧 bundle 会这样） |
| `模型在输出上限（N tokens）内没有写出标题` | 推理占满了预算：加大 `maxOutputTokens`，或换一个非推理模型 |
| `no provider` / `provider disabled` | 卡片里关掉了自动命名，或 `provider`/`model` 只填了一个 |

## 配置

**运行时配置**（推荐，设置卡片写的就是它）：`<插件目录>/settings.json`（本机即 `~/.dsh/profiles/desktop/node_modules/dsh-auto-title/settings.json`；可用环境变量 `DSH_AUTO_TITLE_SETTINGS` 改到别处）。优先级最高，保存后下一次命名立即生效，无需重启。卡片上的「恢复默认」会把它清空，回到下面的加载期配置。

**加载期配置**（可选，用于在 profile 里固化默认值）：在 profile 目录的 `cordis.patch.yml` 里（apply 在最后、能覆盖 bundle 层）追加覆盖行：

```yaml
- id: auto-title
  config:
    language: zh
    maxTitleLength: 20
    waitForReplyMs: 90000
```

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | `false` = 只加载不注册（等价于停用，但保留包） |
| `automatic` | `'first-prompt'` | 命名节奏：`first-prompt` = 只在首轮；`all-prompts` = 每条新消息都重命名（每条多一次小请求） |
| `provider` / `model` | `''` | 留空 = 用**会话自己的路由**；填了就必须两个一起填 |
| `language` | `'auto'` | `auto` / `zh` / `en`，决定提示词要求的标题语言 |
| `maxTitleLength` | `24` | 标题最大字符数（含中英文，按字符计） |
| `maxInputChars` | `6000` | 请求 + 回复拼进提示词时的总字符上限，超出按比例截断 |
| `maxOutputTokens` | `512` | 辅助调用输出上限。推理模型会先把预算花在推理上，给小了会「有推理、没标题」，所以留了余量（上限 8192） |
| `waitForReplyMs` | `120000` | 等首条助手回复的预算；到点就用「只有请求」命名 |
| `timeoutMs` | `30000` | 辅助模型调用自身的超时 |
| `stopWords` | `[]` | 标题里要去掉的词（大小写不敏感） |

配错类型会在加载时抛 `TypeError`（例如 `maxTitleLength: "24"`），行会以错误状态出现而不是静默忽略。取值范围：`maxTitleLength` 1–80，`maxInputChars` 1–20000，`maxOutputTokens` 1–8192，两个毫秒字段 1–600000。

## 验证

```bash
git clone https://github.com/sumingwang233/dsh-auto-title && cd dsh-auto-title
npm test          # 49 个用例：core 规则 + host 装配/事件等待/流解析/命名节奏 + 手动改名路由 + 设置存储与配置/日志路由 + 客户端 bundle
```

真机验证（需要重启后）：

1. 设置侧栏出现「dsh-auto-title」，页面能打开，`provider`/`model` 能保存；
2. 会话列表某行「…」→「AI 重命名」，弹窗出现候选标题，应用后列表标题变化；
3. 若弹窗报错，同一张卡片下方日志里能看到这次请求的失败原因与细节。

## 已知边界

- **默认只在首轮命名一次**：`automatic: 'first-prompt'` 下后续大改需求不会自动改名（可手动重命名）。想让它跟着对话演进改名，设 `automatic: 'all-prompts'`——代价是每条新消息多一次小请求。
- **多一次模型调用**：每条命中的消息多一次小请求（约几百 token 输入、≤512 token 输出）。不想付这个成本就把 `enabled: false` 或用便宜模型（`provider`/`model`）。
- 回复超过 `waitForReplyMs` 才出现时，会退化成「只看请求」命名——仍然是完整主题词，不是原始截断。
- 标题服务对同一个会话可能有并发/重试调用，本插件是**纯函数式**的（不做去重、不写存储），重复调用只会产生更新的标题。

## 卸载

桌面端 **设置 → 插件市场 → 找到 dsh-auto-title → 卸载**，或用 `plugin_manager` 工具 `action: "remove_bundle"`、`target: "dsh-auto-title"`。

从 `dsh.profile.bundles` 移除后，被禁用的 `session-title-llm` 重新生效，行为回到原生。

## 许可

[MIT](LICENSE)
