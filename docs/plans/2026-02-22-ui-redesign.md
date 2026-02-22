# UI 重设计实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 重构应用 UI，采用侧边栏导航 + 配置列表 + 右侧抽屉编辑的现代化布局

**架构:** 将当前的顶部导航改为左侧固定侧边栏（60px），中间为配置列表区（360px），右侧为滑出式抽屉面板（600px）。采用 GitHub Dark 风格的 5 层色彩系统，提供流畅的动画和完善的可访问性。

**技术栈:** React 19, TypeScript, CSS Variables, CSS Grid/Flexbox, CSS Transitions

---

## Phase 1: 核心架构重构

### Task 1: 创建新的色彩系统

**文件:**
- Modify: `src/App.css:7-40`

**Step 1: 更新色彩变量定义**

替换现有的色彩变量为 GitHub Dark 风格的 5 层系统：

```css
:root,
[data-theme="dark"] {
  /* 背景色 - 5 层层次 */
  --bg-base: #0d1117;
  --bg-primary: #161b22;
  --bg-secondary: #1c2128;
  --bg-tertiary: #21262d;
  --bg-elevated: #2d333b;

  /* 边框色 */
  --border-default: #30363d;
  --border-muted: #21262d;
  --border-subtle: #1c2128;

  /* 文字色 */
  --text-primary: #e6edf3;
  --text-secondary: #7d8590;
  --text-tertiary: #57606a;
  --text-muted: #484f58;
  --text-link: #58a6ff;

  /* 语义色 */
  --accent-blue: #58a6ff;
  --accent-blue-hover: #79c0ff;
  --accent-blue-bg: rgba(88, 166, 255, 0.1);
  --accent-green: #3fb950;
  --accent-green-bg: rgba(63, 185, 80, 0.1);
  --accent-orange: #f78166;
  --accent-orange-bg: rgba(247, 129, 102, 0.1);
  --accent-red: #f85149;
  --accent-red-bg: rgba(248, 81, 73, 0.1);
  --accent-purple: #bc8cff;
  --accent-purple-bg: rgba(188, 140, 255, 0.1);

  /* 阴影 */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.12);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.15);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.2);
  --shadow-xl: 0 16px 48px rgba(0, 0, 0, 0.3);

  /* 发光效果 */
  --glow-blue: 0 0 12px rgba(88, 166, 255, 0.4);
  --glow-green: 0 0 12px rgba(63, 185, 80, 0.4);

  /* 间距系统 */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* 圆角系统 */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-xl: 12px;
  --radius-2xl: 16px;

  /* 字体系统 */
  --font-xs: 11px;
  --font-sm: 12px;
  --font-base: 13px;
  --font-md: 14px;
  --font-lg: 15px;
  --font-xl: 16px;
}

[data-theme="light"] {
  --bg-base: #ffffff;
  --bg-primary: #f6f8fa;
  --bg-secondary: #ffffff;
  --bg-tertiary: #f6f8fa;
  --bg-elevated: #ffffff;
  --border-default: #d0d7de;
  --border-muted: #d8dee4;
  --border-subtle: #eaeef2;
  --text-primary: #1f2328;
  --text-secondary: #656d76;
  --text-tertiary: #818b98;
  --text-muted: #9ca3af;
  --accent-blue: #0969da;
  --accent-green: #1a7f37;
  --accent-orange: #bc4c00;
  --accent-red: #d1242f;
  --accent-purple: #8250df;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
}
```

**Step 2: 更新 body 背景色**

```css
body {
  background-color: var(--bg-base);
}
```

**Step 3: 验证色彩变量**

运行: `pnpm dev`
检查: 浏览器开发者工具 -> Elements -> Computed -> 验证 CSS 变量已生效

**Step 4: 提交**

```bash
git add src/App.css
git commit -m "style: 引入 GitHub Dark 风格的色彩系统

- 5 层背景层次（base/primary/secondary/tertiary/elevated）
- 统一的语义色（blue/green/orange/red/purple）
- 设计系统变量（间距、圆角、字体、阴影）
- 保留浅色主题支持

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 2: 创建侧边栏组件

**文件:**
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/Sidebar.css`

