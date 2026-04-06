import { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode, createElement } from "react";

export type Language = "zh" | "en";
export type Theme = "light" | "dark" | "system";

// 翻译字典
const translations = {
  zh: {
    // 通用
    "app.title": "AI Manager",
    "loading": "加载中...",
    "common.close": "关闭",
    "form.required": "必填",

    // 头部
    "header.settings": "设置",
    "header.addConfig": "添加配置",

    // 配置列表
    "configList.empty": "暂无配置",
    "configList.emptyHint": "点击右上角 + 按钮添加新的 Claude Code 配置",

    // 配置项
    "configItem.activate": "启用",
    "configItem.activateTitle": "启用此配置",
    "configItem.edit": "编辑",
    "configItem.editing": "编辑中",
    "configItem.duplicate": "复制",
    "configItem.inUse": "使用中",
    "configItem.delete": "删除",
    "configItem.plugins": "个插件",
    "configItem.copyEnv": "复制环境变量",
    "configItem.envCopied": "环境变量已复制",
    "configItem.envCopyFailed": "复制环境变量失败",

    // 配置弹窗
    "configModal.addTitle": "添加配置",
    "configModal.editTitle": "编辑配置",
    "configModal.name": "配置名称",
    "configModal.nameRequired": "配置名称 *",
    "configModal.namePlaceholder": "例如：个人账号、公司账号",
    "configModal.description": "备注",
    "configModal.descriptionPlaceholder": "例如：公司专用账号",
    "configModal.websiteUrl": "官网链接",
    "configModal.websiteUrlPlaceholder": "https://example.com（可选）",
    "configModal.apiKey": "API Key",
    "configModal.apiKeyPlaceholder": "sk-ant-...",
    "configModal.apiUrl": "请求地址",
    "configModal.apiUrlPlaceholder": "https://api.anthropic.com",
    "configModal.apiUrlHint": "填写 Anthropic 兼容协议地址",
    "configModal.model": "主模型",
    "configModal.modelPlaceholder": "claude-sonnet-4-5",
    "configModal.haikuModel": "Haiku 默认模型",
    "configModal.haikuModelPlaceholder": "claude-sonnet-4-5",
    "configModal.sonnetModel": "Sonnet 默认模型",
    "configModal.sonnetModelPlaceholder": "claude-sonnet-4-5",
    "configModal.opusModel": "Opus 默认模型",
    "configModal.opusModelPlaceholder": "claude-opus-4-5-thinking",
    "configModal.modelHint": "可选：指定默认使用的 Claude 模型，留空则使用系统默认。",
    "configModal.advancedOptions": "高级选项",
    "configModal.alwaysThinking": "始终启用思考模式 (alwaysThinkingEnabled)",
    "configModal.disableTraffic": "禁用非必要网络请求 (CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)",
    "configModal.skipWebFetchPreflight": "跳过 WebFetch 预检 (skipWebFetchPreflight)",
    "configModal.enableLspTool": "启用 LSP 工具 (ENABLE_LSP_TOOL)",
    "configModal.enableAgentTeams": "启用 Agent Teams (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS)",
    "configModal.enableAgentTeamsDesc": "设置为 1 以启用 agent teams。Agent teams 是实验性的，默认禁用",
    "configModal.hasCompletedOnboarding": "已完成引导设置 (hasCompletedOnboarding)",
    "configModal.hasCompletedOnboardingDesc": "启用后将在生成的配置中设置此选项，跳过 Claude Code 首次启动时的引导流程",
    "configModal.pluginMarketplaces": "插件市场",
    "configModal.enableExtraMarketplaces": "启用第三方插件市场",
    "configModal.enableExtraMarketplacesDesc": "启用后将添加 claude-plugins-official 和 chrome-devtools-plugins 市场源",
    "configModal.enabledPlugins": "已启用插件",
    "configModal.enabledPluginsDesc": "管理 Claude Code 插件的启用状态",
    "configModal.addPlugin": "添加",
    "configModal.pluginIdPlaceholder": "输入插件标识符，如 context7@claude-plugins-official",
    "configModal.pluginEnabled": "已启用",
    "configModal.pluginDisabled": "已停用",
    "configModal.preferredLanguage": "Claude Code 响应语言",
    "configModal.preferredLanguageDesc": "设置 Claude Code 回复时使用的语言",
    "configModal.langEnglish": "English",
    "configModal.langChinese": "中文 (Chinese)",
    "configModal.langJapanese": "日本語 (Japanese)",
    "configModal.langKorean": "한국어 (Korean)",
    "configModal.langSpanish": "Español (Spanish)",
    "configModal.langFrench": "Français (French)",
    "configModal.langGerman": "Deutsch (German)",
    "configModal.langPortuguese": "Português (Portuguese)",
    "configModal.langRussian": "Русский (Russian)",
    "configModal.langArabic": "العربية (Arabic)",
    "configModal.langItalian": "Italiano (Italian)",
    "configModal.jsonPreview": "配置预览（含通用配置）",
    "configModal.defaults": "通用配置",
    "configModal.defaultsEnabled": "已启用",
    "configModal.defaultsDisabled": "未启用",
    "configModal.defaultsPlaceholder": "输入通用配置 JSON...",
    "configModal.defaultsHint": "通用配置会与当前配置深度合并，当前配置的字段优先",
    "configModal.defaultsFormat": "格式化",
    "configModal.defaultsError": "JSON 格式不正确",
    "configModal.jsonCopy": "复制",
    "configModal.jsonCopied": "已复制",
    "configModal.cancel": "取消",
    "configModal.save": "保存",

    // 导航栏
    "nav.configs": "配置",
    "nav.memory": "记忆",
    "nav.skills": "Skills",

    // 记忆页面
    "memory.title": "CLAUDE.md 记忆管理",
    "memory.description": "管理项目和全局的 CLAUDE.md 文件，为 Claude Code 提供上下文记忆",
    "memory.addMemory": "添加记忆",
    "memory.editTitle": "编辑记忆",
    "memory.addTitle": "添加记忆",
    "memory.name": "记忆名称",
    "memory.namePlaceholder": "例如：项目规范、代码风格",
    "memory.content": "内容",
    "memory.contentPlaceholder": "输入 Markdown 内容...",
    "memory.cancel": "取消",
    "memory.save": "保存",
    "memory.empty": "暂无记忆",
    "memory.emptyHint": "添加记忆片段，启用后将写入 ~/.claude/CLAUDE.md",
    "memory.enabled": "已启用",
    "memory.disabled": "未启用",
    "memory.editing": "编辑中",
    "memory.edit": "编辑",
    "memory.delete": "删除",
    "memory.toolbar.heading": "插入标题",
    "memory.toolbar.bold": "加粗",
    "memory.toolbar.list": "插入列表",
    "memory.toolbar.code": "插入代码块",

    // Skills 页面
    "skills.title": "Skills 管理",
    "skills.description": "管理和配置 Claude Code 的技能扩展",

    // 统计页面
    "nav.stats": "统计",
    "nav.providers": "Provider",

    // Provider 管理页面
    "providers.title": "Provider 管理",
    "providers.description": "管理 Claude Code API 供应商，支持国内 Coding Plan / Token Plan",
    "providers.addProvider": "添加 Provider",
    "providers.editTitle": "编辑 Provider",
    "providers.addTitle": "添加 Provider",
    "providers.builtin": "内置",
    "providers.custom": "自定义",
    "providers.name": "供应商名称",
    "providers.namePlaceholder": "例如：我的自定义 Provider",
    "providers.slug": "标识符 (slug)",
    "providers.slugPlaceholder": "例如：my-provider（小写字母、数字、连字符）",
    "providers.apiUrl": "API Base URL",
    "providers.apiUrlPlaceholder": "https://api.example.com/anthropic",
    "providers.apiUrlHint": "留空则直连 Anthropic 官方 API",
    "providers.docUrl": "文档链接",
    "providers.docUrlPlaceholder": "https://docs.example.com（可选）",
    "providers.models": "可用模型",
    "providers.addModel": "添加模型",
    "providers.modelId": "模型 ID",
    "providers.modelIdHint": "模型 ID 请填写上游 API 实际使用的模型标识，不是显示名称。例如：claude-sonnet-4-6",
    "providers.modelIdPlaceholder": "claude-sonnet-4-6",
    "providers.modelName": "显示名称",
    "providers.modelNamePlaceholder": "Claude Sonnet 4.6",
    "providers.modelCategory": "等级",
    "providers.empty": "暂无自定义 Provider",
    "providers.emptyHint": "内置 Provider 可直接使用，也可添加自定义 Provider",
    "providers.save": "保存",
    "providers.cancel": "取消",
    "providers.delete": "删除",
    "providers.reset": "重置默认值",
    "providers.resetConfirm": "确认将此 Provider 重置为默认值？",
    "providers.deleteConfirm": "确认删除此 Provider？",
    "providers.viewDocs": "查看文档",
    "toast.providerLoadError": "加载 Provider 列表失败",
    "toast.providerSaved": "Provider 已保存",
    "toast.providerSaveError": "保存 Provider 失败",
    "toast.providerDeleted": "Provider 已删除",
    "toast.providerDeleteError": "删除 Provider 失败",
    "toast.providerResetError": "重置 Provider 失败",

    // ConfigEditor 中的 Provider 选择
    "configModal.provider": "API 供应商",
    "configModal.providerPlaceholder": "选择 Provider（可选）",
    "configModal.providerHint": "选择后自动填充 API URL，模型字段显示该 Provider 的可用模型",
    "configModal.providerNone": "无（手动配置）",
    "stats.title": "使用统计",
    "stats.refresh": "刷新",
    "stats.startups": "启动次数",
    "stats.totalCost": "总花费",
    "stats.firstUse": "首次使用",
    "stats.totalProjects": "项目数",
    "stats.costSection": "费用统计",
    "stats.costByProject": "按项目",
    "stats.costByModel": "按模型",
    "stats.costTrend": "费用趋势",
    "stats.toolSection": "工具 & Skill 使用",
    "stats.toolUsage": "工具调用 TOP10",
    "stats.skillUsage": "Skill 使用频率",
    "stats.sessionSection": "会话与性能",
    "stats.sessionDuration": "最近会话时长",
    "stats.performance": "性能指标",
    "stats.frameAvg": "帧渲染均值",
    "stats.frameP95": "帧渲染 P95",
    "stats.hookAvg": "Hook 均值",
    "stats.hookP95": "Hook P95",
    "stats.calls": "次调用",
    "stats.noData": "暂无统计数据",
    "stats.noDataHint": "使用 Claude Code 后，统计数据将自动显示在这里",
    "stats.loadError": "加载统计数据失败",
    "stats.refreshed": "已刷新统计数据",
    "stats.refreshError": "刷新失败",

    // 确认对话框
    "confirm.deleteConfigTitle": "删除配置",
    "confirm.deleteConfigMessage": "确定要删除这个配置吗？此操作无法撤销。",
    "confirm.deleteMemoryTitle": "删除记忆",
    "confirm.deleteMemoryMessage": "确定要删除这条记忆吗？此操作无法撤销。",
    "confirm.delete": "删除",
    "confirm.cancel": "取消",

    // 设置页面
    "settings.title": "设置",
    "settings.general": "通用",
    "settings.language": "界面语言",
    "settings.languageDesc": "选择应用的显示语言",
    "settings.theme": "主题外观",
    "settings.themeDesc": "选择应用的外观主题",
    "settings.themeLight": "浅色",
    "settings.themeDark": "深色",
    "settings.themeSystem": "跟随系统",
    "settings.showTrayTitle": "在菜单栏显示当前配置",
    "settings.showTrayTitleDesc": "在系统托盘图标旁显示当前激活的配置名称",
    "settings.enabled": "已启用",
    "settings.disabled": "未启用",

    // 操作通知（Toast）
    "toast.configLoadError": "加载配置失败",
    "toast.configActivated": "已切换配置",
    "toast.configActivateError": "激活配置失败",
    "toast.configSaved": "配置已保存",
    "toast.configSaveError": "保存配置失败",
    "toast.configDeleted": "配置已删除",
    "toast.configDeleteError": "删除配置失败",
    "toast.configDuplicated": "配置已复制",
    "toast.configDuplicateError": "复制配置失败",
    "toast.configReorderError": "排序保存失败",
    "toast.memoryLoadError": "加载记忆失败",
    "toast.memoryAdded": "记忆已添加",
    "toast.memoryAddError": "添加记忆失败",
    "toast.memorySaved": "记忆已保存",
    "toast.memorySaveError": "保存记忆失败",
    "toast.memoryDeleted": "记忆已删除",
    "toast.memoryDeleteError": "删除记忆失败",
    "toast.memoryToggleError": "切换记忆状态失败",

    // 导航 aria-label
    "nav.ariaLabel": "主导航",

    // 记忆操作
    "memory.activate": "启用",
    "memory.activateTitle": "启用此记忆",

    // Markdown 工具栏插入占位符
    "memory.toolbar.headingPlaceholder": "标题",
    "memory.toolbar.listPlaceholder": "列表项",
    "memory.toolbar.boldPlaceholder": "文本",

    // Skills 页面（补充）
    "skills.addSkill": "添加 Skill",
    "skills.editTitle": "编辑 Skill",
    "skills.addTitle": "添加 Skill",
    "skills.name": "Skill 名称（目录名）",
    "skills.namePlaceholder": "如：my-skill（小写字母、数字、连字符）",
    "skills.nameHint": "名称将作为 /slash-command 和目录名，创建后不可更改",
    "skills.displayName": "显示名称（可选）",
    "skills.displayNamePlaceholder": "如：My Skill（默认与目录名相同）",
    "skills.displayNameHint": "对应 frontmatter 中的 name 字段，用于界面展示",
    "skills.descriptionLabel": "描述",
    "skills.descriptionPlaceholder": "描述 Skill 的用途和触发条件",
    "skills.content": "内容（Markdown）",
    "skills.contentPlaceholder": "输入 Skill 指令...",
    "skills.disableModelInvocation": "仅手动触发 (disable-model-invocation)",
    "skills.disableModelInvocationHint": "启用后 Claude 不会自动加载此 Skill，只能手动用 /skill-name 调用",
    "skills.userInvocable": "允许手动调用 (user-invocable)",
    "skills.userInvocableHint": "禁用后此 Skill 不出现在 / 菜单中，仅 Claude 可自动调用",
    "skills.enabled": "已启用",
    "skills.disabled": "已禁用",
    "skills.editing": "编辑中",
    "skills.delete": "删除",
    "skills.empty": "暂无 Skills",
    "skills.emptyHint": "点击右上角 + 按钮添加 Skill，保存到 ~/.claude/skills/",
    "skills.save": "保存",
    "skills.files": "支持文件",
    "skills.addFile": "添加文件",
    "skills.fileName": "文件名",
    "skills.fileNamePlaceholder": "如：examples.md 或 scripts/helper.sh",
    "skills.fileContent": "文件内容",
    "skills.editFile": "编辑文件",
    "skills.deleteFile": "删除文件",
    "skills.binaryFile": "二进制文件",
    "skills.cancelEdit": "取消",
    "skills.saveFile": "保存文件",
    "confirm.deleteSkillTitle": "删除 Skill",
    "confirm.deleteSkillMessage": "确定要删除此 Skill 吗？此操作将删除整个目录，无法撤销。",
    "confirm.deleteSkillFileTitle": "删除文件",
    "confirm.deleteSkillFileMessage": "确定要删除此文件吗？此操作无法撤销。",
    "toast.skillLoadError": "加载 Skills 失败",
    "toast.skillAdded": "Skill 已添加",
    "toast.skillAddError": "添加 Skill 失败",
    "toast.skillSaved": "Skill 已保存",
    "toast.skillSaveError": "保存 Skill 失败",
    "toast.skillDeleted": "Skill 已删除",
    "toast.skillDeleteError": "删除 Skill 失败",
    "toast.skillToggleError": "切换 Skill 状态失败",
    "toast.skillFileAdded": "文件已添加",
    "toast.skillFileAddError": "添加文件失败",
    "toast.skillFileSaved": "文件已保存",
    "toast.skillFileSaveError": "保存文件失败",
    "toast.skillFileDeleted": "文件已删除",
    "toast.skillFileDeleteError": "删除文件失败",
    "skills.syncToCodex": "同步到 ~/.codex/skills",
    "toast.skillSynced": "Skill 已同步",
    "toast.skillSyncError": "同步 Skill 失败",

    // 历史页面
    "nav.history": "历史",
    "history.title": "使用历史",
    "history.allProjects": "全部项目",
    "history.messages": "条",
    "history.sessions": "个会话",
    "history.noData": "暂无历史记录",
    "history.search": "搜索历史记录...",
    "history.expand": "展开",
    "history.collapse": "收起",
    "history.lastActive": "最后活跃",
    "history.today": "今天",
    "history.yesterday": "昨天",
    "history.heatmapLess": "少",
    "history.heatmapMore": "多",
    "history.heatmapTooltip": "{day}: {count} 条消息",
    "history.viewConversation": "查看对话",
    "history.conversation": "对话详情",
    "history.thinking": "思考过程",
    "history.toolUse": "工具调用",
    "history.toolResult": "返回结果",
    "history.command": "命令",
    "history.system": "系统信息",
    "history.toolInput": "输入参数",
    "history.roleUser": "用户",
    "history.roleAssistant": "助手",
    "history.image": "图片",
    "history.plan": "实施计划",

    // 配置编辑器 - 分组标题
    "configEditor.section.basic": "基础信息",
    "configEditor.section.advanced": "高级选项",

    // 配置编辑器 - 表单校验错误
    "configEditor.validation.nameRequired": "配置名称不能为空",
    "configEditor.validation.apiKeyRequired": "API Key 不能为空",
    "configEditor.validation.invalidUrl": "请输入有效的 URL（需以 http:// 或 https:// 开头）",
  },
  en: {
    // 通用
    "app.title": "AI Manager",
    "loading": "Loading...",
    "common.close": "Close",
    "form.required": "Required",

    // 头部
    "header.settings": "Settings",
    "header.addConfig": "Add Config",

    // 配置列表
    "configList.empty": "No configurations",
    "configList.emptyHint": "Click the + button in the top right to add a new Claude Code config",

    // 配置项
    "configItem.activate": "Activate",
    "configItem.activateTitle": "Activate this config",
    "configItem.edit": "Edit",
    "configItem.editing": "Editing",
    "configItem.duplicate": "Duplicate",
    "configItem.inUse": "In Use",
    "configItem.delete": "Delete",
    "configItem.plugins": "plugins",
    "configItem.copyEnv": "Copy env vars",
    "configItem.envCopied": "Env vars copied",
    "configItem.envCopyFailed": "Failed to copy env vars",

    // 配置弹窗
    "configModal.addTitle": "Add Config",
    "configModal.editTitle": "Edit Config",
    "configModal.name": "Config Name",
    "configModal.nameRequired": "Config Name *",
    "configModal.namePlaceholder": "e.g. Personal, Company",
    "configModal.description": "Description",
    "configModal.descriptionPlaceholder": "e.g. Company account",
    "configModal.websiteUrl": "Website URL",
    "configModal.websiteUrlPlaceholder": "https://example.com (optional)",
    "configModal.apiKey": "API Key",
    "configModal.apiKeyPlaceholder": "sk-ant-...",
    "configModal.apiUrl": "API URL",
    "configModal.apiUrlPlaceholder": "https://api.anthropic.com",
    "configModal.apiUrlHint": "Enter Anthropic-compatible API endpoint URL",
    "configModal.model": "Primary Model",
    "configModal.modelPlaceholder": "claude-sonnet-4-5",
    "configModal.haikuModel": "Haiku Default Model",
    "configModal.haikuModelPlaceholder": "claude-sonnet-4-5",
    "configModal.sonnetModel": "Sonnet Default Model",
    "configModal.sonnetModelPlaceholder": "claude-sonnet-4-5",
    "configModal.opusModel": "Opus Default Model",
    "configModal.opusModelPlaceholder": "claude-opus-4-5-thinking",
    "configModal.modelHint": "Optional: specify the default Claude model. Leave empty to use system default.",
    "configModal.advancedOptions": "Advanced Options",
    "configModal.alwaysThinking": "Always enable thinking mode (alwaysThinkingEnabled)",
    "configModal.disableTraffic": "Disable non-essential network traffic (CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)",
    "configModal.skipWebFetchPreflight": "Skip WebFetch preflight (skipWebFetchPreflight)",
    "configModal.enableLspTool": "Enable LSP Tool (ENABLE_LSP_TOOL)",
    "configModal.enableAgentTeams": "Enable Agent Teams (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS)",
    "configModal.enableAgentTeamsDesc": "Set to 1 to enable agent teams. Agent teams is experimental and disabled by default.",
    "configModal.hasCompletedOnboarding": "Has completed onboarding",
    "configModal.hasCompletedOnboardingDesc": "When enabled, this option will be set in the generated config to skip Claude Code's onboarding process on first launch",
    "configModal.pluginMarketplaces": "Plugin Marketplaces",
    "configModal.enableExtraMarketplaces": "Enable third-party plugin marketplaces",
    "configModal.enableExtraMarketplacesDesc": "Adds claude-plugins-official and chrome-devtools-plugins marketplace sources",
    "configModal.enabledPlugins": "Enabled Plugins",
    "configModal.enabledPluginsDesc": "Manage Claude Code plugin enable/disable status",
    "configModal.addPlugin": "Add",
    "configModal.pluginIdPlaceholder": "Plugin identifier, e.g. context7@claude-plugins-official",
    "configModal.pluginEnabled": "Enabled",
    "configModal.pluginDisabled": "Disabled",
    "configModal.preferredLanguage": "Claude Code Response Language",
    "configModal.preferredLanguageDesc": "Set the language Claude Code uses in responses",
    "configModal.langEnglish": "English",
    "configModal.langChinese": "中文 (Chinese)",
    "configModal.langJapanese": "日本語 (Japanese)",
    "configModal.langKorean": "한국어 (Korean)",
    "configModal.langSpanish": "Español (Spanish)",
    "configModal.langFrench": "Français (French)",
    "configModal.langGerman": "Deutsch (German)",
    "configModal.langPortuguese": "Português (Portuguese)",
    "configModal.langRussian": "Русский (Russian)",
    "configModal.langArabic": "العربية (Arabic)",
    "configModal.langItalian": "Italiano (Italian)",
    "configModal.jsonPreview": "Config Preview (with defaults)",
    "configModal.defaults": "Default Config",
    "configModal.defaultsEnabled": "Enabled",
    "configModal.defaultsDisabled": "Disabled",
    "configModal.defaultsPlaceholder": "Enter default config JSON...",
    "configModal.defaultsHint": "Default config will be deep-merged with current config. Current config fields take priority",
    "configModal.defaultsFormat": "Format",
    "configModal.defaultsError": "Invalid JSON format",
    "configModal.jsonCopy": "Copy",
    "configModal.jsonCopied": "Copied",
    "configModal.cancel": "Cancel",
    "configModal.save": "Save",

    // 导航栏
    "nav.configs": "Configs",
    "nav.memory": "Memory",
    "nav.skills": "Skills",

    // 记忆页面
    "memory.title": "CLAUDE.md Memory",
    "memory.description": "Manage project and global CLAUDE.md files to provide context memory for Claude Code",
    "memory.addMemory": "Add Memory",
    "memory.editTitle": "Edit Memory",
    "memory.addTitle": "Add Memory",
    "memory.name": "Memory Name",
    "memory.namePlaceholder": "e.g. Project rules, Code style",
    "memory.content": "Content",
    "memory.contentPlaceholder": "Enter Markdown content...",
    "memory.cancel": "Cancel",
    "memory.save": "Save",
    "memory.empty": "No memories",
    "memory.emptyHint": "Add memory snippets, enable them to write to ~/.claude/CLAUDE.md",
    "memory.enabled": "Enabled",
    "memory.disabled": "Disabled",
    "memory.editing": "Editing",
    "memory.edit": "Edit",
    "memory.delete": "Delete",
    "memory.toolbar.heading": "Insert Heading",
    "memory.toolbar.bold": "Bold",
    "memory.toolbar.list": "Insert List",
    "memory.toolbar.code": "Insert Code Block",

    // Skills 页面
    "skills.title": "Skills Management",
    "skills.description": "Manage and configure skill extensions for Claude Code",

    // 统计页面
    "nav.stats": "Stats",
    "nav.providers": "Providers",

    // Provider page
    "providers.title": "Provider Management",
    "providers.description": "Manage Claude Code API providers, support domestic Coding Plan / Token Plan",
    "providers.addProvider": "Add Provider",
    "providers.editTitle": "Edit Provider",
    "providers.addTitle": "Add Provider",
    "providers.builtin": "Built-in",
    "providers.custom": "Custom",
    "providers.name": "Provider Name",
    "providers.namePlaceholder": "e.g. My Custom Provider",
    "providers.slug": "Identifier (slug)",
    "providers.slugPlaceholder": "e.g. my-provider (lowercase, digits, hyphens)",
    "providers.apiUrl": "API Base URL",
    "providers.apiUrlPlaceholder": "https://api.example.com/anthropic",
    "providers.apiUrlHint": "Leave empty to use Anthropic API directly",
    "providers.docUrl": "Documentation URL",
    "providers.docUrlPlaceholder": "https://docs.example.com (optional)",
    "providers.models": "Available Models",
    "providers.addModel": "Add Model",
    "providers.modelId": "Model ID",
    "providers.modelIdHint": "Use the actual model ID accepted by the upstream API, not the display name. Example: claude-sonnet-4-6",
    "providers.modelIdPlaceholder": "claude-sonnet-4-6",
    "providers.modelName": "Display Name",
    "providers.modelNamePlaceholder": "Claude Sonnet 4.6",
    "providers.modelCategory": "Category",
    "providers.empty": "No custom providers",
    "providers.emptyHint": "Built-in providers are ready to use. You can also add custom providers.",
    "providers.save": "Save",
    "providers.cancel": "Cancel",
    "providers.delete": "Delete",
    "providers.reset": "Reset to Default",
    "providers.resetConfirm": "Reset this provider to default values?",
    "providers.deleteConfirm": "Delete this provider?",
    "providers.viewDocs": "View Docs",
    "toast.providerLoadError": "Failed to load providers",
    "toast.providerSaved": "Provider saved",
    "toast.providerSaveError": "Failed to save provider",
    "toast.providerDeleted": "Provider deleted",
    "toast.providerDeleteError": "Failed to delete provider",
    "toast.providerResetError": "Failed to reset provider",

    // ConfigEditor
    "configModal.provider": "API Provider",
    "configModal.providerPlaceholder": "Select Provider (optional)",
    "configModal.providerHint": "Selecting a provider auto-fills API URL and shows available models",
    "configModal.providerNone": "None (manual config)",
    "stats.title": "Usage Statistics",
    "stats.refresh": "Refresh",
    "stats.startups": "Startups",
    "stats.totalCost": "Total Cost",
    "stats.firstUse": "First Use",
    "stats.totalProjects": "Projects",
    "stats.costSection": "Cost Statistics",
    "stats.costByProject": "By Project",
    "stats.costByModel": "By Model",
    "stats.costTrend": "Cost Trend",
    "stats.toolSection": "Tool & Skill Usage",
    "stats.toolUsage": "Tool Calls TOP10",
    "stats.skillUsage": "Skill Usage",
    "stats.sessionSection": "Sessions & Performance",
    "stats.sessionDuration": "Last Session Duration",
    "stats.performance": "Performance Metrics",
    "stats.frameAvg": "Frame Avg",
    "stats.frameP95": "Frame P95",
    "stats.hookAvg": "Hook Avg",
    "stats.hookP95": "Hook P95",
    "stats.calls": "calls",
    "stats.noData": "No statistics yet",
    "stats.noDataHint": "Statistics will appear here after using Claude Code",
    "stats.loadError": "Failed to load statistics",
    "stats.refreshed": "Statistics refreshed",
    "stats.refreshError": "Refresh failed",

    // 确认对话框
    "confirm.deleteConfigTitle": "Delete Config",
    "confirm.deleteConfigMessage": "Are you sure you want to delete this config? This action cannot be undone.",
    "confirm.deleteMemoryTitle": "Delete Memory",
    "confirm.deleteMemoryMessage": "Are you sure you want to delete this memory? This action cannot be undone.",
    "confirm.delete": "Delete",
    "confirm.cancel": "Cancel",

    // 设置页面
    "settings.title": "Settings",
    "settings.general": "General",
    "settings.language": "Language",
    "settings.languageDesc": "Choose the display language",
    "settings.theme": "Theme",
    "settings.themeDesc": "Choose the app appearance",
    "settings.themeLight": "Light",
    "settings.themeDark": "Dark",
    "settings.themeSystem": "System",
    "settings.showTrayTitle": "Show active config in menu bar",
    "settings.showTrayTitleDesc": "Display the active configuration name next to the system tray icon",
    "settings.enabled": "Enabled",
    "settings.disabled": "Disabled",

    // 操作通知（Toast）
    "toast.configLoadError": "Failed to load configs",
    "toast.configActivated": "Config activated",
    "toast.configActivateError": "Failed to activate config",
    "toast.configSaved": "Config saved",
    "toast.configSaveError": "Failed to save config",
    "toast.configDeleted": "Config deleted",
    "toast.configDeleteError": "Failed to delete config",
    "toast.configDuplicated": "Config duplicated",
    "toast.configDuplicateError": "Failed to duplicate config",
    "toast.configReorderError": "Failed to save order",
    "toast.memoryLoadError": "Failed to load memories",
    "toast.memoryAdded": "Memory added",
    "toast.memoryAddError": "Failed to add memory",
    "toast.memorySaved": "Memory saved",
    "toast.memorySaveError": "Failed to save memory",
    "toast.memoryDeleted": "Memory deleted",
    "toast.memoryDeleteError": "Failed to delete memory",
    "toast.memoryToggleError": "Failed to toggle memory",

    // 导航 aria-label
    "nav.ariaLabel": "Main navigation",

    // 记忆操作
    "memory.activate": "Activate",
    "memory.activateTitle": "Activate this memory",

    // Markdown 工具栏插入占位符
    "memory.toolbar.headingPlaceholder": "Heading",
    "memory.toolbar.listPlaceholder": "List item",
    "memory.toolbar.boldPlaceholder": "text",

    // Skills page (additions)
    "skills.addSkill": "Add Skill",
    "skills.editTitle": "Edit Skill",
    "skills.addTitle": "Add Skill",
    "skills.name": "Skill Name (directory name)",
    "skills.namePlaceholder": "e.g. my-skill (lowercase, numbers, hyphens)",
    "skills.nameHint": "Used as /slash-command and directory name. Cannot be changed after creation.",
    "skills.displayName": "Display Name (optional)",
    "skills.displayNamePlaceholder": "e.g. My Skill (defaults to directory name)",
    "skills.displayNameHint": "Corresponds to the name field in frontmatter, used for display in the UI",
    "skills.descriptionLabel": "Description",
    "skills.descriptionPlaceholder": "Describe what this skill does and when to use it",
    "skills.content": "Content (Markdown)",
    "skills.contentPlaceholder": "Enter skill instructions...",
    "skills.disableModelInvocation": "Manual invocation only (disable-model-invocation)",
    "skills.disableModelInvocationHint": "Prevents Claude from automatically loading this skill",
    "skills.userInvocable": "Allow manual invocation (user-invocable)",
    "skills.userInvocableHint": "If disabled, skill is hidden from / menu and only Claude can invoke it",
    "skills.enabled": "Enabled",
    "skills.disabled": "Disabled",
    "skills.editing": "Editing",
    "skills.delete": "Delete",
    "skills.empty": "No Skills",
    "skills.emptyHint": "Click + to add a Skill saved to ~/.claude/skills/",
    "skills.save": "Save",
    "skills.files": "Supporting Files",
    "skills.addFile": "Add File",
    "skills.fileName": "File Name",
    "skills.fileNamePlaceholder": "e.g. examples.md or scripts/helper.sh",
    "skills.fileContent": "File Content",
    "skills.editFile": "Edit File",
    "skills.deleteFile": "Delete File",
    "skills.binaryFile": "Binary",
    "skills.cancelEdit": "Cancel",
    "skills.saveFile": "Save File",
    "confirm.deleteSkillTitle": "Delete Skill",
    "confirm.deleteSkillMessage": "Are you sure you want to delete this Skill? This will remove the entire directory and cannot be undone.",
    "confirm.deleteSkillFileTitle": "Delete File",
    "confirm.deleteSkillFileMessage": "Are you sure you want to delete this file? This cannot be undone.",
    "toast.skillLoadError": "Failed to load Skills",
    "toast.skillAdded": "Skill added",
    "toast.skillAddError": "Failed to add Skill",
    "toast.skillSaved": "Skill saved",
    "toast.skillSaveError": "Failed to save Skill",
    "toast.skillDeleted": "Skill deleted",
    "toast.skillDeleteError": "Failed to delete Skill",
    "toast.skillToggleError": "Failed to toggle Skill status",
    "toast.skillFileAdded": "File added",
    "toast.skillFileAddError": "Failed to add file",
    "toast.skillFileSaved": "File saved",
    "toast.skillFileSaveError": "Failed to save file",
    "toast.skillFileDeleted": "File deleted",
    "toast.skillFileDeleteError": "Failed to delete file",
    "skills.syncToCodex": "Sync to ~/.codex/skills",
    "toast.skillSynced": "Skill synced",
    "toast.skillSyncError": "Failed to sync Skill",

    // 历史页面
    "nav.history": "History",
    "history.title": "Usage History",
    "history.allProjects": "All Projects",
    "history.messages": "msgs",
    "history.sessions": "sessions",
    "history.noData": "No history records",
    "history.search": "Search history...",
    "history.expand": "Expand",
    "history.collapse": "Collapse",
    "history.lastActive": "Last active",
    "history.today": "Today",
    "history.yesterday": "Yesterday",
    "history.heatmapLess": "Less",
    "history.heatmapMore": "More",
    "history.heatmapTooltip": "{day}: {count} msgs",
    "history.viewConversation": "View Conversation",
    "history.conversation": "Conversation Detail",
    "history.thinking": "Thinking",
    "history.toolUse": "Tool Use",
    "history.toolResult": "Result",
    "history.command": "Command",
    "history.system": "System",
    "history.toolInput": "Input",
    "history.roleUser": "User",
    "history.roleAssistant": "Assistant",
    "history.image": "Image",
    "history.plan": "Implementation Plan",

    // ConfigEditor - section labels
    "configEditor.section.basic": "Basic Info",
    "configEditor.section.advanced": "Advanced",

    // ConfigEditor - validation errors
    "configEditor.validation.nameRequired": "Name is required",
    "configEditor.validation.apiKeyRequired": "API Key is required",
    "configEditor.validation.invalidUrl": "Must be a valid URL starting with http:// or https://",
  },
} as const;

