# UI 重设计方案

**日期**: 2026-02-22
**目标**: 全面优化应用 UI 布局和交互逻辑，参考业界最佳实践
**设计风格**: 混合现代开发工具、配置管理工具和 macOS 原生应用的精致感

---

## 设计目标

在保持简洁的前提下，综合改进：
- **视觉美观度** - 更现代、精致的设计风格
- **交互效率** - 减少点击次数，优化工作流程
- **信息层次** - 更清晰的视觉层次，快速定位功能

## 整体架构

### 布局结构：侧边栏 + 列表 + 抽屉

```
┌────────────────────────────────────────────┐
│          Window Title Bar (Tauri)          │
├──────┬──────────────────┬──────────────────┤
│      │                  │                  │
│  侧  │   配置列表区     │   右侧抽屉面板   │
│  边  │   (360px)        │   (600px)        │
│  导  │                  │   [条件渲染]     │
│  航  │   - 添加按钮     │                  │
│      │   - 配置卡片     │   编辑表单       │
│ 60px │   - ...          │                  │
│      │                  │                  │
└──────┴──────────────────┴──────────────────┘
```

**尺寸规格**
- 侧边栏：60px（固定）
- 列表区：360px（默认）→ 280px（抽屉打开时）
- 抽屉：600px（从右侧滑入）

**参考风格**
- 侧边栏导航：VS Code、Cursor
- 抽屉面板：Raycast、GitHub Settings
- 色彩系统：GitHub Dark
- 表单组织：1Password

---

## 一、侧边栏导航

### 设计要点

**垂直导航栏**（替代当前的顶部导航）
```
┌────────┐
│  Logo  │  <- 应用 Logo (40x40, 渐变背景)
├────────┤
│  [⚙]  │  <- 配置页
│  [📝]  │  <- 记忆页
│  [⚡]  │  <- Skills
├────────┤
│  空间  │  <- 弹性空间
├────────┤
│  [⚙️]  │  <- 设置（底部固定）
└────────┘
```

**导航按钮**
- 尺寸：44x44px
- 圆角：10px
- 默认：透明背景，`var(--text-secondary)` 图标
- 悬停：半透明背景，`var(--text-primary)` 图标
- 激活：蓝色背景 10% 透明度，蓝色图标，左侧 3px 蓝色指示条

**优势**
- 节省垂直空间
- 符合现代桌面应用习惯
- 视觉聚焦于内容区

---

## 二、配置列表区域

### 页面结构

**标题栏**（52px 高）
- 左侧：页面标题（如"配置管理"）
- 右侧：预留快捷操作（搜索、排序等）

**添加按钮**（优化）
- 渐变背景（蓝色系）
- 悬停上浮效果
- 阴影增强视觉层次

### 配置卡片优化

**信息结构**
```
┌─────────────────────────────────────┐
│ [A]  配置名称           [使用中 ✓] │
│      描述信息 (蓝色小字)            │
│                                     │
│      模型: claude-3-sonnet-...      │
│      插件: 3 个已启用               │
└─────────────────────────────────────┘
```

**视觉改进**
- 高度：auto（最小 80px）
- 内边距：14px 16px
- 圆角：10px
- 悬停：上浮 2px，蓝色边框，微阴影
- 激活状态：蓝色边框 + 蓝色发光阴影

**关键信息预览**
- 徽章（36x36px，渐变背景）
- 配置名称（14px，600 字重）
- 描述（12px，蓝色）
- 元信息：模型名称、插件数量（11px，次要文字色）

**交互优化**
- 整个卡片可拖拽（无需拖拽手柄）
- 悬停时右上角显示操作按钮（编辑、复制、删除）
- 点击卡片 = 打开编辑抽屉
- 点击状态徽章 = 激活配置

---

## 三、右侧抽屉面板

### 设计原理