**Step 1: 创建 Sidebar 组件文件**

```tsx
import "./Sidebar.css";

interface SidebarProps {
  activeTab: "configs" | "memory" | "skills";
  onTabChange: (tab: "configs" | "memory" | "skills") => void;
  onSettingsClick: () => void;
}

function Sidebar({ activeTab, onTabChange, onSettingsClick }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="主导航">
      <div className="sidebar-logo">AI</div>

      <div className="sidebar-nav">
        <button
          className={`nav-item ${activeTab === "configs" ? "active" : ""}`}
          onClick={() => onTabChange("configs")}
          aria-label="配置管理"
          aria-current={activeTab === "configs" ? "page" : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </button>

        <button
          className={`nav-item ${activeTab === "memory" ? "active" : ""}`}
          onClick={() => onTabChange("memory")}
          aria-label="记忆管理"
          aria-current={activeTab === "memory" ? "page" : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </button>

        <button
          className={`nav-item ${activeTab === "skills" ? "active" : ""}`}
          onClick={() => onTabChange("skills")}
          aria-label="Skills 管理"
          aria-current={activeTab === "skills" ? "page" : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </button>
      </div>

      <div className="sidebar-spacer" />

      <div className="sidebar-settings">
        <button
          className="nav-item"
          onClick={onSettingsClick}
          aria-label="设置"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </nav>
  );
}

export default Sidebar;
```

**Step 2: 创建 Sidebar 样式文件**

```css
.sidebar {
  width: 60px;
  height: 100vh;
  background-color: var(--bg-primary);
  border-right: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-3) var(--space-2);
  flex-shrink: 0;
}

.sidebar-logo {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: var(--font-xl);
  margin-bottom: var(--space-5);
  box-shadow: var(--glow-blue);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

.nav-item {
  position: relative;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: var(--radius-lg);
  background-color: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.nav-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.nav-item:active {
  transform: scale(0.95);
}

.nav-item.active {
  background-color: var(--accent-blue-bg);
  color: var(--accent-blue);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background-color: var(--accent-blue);
  border-radius: 0 2px 2px 0;
}

.sidebar-spacer {
  flex: 1;
}

.sidebar-settings {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-default);
  width: 100%;
  display: flex;
  justify-content: center;
}

/* 焦点可见性 */
.nav-item:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}
```

**Step 3: 验证组件渲染**

运行: `pnpm dev`
检查: 浏览器中侧边栏组件是否正确显示（暂时独立测试）

**Step 4: 提交**

```bash
git add src/components/Sidebar.tsx src/components/Sidebar.css
git commit -m "feat: 创建侧边栏导航组件

- 60px 固定宽度侧边栏
- Logo、导航按钮、设置按钮布局
- 激活状态左侧蓝色指示条
- 完整的 ARIA 标签支持

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 3: 重构 App 主布局

**文件:**
- Modify: `src/App.tsx:174-256`
- Modify: `src/App.css:55-216`

**Step 1: 更新 App.tsx 的 JSX 结构**

替换 `return` 语句中的 JSX 为新布局：

```tsx
return (
  <div className="app-container">
    <Sidebar
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onSettingsClick={() => setIsSettingsOpen(true)}
    />

    <div className="content-area">
      <div className={`list-section ${isModalOpen ? "compressed" : ""}`}>
        {activeTab === "configs" && (
          <>
            <div className="page-header">
              <h1 className="page-title">{t("nav.configs")}</h1>
            </div>
            <button className="add-config-btn" onClick={handleAdd}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>{t("header.addConfig")}</span>
            </button>
            <ConfigList
              configs={configs}
              activeConfigId={activeConfigId}
              onActivate={handleActivate}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onReorder={handleReorder}
            />
          </>
        )}
        {activeTab === "memory" && <MemoryPage />}
        {activeTab === "skills" && <SkillsPage />}
      </div>

      {isModalOpen && (
        <>
          <div
            className={`drawer-overlay ${isModalOpen ? "visible" : ""}`}
            onClick={() => {
              setIsModalOpen(false);
              setEditingConfig(null);
            }}
          />
          <div className={`drawer ${isModalOpen ? "open" : ""}`}>
            <ConfigModal
              config={editingConfig}
              defaults={defaults}
              onSave={handleSave}
              onClose={() => {
                setIsModalOpen(false);
                setEditingConfig(null);
              }}
            />
          </div>
        </>
      )}
    </div>

    {isSettingsOpen && (
      <SettingsModal onClose={() => setIsSettingsOpen(false)} />
    )}
  </div>
);
```

**Step 2: 导入 Sidebar 组件**

在文件顶部添加导入：

```tsx
import Sidebar from "./components/Sidebar";
```

**Step 3: 更新 App.css 的布局样式**

替换 `.app` 及相关样式：

```css
.app-container {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background-color: var(--bg-base);
}