export type TranslationKey = keyof typeof translations.zh;

// 设置持久化
const STORAGE_KEY = "ai-manager-settings";

interface AppSettings {
  language: Language;
  theme: Theme;
}

function loadSettings(): AppSettings {
  const defaults: AppSettings = { language: "zh", theme: "dark" };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 校验解析结果，防止 localStorage 数据损坏导致崩溃
      if (parsed && typeof parsed === "object") {
        const validThemes: Theme[] = ["light", "dark", "system"];
        return {
          language: parsed.language === "en" ? "en" : defaults.language,
          theme: validThemes.includes(parsed.theme) ? parsed.theme : defaults.theme,
        };
      }
    }
  } catch {
    // 忽略解析错误
  }
  return defaults;
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// 主题应用
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", prefersDark ? "dark" : "light");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

// Context
interface I18nContextType {
  language: Language;
  theme: Theme;
  t: (key: TranslationKey) => string;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: Theme) => void;
}

const I18nContext = createContext<I18nContextType | null>(null);

// Provider 组件
export function I18nProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  const t = useCallback(
    (key: TranslationKey): string => {
      return translations[settings.language][key] || key;
    },
    [settings.language]
  );

  const setLanguage = useCallback((language: Language) => {
    setSettings((prev) => {
      const next = { ...prev, language };
      saveSettings(next);
      return next;
    });
  }, []);

  const setTheme = useCallback((theme: Theme) => {
    setSettings((prev) => {
      const next = { ...prev, theme };
      saveSettings(next);
      applyTheme(theme);
      return next;
    });
  }, []);

  // 初始化时应用主题
  useEffect(() => {
    applyTheme(settings.theme);
  }, []);

  // 监听系统主题变化（仅在 "system" 模式下生效）
  useEffect(() => {
    if (settings.theme !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [settings.theme]);

  const value = useMemo<I18nContextType>(() => ({
    language: settings.language,
    theme: settings.theme,
    t,
    setLanguage,
    setTheme,
  }), [settings.language, settings.theme, t, setLanguage, setTheme]);

  return createElement(I18nContext.Provider, { value }, children);
}

// Hook
export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
