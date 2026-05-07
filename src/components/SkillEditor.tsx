import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { zodResolver } from "@hookform/resolvers/zod";
import { invoke } from "@tauri-apps/api/core";
import CodeMirror from "@uiw/react-codemirror";
import { ChevronLeft, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { useCodeMirrorTheme } from "../hooks/useCodeMirrorTheme";
import { useToast } from "../hooks/useToast";
import { type TranslationKey, useI18n } from "../i18n";
import { cn } from "../lib/utils";
import type { FieldConfig } from "../schemas/form-fields";
import {
  buildSkillFileDefaultValues,
  type SkillFileFormData,
  SkillFileSchema,
  toSkillFilePayload,
} from "../schemas/skill-file-schema";
import {
  buildSkillDefaultValues,
  buildSkillPrimaryFields,
  SKILL_BOOLEAN_FIELDS,
  type SkillFormData,
  SkillSchema,
  toSkillPayload,
} from "../schemas/skill-schema";
import type { Skill, SkillFile } from "../types";
import CollapsibleSection from "./CollapsibleSection";
import ConfirmAlertDialog from "./ConfirmAlertDialog";
import ProfileNameBadge from "./ProfileNameBadge";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
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

interface SkillEditorProps {
  skill: Skill | null; // null = 新建模式
  onSave: (skill: Skill) => void;
  onClose: () => void;
}

function SkillEditor({ skill, onSave, onClose }: SkillEditorProps) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const editorTheme = useCodeMirrorTheme();
  const isEditing = skill !== null;
  const primaryFields = buildSkillPrimaryFields(isEditing);

  const form = useForm<SkillFormData>({
    resolver: zodResolver(SkillSchema) as Resolver<SkillFormData>,
    defaultValues: buildSkillDefaultValues(skill),
    mode: "onBlur",
  });
  const { control, handleSubmit, watch } = form;
  const addFileForm = useForm<SkillFileFormData>({
    resolver: zodResolver(SkillFileSchema) as Resolver<SkillFileFormData>,
    defaultValues: buildSkillFileDefaultValues(),
    mode: "onBlur",
  });
  const editFileForm = useForm<SkillFileFormData>({
    resolver: zodResolver(SkillFileSchema) as Resolver<SkillFileFormData>,
    defaultValues: buildSkillFileDefaultValues(),
    mode: "onBlur",
  });

  // 支持文件相关状态
  const [files, setFiles] = useState<SkillFile[]>([]);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [showAddFile, setShowAddFile] = useState(false);
  const [pendingDeleteFile, setPendingDeleteFile] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const watchId = watch("id");
  const canSave = watchId.trim().length > 0 && !isSaving;

  // 编辑模式下进入页面时自动懒加载支持文件
  // CollapsibleSection 暂不支持 onExpand 回调，故在 isEditing && !filesLoaded 时通过 useEffect 触发
  // biome-ignore lint/correctness/useExhaustiveDependencies: 仅在 isEditing 变化时触发，filesLoaded/loadFiles 为稳定引用
  useEffect(() => {
    if (isEditing && !filesLoaded) {
      void loadFiles();
    }
  }, [isEditing]);

  // 懒加载支持文件（仅编辑模式下）
  async function loadFiles() {
    if (!skill || filesLoaded) return;
    try {
      const result = await invoke<SkillFile[]>("get_skill_files", {
        id: skill.id,
        isActive: skill.isActive,
      });
      setFiles(result);
      setFilesLoaded(true);
    } catch (_err) {
      showToast(t("toast.skillLoadError"), "error");
    }
  }

  // 提交表单，新建或更新 Skill
  async function handleSkillSubmit(data: SkillFormData) {
    setIsSaving(true);
    try {
      const payload = toSkillPayload(data);
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(msg || (isEditing ? t("toast.skillSaveError") : t("toast.skillAddError")), "error");
    } finally {
      setIsSaving(false);
    }
  }

  // 添加支持文件
  const submitAddFile = addFileForm.handleSubmit(async (data) => {
    if (!skill) return;
    try {
      const payload = toSkillFilePayload(data);
      const file = await invoke<SkillFile>("add_skill_file", {
        id: skill.id,
        isActive: skill.isActive,
        data: payload,
      });
      setFiles((prev) => [...prev, file]);
      addFileForm.reset(buildSkillFileDefaultValues());
      setShowAddFile(false);
      showToast(t("toast.skillFileAdded"));
    } catch (_err) {
      showToast(t("toast.skillFileAddError"), "error");
    }
  });

  // 保存已编辑的文件内容
  const submitEditFile = editFileForm.handleSubmit(async (data) => {
    if (!skill || !editingFile) return;
    try {
      const payload = toSkillFilePayload(data);
      const file = await invoke<SkillFile>("update_skill_file", {
        id: skill.id,
        isActive: skill.isActive,
        fileName: editingFile,
        data: payload,
      });
      setFiles((prev) => prev.map((current) => (current.name === editingFile ? file : current)));
      setEditingFile(null);
      editFileForm.reset(buildSkillFileDefaultValues());
      showToast(t("toast.skillFileSaved"));
    } catch (_err) {
      showToast(t("toast.skillFileSaveError"), "error");
    }
  });

  // 删除支持文件
  async function handleDeleteFile(fileName: string) {
    if (!skill) return;
    try {
      await invoke("delete_skill_file", {
        id: skill.id,
        isActive: skill.isActive,
        fileName,
      });
      setFiles((prev) => prev.filter((file) => file.name !== fileName));
      showToast(t("toast.skillFileDeleted"));
    } catch (_err) {
      showToast(t("toast.skillFileDeleteError"), "error");
    }
  }

  // 进入文件编辑模式
  function startEditFile(file: SkillFile) {
    setEditingFile(file.name);
    editFileForm.reset(buildSkillFileDefaultValues(file));
  }

  function cancelEditFile() {
    setEditingFile(null);
    editFileForm.reset(buildSkillFileDefaultValues());
  }

  function openAddFileForm() {
    addFileForm.reset(buildSkillFileDefaultValues());
    setShowAddFile(true);
  }

  function cancelAddFile() {
    setShowAddFile(false);
    addFileForm.reset(buildSkillFileDefaultValues());
  }

  function renderSkillField(fieldConfig: FieldConfig<SkillFormData>) {
    const isRequired = !!fieldConfig.required;

    return (
      <FormField
        key={fieldConfig.name}
        control={control}
        name={fieldConfig.name}
        render={({ field }) => (
          <FormItem className="form-group flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <FormLabel className="text-[length:var(--font-base)] font-medium text-[var(--text-primary)]">
                {t(fieldConfig.labelKey)}
              </FormLabel>
              {isRequired ? (
                <span className="required-badge inline-flex items-center justify-center rounded-full bg-[var(--accent-red-bg)] px-1.5 py-px text-[length:var(--font-xs)] font-semibold text-[var(--accent-red)]">
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
                  readOnly={fieldConfig.readOnly}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  className="rounded-[var(--radius-md)] border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2.5 text-[length:var(--font-base)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] hover:border-[var(--text-muted)] focus-visible:border-[var(--accent-blue)] focus-visible:ring-[3px] focus-visible:ring-[var(--accent-blue-bg)]"
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
                  readOnly={fieldConfig.readOnly}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  className={cn(
                    "h-auto rounded-[var(--radius-md)] border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2.5 text-[length:var(--font-base)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] hover:border-[var(--text-muted)] focus-visible:border-[var(--accent-blue)] focus-visible:ring-[3px] focus-visible:ring-[var(--accent-blue-bg)]",
                    fieldConfig.inputClassName,
                    fieldConfig.readOnly &&
                      "cursor-default font-mono text-[length:var(--font-sm)] opacity-60",
                  )}
                />
              )}
            </FormControl>
            {fieldConfig.descriptionKey ? (
              <FormDescription className="form-hint field-hint m-0 text-[length:var(--font-xs)] leading-normal text-[var(--text-muted)]">
                {t(fieldConfig.descriptionKey)}
              </FormDescription>
            ) : null}
            <FormMessage className="field-error mt-1 text-[11px] text-[var(--accent-red)]" />
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
          <FormItem className="checkbox-group flex flex-col gap-1.5">
            <div className="flex items-start gap-2">
              <FormControl>
                <Checkbox
                  checked={!!field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  className="mt-0.5 border-[var(--border-default)] data-[state=checked]:border-[var(--accent-blue)] data-[state=checked]:bg-[var(--accent-blue)]"
                />
              </FormControl>
              <div className="grid min-w-0 gap-1">
                <FormLabel className="text-[length:var(--font-sm)] font-medium text-[var(--text-primary)]">
                  {t(fieldConfig.labelKey)}
                </FormLabel>
                {fieldConfig.descriptionKey ? (
                  <FormDescription className="form-hint m-0 text-[length:var(--font-xs)] leading-normal text-[var(--text-muted)]">
                    {t(fieldConfig.descriptionKey)}
                  </FormDescription>
                ) : null}
              </div>
            </div>
            <FormMessage className="field-error mt-1 text-[11px] text-[var(--accent-red)]" />
          </FormItem>
        )}
      />
    );
  }

  return (
    <Form {...form}>
      <div className="editor-drawer-container">
        <div className="editor-panel" role="dialog" aria-modal="true">
          <form onSubmit={handleSubmit(handleSkillSubmit)}>
            {/* 顶部操作栏 */}
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
              <h2>{isEditing ? t("skills.editTitle") : t("skills.addTitle")}</h2>
              <Button type="submit" className="editor-save-btn" disabled={!canSave}>
                {t("skills.save")}
              </Button>
            </div>

            {/* 正文区域 */}
            <div className="editor-body">
              {/* 大徽章头像 */}
              <ProfileNameBadge
                name={watchId || skill?.id}
                size="lg"
                fallbackChar="S"
                className="editor-badge-large"
              />

              {primaryFields.map(renderSkillField)}

              {/* 高级开关：disable-model-invocation 和 user-invocable */}
              <div className="form-group skill-checkboxes flex flex-col gap-1">
                {SKILL_BOOLEAN_FIELDS.map(renderSkillBooleanField)}
              </div>

              {/* Markdown 内容编辑器 */}
              <div className="form-group flex flex-col gap-3">
                <label className="text-[length:var(--font-base)] font-medium text-[var(--text-primary)]">
                  {t("skills.content")}
                </label>
                <FormField
                  control={control}
                  name="content"
                  render={({ field }) => (
                    <div className="skill-editor-wrap overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] focus-within:border-[var(--accent-blue)] focus-within:shadow-[0_0_0_3px_var(--accent-blue-bg)] [&_.cm-editor]:text-[13px] [&_.cm-editor]:leading-[1.6] [&_.cm-editor.cm-focused]:outline-none [&_.cm-scroller]:font-mono [&_.cm-scroller]:overflow-auto">
                      <CodeMirror
                        value={field.value}
                        onChange={field.onChange}
                        height="360px"
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
                />
              </div>

              {/* 支持文件区（仅编辑模式可用） */}
              {isEditing && (
                <CollapsibleSection title={t("skills.files")} badge={files.length} defaultExpanded>
                  <div className="skill-files-section flex flex-col gap-2">
                    {/* 文件列表 */}
                    {files.map((file) => (
                      <Card
                        key={file.name}
                        className="skill-file-item overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-primary)] py-0 shadow-none"
                      >
                        {editingFile === file.name ? (
                          // 文件编辑模式
                          <div className="skill-file-editor flex flex-col">
                            <div className="skill-file-editor-header flex items-center justify-between gap-2 border-b border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-2">
                              <span className="skill-file-name min-w-0 truncate font-mono text-[length:var(--font-sm)] text-[var(--text-primary)]">
                                {file.name}
                              </span>
                              <div className="skill-file-editor-actions flex shrink-0 gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  className="file-btn cancel border-[var(--border-default)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                  onClick={cancelEditFile}
                                >
                                  {t("skills.cancelEdit")}
                                </Button>
                                <Button
                                  type="button"
                                  size="xs"
                                  className="file-btn save bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-hover)]"
                                  onClick={() => void submitEditFile()}
                                >
                                  {t("skills.saveFile")}
                                </Button>
                              </div>
                            </div>
                            <Textarea
                              className="skill-file-textarea min-h-48 rounded-none border-0 bg-[var(--bg-primary)] px-3 py-2.5 font-mono text-[13px] leading-normal text-[var(--text-primary)] shadow-none focus-visible:ring-0"
                              rows={8}
                              {...editFileForm.register("content")}
                            />
                            {editFileForm.formState.errors.content?.message && (
                              <span className="field-error px-3 pb-3 text-[11px] text-[var(--accent-red)]">
                                {t(editFileForm.formState.errors.content.message as TranslationKey)}
                              </span>
                            )}
                          </div>
                        ) : (
                          // 文件列表行
                          <div className="skill-file-row flex items-center justify-between gap-2 px-3 py-2.5">
                            <span className="skill-file-name flex min-w-0 items-center gap-1.5 font-mono text-[length:var(--font-sm)] text-[var(--text-primary)]">
                              <span className="truncate">{file.name}</span>
                              {file.isBinary && (
                                <Badge
                                  variant="secondary"
                                  className="skill-file-binary-tag shrink-0 rounded bg-[var(--bg-tertiary)] px-1.5 py-px text-[10px] font-semibold text-[var(--text-muted)]"
                                >
                                  {t("skills.binaryFile")}
                                </Badge>
                              )}
                            </span>
                            <div className="skill-file-row-actions flex shrink-0 gap-1.5">
                              {!file.isBinary && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  className="file-btn edit border-[var(--border-default)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                  onClick={() => startEditFile(file)}
                                >
                                  {t("skills.editFile")}
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                className="file-btn delete text-[var(--accent-red)] hover:bg-[var(--accent-red-bg)] hover:text-[var(--accent-red)]"
                                onClick={() => setPendingDeleteFile(file.name)}
                              >
                                {t("skills.deleteFile")}
                              </Button>
                            </div>
                          </div>
                        )}
                      </Card>
                    ))}

                    {/* 添加文件表单 */}
                    {showAddFile ? (
                      <div className="skill-add-file-form flex flex-col gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] p-3">
                        <Input
                          type="text"
                          className="skill-file-name-input h-auto rounded-[var(--radius-md)] border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-[length:var(--font-sm)] text-[var(--text-primary)]"
                          placeholder={t("skills.fileNamePlaceholder")}
                          {...addFileForm.register("fileName")}
                        />
                        {addFileForm.formState.errors.fileName?.message && (
                          <span className="field-error text-[11px] text-[var(--accent-red)]">
                            {t(addFileForm.formState.errors.fileName.message as TranslationKey)}
                          </span>
                        )}
                        <Textarea
                          className="skill-file-textarea min-h-36 rounded-[var(--radius-md)] border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2.5 font-mono text-[13px] leading-normal text-[var(--text-primary)]"
                          placeholder={t("skills.fileContent")}
                          rows={6}
                          {...addFileForm.register("content")}
                        />
                        {addFileForm.formState.errors.content?.message && (
                          <span className="field-error text-[11px] text-[var(--accent-red)]">
                            {t(addFileForm.formState.errors.content.message as TranslationKey)}
                          </span>
                        )}
                        <div className="skill-add-file-actions flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className="file-btn cancel border-[var(--border-default)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            onClick={cancelAddFile}
                          >
                            {t("skills.cancelEdit")}
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            className="file-btn save bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-hover)]"
                            onClick={() => void submitAddFile()}
                          >
                            {t("skills.saveFile")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // 添加文件按钮
                      <Button
                        type="button"
                        variant="outline"
                        className="skill-add-file-btn w-full border-dashed border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                        onClick={openAddFileForm}
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                        {t("skills.addFile")}
                      </Button>
                    )}
                  </div>
                </CollapsibleSection>
              )}
            </div>
          </form>

          {/* 删除文件确认对话框 */}
          {pendingDeleteFile && (
            <ConfirmAlertDialog
              title={t("confirm.deleteSkillFileTitle")}
              message={t("confirm.deleteSkillFileMessage")}
              confirmText={t("confirm.delete")}
              cancelText={t("confirm.cancel")}
              danger
              onConfirm={() => {
                void handleDeleteFile(pendingDeleteFile);
                setPendingDeleteFile(null);
              }}
              onCancel={() => setPendingDeleteFile(null)}
            />
          )}
        </div>
      </div>
    </Form>
  );
}

export default SkillEditor;
