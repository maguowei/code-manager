import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { zodResolver } from "@hookform/resolvers/zod";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useEffect, useRef } from "react";
import { Controller, type FieldError, type Resolver, useForm } from "react-hook-form";
import useEditorTheme from "../hooks/useEditorTheme";
import { type TranslationKey, useI18n } from "../i18n";
import {
  buildMemoryDefaultValues,
  MEMORY_NAME_FIELD,
  MEMORY_RULE_PATH_FIELD,
  type MemoryFormData,
  MemorySchema,
  suggestRulePathFromName,
  toMemoryPayload,
} from "../schemas/memory-schema";
import type { Memory, MemoryTargetType } from "../types";
import { CheckCircleIcon, ChevronLeftIcon } from "./Icons";
import SchemaFormField from "./SchemaFormField";
import "./MemoryEditor.css";

interface MemoryEditorProps {
  memory: Memory | null;
  onSave: (data: {
    id?: string;
    name: string;
    content: string;
    targetType: MemoryTargetType;
    rulePath?: string;
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
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const editorTheme = useEditorTheme();
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MemoryFormData>({
    resolver: zodResolver(MemorySchema) as Resolver<MemoryFormData>,
    defaultValues: buildMemoryDefaultValues(memory),
    mode: "onBlur",
  });
  const watchName = watch("name");
  const watchTargetType = watch("targetType");
  const watchRulePath = watch("rulePath");
  const lastSuggestedRulePath = useRef("");

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
              <SchemaFormField
                field={MEMORY_RULE_PATH_FIELD}
                register={register}
                control={control}
                error={errors.rulePath as FieldError | undefined}
              />
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
                    onClick={insertBold}
                  >
                    B
                  </button>
                  {/* 列表 */}
                  <button
                    type="button"
                    className="memory-toolbar-btn"
                    title={t("memory.toolbar.list")}
                    onClick={() => insertAtLineStart(`- ${t("memory.toolbar.listPlaceholder")}\n`)}
                  >
                    ≡
                  </button>
                  {/* 代码块 */}
                  <button
                    type="button"
                    className="memory-toolbar-btn"
                    title={t("memory.toolbar.code")}
                    onClick={() => insertAtCursor("```\n\n```")}
                  >
                    &lt;/&gt;
                  </button>
                </div>
                <Controller
                  name="content"
                  control={control}
                  render={({ field }) => (
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
