# herdr 会话聚焦走"两跳"：socket 定位 pane + 宿主终端激活

## Context

会话托盘"聚焦终端"依赖 `pid -> tty -> AppleScript`：把会话进程的 tty 拿去宿主终端里按 tab 匹配。herdr（agent 多路复用器，跑在宿主终端内部，类 tmux）打破了这个前提——Claude Code 进程跑在 herdr 自己创建的 pty 上，宿主终端 tab 列表里根本没有这个 tty，聚焦必然失配（TabNotFound）。

调查 herdr 源码后确认三个事实：server 是 detached 的 headless daemon，pane 是它的子进程；socket API（NDJSON over unix socket）只改 herdr 内部焦点，没有任何接口能激活宿主窗口；TUI client 进程跑在宿主终端 tab 里，其 tty 就是宿主 tab 的 tty，但它不是 pane 进程的祖先，pid 反查不到。此外默认会话的 pane 进程没有任何环境标记（只有命名会话带 `HERDR_SESSION`）。

## Decision

1. **两跳聚焦**：第一跳连 herdr socket API，`pane.list` + 逐 pane `pane.process_info` 按 pid 精确匹配（命中 foreground pid / shell_pid / 进程组 id），失配时 `agent.list` 按 cwd 兜底且只允许唯一匹配；命中后 `pane.focus`。第二跳扫描本机 `herdr` 进程，按会话一致性（env 标记或 argv 会话参数）+ 真实 tty 过滤找到 client（daemon 无 tty 天然排除），其 tty 即宿主 tab tty，复用现有 Terminal/iTerm AppleScript；Ghostty 侧 tty 优先（`tty` 属性上游 #11592 起、随 PR #11922 合入 main 尚未发布，旧版脚本内 `try` 降级），普通会话先按 terminal title 排除 herdr client，再对会话文件记录的 cwd 做唯一匹配；herdr 宿主（含默认会话，永不排除 herdr client）优先按命名会话的 client title 匹配，client tty 次之，都未命中才解析 client cwd（`lsof`，延迟到精确匹配失败后）做唯一兜底。socket 跳失败即报错并跳过宿主跳。
2. **降级语义**：socket 跳成功但宿主跳失败或找不到 client（detach / ssh 远程附着）按"部分成功"处理，只记 warn 不弹通知——herdr 内部焦点已切换，没有窗口可激活不是错误。
3. **检测**：先读 pane 进程 env（`HERDR_SESSION` / `HERDR_SOCKET_PATH` 标记），无标记再沿 ppid 链找名为 `herdr` 的祖先进程（覆盖默认会话）；`HERDR_SESSION` 按 herdr 命名规则白名单校验防路径穿越。
4. **门禁放宽**：聚焦可用性从"只看默认终端 slug"改为按会话判定（macOS、会话 `procStart` 可验证，且默认终端支持，或 pid 自身宿主终端支持，或会话在 herdr 里）；全局快捷键只挑可聚焦会话。不做"菜单扫描成本"的缓存——ps 调用在菜单重建频率下可忽略。
5. **实现位置**：herdr 侧逻辑独立成 `herdr.rs`，`terminal_focus.rs` 只做编排，AppleScript 模板不重复。socket 用 std `UnixStream`，零新依赖，1s 读写超时防后台线程卡死。

## Consequences

- 协议按 herdr 源码快照实现（无官方 schema 文件）；herdr 协议若变动，socket 调用失败会走 `HerdrNotRunning` / 通用 `ScriptError` 兜底，不会崩溃，但需要跟进。
- 宿主终端必须仍受支持（Terminal / iTerm / Ghostty）才有完整两跳；herdr 跑在 Warp 等无 AppleScript 宿主里只能得到内部聚焦 + warn。
- 多 tab 附着同一 herdr 会话时取第一个 client（UI 内容相同，聚焦任一都正确）；本地找不到 client 时不激活窗口。
- Ghostty 的 `tty` 属性由上游 #11592 引入（随 PR #11922 合入 main、尚未发布，1.3.x 的 sdef 没有）：`try` 只包住属性读取，新版按 tty 精确命中，旧版探测失败后落到 title/cwd 兜底；空 cwd 不生成兜底分支（`"" is ""` 为 true，会误命中无 shell 集成的 tab）。命名会话的 title 可区分同 cwd 的多个 client，title 未命中且 cwd 多匹配时宁可降级为内部聚焦成功，也不误激活其它会话。
- 普通 Ghostty 会话与 herdr client 共享 cwd 时，普通路径必须先排除 herdr title；若剩余普通 terminal 仍多于一个，继续降级失败，避免无法精确识别时误激活其它会话。
- pid 身份校验：会话文件 `procStart`（UTC）必须存在、可解析且与 `ps etime` 推算的进程启动时间一致；缺失、非法或不一致时拒绝整个聚焦请求，不再把 cwd / herdr 的 pid 兜底用于可能已回收的 pid。菜单项与可点击通知携带创建时的 `procStart` 快照，点击时不按 pid 重读会话文件。
- 后续其它多路复用器（如 tmux）支持会以"检测 → 内部聚焦 API → 宿主激活"三段式结构为参照，但各自机制不同，不应直接套用 herdr 实现。