.content-area {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.list-section {
  width: 360px;
  background-color: var(--bg-secondary);
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 300ms ease-out;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.list-section.compressed {
  width: 280px;
}

/* 页面标题栏 */
.page-header {
  height: 52px;
  padding: 0 var(--space-5);
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.page-title {
  font-size: var(--font-xl);
  font-weight: 600;
  color: var(--text-primary);
}

/* 抽屉遮罩 */
.drawer-overlay {
  position: fixed;
  top: 0;
  left: 60px;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  opacity: 0;
  pointer-events: none;
  transition: opacity 300ms ease;
  z-index: 99;
}

.drawer-overlay.visible {
  opacity: 1;
  pointer-events: auto;
}

/* 抽屉面板 */
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 600px;
  background-color: var(--bg-elevated);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.2);
  transform: translateX(100%);
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 100;
  display: flex;
  flex-direction: column;
}

.drawer.open {
  transform: translateX(0);
}

/* 自定义滚动条 */
.list-section::-webkit-scrollbar {
  width: 6px;
}

.list-section::-webkit-scrollbar-track {
  background: transparent;
}

.list-section::-webkit-scrollbar-thumb {
  background-color: var(--border-default);
  border-radius: 3px;
}

.list-section::-webkit-scrollbar-thumb:hover {
  background-color: var(--text-muted);
}
```

**Step 4: 删除旧的导航相关样式**

删除 `.header`, `.header-left`, `.header-right`, `.nav-bar`, `.tab-group`, `.tab` 等旧样式

**Step 5: 运行开发服务器验证**

运行: `pnpm dev`
检查:
- 侧边栏显示在左侧
- 列表区显示在中间
- 点击编辑时抽屉从右侧滑出
- 抽屉打开时列表区压缩

**Step 6: 提交**

```bash
git add src/App.tsx src/App.css
git commit -m "refactor: 重构主布局为侧边栏+列表+抽屉架构

- 移除顶部导航，改用左侧固定侧边栏
- 列表区域 360px，抽屉打开时压缩到 280px
- 抽屉从右侧滑入，宽度 600px
- 删除旧的 header 和 nav-bar 样式

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 4: 优化添加配置按钮样式

**文件:**
- Modify: `src/App.css:137-160`

**Step 1: 更新添加配置按钮样式**

```css
.add-config-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin: var(--space-4) var(--space-4) var(--space-3) var(--space-4);
  padding: 14px;
  border: none;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--accent-blue), #2563eb);
  color: white;
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  transition: all 200ms ease;
  box-shadow: var(--shadow-sm), 0 2px 8px rgba(88, 166, 255, 0.2);
}

.add-config-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md), 0 4px 12px rgba(88, 166, 255, 0.3);
}

.add-config-btn:active {
  transform: translateY(0);
}
```

**Step 2: 验证样式**

运行: `pnpm dev`
检查: 添加按钮有渐变背景、悬停上浮效果

**Step 3: 提交**

```bash
git add src/App.css
git commit -m "style: 优化添加配置按钮样式

- 蓝色渐变背景
- 悬停上浮动画
- 阴影增强视觉层次

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: 视觉优化

### Task 5: 优化配置卡片样式

**文件:**
- Modify: `src/components/ConfigItem.tsx`
- Modify: `src/components/ConfigItem.css:1-136`

**Step 1: 更新配置卡片结构**

修改 `ConfigItem.tsx` 的 JSX，添加元信息展示：

```tsx
// 在 return 的卡片结构中添加元信息区域
<div className="config-item" ...>
  {/* 拖拽手柄 - 保留但隐藏 */}
  <div className="config-drag-handle" style={{ display: 'none' }}>...</div>

  {/* 头部区域 */}
  <div className="config-header">
    <div className="config-badge">
      <span className="badge-text">{config.name.charAt(0).toUpperCase()}</span>
    </div>

    <div className="config-title">
      <div className="config-name">{config.name}</div>
      {config.description && (
        <div className="config-description">{config.description}</div>
      )}
    </div>

    <div className="config-status">
      {config.isActive ? (
        <span className="status-active">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          使用中
        </span>
      ) : null}
    </div>
  </div>

  {/* 元信息区域 */}
  {(config.model || config.enabledPlugins) && (
    <div className="config-meta">
      {config.model && (
        <div className="config-meta-item">
          <svg className="config-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          <span>{config.model.substring(0, 30)}...</span>
        </div>
      )}
      {config.enabledPlugins && Object.keys(config.enabledPlugins).length > 0 && (
        <div className="config-meta-item">
          <svg className="config-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="9" x2="15" y2="9"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          <span>{Object.keys(config.enabledPlugins).length} 个插件</span>
        </div>
      )}
    </div>
  )}

  {/* 操作按钮区域 - 保留原有逻辑 */}
  <div className="config-actions">...</div>
</div>
```

**Step 2: 更新配置卡片样式**

```css
.config-item {
  position: relative;
  padding: 14px 16px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: var(--space-2);
}

.config-item:hover {
  background-color: var(--bg-tertiary);
  border-color: var(--accent-blue);
  box-shadow: 0 2px 8px rgba(88, 166, 255, 0.08);
  transform: translateY(-2px);
}

.config-item.active {
  background-color: var(--bg-tertiary);
  border-color: var(--accent-blue);
  box-shadow:
    0 0 0 1px var(--accent-blue) inset,
    var(--glow-blue);
}

/* 头部区域 */
.config-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

.config-badge {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--bg-tertiary), var(--bg-elevated));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.badge-text {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
}

