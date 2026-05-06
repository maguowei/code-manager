import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { zodResolver } from "@hookform/resolvers/zod";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useEffect, useRef, useState } from "react";
import { Controller, type FieldError, type Resolver, useForm } from "react-hook-form";
import { useCodeMirrorTheme } from "../hooks/useCodeMirrorTheme";
import { type TranslationKey, useI18n } from "../i18n";
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
import { CheckCircleIcon, ChevronLeftIcon, CodeIcon, EyeIcon } from "./Icons";
import SchemaFormField from "./SchemaFormField";
import "./MemoryEditor.css";
import { useTheme } from "./theme-provider";

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
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MemoryFormData>({
    resolver: zodResolver(MemorySchema) as Resolver<MemoryFormData>,
    defaultValues,
    mode: "onBlur",
  });
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
    <div className="editor-drawer-container">
      <div
        className="editor-panel"
        role="dialog"
        aria-labelledby="memory-modal-title"
        aria-modal="true"
      >
        <form id="memory-form" onSubmit={handleSubmit(handleFormSubmit)}>
          <div className="editor-header">
            <button
              type="button"
              className="editor-back-btn"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <ChevronLeftIcon />
            </button>
            <h2 id="memory-modal-title">{memory ? t("memory.editTitle") : t("memory.addTitle")}</h2>
            <button type="submit" className="editor-save-btn" disabled={!watchName?.trim()}>
              {t("memory.save")}
            </button>
          </div>

          <div className="editor-body">
            <div className="editor-badge-large">
              <span>{watchName ? watchName.charAt(0).toUpperCase() : "M"}</span>
            </div>

            <SchemaFormField
              field={MEMORY_NAME_FIELD}
              register={register}
              control={control}
              error={errors.name as FieldError | undefined}
            />

            <div className="form-group memory-target-field">
              <div id="memory-target-type-label" className="memory-target-label label-required">
                <span>{t("memory.targetType")}</span>
                <span className="required-badge">{t("form.required")}</span>
              </div>
              <Controller
                name="targetType"
                control={control}
                render={({ field }) => (
                  <div
                    className="memory-target-card-group"
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
                          className={`memory-target-card${isSelected ? " is-selected" : ""}`}
                          htmlFor={optionId}
                        >
                          <input
                            ref={field.ref}
                            id={optionId}
                            className="memory-target-input"
                            type="radio"
                            name={field.name}
                            value={option.value}
                            checked={isSelected}
                            aria-describedby={descriptionId}
                            onBlur={field.onBlur}
                            onChange={() => field.onChange(option.value)}
                          />
                          <span className="memory-target-card-content">
                            <span className="memory-target-card-main">
                              <span className="memory-target-card-title">{t(option.labelKey)}</span>
                              <span className="memory-target-card-check" aria-hidden="true">
                                <CheckCircleIcon size={18} />
                              </span>
                            </span>
                            <span id={descriptionId} className="memory-target-card-description">
                              {t(option.descriptionKey)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              />
              {errors.targetType?.message ? (
                <span className="field-error">
                  {t(errors.targetType.message as TranslationKey)}
                </span>
              ) : null}
            </div>

            {watchTargetType === "rule" && (
              <>
                <SchemaFormField
                  field={MEMORY_RULE_PATH_FIELD}
                  register={register}
                  control={control}
                  error={errors.rulePath as FieldError | undefined}
                />
                <div className="memory-advanced-rules">
                  <button
                    type="button"
                    className="memory-advanced-rules-toggle"
                    aria-expanded={isPathPatternsOpen}
                    aria-controls={pathPatternsPanelId}
                    onClick={() => setIsPathPatternsOpen((isOpen) => !isOpen)}
                  >
                    <span>{t("memory.advancedRules")}</span>
                    <ChevronLeftIcon
                      size={16}
                      className={`memory-advanced-rules-icon${
                        isPathPatternsOpen ? " is-open" : ""
                      }`}
                    />
                  </button>
                  {isPathPatternsOpen ? (
                    <div id={pathPatternsPanelId} className="memory-advanced-rules-panel">
                      <SchemaFormField
                        field={MEMORY_PATH_PATTERNS_FIELD}
                        register={register}
                        control={control}
                        error={errors.pathPatternsText as FieldError | undefined}
                      />
                    </div>
                  ) : null}
                </div>
              </>
            )}

            <div className="form-group">
              <label>{t("memory.content")}</label>
              <div className="memory-editor">
                <div className="memory-editor-toolbar">
                  {/* 标题 */}
                  <button
                    type="button"
                    className="memory-toolbar-btn"
                    title={t("memory.toolbar.heading")}
                    disabled={isPreviewMode}
                    onClick={() =>
                      insertAtLineStart(`## ${t("memory.toolbar.headingPlaceholder")}\n`)
                    }
                  >
                    H
                  </button>
                  {/* 加粗 */}
                  <button
                    type="button"
                    className="memory-toolbar-btn memory-toolbar-btn-bold"
                    title={t("memory.toolbar.bold")}
                    disabled={isPreviewMode}
                    onClick={insertBold}
                  >
                    B
                  </button>
                  {/* 列表 */}
                  <button
                    type="button"
                    className="memory-toolbar-btn"
                    title={t("memory.toolbar.list")}
                    disabled={isPreviewMode}
                    onClick={() => insertAtLineStart(`- ${t("memory.toolbar.listPlaceholder")}\n`)}
                  >
                    ≡
                  </button>
                  {/* 代码块 */}
                  <button
                    type="button"
                    className="memory-toolbar-btn"
                    title={t("memory.toolbar.code")}
                    disabled={isPreviewMode}
                    onClick={() => insertAtCursor("```\n\n```")}
                  >
                    &lt;/&gt;
                  </button>
                  <button
                    type="button"
                    className="memory-toolbar-btn memory-toolbar-preview-toggle"
                    aria-label={t(
                      isPreviewMode ? "memory.toolbar.source" : "memory.toolbar.preview",
                    )}
                    title={t(isPreviewMode ? "memory.toolbar.source" : "memory.toolbar.preview")}
                    aria-pressed={isPreviewMode}
                    onClick={() =>
                      setEditorMode((current) => (current === "preview" ? "source" : "preview"))
                    }
                  >
                    {isPreviewMode ? <CodeIcon size={14} /> : <EyeIcon size={14} />}
                  </button>
                </div>
                <Controller
                  name="content"
                  control={control}
                  render={({ field }) =>
                    isPreviewMode ? (
                      <MarkdownPreview
                        className="memory-markdown-preview"
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
                    )
                  }
                />
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MemoryEditor;
