import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { zodResolver } from "@hookform/resolvers/zod";
import { invoke } from "@tauri-apps/api/core";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useState } from "react";
import { Controller, type FieldError, type Resolver, useForm } from "react-hook-form";
import { useCodeMirrorTheme } from "../hooks/useCodeMirrorTheme";
import { useToast } from "../hooks/useToast";
import { type TranslationKey, useI18n } from "../i18n";
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
import ConfirmDialog from "./ConfirmDialog";
import { ChevronLeftIcon } from "./Icons";
import SchemaFormField from "./SchemaFormField";
import "./SkillEditor.css";

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

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SkillFormData>({
    resolver: zodResolver(SkillSchema) as Resolver<SkillFormData>,
    defaultValues: buildSkillDefaultValues(skill),
    mode: "onBlur",
  });
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
  const badgeLetter = (() => {
    const label = watchId || skill?.id || "";
    return label ? label.charAt(0).toUpperCase() : "S";
  })();

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

  return (
    <div className="editor-drawer-container">
      <div className="editor-panel" role="dialog" aria-modal="true">
        <form onSubmit={handleSubmit(handleSkillSubmit)}>
          {/* 顶部操作栏 */}
          <div className="editor-header">
            <button
              type="button"
              className="editor-back-btn"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <ChevronLeftIcon />
            </button>
            <h2>{isEditing ? t("skills.editTitle") : t("skills.addTitle")}</h2>
            <button type="submit" className="editor-save-btn" disabled={!canSave}>
              {t("skills.save")}
            </button>
          </div>

          {/* 正文区域 */}
          <div className="editor-body">
            {/* 大徽章头像 */}
            <div className="editor-badge-large">
              <span>{badgeLetter}</span>
            </div>

            {primaryFields.map((field) => (
              <SchemaFormField
                key={field.name}
                field={field}
                register={register}
                control={control}
                error={errors[field.name] as FieldError | undefined}
              />
            ))}

            {/* 高级开关：disable-model-invocation 和 user-invocable */}
            <div className="form-group skill-checkboxes">
              {SKILL_BOOLEAN_FIELDS.map((field) => (
                <SchemaFormField
                  key={field.name}
                  field={field}
                  register={register}
                  control={control}
                  error={errors[field.name] as FieldError | undefined}
                />
              ))}
            </div>

            {/* Markdown 内容编辑器 */}
            <div className="form-group">
              <label>{t("skills.content")}</label>
              <div className="skill-editor-wrap">
                <Controller
                  name="content"
                  control={control}
                  render={({ field }) => (
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
                  )}
                />
              </div>
            </div>

            {/* 支持文件区（仅编辑模式可用） */}
            {isEditing && (
              <CollapsibleSection title={t("skills.files")} badge={files.length} defaultExpanded>
                <div className="skill-files-section">
                  {/* 文件列表 */}
                  {files.map((file) => (
                    <div key={file.name} className="skill-file-item">
                      {editingFile === file.name ? (
                        // 文件编辑模式
                        <div className="skill-file-editor">
                          <div className="skill-file-editor-header">
                            <span className="skill-file-name">{file.name}</span>
                            <div className="skill-file-editor-actions">
                              <button
                                type="button"
                                className="file-btn cancel"
                                onClick={cancelEditFile}
                              >
                                {t("skills.cancelEdit")}
                              </button>
                              <button
                                type="button"
                                className="file-btn save"
                                onClick={() => void submitEditFile()}
                              >
                                {t("skills.saveFile")}
                              </button>
                            </div>
                          </div>
                          <textarea
                            className="skill-file-textarea"
                            rows={8}
                            {...editFileForm.register("content")}
                          />
                          {editFileForm.formState.errors.content?.message && (
                            <span className="field-error">
                              {t(editFileForm.formState.errors.content.message as TranslationKey)}
                            </span>
                          )}
                        </div>
                      ) : (
                        // 文件列表行
                        <div className="skill-file-row">
                          <span className="skill-file-name">
                            {file.name}
                            {file.isBinary && (
                              <span className="skill-file-binary-tag">
                                {t("skills.binaryFile")}
                              </span>
                            )}
                          </span>
                          <div className="skill-file-row-actions">
                            {!file.isBinary && (
                              <button
                                type="button"
                                className="file-btn edit"
                                onClick={() => startEditFile(file)}
                              >
                                {t("skills.editFile")}
                              </button>
                            )}
                            <button
                              type="button"
                              className="file-btn delete"
                              onClick={() => setPendingDeleteFile(file.name)}
                            >
                              {t("skills.deleteFile")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* 添加文件表单 */}
                  {showAddFile ? (
                    <div className="skill-add-file-form">
                      <input
                        type="text"
                        className="skill-file-name-input"
                        placeholder={t("skills.fileNamePlaceholder")}
                        {...addFileForm.register("fileName")}
                      />
                      {addFileForm.formState.errors.fileName?.message && (
                        <span className="field-error">
                          {t(addFileForm.formState.errors.fileName.message as TranslationKey)}
                        </span>
                      )}
                      <textarea
                        className="skill-file-textarea"
                        placeholder={t("skills.fileContent")}
                        rows={6}
                        {...addFileForm.register("content")}
                      />
                      {addFileForm.formState.errors.content?.message && (
                        <span className="field-error">
                          {t(addFileForm.formState.errors.content.message as TranslationKey)}
                        </span>
                      )}
                      <div className="skill-add-file-actions">
                        <button type="button" className="file-btn cancel" onClick={cancelAddFile}>
                          {t("skills.cancelEdit")}
                        </button>
                        <button
                          type="button"
                          className="file-btn save"
                          onClick={() => void submitAddFile()}
                        >
                          {t("skills.saveFile")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    // 添加文件按钮
                    <button type="button" className="skill-add-file-btn" onClick={openAddFileForm}>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      {t("skills.addFile")}
                    </button>
                  )}
                </div>
              </CollapsibleSection>
            )}
          </div>
        </form>

        {/* 删除文件确认对话框 */}
        {pendingDeleteFile && (
          <ConfirmDialog
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
  );
}

export default SkillEditor;