.config-title {
  flex: 1;
  min-width: 0;
}

.config-name {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.config-description {
  font-size: var(--font-sm);
  color: var(--accent-blue);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 状态徽章 */
.config-status {
  flex-shrink: 0;
}

.status-active {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
  font-weight: 600;
  background-color: var(--accent-green-bg);
  color: var(--accent-green);
  border: 1px solid rgba(63, 185, 80, 0.3);
}

/* 元信息区域 */
.config-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 48px;
  margin-bottom: var(--space-2);
}

.config-meta-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-xs);
  color: var(--text-secondary);
}

.config-meta-icon {
  width: 12px;
  height: 12px;
  opacity: 0.6;
  flex-shrink: 0;
}

/* 操作按钮悬停显示 */
.config-actions {
  opacity: 0;
  transform: translateX(8px);
  transition: all 200ms ease;
}

.config-item:hover .config-actions {
  opacity: 1;
  transform: translateX(0);
}

/* 激活按钮样式更新 */
.activate-btn {
  background-color: var(--accent-blue);
  color: white;
}

.activate-btn:hover {
  background-color: var(--accent-blue-hover);
  color: white;
}

.active-badge {
  background-color: var(--accent-green-bg);
  color: var(--accent-green);
  border: 1px solid rgba(63, 185, 80, 0.3);
  cursor: default;
}