**为什么选择抽屉而非弹窗？**
1. 表单复杂度高（基本信息、模型、插件、通用配置 JSON 等）
2. 编辑时列表仍可见，支持快速切换配置
3. 符合现代工具习惯（VS Code Settings、GitHub PR Review）

### 抽屉结构

**固定头部**（56px）
- 左侧：返回按钮 + 配置名称
- 右侧：保存按钮（蓝色渐变）
- 粘性定位，滚动时始终可见

**滚动内容区**
- 内边距：24px
- 高度：calc(100vh - 56px)

**表单组织**
- 字段分组，清晰的区块标题（大写，字间距）
- 两列布局（grid，间距 12px）
- 折叠区域优化（边框卡片，清晰的展开/收起图标）

### 折叠区域设计

**结构**
```css
.collapsible-section {
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background-color: var(--bg-primary);
}

.collapsible-header {
  padding: 14px 16px;
  cursor: pointer;
  /* 左侧：标题 + 徽章，右侧：展开图标 */
}

.collapsible-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 300ms ease;
}

.collapsible-section.expanded .collapsible-content {
  max-height: 2000px;
}
```

### 表单字段优化

**输入框**
- 内边距：10px 12px
- 圆角：8px
- 聚焦：蓝色边框 + 3px 蓝色光晕

**开关（Toggle）**
- 宽：40px，高：22px
- 滑块：18px 圆形，白色
- 开启：蓝色背景，滑块右移

**复选框**
- 18x18px，圆角 4px
- 选中：蓝色背景，白色对勾，对勾动画

---

## 四、色彩系统

### 色彩变量（GitHub Dark 风格）

**背景色**（更细腻的 5 层层次）
```css
--bg-base: #0d1117;      /* 窗口背景 */
--bg-primary: #161b22;   /* 侧边栏、头部 */
--bg-secondary: #1c2128; /* 列表区、卡片 */
--bg-tertiary: #21262d;  /* 悬停、输入框 */
--bg-elevated: #2d333b;  /* 抽屉、弹窗 */
```

**边框色**
```css
--border-default: #30363d;
--border-muted: #21262d;
--border-subtle: #1c2128;
```

**文字色**
```css
--text-primary: #e6edf3;
--text-secondary: #7d8590;
--text-tertiary: #57606a;
--text-muted: #484f58;
```

**语义色**
```css
--accent-blue: #58a6ff;       /* 主色调 */
--accent-green: #3fb950;      /* 成功/激活 */
--accent-orange: #f78166;     /* 警告 */
--accent-red: #f85149;        /* 错误 */
--accent-purple: #bc8cff;     /* 特殊 */
```

**阴影和发光**
```css
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.12);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.15);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.2);
--glow-blue: 0 0 12px rgba(88, 166, 255, 0.4);
```

### 视觉层次应用

- **层级 0**：窗口基础（`--bg-base`）
- **层级 1**：侧边栏、头部（`--bg-primary`）
- **层级 2**：列表区、卡片（`--bg-secondary`）
- **层级 3**：悬停、输入（`--bg-tertiary`）
- **层级 4**：浮起元素（`--bg-elevated`）

---

## 五、交互动画

### 核心动画效果

**抽屉滑入**
```css
transform: translateX(100%) → translateX(0)
transition: 300ms cubic-bezier(0.4, 0, 0.2, 1)
```

**卡片悬停**
```css
transform: translateY(-2px)
box-shadow: 蓝色边框 + 微阴影
transition: 200ms cubic-bezier(0.4, 0, 0.2, 1)
```

**拖拽排序**
- 拖拽中：opacity 0.5，scale 0.98，rotate 2deg
- 其他卡片：opacity 0.6
- 插入指示：2px 蓝色线 + 蓝色发光

**按钮交互**
- 悬停：上浮 1px，阴影增强
- 点击：scale 0.97

**折叠展开**
```css
max-height: 0 → 2000px
transition: 300ms ease
图标旋转: rotate(0deg) → rotate(180deg)
```

### 性能优化

