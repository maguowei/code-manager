import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { zodResolver } from "@hookform/resolvers/zod";
import { invoke } from "@tauri-apps/api/core";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { ChevronLeft, Code2, ExternalLink, Eye, FileText, Folder, FolderOpen } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { showOperationError } from "@/lib/user-facing-error";
import { useCodeMirrorTheme } from "../hooks/useCodeMirrorTheme";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import { cn } from "../lib/utils";
import type { FieldConfig } from "../schemas/form-fields";
import {
  buildSkillDefaultValues,
  buildSkillPrimaryFields,
  composeSkillMarkdownDocument,
  parseSkillMarkdownDocument,
  SKILL_BOOLEAN_FIELDS,
  type SkillFormData,
  SkillSchema,
  toSkillPayload,
} from "../schemas/skill-schema";
import type { Skill, SkillFileTreeEntry } from "../types";
import CollapsibleSection from "./CollapsibleSection";
import MarkdownPreview from "./claude-overview/MarkdownPreview";
import ProfileNameBadge from "./ProfileNameBadge";
import {
  CONTROL_SURFACE_CLASS,
  PANEL_SURFACE_CLASS,
  TOOLBAR_SURFACE_CLASS,
} from "./surface-classes";
import { useTheme } from "./theme-provider";
import { TYPOGRAPHY } from "./typography-classes";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";

interface SkillEditorProps {
  skill: Skill | null; // null = 新建模式
  onSave: (skill: Skill) => void;
  onClose: () => void;
}

type SkillEditorMode = "source" | "preview";
type MarkdownPreviewThemeType = "light" | "dark";

export interface SkillEditorHandle {
  isDirty: () => boolean;
  canSave: () => boolean;
  save: () => Promise<boolean>;
}

type SkillEditorSaveData = ReturnType<typeof toSkillPayload>;

function parseSkillSaveData(markdownDocument: string, fallback: SkillFormData) {
  return {
    ...parseSkillMarkdownDocument(markdownDocument, fallback),
    id: fallback.id,
  };
}

function normalizeSkillFormData(data: SkillFormData): SkillEditorSaveData {
  return {
    id: data.id.trim(),
    name: data.name.trim(),
    description: data.description.trim(),
    content: data.content,
    disableModelInvocation: data.disableModelInvocation,
    userInvocable: data.userInvocable,
  };
}