.active-badge:hover {
  background-color: var(--accent-green-bg);
  color: var(--accent-green);
}
```

**Step 3: 验证卡片样式**

运行: `pnpm dev`
检查:
- 卡片显示模型信息和插件数量
- 悬停时上浮效果和操作按钮显示
- 激活状态有蓝色发光

**Step 4: 提交**

```bash
git add src/components/ConfigItem.tsx src/components/ConfigItem.css
git commit -m "style: 优化配置卡片视觉设计

- 添加元信息展示（模型、插件数量）
- 悬停上浮 2px，蓝色边框高亮
- 激活状态蓝色发光效果
- 操作按钮悬停淡入

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 6: 优化 ConfigModal 为抽屉样式

**文件:**
- Modify: `src/components/ConfigModal.css:1-90`

**Step 1: 更新 modal 样式为抽屉风格**

```css
/* 移除 modal-overlay 样式（已在 App.css 中定义为 drawer-overlay） */

.modal {
  width: 100%;
  height: 100%;
  background-color: var(--bg-elevated);
  overflow: visible;
  display: flex;
  flex-direction: column;
  border-radius: 0;
  box-shadow: none;
}

.modal.modal-large {
  max-width: none;
}

/* 固定头部 */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 var(--space-6);
  background-color: var(--bg-primary);
  border-bottom: 1px solid var(--border-default);
  position: sticky;
  top: 0;
  z-index: 10;
  flex-shrink: 0;
}

.modal-header h2 {
  font-size: var(--font-lg);
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  text-align: left;
  margin-left: var(--space-3);
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-md);
  background-color: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 150ms ease;
  flex-shrink: 0;
}

.back-btn:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.header-spacer {
  width: 0;
}

/* 滚动内容区 */
.modal-body {
  padding: var(--space-6);
  overflow-y: auto;
  height: calc(100vh - 56px);
  flex: 1;
}

/* 保存按钮移到头部右侧 */
.drawer-save-btn {
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-md);
  background-color: var(--accent-blue);
  color: white;
  font-size: var(--font-base);
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
  flex-shrink: 0;
}

.drawer-save-btn:hover {
  background-color: var(--accent-blue-hover);
  transform: translateY(-1px);
}

.drawer-save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
```

**Step 2: 更新 ConfigModal.tsx 头部结构**

修改 `modal-header` 部分：

```tsx
<div className="modal-header">
  <button className="back-btn" onClick={onClose}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  </button>
  <h2>{config ? "编辑配置" : "添加配置"}</h2>
  <button
    type="submit"
    className="drawer-save-btn"
    disabled={!name.trim() || !apiKey.trim()}
  >
    保存
  </button>
</div>
```

**Step 3: 移除底部 footer**

删除 `modal-footer` 的 JSX 和相关样式

**Step 4: 验证抽屉样式**

运行: `pnpm dev`
检查:
- 抽屉头部固定，保存按钮在右侧
- 内容区可滚动
- 点击返回按钮或遮罩关闭抽屉

**Step 5: 提交**

```bash
git add src/components/ConfigModal.tsx src/components/ConfigModal.css
git commit -m "refactor: ConfigModal 改为抽屉面板样式

- 固定头部（56px），保存按钮移至头部右侧
- 移除底部 footer
- 滚动内容区高度适配
- 返回按钮在左侧

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 7: 优化折叠区域样式

**文件:**
- Modify: `src/components/ConfigModal.css` (折叠区域相关样式)

**Step 1: 更新折叠区域样式**

找到 `.section-toggle` 等折叠相关样式，替换为：

```css
/* 折叠区域容器 */
.collapsible-section {
  margin-bottom: var(--space-4);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background-color: var(--bg-primary);
  overflow: hidden;
  transition: all 200ms ease;
}

/* 折叠头部 */
.collapsible-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
  user-select: none;
  transition: background-color 150ms ease;
}

.collapsible-header:hover {
  background-color: var(--bg-tertiary);
}

