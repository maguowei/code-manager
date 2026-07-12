# Code Manager

Code Manager 的领域术语表(glossary),只记录本项目语境下需要统一口径的词汇,不记录实现细节。

## Language

### 防止休眠(Sleep Prevention)

**防止休眠(Sleep Prevention)**:
应用阻止操作系统进入空闲休眠的能力,用于保证 Claude Code 会话在无人值守时不被系统休眠打断。
_Avoid_: 保持唤醒(keep awake)、caffeine、防睡眠

**防止休眠模式(Sleep Prevention Mode)**:
一个三态互斥的用户偏好,决定防止休眠**何时**生效。取值:关闭(Off)、始终(Always)、仅活动时(While Active)。与[屏幕常亮](#屏幕常亮keep-display-awake)正交:模式管"何时",屏幕常亮管"保持什么"。
_Avoid_: 防止休眠开关(它不是布尔开关,是三态)

**屏幕常亮(Keep Display Awake)**:
一个与[防止休眠模式](#防止休眠模式sleep-prevention-mode)正交的布尔偏好,决定保持唤醒时**连显示器一起不熄**(阻止显示器空闲休眠,连带系统)还是**只挡系统空闲休眠、放任屏幕熄灭**。仅在模式非关闭时有意义;关闭时无效。默认关(只挡系统)。
_Avoid_: 防止黑屏、屏幕常显、display sleep

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

### 目录总览(Directory Overview)

**目录总览(Directory Overview)**:
对 Claude Code 本地目录树(`~/.claude` 或项目级 `.claude/`)的只读浏览视图,用于查看布局、预览文件内容与诊断异常条目。
_Avoid_: 文件管理器、资源管理器、通用编辑器

**软链条目(Symlink Entry)**:
目录总览中**自身**为符号链接的树节点。可只读查看(目录可展开、文件可预览),不可经总览写入。
_Avoid_: 快捷方式、别名、映射(单独指代软链时)

**经软链路径(Path Via Symlink)**:
解析时经过至少一个[软链条目](#软链条目symlink-entry)的逻辑路径。只读可预览;新建、重命名、删除一律拒绝。
_Avoid_: 外部路径、越界路径(经软链可读但写仍拒绝,与恶意路径逃逸不同)

**可预览文本(Previewable Text)**:
目录总览中非已知二进制类型的文件内容,以 UTF-8 或有损 UTF-8 形式展示供阅读。
_Avoid_: 源码、纯文本白名单(判定是「非已知二进制」,不是穷举文本扩展名)
