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
import {
  CONTROL_SURFACE_CLASS,
  PANEL_SURFACE_CLASS,
  SUBTLE_SURFACE_CLASS,
  TOOLBAR_SURFACE_CLASS,
} from "./surface-classes";
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
                  readOnly={fieldConfig.readOnly}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  className={cn(
                    "rounded-md border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    CONTROL_SURFACE_CLASS,
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
                  readOnly={fieldConfig.readOnly}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  className={cn(
                    "h-auto rounded-md border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    CONTROL_SURFACE_CLASS,
                    fieldConfig.inputClassName,
                    fieldConfig.readOnly && "cursor-default font-mono text-xs opacity-60",
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
          <FormItem className="checkbox-group flex flex-col gap-1.5">
            <div className="flex items-start gap-2">
              <FormControl>
                <Checkbox
                  checked={!!field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  className="mt-0.5 border-border data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                />
              </FormControl>
              <div className="grid min-w-0 gap-1">
                <FormLabel className="text-xs font-medium text-foreground">
                  {t(fieldConfig.labelKey)}
                </FormLabel>
                {fieldConfig.descriptionKey ? (
                  <FormDescription className="m-0 text-xs leading-normal text-muted-foreground">
                    {t(fieldConfig.descriptionKey)}
                  </FormDescription>
                ) : null}
              </div>
            </div>
            <FormMessage className="mt-1 text-xs text-destructive" />
          </FormItem>
        )}
      />
    );
  }

  return (
    <Form {...form}>
      <div className="flex h-full min-h-0 w-full min-w-[560px] bg-background">
        <div
          className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background"
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
              <Button type="submit" disabled={!canSave}>
                {t("skills.save")}
              </Button>
            </div>

            {/* 正文区域 */}
            <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto px-6 py-6 pb-6 [&>*]:shrink-0 [&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]">
              {/* 大徽章头像 */}
              <ProfileNameBadge name={watchId || skill?.id} size="lg" fallbackChar="S" />

              {primaryFields.map(renderSkillField)}

              {/* 高级开关：disable-model-invocation 和 user-invocable */}
              <div className="flex flex-col gap-1">
                {SKILL_BOOLEAN_FIELDS.map(renderSkillBooleanField)}
              </div>

              {/* Markdown 内容编辑器 */}
              <div className="flex flex-col gap-3">
                <label className="text-sm font-medium text-foreground">{t("skills.content")}</label>
                <FormField
                  control={control}
                  name="content"
                  render={({ field }) => (
                    <div
                      className={cn(
                        "skill-editor-wrap overflow-hidden rounded-md border border-border/80 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/50 [&_.cm-editor]:text-[13px] [&_.cm-editor]:leading-[1.6] [&_.cm-editor.cm-focused]:outline-none [&_.cm-scroller]:font-mono [&_.cm-scroller]:overflow-auto",
                        CONTROL_SURFACE_CLASS,
                      )}
                    >
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
                        className={cn(
                          "skill-file-item overflow-hidden rounded-md border py-0",
                          PANEL_SURFACE_CLASS,
                        )}
                      >
                        {editingFile === file.name ? (
                          // 文件编辑模式
                          <div className="skill-file-editor flex flex-col">
                            <div className="skill-file-editor-header flex items-center justify-between gap-2 border-b border-border/80 bg-muted/50 px-3 py-2">
                              <span className="skill-file-name min-w-0 truncate font-mono text-xs text-foreground">
                                {file.name}
                              </span>
                              <div className="skill-file-editor-actions flex shrink-0 gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  className="border-border bg-secondary text-muted-foreground hover:text-foreground"
                                  onClick={cancelEditFile}
                                >
                                  {t("skills.cancelEdit")}
                                </Button>
                                <Button
                                  type="button"
                                  size="xs"
                                  className="font-semibold"
                                  onClick={() => void submitEditFile()}
                                >
                                  {t("skills.saveFile")}
                                </Button>
                              </div>
                            </div>
                            <Textarea
                              className="skill-file-textarea min-h-48 rounded-none border-0 bg-background/80 px-3 py-2.5 font-mono text-[13px] leading-normal text-foreground shadow-none transition-colors focus-visible:bg-background focus-visible:ring-0"
                              rows={8}
                              {...editFileForm.register("content")}
                            />
                            {editFileForm.formState.errors.content?.message && (
                              <span className="px-3 pb-3 text-xs text-destructive">
                                {t(editFileForm.formState.errors.content.message as TranslationKey)}
                              </span>
                            )}
                          </div>
                        ) : (
                          // 文件列表行
                          <div className="skill-file-row flex items-center justify-between gap-2 px-3 py-2.5">
                            <span className="skill-file-name flex min-w-0 items-center gap-1.5 font-mono text-xs text-foreground">
                              <span className="truncate">{file.name}</span>
                              {file.isBinary && (
                                <Badge
                                  variant="secondary"
                                  className="skill-file-binary-tag shrink-0 rounded bg-muted px-1.5 py-px text-xs font-semibold text-muted-foreground"
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
                                  className="border-border bg-secondary text-muted-foreground hover:text-foreground"
                                  onClick={() => startEditFile(file)}
                                >
                                  {t("skills.editFile")}
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="destructive-ghost"
                                size="xs"
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
                      <div
                        className={cn(
                          "skill-add-file-form flex flex-col gap-2 rounded-md border border-dashed p-3",
                          SUBTLE_SURFACE_CLASS,
                        )}
                      >
                        <Input
                          type="text"
                          className={cn(
                            "skill-file-name-input h-auto rounded-md border-border px-3 py-2 font-mono text-xs text-foreground",
                            CONTROL_SURFACE_CLASS,
                          )}
                          placeholder={t("skills.fileNamePlaceholder")}
                          {...addFileForm.register("fileName")}
                        />
                        {addFileForm.formState.errors.fileName?.message && (
                          <span className="text-xs text-destructive">
                            {t(addFileForm.formState.errors.fileName.message as TranslationKey)}
                          </span>
                        )}
                        <Textarea
                          className={cn(
                            "skill-file-textarea min-h-36 rounded-md border-border px-3 py-2.5 font-mono text-[13px] leading-normal text-foreground",
                            CONTROL_SURFACE_CLASS,
                          )}
                          placeholder={t("skills.fileContent")}
                          rows={6}
                          {...addFileForm.register("content")}
                        />
                        {addFileForm.formState.errors.content?.message && (
                          <span className="text-xs text-destructive">
                            {t(addFileForm.formState.errors.content.message as TranslationKey)}
                          </span>
                        )}
                        <div className="skill-add-file-actions flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className="border-border bg-secondary text-muted-foreground hover:text-foreground"
                            onClick={cancelAddFile}
                          >
                            {t("skills.cancelEdit")}
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            className="font-semibold"
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
                        className="w-full border-dashed border-border bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
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