.collapsible-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: 1;
}

.collapsible-title {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
}

.collapsible-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: var(--font-xs);
  font-weight: 600;
  background-color: var(--bg-tertiary);
  color: var(--text-secondary);
}

.collapsible-icon {
  width: 16px;
  height: 16px;
  color: var(--text-secondary);
  transition: transform 200ms ease;
  flex-shrink: 0;
}

.collapsible-section.expanded .collapsible-icon {
  transform: rotate(180deg);
}

/* 折叠内容 */
.collapsible-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 300ms ease;
}

.collapsible-section.expanded .collapsible-content {
  max-height: 2000px;
}

.collapsible-body {
  padding: var(--space-4);
  border-top: 1px solid var(--border-default);
}
```

**Step 2: 更新 ConfigModal.tsx 的折叠区域结构**

修改所有使用 `section-toggle` 的部分为新结构（以插件管理为例）：

```tsx
<div className={`collapsible-section ${showPlugins ? "expanded" : ""}`}>
  <div className="collapsible-header" onClick={() => setShowPlugins(!showPlugins)}>
    <div className="collapsible-header-left">
      <span className="collapsible-title">{t("configModal.enabledPlugins")}</span>
      {Object.keys(enabledPlugins).length > 0 && (
        <span className="collapsible-badge">
          {Object.keys(enabledPlugins).length}
        </span>
      )}
    </div>
    <svg
      className="collapsible-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </div>

  {showPlugins && (
    <div className="collapsible-content">
      <div className="collapsible-body">
        {/* 原有插件内容 */}
      </div>
    </div>
  )}
</div>
```

**Step 3: 验证折叠区域**

运行: `pnpm dev`
检查:
- 折叠区域有边框卡片样式
- 展开/收起动画流畅
- 悬停头部有背景色变化

**Step 4: 提交**

```bash
git add src/components/ConfigModal.tsx src/components/ConfigModal.css
git commit -m "style: 优化折叠区域视觉设计

- 边框卡片样式，圆角 10px
- 清晰的展开/收起图标旋转动画
- 徽章显示项目数量
- 悬停背景色变化

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 8: 优化表单字段样式

**文件:**
- Modify: `src/components/ConfigModal.css` (表单字段相关样式)

**Step 1: 更新表单字段样式**

```css
/* 表单区块 */
.form-section {
  margin-bottom: var(--space-6);
}

.form-section:last-child {
  margin-bottom: 0;
}

.form-section-title {
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-3);
}

/* 表单行 */
.form-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.form-group.full-width {
  grid-column: 1 / -1;
}

.form-group.half-width {
  grid-column: span 1;
}

/* 标签 */
.form-group label {
  font-size: var(--font-base);
  font-weight: 500;
  color: var(--text-primary);
}

/* 输入框 */
.form-group input,
.form-group select,
.form-group textarea {
  padding: 10px 12px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: var(--font-base);
  transition: all 150ms ease;
  font-family: inherit;
}

.form-group input:hover,
.form-group select:hover,
.form-group textarea:hover {
  border-color: var(--text-muted);
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 3px var(--accent-blue-bg);
  transform: scale(1.01);
}

.form-group input::placeholder,
.form-group textarea::placeholder {
  color: var(--text-muted);
}

/* 提示文本 */
.form-hint {
  font-size: var(--font-xs);
  color: var(--text-secondary);
  line-height: 1.4;
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.form-hint svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.form-hint.warning {
  color: var(--accent-orange);
}

/* 复选框 */
.checkbox-group {
  margin-bottom: var(--space-4);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type="checkbox"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.checkbox-custom {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-default);
  border-radius: 4px;
  background-color: var(--bg-primary);
  transition: all 150ms ease;
  position: relative;
  flex-shrink: 0;
}

.checkbox-label input[type="checkbox"]:checked + .checkbox-custom {
  background-color: var(--accent-blue);
  border-color: var(--accent-blue);
}

.checkbox-label input[type="checkbox"]:checked + .checkbox-custom::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 5px;
  width: 4px;
  height: 8px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  animation: checkmark 200ms ease-out;
}

@keyframes checkmark {
  0% { height: 0; }
  100% { height: 8px; }
}

.checkbox-label:hover .checkbox-custom {
  border-color: var(--accent-blue);
}
```

