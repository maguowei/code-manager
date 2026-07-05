# Code Manager

Code Manager 的领域术语表(glossary),只记录本项目语境下需要统一口径的词汇,不记录实现细节。

## Language

### 防止休眠(Sleep Prevention)

**防止休眠(Sleep Prevention)**:
应用阻止操作系统进入空闲休眠的能力,用于保证 Claude Code 会话在无人值守时不被系统休眠打断。
_Avoid_: 保持唤醒(keep awake)、caffeine、防睡眠

**防止休眠模式(Sleep Prevention Mode)**:
一个三态互斥的用户偏好,决定防止休眠何时生效。取值:关闭(Off)、始终(Always)、仅活动时(While Active)。
_Avoid_: 防止休眠开关(它不是布尔开关,是三态)

**始终(Always)**:
防止休眠模式的一种取值。无条件保持电脑唤醒,与会话状态无关,直到用户切换到其它模式。
_Avoid_: 手动模式、常开

**仅活动时(While Active)**:
防止休眠模式的一种取值。仅当存在[活动会话](#活动会话active-session)时保持唤醒,会话结束后自动释放。
_Avoid_: 自动模式

### 活动会话(Active Session)

**活动会话(Active Session)**:
一个处于 running 类状态(`running / busy / active / starting`)的 Claude Code 会话。**waiting(等待用户操作)不计入**——那时 Claude 卡在等人,机器休眠也不会杀死会话。"仅活动时"模式据此判断是否保持唤醒。
_Avoid_: 运行中会话(running session,只是其中一个具体状态)