function skillSaveDataEquals(left: SkillEditorSaveData, right: SkillEditorSaveData) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const SkillEditor = forwardRef<SkillEditorHandle, SkillEditorProps>(function SkillEditor(
  { skill, onSave, onClose },
  ref,
) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { isDark } = useTheme();
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const editorTheme = useCodeMirrorTheme();
  const previewThemeType: MarkdownPreviewThemeType = isDark ? "dark" : "light";
  const isEditing = skill !== null;
  const isReadOnly = skill?.isSymlink === true;
  const primaryFields = buildSkillPrimaryFields(isEditing);
  const defaultValues = buildSkillDefaultValues(skill);

  const form = useForm<SkillFormData>({
    resolver: zodResolver(SkillSchema) as Resolver<SkillFormData>,
    defaultValues,
    mode: "onBlur",
  });
  const { control, getValues, handleSubmit, setValue, trigger, watch } = form;
  const initialSaveDataRef = useRef(
    normalizeSkillFormData(
      parseSkillSaveData(composeSkillMarkdownDocument(defaultValues), defaultValues),
    ),
  );

  // 支持文件相关状态
  const [fileTree, setFileTree] = useState<SkillFileTreeEntry[]>([]);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editorMode, setEditorMode] = useState<SkillEditorMode>("source");
  const [skillMarkdown, setSkillMarkdown] = useState(() =>
    composeSkillMarkdownDocument(defaultValues),
  );

  const watchId = watch("id");
  const isPreviewMode = editorMode === "preview";
  const sortedFileTree = fileTree.slice().sort((a, b) => a.path.localeCompare(b.path));
  const currentSkillDraft = parseSkillSaveData(skillMarkdown, { ...getValues(), id: watchId });
  const canSave = SkillSchema.safeParse(currentSkillDraft).success && !isSaving && !isReadOnly;
  const currentSaveData = normalizeSkillFormData(currentSkillDraft);
  const isDirty = !isReadOnly && !skillSaveDataEquals(initialSaveDataRef.current, currentSaveData);

  // 编辑模式下进入页面时自动懒加载支持文件
  // CollapsibleSection 暂不支持 onExpand 回调，故在 isEditing && !filesLoaded 时通过 useEffect 触发
  // biome-ignore lint/correctness/useExhaustiveDependencies: 仅在 isEditing 变化时触发，filesLoaded/loadFiles 为稳定引用
  useEffect(() => {
    if (isEditing && !isReadOnly && !filesLoaded) {
      void loadFiles();
    }
  }, [isEditing, isReadOnly]);

  // 懒加载支持文件（仅编辑模式下）
  async function loadFiles() {
    if (!skill || filesLoaded) return;
    try {
      const result = await invoke<SkillFileTreeEntry[]>("get_skill_file_tree", {
        id: skill.id,
        isActive: skill.isActive,
      });
      setFileTree(result);
      setFilesLoaded(true);
    } catch (err) {
      showOperationError(showToast, t("toast.skillLoadError"), err);
    }
  }

  async function saveSkillForm(data: SkillFormData) {
    if (isReadOnly) return false;
    setIsSaving(true);
    try {
      const parsedDocument = parseSkillMarkdownDocument(skillMarkdown, data);
      const validated = SkillSchema.safeParse({ ...parsedDocument, id: data.id });
      if (!validated.success) {
        return false;
      }
      const payload = toSkillPayload(validated.data);
      const saved =
        isEditing && skill
          ? await invoke<Skill>("update_skill", {
              id: skill.id,
              isActive: skill.isActive,
              data: payload,
            })
          : await invoke<Skill>("add_skill", { data: payload });
      showToast(t(isEditing ? "toast.skillSaved" : "toast.skillAdded"));
      onSave(saved);
      return true;
    } catch (err) {
      showOperationError(
        showToast,
        t(isEditing ? "toast.skillSaveError" : "toast.skillAddError"),
        err,
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  // 提交表单，新建或更新 Skill
  async function handleSkillSubmit(data: SkillFormData) {
    await saveSkillForm(data);
  }

  async function handleSaveClick() {
    if (!canSave) {
      return false;
    }

    const isValid = await trigger();
    if (!isValid) {
      return false;
    }

    return saveSkillForm(getValues());
  }

  async function handleOpenInEditor() {
    if (!skill) return;
    try {
      await invoke("open_skill_in_editor", { id: skill.id, isActive: skill.isActive });
      showToast(t("toast.skillOpenEditorRequested"));
    } catch (err) {
      showOperationError(showToast, t("toast.skillOpenEditorError"), err);
    }
  }

  function handleReadonlyAttempt() {
    showToast(t("toast.skillSymlinkReadonly"), "error", {
      description: skill?.linkTarget ?? undefined,
    });
  }

  function syncMarkdownFromForm(nextValues: Partial<SkillFormData>) {
    setSkillMarkdown(composeSkillMarkdownDocument({ ...getValues(), ...nextValues }));
  }

  function handleMarkdownChange(raw: string) {
    setSkillMarkdown(raw);
    const parsedDocument = parseSkillMarkdownDocument(raw, getValues());
    setValue("name", parsedDocument.name, { shouldDirty: true, shouldValidate: true });
    setValue("description", parsedDocument.description, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("content", parsedDocument.content, { shouldDirty: true, shouldValidate: true });
    setValue("disableModelInvocation", parsedDocument.disableModelInvocation, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("userInvocable", parsedDocument.userInvocable, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  // 在光标位置插入文本（选中文字时替换）
  function insertAtCursor(text: string) {
    const view = editorRef.current?.view;
    if (isReadOnly) {
      handleReadonlyAttempt();
      return;
    }
    if (!view || isPreviewMode) return;
    view.dispatch(view.state.replaceSelection(text));
    view.focus();
  }

  // 在当前行行首插入前缀
  function insertAtLineStart(prefix: string) {
    const view = editorRef.current?.view;
    if (isReadOnly) {
      handleReadonlyAttempt();
      return;
    }
    if (!view || isPreviewMode) return;
    const { from } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    view.dispatch({ changes: { from: line.from, insert: prefix } });
    view.focus();
  }

  // 加粗：选中文字时包裹，否则插入占位符
  function insertBold() {
    const view = editorRef.current?.view;
    if (isReadOnly) {
      handleReadonlyAttempt();
      return;
    }
    if (!view || isPreviewMode) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    view.dispatch(
      view.state.replaceSelection(
        selected ? `**${selected}**` : `**${t("skills.toolbar.boldPlaceholder")}**`,
      ),
    );
    view.focus();
  }

  function renderSkillField(fieldConfig: FieldConfig<SkillFormData>) {
    const isRequired = !!fieldConfig.required;

    return (
      <FormField
        key={fieldConfig.name}
        control={control}
        name={fieldConfig.name}
        render={({ field }) => (
          <FormItem className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <FormLabel className="text-sm font-medium text-foreground">
                {t(fieldConfig.labelKey)}
              </FormLabel>
              {isRequired ? (
                <span className="inline-flex items-center justify-center rounded-full bg-destructive/10 px-1.5 py-px text-xs font-semibold text-destructive">
                  {t("form.required")}
                </span>
              ) : null}
            </div>
            <FormControl>
              {fieldConfig.inputType === "textarea" ? (
                <Textarea
                  name={field.name}
                  ref={field.ref}
                  rows={fieldConfig.rows}
                  value={typeof field.value === "string" ? field.value : ""}
                  placeholder={
                    fieldConfig.placeholderKey ? t(fieldConfig.placeholderKey) : undefined
                  }
                  aria-disabled={isReadOnly}
                  readOnly={fieldConfig.readOnly || isReadOnly}
                  onBlur={field.onBlur}
                  onPointerDown={isReadOnly ? handleReadonlyAttempt : undefined}
                  onChange={(event) => {
                    field.onChange(event);
                    syncMarkdownFromForm({
                      [fieldConfig.name]: event.target.value,
                    } as Partial<SkillFormData>);
                  }}
                  className={cn(
                    "rounded-md border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    CONTROL_SURFACE_CLASS,
                    isReadOnly && "cursor-default opacity-75",
                  )}
                />
              ) : (
                <Input
                  name={field.name}
                  ref={field.ref}
                  type={fieldConfig.inputType === "url" ? "url" : "text"}
                  value={typeof field.value === "string" ? field.value : ""}
                  placeholder={
                    fieldConfig.placeholderKey ? t(fieldConfig.placeholderKey) : undefined
                  }
                  aria-disabled={isReadOnly}
                  readOnly={fieldConfig.readOnly || isReadOnly}
                  onBlur={field.onBlur}
                  onPointerDown={isReadOnly ? handleReadonlyAttempt : undefined}
                  onChange={(event) => {
                    field.onChange(event);
                    syncMarkdownFromForm({
                      [fieldConfig.name]: event.target.value,
                    } as Partial<SkillFormData>);
                  }}
                  className={cn(
                    "h-auto rounded-md border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    CONTROL_SURFACE_CLASS,
                    fieldConfig.inputClassName,
                    (fieldConfig.readOnly || isReadOnly) &&
                      "cursor-default font-mono text-xs opacity-75",
                  )}
                />
              )}
            </FormControl>
            {fieldConfig.descriptionKey ? (
              <FormDescription className="m-0 text-xs leading-normal text-muted-foreground">
                {t(fieldConfig.descriptionKey)}
              </FormDescription>
            ) : null}
            <FormMessage className="mt-1 text-xs text-destructive" />
          </FormItem>
        )}
      />
    );
  }

  function renderSkillBooleanField(fieldConfig: FieldConfig<SkillFormData>) {
    return (
      <FormField
        key={fieldConfig.name}
        control={control}
        name={fieldConfig.name}
        render={({ field }) => (
          <FormItem className="flex flex-col gap-1">
            <div
              data-slot="skill-boolean-option"
              className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-background/60 px-3 py-3 shadow-xs"
              onPointerDown={
                isReadOnly
                  ? (event) => {
                      event.preventDefault();
                      handleReadonlyAttempt();
                    }
                  : undefined
              }
            >
              <div className="min-w-0 flex-1">
                <FormLabel className={TYPOGRAPHY.fieldLabel}>{t(fieldConfig.labelKey)}</FormLabel>
                {fieldConfig.descriptionKey ? (
                  <FormDescription className="m-0 text-xs leading-normal text-muted-foreground">
                    {t(fieldConfig.descriptionKey)}
                  </FormDescription>
                ) : null}
              </div>
              <FormControl>
                <Switch
                  checked={!!field.value}
                  onCheckedChange={(checked) => {
                    if (isReadOnly) {
                      handleReadonlyAttempt();
                      return;
                    }
                    field.onChange(checked);
                    syncMarkdownFromForm({
                      [fieldConfig.name]: checked,
                    } as Partial<SkillFormData>);
                  }}
                  aria-disabled={isReadOnly}
                />
              </FormControl>
            </div>
            <FormMessage className="mt-1 text-xs text-destructive" />
          </FormItem>
        )}
      />
    );
  }

  function renderFileTreeEntry(entry: SkillFileTreeEntry) {
    const Icon = entry.kind === "directory" ? Folder : FileText;
    const depth = entry.path.split("/").length - 1;
    const basename = entry.path.split("/").pop() ?? entry.path;
    return (
      <li
        key={entry.path}
        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-t border-border/70 py-2 pr-3 first:border-t-0"
        // 文件树层级来自路径深度，只能用内联 style 承载动态缩进值。
        style={{ paddingLeft: `calc(${depth} * 1rem + 0.75rem)` }}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <code title={entry.path} className="min-w-0 truncate font-mono text-xs text-foreground">
          {basename}
        </code>
        {entry.kind === "file" ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {entry.isBinary ? (
              <Badge
                variant="secondary"
                className="skill-file-binary-tag rounded bg-muted px-1 py-px text-xs font-semibold text-muted-foreground"
              >
                {t("skills.binaryFile")}
              </Badge>
            ) : null}
            <span className="font-mono text-xs text-muted-foreground">
              {t("skills.fileSizeBytes").replace("{size}", String(entry.size))}
            </span>
          </div>
        ) : null}
      </li>
    );
  }

  useImperativeHandle(ref, () => ({
    isDirty: () => isDirty,
    canSave: () => canSave,
    save: handleSaveClick,
  }));

  return (
    <Form {...form}>
      <div className="flex h-full min-h-0 w-full min-w-[560px] bg-secondary">
        <div
          className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-secondary"
          role="dialog"
          aria-modal="true"
        >
          <form className="flex h-full min-h-0 flex-col" onSubmit={handleSubmit(handleSkillSubmit)}>
            {/* 顶部操作栏 */}
            <div
              className={cn(
                "sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between gap-3 border-b px-5",
                TOOLBAR_SURFACE_CLASS,
              )}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label={t("common.close")}
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </Button>
              <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
                {isEditing ? t("skills.editTitle") : t("skills.addTitle")}
              </h2>
              <div className="flex shrink-0 items-center gap-2">
                {isEditing ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleOpenInEditor}
                    aria-label={t("skills.openInEditor")}
                  >
                    <FolderOpen className="size-3.5" aria-hidden="true" />
                    <span>{t("skills.openDirectory")}</span>
                  </Button>
                ) : null}
                {!isReadOnly ? (
                  <Button type="submit" disabled={!canSave}>
                    {t("skills.save")}
                  </Button>
                ) : null}
              </div>
            </div>

            {/* 正文区域 */}
            <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto bg-secondary px-6 py-6 pb-6 [&>*]:shrink-0 [&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]">
              {/* 大徽章头像 */}
              <ProfileNameBadge name={watchId || skill?.id} size="lg" fallbackChar="S" />

              <section
                data-slot="skill-editor-section"
                className={cn("flex flex-col gap-4 rounded-lg border p-4", PANEL_SURFACE_CLASS)}
              >
                {primaryFields.map(renderSkillField)}

                {/* 高级开关：disable-model-invocation 和 user-invocable */}
                <div className="flex flex-col gap-1">
                  {SKILL_BOOLEAN_FIELDS.map(renderSkillBooleanField)}
                </div>
              </section>

              {/* Markdown 内容编辑器 */}
              <section
                data-slot="skill-editor-section"
                className={cn("flex flex-col gap-3 rounded-lg border p-4", PANEL_SURFACE_CLASS)}
              >
                <label className="text-sm font-medium text-foreground">{t("skills.content")}</label>
                <FormField
                  control={control}
                  name="content"
                  render={() => (
                    <div
                      className={cn(
                        "skill-editor-wrap overflow-hidden rounded-md border border-border/80 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/50 [&_.cm-editor]:min-h-[360px] [&_.cm-editor]:text-[13px] [&_.cm-editor]:leading-[1.6] [&_.cm-editor.cm-focused]:outline-none [&_.cm-scroller]:font-mono [&_.cm-scroller]:overflow-auto",
                        CONTROL_SURFACE_CLASS,
                      )}
                    >
                      <div className="skill-editor-toolbar flex items-center gap-1 border-b border-border/80 bg-muted/50 px-2 py-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="skill-toolbar-btn border-border bg-transparent text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-accent dark:hover:text-foreground"
                          title={t("skills.toolbar.heading")}
                          disabled={isPreviewMode}
                          onClick={() =>
                            insertAtLineStart(`## ${t("skills.toolbar.headingPlaceholder")}\n`)
                          }
                        >
                          H
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="skill-toolbar-btn skill-toolbar-btn-bold border-border bg-transparent text-xs font-black text-muted-foreground italic hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-accent dark:hover:text-foreground"
                          title={t("skills.toolbar.bold")}
                          disabled={isPreviewMode}
                          onClick={insertBold}
                        >
                          B
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="skill-toolbar-btn border-border bg-transparent text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-accent dark:hover:text-foreground"
                          title={t("skills.toolbar.list")}
                          disabled={isPreviewMode}
                          onClick={() =>
                            insertAtLineStart(`- ${t("skills.toolbar.listPlaceholder")}\n`)
                          }
                        >
                          ≡
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="skill-toolbar-btn border-border bg-transparent text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-accent dark:hover:text-foreground"
                          title={t("skills.toolbar.code")}
                          disabled={isPreviewMode}
                          onClick={() => insertAtCursor("```\n\n```")}
                        >
                          &lt;/&gt;
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-xs"
                          className="skill-toolbar-btn skill-toolbar-preview-toggle ml-auto border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:border-primary dark:hover:bg-accent dark:hover:text-foreground"
                          aria-label={t(
                            isPreviewMode ? "skills.toolbar.source" : "skills.toolbar.preview",
                          )}
                          title={t(
                            isPreviewMode ? "skills.toolbar.source" : "skills.toolbar.preview",
                          )}
                          aria-pressed={isPreviewMode}
                          onClick={() =>
                            setEditorMode((current) =>
                              current === "preview" ? "source" : "preview",
                            )
                          }
                        >
                          {isPreviewMode ? (
                            <Code2 className="size-3.5" aria-hidden="true" />
                          ) : (
                            <Eye className="size-3.5" aria-hidden="true" />
                          )}
                        </Button>
                      </div>
                      {isPreviewMode ? (
                        <MarkdownPreview
                          className="skill-markdown-preview min-h-[360px] max-h-[60vh] overflow-auto bg-background/80 px-5 py-4 text-xs text-foreground [&_pre]:my-3 [&_pre]:bg-transparent [&_pre]:p-0 [&_pre>div]:m-0 [&_.markdown-preview-image-fallback]:inline-block [&_.markdown-preview-image-fallback]:rounded-sm [&_.markdown-preview-image-fallback]:border [&_.markdown-preview-image-fallback]:border-dashed [&_.markdown-preview-image-fallback]:border-border [&_.markdown-preview-image-fallback]:px-2 [&_.markdown-preview-image-fallback]:py-0.5 [&_.markdown-preview-image-fallback]:text-xs [&_.markdown-preview-image-fallback]:text-muted-foreground"
                          content={skillMarkdown}
                          themeType={previewThemeType}
                        />
                      ) : (
                        <div onPointerDownCapture={isReadOnly ? handleReadonlyAttempt : undefined}>
                          <CodeMirror
                            ref={editorRef}
                            value={skillMarkdown}
                            onChange={isReadOnly ? undefined : handleMarkdownChange}
                            readOnly={isReadOnly}
                            editable={!isReadOnly}
                            extensions={[markdown(), EditorView.lineWrapping]}
                            theme={editorTheme}
                            placeholder={t("skills.contentPlaceholder")}
                            basicSetup={{
                              lineNumbers: true,
                              bracketMatching: false,
                              indentOnInput: false,
                              foldGutter: false,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                />
              </section>

              {/* 支持文件区（仅编辑模式可用） */}
              {isEditing && !isReadOnly && (
                <CollapsibleSection
                  title={t("skills.files")}
                  badge={fileTree.length}
                  defaultExpanded
                >
                  <div
                    className={cn(
                      "skill-files-tree overflow-hidden rounded-md border",
                      PANEL_SURFACE_CLASS,
                    )}
                  >
                    {sortedFileTree.length > 0 ? (
                      <ul className="m-0 flex flex-col p-0">
                        {sortedFileTree.map(renderFileTreeEntry)}
                      </ul>
                    ) : (
                      <div className="px-3 py-3 text-xs text-muted-foreground">
                        {t("skills.fileTreeEmpty")}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 border-t border-border/70 px-3 py-2">
                      <p className="m-0 text-xs text-muted-foreground">
                        {t("skills.fileTreeReadonlyHint")}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={handleOpenInEditor}
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        {t("skills.openInEditor")}
                      </Button>
                    </div>
                  </div>
                </CollapsibleSection>
              )}
            </div>
          </form>
        </div>
      </div>
    </Form>
  );
});

export default SkillEditor;
