import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { zodResolver } from "@hookform/resolvers/zod";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { ChevronLeft, CircleCheck, Code2, Eye } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { useCodeMirrorTheme } from "../hooks/useCodeMirrorTheme";
import { type TranslationKey, useI18n } from "../i18n";
import { cn } from "../lib/utils";
import {
  buildMemoryDefaultValues,
  composeMemoryEditorContent,
  extractMemoryTitleHeading,
  MEMORY_NAME_FIELD,
  MEMORY_PATH_PATTERNS_FIELD,
  MEMORY_RULE_PATH_FIELD,
  type MemoryFormData,
  MemorySchema,
  stripMemoryTitleHeading,
  suggestRulePathFromName,
  toMemoryPayload,
} from "../schemas/memory-schema";
import type { Memory, MemoryTargetType } from "../types";
import MarkdownPreview from "./claude-overview/MarkdownPreview";
import ProfileNameBadge from "./ProfileNameBadge";
import {
  CONTROL_SURFACE_CLASS,
  PANEL_SURFACE_CLASS,
  SUBTLE_SURFACE_CLASS,
  TOOLBAR_SURFACE_CLASS,
} from "./surface-classes";
import { useTheme } from "./theme-provider";
import { TYPOGRAPHY } from "./typography-classes";
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
import { Textarea } from "./ui/textarea";

type MemoryEditorMode = "source" | "preview";
type MarkdownPreviewThemeType = "light" | "dark";

interface MemoryEditorProps {
  memory: Memory | null;
  onSave: (data: {
    id?: string;
    name: string;
    content: string;
    targetType: MemoryTargetType;
    rulePath?: string;
    pathPatterns?: string[];
  }) => unknown;
  onClose: () => void;
}

export interface MemoryEditorHandle {
  isDirty: () => boolean;
  canSave: () => boolean;
  save: () => Promise<boolean>;
}

const MEMORY_TARGET_OPTIONS: Array<{
  value: MemoryTargetType;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
}> = [
  {
    value: "claude",
    labelKey: "memory.targetType.claude",
    descriptionKey: "memory.targetType.claudeDescription",
  },
  {
    value: "rule",
    labelKey: "memory.targetType.rule",
    descriptionKey: "memory.targetType.ruleDescription",
  },
];

function splitMemoryPathPatterns(text: string) {
  const patterns: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const pattern = line.trim();
    if (pattern && !patterns.includes(pattern)) {
      patterns.push(pattern);
    }
  }
  return patterns;
}

function normalizeMemoryFormData(data: MemoryFormData) {
  const id = data.id.trim();
  const rulePath = data.rulePath.trim();
  return {
    id: id || undefined,
    name: data.name.trim(),
    content: stripMemoryTitleHeading(data.content),
    targetType: data.targetType,
    rulePath: data.targetType === "rule" && rulePath ? rulePath : undefined,
    pathPatterns:
      data.targetType === "rule" ? splitMemoryPathPatterns(data.pathPatternsText) : undefined,
  };
}

