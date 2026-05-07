import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { zodResolver } from "@hookform/resolvers/zod";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { ChevronLeft, CircleCheck, Code2, Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  suggestRulePathFromName,
  toMemoryPayload,
} from "../schemas/memory-schema";
import type { Memory, MemoryTargetType } from "../types";
import MarkdownPreview from "./claude-overview/MarkdownPreview";
import ProfileNameBadge from "./ProfileNameBadge";
import { useTheme } from "./theme-provider";
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
  }) => void;
  onClose: () => void;
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

function MemoryEditor({ memory, onSave, onClose }: MemoryEditorProps) {
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
  const { control, handleSubmit, watch, setValue } = form;
  const watchName = watch("name");
  const watchContent = watch("content");
  const watchTargetType = watch("targetType");
  const watchRulePath = watch("rulePath");
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

  function handleFormSubmit(data: MemoryFormData) {
    onSave(toMemoryPayload(data));
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

  return (
    <Form {...form}>
      <div className="editor-drawer-container">
        <div
          className="editor-panel"
          role="dialog"
          aria-labelledby="memory-modal-title"
          aria-modal="true"
        >
          <form id="memory-form" onSubmit={handleSubmit(handleFormSubmit)}>
            <div className="editor-header">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="editor-back-btn"
                onClick={onClose}
                aria-label={t("common.close")}
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </Button>
              <h2 id="memory-modal-title">
                {memory ? t("memory.editTitle") : t("memory.addTitle")}
              </h2>
              <Button type="submit" className="editor-save-btn" disabled={!watchName?.trim()}>
                {t("memory.save")}
              </Button>
            </div>

            <div className="editor-body">
              <ProfileNameBadge
                name={watchName}
                size="lg"
                fallbackChar="M"
                className="editor-badge-large"
              />

              <FormField
                control={control}
                name={MEMORY_NAME_FIELD.name}
                render={({ field }) => (
                  <FormItem className="form-group flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <FormLabel className="text-[length:var(--font-base)] font-medium text-[var(--foreground)]">
                        {t(MEMORY_NAME_FIELD.labelKey)}
                      </FormLabel>
                      <span className="required-badge inline-flex items-center justify-center rounded-full bg-[var(--accent-red-bg)] px-1.5 py-px text-[length:var(--font-xs)] font-semibold text-[var(--accent-red)]">
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
                        className="h-auto rounded-[var(--radius-md)] border-[var(--border-default)] bg-[var(--card)] px-3 py-2.5 text-[length:var(--font-base)] text-[var(--foreground)] placeholder:text-[var(--text-muted)] hover:border-[var(--text-muted)] focus-visible:border-[var(--primary)] focus-visible:ring-[3px] focus-visible:ring-[var(--accent)]"
                      />
                    </FormControl>
                    <FormMessage className="field-error mt-1 text-[11px] text-[var(--accent-red)]" />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="targetType"
                render={({ field }) => (
                  <FormItem className="form-group memory-target-field flex flex-col gap-2">
                    <div
                      id="memory-target-type-label"
                      className="memory-target-label label-required flex items-center gap-2 text-[length:var(--font-base)] font-medium text-[var(--foreground)]"
                    >
                      <span>{t("memory.targetType")}</span>
                      <span className="required-badge inline-flex items-center justify-center rounded-full bg-[var(--accent-red-bg)] px-1.5 py-px text-[length:var(--font-xs)] font-semibold text-[var(--accent-red)]">
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
                                  "memory-target-card-content flex min-h-[92px] flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--card)] p-3.5 text-[var(--text-secondary)] transition-[border-color,background-color,box-shadow,color] duration-150 group-hover/memory-target:border-[var(--text-muted)] group-hover/memory-target:bg-[var(--secondary)]",
                                  isSelected &&
                                    "border-[var(--primary)] bg-[var(--accent)] text-[var(--foreground)] shadow-[0_0_0_1px_var(--primary)_inset]",
                                )}
                              >
                                <span className="memory-target-card-main flex items-center justify-between gap-2">
                                  <span className="memory-target-card-title min-w-0 truncate text-[length:var(--font-base)] leading-snug font-bold text-[var(--foreground)]">
                                    {t(option.labelKey)}
                                  </span>
                                  <span
                                    className={cn(
                                      "memory-target-card-check inline-flex shrink-0 items-center justify-center text-[var(--text-muted)] opacity-0",
                                      isSelected && "text-[var(--primary)] opacity-100",
                                    )}
                                    aria-hidden="true"
                                  >
                                    <CircleCheck className="size-[18px]" aria-hidden="true" />
                                  </span>
                                </span>
                                <span
                                  id={descriptionId}
                                  className={cn(
                                    "memory-target-card-description text-[length:var(--font-sm)] leading-normal text-[var(--text-muted)] [overflow-wrap:anywhere]",
                                    isSelected && "text-[var(--text-secondary)]",
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
                    <FormMessage className="field-error mt-1 text-[11px] text-[var(--accent-red)]" />
                  </FormItem>
                )}
              />

              {watchTargetType === "rule" && (
                <>
                  <FormField
                    control={control}
                    name={MEMORY_RULE_PATH_FIELD.name}
                    render={({ field }) => (
                      <FormItem className="form-group flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <FormLabel className="text-[length:var(--font-base)] font-medium text-[var(--foreground)]">
                            {t(MEMORY_RULE_PATH_FIELD.labelKey)}
                          </FormLabel>
                          <span className="required-badge inline-flex items-center justify-center rounded-full bg-[var(--accent-red-bg)] px-1.5 py-px text-[length:var(--font-xs)] font-semibold text-[var(--accent-red)]">
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
                            className="h-auto rounded-[var(--radius-md)] border-[var(--border-default)] bg-[var(--card)] px-3 py-2.5 text-[length:var(--font-base)] text-[var(--foreground)] placeholder:text-[var(--text-muted)] hover:border-[var(--text-muted)] focus-visible:border-[var(--primary)] focus-visible:ring-[3px] focus-visible:ring-[var(--accent)]"
                          />
                        </FormControl>
                        {MEMORY_RULE_PATH_FIELD.descriptionKey ? (
                          <FormDescription className="form-hint text-[length:var(--font-sm)] leading-normal text-[var(--text-muted)]">
                            {t(MEMORY_RULE_PATH_FIELD.descriptionKey)}
                          </FormDescription>
                        ) : null}
                        <FormMessage className="field-error mt-1 text-[11px] text-[var(--accent-red)]" />
                      </FormItem>
                    )}
                  />
                  <div className="memory-advanced-rules overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--card)]">
                    <Button
                      type="button"
                      variant="ghost"
                      className="memory-advanced-rules-toggle h-auto w-full justify-between gap-2 rounded-none px-3.5 py-3 text-[length:var(--font-base)] font-semibold text-[var(--foreground)] hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)]"
                      aria-expanded={isPathPatternsOpen}
                      aria-controls={pathPatternsPanelId}
                      onClick={() => setIsPathPatternsOpen((isOpen) => !isOpen)}
                    >
                      <span>{t("memory.advancedRules")}</span>
                      <ChevronLeft
                        className={cn(
                          "memory-advanced-rules-icon size-4 shrink-0 text-[var(--text-muted)] transition-transform duration-150 -rotate-90",
                          isPathPatternsOpen && "is-open rotate-90",
                        )}
                        aria-hidden="true"
                      />
                    </Button>
                    {isPathPatternsOpen ? (
                      <div
                        id={pathPatternsPanelId}
                        className="memory-advanced-rules-panel border-t border-[var(--border-default)] px-3.5 pt-3 pb-3.5"
                      >
                        <FormField
                          control={control}
                          name={MEMORY_PATH_PATTERNS_FIELD.name}
                          render={({ field }) => (
                            <FormItem className="form-group flex flex-col gap-3">
                              <FormLabel className="text-[length:var(--font-base)] font-medium text-[var(--foreground)]">
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
                                  className="rounded-[var(--radius-md)] border-[var(--border-default)] bg-[var(--card)] px-3 py-2.5 text-[length:var(--font-base)] text-[var(--foreground)] placeholder:text-[var(--text-muted)] hover:border-[var(--text-muted)] focus-visible:border-[var(--primary)] focus-visible:ring-[3px] focus-visible:ring-[var(--accent)]"
                                />
                              </FormControl>
                              {MEMORY_PATH_PATTERNS_FIELD.descriptionKey ? (
                                <FormDescription className="form-hint text-[length:var(--font-sm)] leading-normal text-[var(--text-muted)]">
                                  {t(MEMORY_PATH_PATTERNS_FIELD.descriptionKey)}
                                </FormDescription>
                              ) : null}
                              <FormMessage className="field-error mt-1 text-[11px] text-[var(--accent-red)]" />
                            </FormItem>
                          )}
                        />
                      </div>
                    ) : null}
                  </div>
                </>
              )}

              <div className="form-group flex flex-col gap-3">
                <label className="text-[length:var(--font-base)] font-medium text-[var(--foreground)]">
                  {t("memory.content")}
                </label>
                <FormField
                  control={control}
                  name="content"
                  render={({ field }) => (
                    <div className="memory-editor overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] focus-within:border-[var(--primary)] focus-within:shadow-[0_0_0_3px_var(--accent)] dark:border-[var(--border-default)] [&_.cm-editor]:min-h-[300px] [&_.cm-editor]:text-[13px] [&_.cm-editor]:leading-[1.6] [&_.cm-editor.cm-focused]:outline-none [&_.cm-scroller]:font-mono [&_.cm-scroller]:overflow-auto">
                      <div className="memory-editor-toolbar flex items-center gap-1 border-b border-[#e0e0e0] bg-[#f5f5f7] px-2 py-1.5 dark:border-[#3e4452] dark:bg-[#21252b]">
                        {/* 标题 */}
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="memory-toolbar-btn border-black/15 bg-transparent text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/15 dark:text-[#abb2bf] dark:hover:bg-white/10 dark:hover:text-[#e5e7eb]"
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
                          className="memory-toolbar-btn memory-toolbar-btn-bold border-black/15 bg-transparent text-xs font-black text-[var(--text-secondary)] italic hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/15 dark:text-[#abb2bf] dark:hover:bg-white/10 dark:hover:text-[#e5e7eb]"
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
                          className="memory-toolbar-btn border-black/15 bg-transparent text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/15 dark:text-[#abb2bf] dark:hover:bg-white/10 dark:hover:text-[#e5e7eb]"
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
                          className="memory-toolbar-btn border-black/15 bg-transparent text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/15 dark:text-[#abb2bf] dark:hover:bg-white/10 dark:hover:text-[#e5e7eb]"
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
                          className="memory-toolbar-btn memory-toolbar-preview-toggle ml-auto border-black/15 bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)] aria-pressed:border-[var(--primary)] dark:border-white/15 dark:text-[#abb2bf] dark:hover:bg-white/10 dark:hover:text-[#e5e7eb]"
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
                          className="memory-markdown-preview min-h-[300px] max-h-[60vh] overflow-auto bg-[var(--card)] px-5 py-4 text-[length:var(--font-sm)] text-[var(--foreground)] [&_pre]:my-3 [&_pre]:bg-transparent [&_pre]:p-0 [&_pre>div]:m-0 [&_.markdown-preview-image-fallback]:inline-block [&_.markdown-preview-image-fallback]:rounded-[calc(var(--radius) - 4px)] [&_.markdown-preview-image-fallback]:border [&_.markdown-preview-image-fallback]:border-dashed [&_.markdown-preview-image-fallback]:border-[var(--border-default)] [&_.markdown-preview-image-fallback]:px-2 [&_.markdown-preview-image-fallback]:py-0.5 [&_.markdown-preview-image-fallback]:text-[length:var(--font-xs)] [&_.markdown-preview-image-fallback]:text-[var(--text-secondary)]"
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
              </div>
            </div>
          </form>
        </div>
      </div>
    </Form>
  );
}

export default MemoryEditor;