**Step 2: 验证表单样式**

运行: `pnpm dev`
检查:
- 输入框聚焦有蓝色光晕和轻微放大
- 复选框选中有对勾动画
- 提示文本显示正确

**Step 3: 提交**

```bash
git add src/components/ConfigModal.css
git commit -m "style: 优化表单字段视觉设计

- 输入框聚焦蓝色光晕 + 放大效果
- 复选框选中对勾动画
- 统一的间距和圆角
- 悬停边框高亮

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: 交互增强

### Task 9: 添加键盘快捷键支持

**文件:**
- Modify: `src/App.tsx` (添加 useEffect 处理快捷键)

**Step 1: 添加快捷键处理逻辑**

在 `App.tsx` 中添加快捷键 hook：

```tsx
// 在其他 useEffect 后添加
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Cmd/Ctrl + N: 新建配置
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      e.preventDefault();
      if (activeTab === 'configs') {
        handleAdd();
      }
    }

    // Cmd/Ctrl + S: 保存（在抽屉打开时）
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      // 触发表单提交（ConfigModal 内部处理）
    }

    // ESC: 关闭抽屉
    if (e.key === 'Escape' && isModalOpen) {
      setIsModalOpen(false);
      setEditingConfig(null);
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [activeTab, isModalOpen]);
```

**Step 2: 验证快捷键**

运行: `pnpm dev`
测试:
- Cmd/Ctrl + N 打开新建配置
- ESC 关闭抽屉

**Step 3: 提交**

```bash
git add src/App.tsx
git commit -m "feat: 添加键盘快捷键支持

- Cmd/Ctrl + N: 新建配置
- Cmd/Ctrl + S: 保存（表单中）
- ESC: 关闭抽屉

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 10: 添加响应式适配

**文件:**
- Modify: `src/App.css` (添加媒体查询)

**Step 1: 添加响应式样式**

```css
/* 小窗口适配 (< 900px) */
@media (max-width: 900px) {
  .list-section {
    position: fixed;
    left: 60px;
    right: 0;
    top: 0;
    bottom: 0;
    width: auto;
    z-index: 50;
  }

  .drawer {
    width: 100%;
    left: 60px;
  }

  .drawer.open ~ .list-section {
    display: none;
  }

  .drawer-overlay {
    left: 60px;
  }
}

/* 最小窗口适配 (< 700px) */
@media (max-width: 700px) {
  .sidebar {
    width: 48px;
    padding: var(--space-2) 4px;
  }

  .sidebar-logo {
    width: 32px;
    height: 32px;
    font-size: var(--font-md);
  }

  .nav-item {
    width: 36px;
    height: 36px;
  }

  .nav-item svg {
    width: 18px;
    height: 18px;
  }
}
```

**Step 2: 测试响应式**

运行: `pnpm dev`
调整浏览器窗口大小，检查:
- 小窗口时抽屉打开隐藏列表
- 最小窗口时侧边栏缩小

**Step 3: 提交**

```bash
git add src/App.css
git commit -m "feat: 添加响应式适配

- 小窗口（< 900px）：抽屉全屏，打开时隐藏列表
- 最小窗口（< 700px）：侧边栏缩小到 48px

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 11: 优化拖拽排序视觉反馈

**文件:**
- Modify: `src/components/ConfigItem.css` (拖拽相关样式)

**Step 1: 更新拖拽样式**

```css
/* 拖拽中的卡片 */
.config-item.dragging {
  opacity: 0.5;
  transform: scale(0.98) rotate(2deg);
  cursor: grabbing;
  box-shadow: var(--shadow-lg);
  z-index: 1000;
}