function memorySaveDataEquals(
  left: ReturnType<typeof normalizeMemoryFormData>,
  right: ReturnType<typeof normalizeMemoryFormData>,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const MemoryEditor = forwardRef<MemoryEditorHandle, MemoryEditorProps>(function MemoryEditor(
  { memory, onSave, onClose },
  ref,
) {
  const { t } = useI18n();
  const { isDark } = useTheme();
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const editorTheme = useCodeMirrorTheme();
  const previewThemeType: MarkdownPreviewThemeType = isDark ? "dark" : "light";
  const [editorMode, setEditorMode] = useState<MemoryEditorMode>("source");
  const hasInitialPathPatterns = (memory?.pathPatterns ?? []).some(
    (pattern) => pattern.trim().length > 0,
  );
  const [isPathPatternsOpen, setIsPathPatternsOpen] = useState(hasInitialPathPatterns);
  const defaultValues = buildMemoryDefaultValues(memory);
  const form = useForm<MemoryFormData>({
    resolver: zodResolver(MemorySchema) as Resolver<MemoryFormData>,
    defaultValues,
    mode: "onBlur",
  });
  const { control, getValues, handleSubmit, setValue, trigger, watch } = form;
  const watchName = watch("name");
  const watchContent = watch("content");
  const watchTargetType = watch("targetType");
  const watchRulePath = watch("rulePath");
  const watchPathPatternsText = watch("pathPatternsText");
  const initialSaveDataRef = useRef(normalizeMemoryFormData(defaultValues));
  const lastSyncedTitle = useRef(
    extractMemoryTitleHeading(defaultValues.content) ?? defaultValues.name.trim(),
  );
  const lastSuggestedRulePath = useRef("");
  const pathPatternsPanelId = "memory-path-patterns-panel";
  const isPreviewMode = editorMode === "preview";

  useEffect(() => {
    setIsPathPatternsOpen(hasInitialPathPatterns);
  }, [hasInitialPathPatterns]);

  useEffect(() => {
    if (memory?.rulePath || watchTargetType !== "rule") return;

    const currentPath = watchRulePath.trim();
    if (currentPath && currentPath !== lastSuggestedRulePath.current) return;

    const suggested = suggestRulePathFromName(watchName);
    lastSuggestedRulePath.current = suggested;
    setValue("rulePath", suggested, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [memory?.rulePath, setValue, watchName, watchRulePath, watchTargetType]);

  useEffect(() => {
    const nameTitle = watchName.trim();
    const contentTitle = extractMemoryTitleHeading(watchContent);
    const previousTitle = lastSyncedTitle.current;

    if (contentTitle && contentTitle !== nameTitle && contentTitle !== previousTitle) {
      lastSyncedTitle.current = contentTitle;
      setValue("name", contentTitle, {
        shouldDirty: true,
        shouldValidate: true,
      });
      return;
    }

    if (!nameTitle) {
      lastSyncedTitle.current = "";
      return;
    }

    if (contentTitle === nameTitle) {
      lastSyncedTitle.current = nameTitle;
      return;
    }

    if (contentTitle && contentTitle !== previousTitle) {
      return;
    }

    const nextContent = composeMemoryEditorContent(nameTitle, watchContent);
    if (nextContent === watchContent) {
      lastSyncedTitle.current = nameTitle;
      return;
    }

    lastSyncedTitle.current = nameTitle;
    setValue("content", nextContent, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [setValue, watchContent, watchName]);

  async function saveMemoryForm(data: MemoryFormData) {
    const result = await onSave(toMemoryPayload(data));
    return result !== false;
  }

  async function handleFormSubmit(data: MemoryFormData) {
    await saveMemoryForm(data);
  }

  async function handleSaveClick() {
    if (!canSaveMemory) {
      return false;
    }

    const isValid = await trigger();
    if (!isValid) {
      return false;
    }

    const parsed = MemorySchema.safeParse(getValues());
    if (!parsed.success) {
      return false;
    }

    return saveMemoryForm(parsed.data);
  }

  // 在光标位置插入文本（选中文字时替换）
  function insertAtCursor(text: string) {
    const view = editorRef.current?.view;
    if (!view) return;
    view.dispatch(view.state.replaceSelection(text));
    view.focus();
  }

  // 在当前行行首插入前缀
  function insertAtLineStart(prefix: string) {
    const view = editorRef.current?.view;
    if (!view) return;
    const { from } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    view.dispatch({ changes: { from: line.from, insert: prefix } });
    view.focus();
  }

  // 加粗：选中文字时包裹，否则插入占位符
  function insertBold() {
    const view = editorRef.current?.view;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    view.dispatch(
      view.state.replaceSelection(
        selected ? `**${selected}**` : `**${t("memory.toolbar.boldPlaceholder")}**`,
      ),
    );
    view.focus();
  }

  const currentFormData: MemoryFormData = {
    ...defaultValues,
    name: watchName,
    content: watchContent,
    targetType: watchTargetType,
    rulePath: watchRulePath,
    pathPatternsText: watchPathPatternsText,
  };
  const currentSaveData = normalizeMemoryFormData(currentFormData);
  const isDirty = !memorySaveDataEquals(initialSaveDataRef.current, currentSaveData);
  const canSaveMemory = MemorySchema.safeParse(currentFormData).success;

  useImperativeHandle(ref, () => ({
    isDirty: () => isDirty,
    canSave: () => canSaveMemory,
    save: handleSaveClick,
  }));

  return (
    <Form {...form}>
      <div className="flex h-full min-h-0 w-full min-w-[560px] bg-secondary">
        <div
          className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-secondary"
          role="dialog"
          aria-labelledby="memory-modal-title"
          aria-modal="true"
        >
          <form
            id="memory-form"
            className="flex h-full min-h-0 flex-col"
            onSubmit={handleSubmit(handleFormSubmit)}
          >
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
              <h2
                id="memory-modal-title"
                className={cn("min-w-0 flex-1 truncate", TYPOGRAPHY.drawerTitle)}
              >
                {memory ? t("memory.editTitle") : t("memory.addTitle")}
              </h2>
              <Button type="submit" disabled={!canSaveMemory}>
                {t("memory.save")}
              </Button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto bg-secondary px-6 py-6 pb-6 [&>*]:shrink-0 [&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]">
              <ProfileNameBadge name={watchName} size="lg" fallbackChar="M" />

              <section
                data-slot="memory-editor-section"
                className={cn("flex flex-col gap-4 rounded-lg border p-4", PANEL_SURFACE_CLASS)}
              >
                <FormField
                  control={control}
                  name={MEMORY_NAME_FIELD.name}
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <FormLabel className="text-sm font-medium text-foreground">
                          {t(MEMORY_NAME_FIELD.labelKey)}
                        </FormLabel>
                        <span className="inline-flex items-center justify-center rounded-full bg-destructive/10 px-1.5 py-px text-xs font-semibold text-destructive">
                          {t("form.required")}
                        </span>
                      </div>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={
                            MEMORY_NAME_FIELD.placeholderKey
                              ? t(MEMORY_NAME_FIELD.placeholderKey)
                              : undefined
                          }
                          className={cn(
                            "h-auto rounded-md border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                            CONTROL_SURFACE_CLASS,
                          )}
                        />
                      </FormControl>
                      <FormMessage className="mt-1 text-xs text-destructive" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name="targetType"
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-2">
                      <div
                        id="memory-target-type-label"
                        className="memory-target-label label-required flex items-center gap-2 text-sm font-medium text-foreground"
                      >
                        <span>{t("memory.targetType")}</span>
                        <span className="inline-flex items-center justify-center rounded-full bg-destructive/10 px-1.5 py-px text-xs font-semibold text-destructive">
                          {t("form.required")}
                        </span>
                      </div>
                      <FormControl>
                        <div
                          className="memory-target-card-group grid grid-cols-2 gap-3 max-[640px]:grid-cols-1"
                          role="radiogroup"
                          aria-labelledby="memory-target-type-label"
                        >
                          {MEMORY_TARGET_OPTIONS.map((option) => {
                            const isSelected = field.value === option.value;
                            const optionId = `memory-target-${option.value}`;
                            const descriptionId = `${optionId}-description`;

                            return (
                              <label
                                key={option.value}
                                className={cn(
                                  "memory-target-card group/memory-target relative block min-w-0 cursor-pointer",
                                  isSelected && "is-selected",
                                )}
                                htmlFor={optionId}
                              >
                                <input
                                  ref={field.ref}
                                  id={optionId}
                                  className="memory-target-input pointer-events-none absolute size-px opacity-0"
                                  type="radio"
                                  name={field.name}
                                  value={option.value}
                                  checked={isSelected}
                                  aria-describedby={descriptionId}
                                  onBlur={field.onBlur}
                                  onChange={() => field.onChange(option.value)}
                                />
                                <span
                                  className={cn(
                                    "memory-target-card-content flex min-h-[92px] flex-col gap-2 rounded-md border p-3.5 text-muted-foreground transition-[border-color,background-color,color] duration-150 group-hover/memory-target:border-muted-foreground/60 group-hover/memory-target:bg-muted/50 group-focus-within/memory-target:border-primary/70 group-focus-within/memory-target:bg-muted/60",
                                    SUBTLE_SURFACE_CLASS,
                                    isSelected &&
                                      "border-primary bg-accent text-foreground ring-1 ring-primary/30",
                                  )}
                                >
                                  <span className="memory-target-card-main flex items-center justify-between gap-2">
                                    <span className="memory-target-card-title min-w-0 truncate text-sm leading-snug font-bold text-foreground">
                                      {t(option.labelKey)}
                                    </span>
                                    <span
                                      className={cn(
                                        "memory-target-card-check inline-flex shrink-0 items-center justify-center text-muted-foreground opacity-0",
                                        isSelected && "text-primary opacity-100",
                                      )}
                                      aria-hidden="true"
                                    >
                                      <CircleCheck className="size-[18px]" aria-hidden="true" />
                                    </span>
                                  </span>
                                  <span
                                    id={descriptionId}
                                    className={cn(
                                      "memory-target-card-description text-xs leading-normal text-muted-foreground [overflow-wrap:anywhere]",
                                      isSelected && "text-muted-foreground",
                                    )}
                                  >
                                    {t(option.descriptionKey)}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </FormControl>
                      <FormMessage className="mt-1 text-xs text-destructive" />
                    </FormItem>
                  )}
                />

                {watchTargetType === "rule" && (
                  <>
                    <FormField
                      control={control}
                      name={MEMORY_RULE_PATH_FIELD.name}
                      render={({ field }) => (
                        <FormItem className="flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <FormLabel className="text-sm font-medium text-foreground">
                              {t(MEMORY_RULE_PATH_FIELD.labelKey)}
                            </FormLabel>
                            <span className="inline-flex items-center justify-center rounded-full bg-destructive/10 px-1.5 py-px text-xs font-semibold text-destructive">
                              {t("form.required")}
                            </span>
                          </div>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder={
                                MEMORY_RULE_PATH_FIELD.placeholderKey
                                  ? t(MEMORY_RULE_PATH_FIELD.placeholderKey)
                                  : undefined
                              }
                              className={cn(
                                "h-auto rounded-md border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                                CONTROL_SURFACE_CLASS,
                              )}
                            />
                          </FormControl>
                          {MEMORY_RULE_PATH_FIELD.descriptionKey ? (
                            <FormDescription className="text-xs leading-normal text-muted-foreground">
                              {t(MEMORY_RULE_PATH_FIELD.descriptionKey)}
                            </FormDescription>
                          ) : null}
                          <FormMessage className="mt-1 text-xs text-destructive" />
                        </FormItem>
                      )}
                    />
                    <div
                      className={cn(
                        "memory-advanced-rules overflow-hidden rounded-md border",
                        PANEL_SURFACE_CLASS,
                      )}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        className="memory-advanced-rules-toggle h-auto w-full justify-between gap-2 rounded-none px-3.5 py-3 text-sm font-semibold text-foreground hover:bg-accent hover:text-foreground"
                        aria-expanded={isPathPatternsOpen}
                        aria-controls={pathPatternsPanelId}
                        onClick={() => setIsPathPatternsOpen((isOpen) => !isOpen)}
                      >
                        <span>{t("memory.advancedRules")}</span>
                        <ChevronLeft
                          className={cn(
                            "memory-advanced-rules-icon size-4 shrink-0 text-muted-foreground transition-transform duration-150 -rotate-90",
                            isPathPatternsOpen && "is-open rotate-90",
                          )}
                          aria-hidden="true"
                        />
                      </Button>
                      {isPathPatternsOpen ? (
                        <div
                          id={pathPatternsPanelId}
                          className="memory-advanced-rules-panel border-t border-border/80 px-3.5 pt-3 pb-3.5"
                        >
                          <FormField
                            control={control}
                            name={MEMORY_PATH_PATTERNS_FIELD.name}
                            render={({ field }) => (
                              <FormItem className="flex flex-col gap-3">
                                <FormLabel className="text-sm font-medium text-foreground">
                                  {t(MEMORY_PATH_PATTERNS_FIELD.labelKey)}
                                </FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...field}
                                    rows={MEMORY_PATH_PATTERNS_FIELD.rows}
                                    placeholder={
                                      MEMORY_PATH_PATTERNS_FIELD.placeholderKey
                                        ? t(MEMORY_PATH_PATTERNS_FIELD.placeholderKey)
                                        : undefined
                                    }
                                    className={cn(
                                      "rounded-md border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                                      CONTROL_SURFACE_CLASS,
                                    )}
                                  />
                                </FormControl>
                                {MEMORY_PATH_PATTERNS_FIELD.descriptionKey ? (
                                  <FormDescription className="text-xs leading-normal text-muted-foreground">
                                    {t(MEMORY_PATH_PATTERNS_FIELD.descriptionKey)}
                                  </FormDescription>
                                ) : null}
                                <FormMessage className="mt-1 text-xs text-destructive" />
                              </FormItem>
                            )}
                          />
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </section>

              <section
                data-slot="memory-editor-section"
                className={cn("flex flex-col gap-3 rounded-lg border p-4", PANEL_SURFACE_CLASS)}
              >
                <label className="text-sm font-medium text-foreground">{t("memory.content")}</label>
                <FormField
                  control={control}
                  name="content"
                  render={({ field }) => (
                    <div
                      className={cn(
                        "memory-editor overflow-hidden rounded-md border border-border/80 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/50 [&_.cm-editor]:min-h-[300px] [&_.cm-editor]:text-[13px] [&_.cm-editor]:leading-[1.6] [&_.cm-editor.cm-focused]:outline-none [&_.cm-scroller]:font-mono [&_.cm-scroller]:overflow-auto",
                        CONTROL_SURFACE_CLASS,
                      )}
                    >
                      <div className="memory-editor-toolbar flex items-center gap-1 border-b border-border/80 bg-muted/50 px-2 py-1.5">
                        {/* 标题 */}
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="memory-toolbar-btn border-border bg-transparent text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-accent dark:hover:text-foreground"
                          title={t("memory.toolbar.heading")}
                          disabled={isPreviewMode}
                          onClick={() =>
                            insertAtLineStart(`## ${t("memory.toolbar.headingPlaceholder")}\n`)
                          }
                        >
                          H
                        </Button>
                        {/* 加粗 */}
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="memory-toolbar-btn memory-toolbar-btn-bold border-border bg-transparent text-xs font-black text-muted-foreground italic hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-accent dark:hover:text-foreground"
                          title={t("memory.toolbar.bold")}
                          disabled={isPreviewMode}
                          onClick={insertBold}
                        >
                          B
                        </Button>
                        {/* 列表 */}
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="memory-toolbar-btn border-border bg-transparent text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-accent dark:hover:text-foreground"
                          title={t("memory.toolbar.list")}
                          disabled={isPreviewMode}
                          onClick={() =>
                            insertAtLineStart(`- ${t("memory.toolbar.listPlaceholder")}\n`)
                          }
                        >
                          ≡
                        </Button>
                        {/* 代码块 */}
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="memory-toolbar-btn border-border bg-transparent text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-accent dark:hover:text-foreground"
                          title={t("memory.toolbar.code")}
                          disabled={isPreviewMode}
                          onClick={() => insertAtCursor("```\n\n```")}
                        >
                          &lt;/&gt;
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-xs"
                          className="memory-toolbar-btn memory-toolbar-preview-toggle ml-auto border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:border-primary dark:hover:bg-accent dark:hover:text-foreground"
                          aria-label={t(
                            isPreviewMode ? "memory.toolbar.source" : "memory.toolbar.preview",
                          )}
                          title={t(
                            isPreviewMode ? "memory.toolbar.source" : "memory.toolbar.preview",
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
                          className="memory-markdown-preview min-h-[300px] max-h-[60vh] overflow-auto bg-background/80 px-5 py-4 text-xs text-foreground [&_pre]:my-3 [&_pre]:bg-transparent [&_pre]:p-0 [&_pre>div]:m-0 [&_.markdown-preview-image-fallback]:inline-block [&_.markdown-preview-image-fallback]:rounded-sm [&_.markdown-preview-image-fallback]:border [&_.markdown-preview-image-fallback]:border-dashed [&_.markdown-preview-image-fallback]:border-border [&_.markdown-preview-image-fallback]:px-2 [&_.markdown-preview-image-fallback]:py-0.5 [&_.markdown-preview-image-fallback]:text-xs [&_.markdown-preview-image-fallback]:text-muted-foreground"
                          content={field.value}
                          themeType={previewThemeType}
                        />
                      ) : (
                        <CodeMirror
                          ref={editorRef}
                          value={field.value}
                          onChange={field.onChange}
                          extensions={[markdown(), EditorView.lineWrapping]}
                          theme={editorTheme}
                          placeholder={t("memory.contentPlaceholder")}
                          basicSetup={{
                            lineNumbers: true,
                            bracketMatching: false,
                            indentOnInput: false,
                            foldGutter: false,
                          }}
                        />
                      )}
                    </div>
                  )}
                />
              </section>
            </div>
          </form>
        </div>
      </div>
    </Form>
  );
});

export default MemoryEditor;
