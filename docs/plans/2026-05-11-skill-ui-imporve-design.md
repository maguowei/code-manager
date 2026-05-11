# Skills 页与编辑器 UI 微调

## Context

上一轮（commit `9f7a27e` / `13fcc79`）把 Skills 卡片重排、Skill 编辑器接入完整 Markdown 与 Toast 只读反馈。用户基于截图回头做一组视觉细节收敛：

1. 列表区冗余分组标题与卡片里的 slash 路径行拥挤。
2. frontmatter 的两个布尔选项排版与 ProfileEditor 其它设置项不一致。
3. 支持文件目录树是扁平行，层级不清，还有冗余"目录"徽章。
4. 编辑器顶部"用编辑器打开 Skill 目录"按钮文案过长，抢占主标题空间。

Rust 侧的名称解析已是 frontmatter.name 优先、fallback 目录 id（`src-tauri/src/skills.rs:135-141、:198-203`），所以前端可以放心只把名称展示在 h3，删掉 slash id 行。

目标：仅前端 UI / 文案收敛，不改 Rust 命令、契约、类型。

## 调整清单

### 1. `src/components/SkillsPage.tsx`
- 删 `:503-507` 的 `skill-group-header` 整块（h2 + 容器 div）。
- 保留 `:502` section 的 `aria-label={t("skills.list")}`，让 `skills.list` 继续被引用。

### 2. `src/components/SkillItem.tsx`
- 删 `:107-109` 的 `skill-slash-id` span（`/{skill.id}`）。
- 徽章行仅剩：来源徽章（本地目录/软链接）+ 只读徽章（软链接时）。

### 3. `src/components/SkillEditor.tsx` —— frontmatter 选项改横排卡片
- 参考 `src/components/profile-editor/StructuredSettingsSections.tsx:486-509` 的 `common-option` 版式。
- `renderSkillBooleanField`（`:313-356`）整块重写：
  - 外壳：`data-slot="skill-boolean-option"` + `flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-background/60 px-3 py-3 shadow-xs`。
  - 左：`<FormLabel>` 用 `TYPOGRAPHY.fieldLabel` + `<FormDescription>` 用 `text-xs text-muted-foreground`（与 StructuredSettings 描述一致）。
  - 右：shadcn `<Switch>`（`src/components/ui/switch.tsx`），`checked={!!field.value}`、`onCheckedChange={(checked) => { if (isReadOnly) { handleReadonlyAttempt(); return; } field.onChange(checked); syncMarkdownFromForm({ [fieldConfig.name]: checked } as Partial<SkillFormData>); }}`、`aria-disabled={isReadOnly}`。
  - 只读点击拦截：在外壳加 `onPointerDown={isReadOnly ? handleReadonlyAttempt : undefined}`，保留 `showToast('skillSymlinkReadonly')` 行为。
- 外层分组容器保持 `<div className="flex flex-col gap-1">`（`:445-447`）；Switch 本身无 `checked === true` 断言路径。

### 4. `src/components/SkillEditor.tsx` —— `renderFileTreeEntry` 分层缩进 + 精简
- 位置：`:358-388` + `:584-585`。
- 新增 `const depth = entry.path.split("/").length - 1;`。
- 行容器：`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 ...`，加 `style={{ paddingLeft: \`calc(${depth} * 1rem + 0.75rem)\` }}`（项目已有多处直接用 `style` 承载动态像素值，内联 style 可接受，注释说明为动态缩进）。
- 第二列改为 `<code title={entry.path} className="min-w-0 truncate ...">{entry.path.split("/").pop() ?? entry.path}</code>`，完整路径放进 `title`，便于悬浮查看。
- 目录行删除 `Badge {t("skills.directory")}`，仅保留 `<Folder>` + basename；第三列渲染为 `null`（保留 grid 第三列占位以让文件行对齐）。
- 文件行保持"二进制徽章（保留）+ 字节数 span"，仅把徽章 padding 收到 `px-1 py-px`、字号仍保持 `text-xs`（满足 TYPOGRAPHY.badge 契约）。
- 父目录排序：Rust 侧不保证父在前。把 `fileTree` 在渲染前本地 `.slice().sort((a, b) => a.path.localeCompare(b.path))`。