/* 其他卡片在拖拽时 */
.config-list.is-dragging .config-item:not(.dragging) {
  opacity: 0.6;
  transition: all 200ms ease;
}

/* 插入位置指示器 */
.config-item.drag-over::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background-color: var(--accent-blue);
  box-shadow: var(--glow-blue);
}

.config-item.drag-over-above::before {
  top: -5px;
}

.config-item.drag-over-below::before {
  bottom: -5px;
}

.config-item.drag-over {
  transform: scale(1.02);
}

/* 移除旧的复杂指示器样式 */
```

**Step 2: 验证拖拽效果**

运行: `pnpm dev`
测试拖拽排序，检查插入指示线显示

**Step 3: 提交**

```bash
git add src/components/ConfigItem.css
git commit -m "style: 优化拖拽排序视觉反馈

- 拖拽中卡片半透明 + 轻微旋转
- 简化插入指示器为蓝色发光线
- 拖拽目标轻微放大

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 12: 添加可访问性增强

**文件:**
- Modify: `src/App.css` (焦点样式)
- Modify: `src/components/ConfigModal.tsx` (ARIA 标签)

**Step 1: 添加全局焦点样式**

```css
/* 焦点可见性 */
*:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}

button:focus-visible {
  outline-offset: 3px;
}

/* 屏幕阅读器专用 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

**Step 2: 更新 ConfigModal ARIA 标签**

在 `ConfigModal.tsx` 中添加：

```tsx
<div
  className="modal"
  role="dialog"
  aria-labelledby="config-modal-title"
  aria-modal="true"
>
  <div className="modal-header">
    <button className="back-btn" onClick={onClose} aria-label="关闭">
      {/* ... */}
    </button>
    <h2 id="config-modal-title">{config ? "编辑配置" : "添加配置"}</h2>
    {/* ... */}
  </div>
  {/* ... */}
</div>
```

**Step 3: 验证可访问性**

运行: `pnpm dev`
使用 Tab 键导航，检查焦点环显示

**Step 4: 提交**

```bash
git add src/App.css src/components/ConfigModal.tsx
git commit -m "feat: 添加可访问性增强

- 全局焦点环样式（蓝色，2px）
- ConfigModal ARIA 标签（role, aria-labelledby）
- 屏幕阅读器专用样式类

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 13: 最终验证和优化

**Step 1: 运行完整构建**

```bash
pnpm build
```

检查是否有构建错误或警告

**Step 2: 手动测试所有功能**

测试清单：
- [ ] 侧边栏导航切换
- [ ] 配置列表显示和滚动
- [ ] 点击卡片打开抽屉
- [ ] 抽屉打开时列表压缩
- [ ] 抽屉内表单编辑
- [ ] 保存配置
- [ ] 激活配置
- [ ] 拖拽排序
- [ ] 删除和复制配置
- [ ] 键盘快捷键（Cmd+N, ESC）
- [ ] 响应式（调整窗口大小）

**Step 3: 性能检查**

Chrome DevTools -> Performance:
- 录制交互过程
- 检查是否有明显的性能问题
- 验证动画流畅度（60fps）

**Step 4: 最终提交**

```bash
git add .
git commit -m "test: UI 重设计最终验证

验证通过：
- 所有核心功能正常
- 动画流畅
- 响应式适配正常
- 键盘导航可用

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 实现完成

**总计任务**: 13 个
**预计时间**: 4-6 小时
**提交次数**: 13 次（每个任务一次提交）

**关键改进总结**:
1. ✅ 侧边栏导航架构
2. ✅ 右侧抽屉编辑面板
3. ✅ GitHub Dark 色彩系统
4. ✅ 配置卡片视觉优化
5. ✅ 表单和折叠区域优化
6. ✅ 流畅的动画效果
7. ✅ 键盘快捷键
8. ✅ 响应式适配
9. ✅ 可访问性增强

**后续可选优化**:
- 虚拟滚动（配置列表很长时）
- 主题切换动画
- 更多键盘快捷键
- Toast 通知组件