- 使用 `transform` 和 `opacity` 动画（GPU 加速）
- 长列表使用 `content-visibility: auto`
- 谨慎使用 `will-change`

---

## 六、响应式和可访问性

### 响应式断点

**小窗口（< 900px）**
- 抽屉打开时隐藏列表
- 抽屉占据全部宽度（从侧边栏右侧开始）

**最小窗口（< 700px）**
- 侧边栏缩小到 48px
- 导航按钮 36x36px

### 可访问性

**键盘导航**
- Cmd/Ctrl + N：新建配置
- Cmd/Ctrl + S：保存
- ESC：关闭抽屉
- Tab/Shift+Tab：表单导航

**焦点可见性**
```css
*:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}
```

**ARIA 标签**
- 侧边栏：`<nav aria-label="主导航">`
- 抽屉：`<aside role="complementary" aria-label="配置编辑">`
- 状态通知：`<div role="status" aria-live="polite">`

**屏幕阅读器**
- 所有图标按钮添加 `aria-label`
- 加载状态使用 `aria-busy`
- 错误消息使用 `aria-describedby`

---

## 七、设计系统规范

### 间距系统

```css
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-6: 24px
--space-8: 32px
```

### 圆角系统

```css
--radius-sm: 6px    /* 小元素 */
--radius-md: 8px    /* 按钮、输入框 */
--radius-lg: 10px   /* 卡片 */
--radius-xl: 12px   /* 大卡片 */
--radius-2xl: 16px  /* 弹窗 */
```

### 字体系统

```css
--font-xs: 11px     /* 元信息 */
--font-sm: 12px     /* 描述 */
--font-base: 13px   /* 标签、正文 */
--font-md: 14px     /* 卡片标题 */
--font-lg: 15px     /* 抽屉标题 */
--font-xl: 16px     /* 页面标题 */
```

---

## 实现优先级

### Phase 1: 核心架构（必须）

1. 侧边栏导航布局
2. 列表区域重构
3. 抽屉面板实现
4. 色彩系统应用

### Phase 2: 视觉优化（重要）

5. 配置卡片样式优化
6. 表单字段和折叠区域优化
7. 动画和过渡效果
8. 悬停和焦点状态

### Phase 3: 交互增强（可选）

9. 拖拽排序优化
10. 键盘快捷键
11. 响应式适配
12. 可访问性增强

---

## 技术实现要点

### 状态管理

**抽屉状态**
```tsx
const [drawerOpen, setDrawerOpen] = useState(false);
const [editingConfig, setEditingConfig] = useState<ClaudeConfig | null>(null);
```

**列表压缩状态**
```tsx
<div className={`list-section ${drawerOpen ? 'compressed' : ''}`}>
```

### 动画性能

- 使用 CSS transition，避免 JavaScript 动画
- 长列表考虑虚拟滚动（react-window）
- 拖拽使用原生 HTML5 Drag and Drop API

### 用户偏好持久化

```tsx
// 记住折叠区域状态
localStorage.setItem('expandedSections', JSON.stringify(sections));

// 记住滚动位置
sessionStorage.setItem('listScrollPos', scrollTop.toString());
```

---

## 预期效果

### 视觉效果

- ✅ 更现代、精致的界面设计
- ✅ 清晰的视觉层次和信息组织
- ✅ 流畅的动画和过渡效果

### 交互体验

- ✅ 快速切换配置（抽屉 + 列表并存）
- ✅ 减少点击次数（悬停显示操作、快捷键）
- ✅ 直观的拖拽排序

### 开发体验

- ✅ 统一的设计系统（色彩、间距、圆角）
- ✅ 可复用的组件样式
- ✅ 易于扩展和维护

---

## 参考资源

- [GitHub Dark Theme](https://primer.style/design/foundations/color)
- [VS Code UI Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)
- [Tailwind CSS Design System](https://tailwindcss.com/docs)
- [macOS Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/macos)
