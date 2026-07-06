# 防止休眠只拦截系统空闲休眠,不提权、不处理合盖

## Context

用户希望在 Claude Code 会话运行时阻止 macOS 进入休眠,避免长任务被系统休眠打断。macOS 上可选手段:`caffeinate -i` / `NSProcessInfo.beginActivityWithOptions`(阻止空闲休眠,盖子开着可靠、无需权限)、`caffeinate -s`(阻止系统休眠,仅 AC 供电、合盖不可靠且积热)、`sudo pmset disablesleep`(能可靠合盖不睡,但需要 root/提权)、外接屏 clamshell(需硬件条件,系统自带)。

## Decision

只做**阻止系统空闲休眠**,在 macOS 上通过进程内 `NSProcessInfo.beginActivityWithOptions(.idleSystemSleepDisabled)` 断言实现(objc2,`#[cfg(target_os = "macos")]` 门控,贴合 `led.rs` / `macos_notifications.rs` 既有原生模式);Windows / Linux 先做 no-op。**不阻止屏幕熄灭**,**不引入任何提权 / sudo / `pmset`**,因此**合盖休眠不在能力范围内**。

## Consequences

- 该功能只在**盖子开着**时有效;合盖(无外接屏)仍会休眠,这是刻意的边界,不是缺陷。未来若要支持合盖,需要单独评估提权方案(密码弹窗、安全面扩大),属于另一个决策。
- 选择进程内原生断言而非 `caffeinate` 子进程:避免唯一一处常驻辅助进程、避免会话状态抖动时反复起/杀进程,崩溃时 OS 自动回收断言。

## Update (2026-07-06):屏幕熄灭从"永不阻止"改为可选

- 实现落地时用的是 IOKit `IOPMAssertionCreateWithName`(整型句柄,天然 `Send + Sync`),而非本文 Decision 段最初写的 `NSProcessInfo`;两者语义等价,IOKit 版更便于进程内持有整型句柄。
- 新增正交布尔偏好 `keep_display_awake`:关(默认)时断言类型为 `PreventUserIdleSystemSleep`(只挡系统、放任屏幕熄灭,即原始决策);开时改用 `PreventUserIdleDisplaySleep`(连显示器一起不熄,连带系统)。
- **默认仍为"仅系统"**:保持屏幕常亮更耗电、有烧屏风险,且无人值守长任务不需要亮屏,故设为 opt-in。
- **不改变合盖边界**:阻止显示器休眠同样盖不住合盖 sleep,提权/合盖仍不在范围内。