### 5. `src/components/SkillEditor.tsx` —— 顶部按钮文案
- 位置：`:420-423`。
- `aria-label` 继续用 `skills.openInEditor`（跨组件一致）。
- 可见文案换成新 key `skills.openDirectory`（中文"打开 Skill 目录"、英文"Open Skill Directory"）。
- 文件树底部按钮（`:595-603`）与 SkillItem 图标按钮（`SkillItem.tsx:151-152、163-164、175-176` 中 `openInEditor` 关联的那一颗）继续用 `skills.openInEditor` 做 title/aria-label。

### 6. i18n 清理（`src/i18n.ts`）
- 删中英文 `skills.listDescription`（`:184`、`:1298`）——已无引用。
- 删中英文 `skills.directory`（`:1031`、`:2177`）——调整 4 后无引用。
- 新增 `skills.openDirectory`：中 `:1031` 附近；英 `:2176` 附近。

### 7. 同步测试

`src/components/__tests__/SkillEditor.test.tsx`：
- `:129` `getByText("scripts/helper.sh")` → 改为 `getByText("helper.sh")`，补一条 `getByTitle("scripts/helper.sh")` 验证完整路径仍可查。
- 若有依赖 checkbox role 的后续用例（目前无），提醒改为 `getByRole("switch", { name })`。

`src/components/__tests__/SkillItem.test.tsx`：
- 当前无直接断言 slash id（`:136/:141` 的 `/tmp/external/code-review` 是 linkTarget，不受影响）。但顺便补一条 `expect(screen.queryByText(/^\/code-review$/)).not.toBeInTheDocument();` 防止回归。

`src/components/__tests__/SkillsPage.test.tsx`：
- 若任何断言找的是文本 `Skills 列表`，改为用 `getByRole("region", { name: "Skills 列表" })`（grep 显示当前不存在该断言，保险核查）。

## 关键文件

- `src/components/SkillsPage.tsx`
- `src/components/SkillItem.tsx`
- `src/components/SkillEditor.tsx`
- `src/components/ui/switch.tsx`（只读使用，不改）
- `src/i18n.ts`
- `src/components/profile-editor/StructuredSettingsSections.tsx:486-509`（版式参考，只读）
- `src/components/__tests__/SkillEditor.test.tsx`
- `src/components/__tests__/SkillItem.test.tsx`
- `src/components/__tests__/SkillsPage.test.tsx`

## 复用

- 卡片表面：shadcn `Switch`（`src/components/ui/switch.tsx`）、`TYPOGRAPHY` 常量（`src/components/typography-classes.ts`）。
- Toast 只读提示：`showToast("toast.skillSymlinkReadonly")`（已存在 i18n key）。
- 只读写入拦截：`handleReadonlyAttempt`（`SkillEditor.tsx` 现有函数，不新增）。

## 验证

1. `pnpm biome:ci`：格式/lint 通过。
2. `pnpm test`：Vitest 全量，重点关注 `SkillEditor.test.tsx`、`SkillItem.test.tsx`、`SkillsPage.test.tsx`、`typography-classes.test.ts`、`ui-system-contract.test.ts`。
3. `pnpm build`：确认 TS 与 Vite 构建通过。
4. `pnpm tauri dev` 手动冒烟（若环境允许）：
   - 打开 Skills 页：列表无"Skills 列表"标题；卡片无 slash id 行；hover 卡片操作按钮正常。
   - 编辑任意本地 Skill：frontmatter 两个选项呈横排卡片，切换 Switch 会反映到 `SKILL.md` 内容预览的 frontmatter；点击软链接 Skill 的 Switch 弹出 Toast 只读提示。
   - 展开"支持文件"：含子目录 Skill 能看到层级缩进；文件行显示 basename + 字节数，悬浮查看完整路径。
   - 顶部按钮文字变短为"打开 Skill 目录"，点击仍能调起系统编辑器。
5. 若环境无法启动桌面壳，明确告知并以静态检查 + 测试覆盖作为兜底。
