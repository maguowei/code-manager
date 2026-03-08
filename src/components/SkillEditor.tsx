import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { Skill, SkillFile } from "../types";
import { useI18n } from "../i18n";
import { useToast } from "../hooks/useToast";
import useEditorTheme from "../hooks/useEditorTheme";
import CollapsibleSection from "./CollapsibleSection";
import ConfirmDialog from "./ConfirmDialog";
import "./SkillEditor.css";

interface SkillEditorProps {
  skill: Skill | null; // null = 新建模式
  onSave: (skill: Skill) => void;
  onClose: () => void;
}

function SkillEditor({ skill, onSave, onClose }: SkillEditorProps) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const editorTheme = useEditorTheme();

  // 基本信息字段
  const [id, setId] = useState(skill?.id ?? "");
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [content, setContent] = useState(skill?.content ?? "");
  const [disableModelInvocation, setDisableModelInvocation] = useState(
    skill?.disableModelInvocation ?? false
  );
  const [userInvocable, setUserInvocable] = useState(
    skill?.userInvocable ?? true
  );

  // 支持文件相关状态
  const [files, setFiles] = useState<SkillFile[]>([]);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [editingFile, setEditingFile] = useState<string | null>(null); // 正在编辑的文件名
  const [editingFileContent, setEditingFileContent] = useState("");
  const [showAddFile, setShowAddFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [pendingDeleteFile, setPendingDeleteFile] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 是否为编辑模式
  // 注意：父组件须为每个不同的 skill 提供唯一 key（如 key={skill?.id ?? "new"}），
  // 确保切换 skill 时组件重新挂载，state 得到正确初始化。
  const isEditing = skill !== null;

  // 编辑模式下进入页面时自动懒加载支持文件
  // CollapsibleSection 暂不支持 onExpand 回调，故在 isEditing && !filesLoaded 时通过 useEffect 触发
  useEffect(() => {
    if (isEditing && !filesLoaded) {
      loadFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // 懒加载支持文件（仅编辑模式下，点击文件区域时触发）
  async function loadFiles() {
    if (!skill || filesLoaded) return;
    try {
      const result = await invoke<SkillFile[]>("get_skill_files", {
        id: skill.id,
        isActive: skill.isActive,
      });
      setFiles(result);
      setFilesLoaded(true);
    } catch (err) {
      showToast(t("toast.skillLoadError"), "error");
    }
  }

  // 提交表单，新建或更新 Skill
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEditing && !id.trim()) return;
    setIsSaving(true);
    try {
      let saved: Skill;
      if (isEditing) {
        saved = await invoke<Skill>("update_skill", {
          id: skill.id,
          isActive: skill.isActive,
          name: name.trim(),
          description: description.trim(),
          content,
          disableModelInvocation,
          userInvocable,
        });
        showToast(t("toast.skillSaved"));
      } else {
        saved = await invoke<Skill>("add_skill", {
          id: id.trim(),
          name: name.trim(),
          description: description.trim(),
          content,
          disableModelInvocation,
          userInvocable,
        });
        showToast(t("toast.skillAdded"));
      }
      onSave(saved);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(msg || (isEditing ? t("toast.skillSaveError") : t("toast.skillAddError")), "error");
    } finally {
      setIsSaving(false);
    }
  }

  // 添加支持文件
  async function handleAddFile() {
    if (!skill || !newFileName.trim()) return;
    try {
      const file = await invoke<SkillFile>("add_skill_file", {
        id: skill.id,
        isActive: skill.isActive,
        fileName: newFileName.trim(),
        content: newFileContent,
      });
      setFiles((prev) => [...prev, file]);
      setNewFileName("");
      setNewFileContent("");
      setShowAddFile(false);
      showToast(t("toast.skillFileAdded"));
    } catch (err) {
      showToast(t("toast.skillFileAddError"), "error");
    }
  }

  // 保存已编辑的文件内容
  async function handleSaveFile(fileName: string) {
    if (!skill) return;
    try {
      const file = await invoke<SkillFile>("update_skill_file", {
        id: skill.id,
        isActive: skill.isActive,
        fileName,
        content: editingFileContent,
      });
      setFiles((prev) => prev.map((f) => (f.name === fileName ? file : f)));
      setEditingFile(null);
      showToast(t("toast.skillFileSaved"));
    } catch (err) {
      showToast(t("toast.skillFileSaveError"), "error");
    }
  }

  // 删除支持文件
  async function handleDeleteFile(fileName: string) {
    if (!skill) return;
    try {
      await invoke("delete_skill_file", {
        id: skill.id,
        isActive: skill.isActive,
        fileName,
      });
      setFiles((prev) => prev.filter((f) => f.name !== fileName));
      showToast(t("toast.skillFileDeleted"));
    } catch (err) {
      showToast(t("toast.skillFileDeleteError"), "error");
    }
  }

  // 进入文件编辑模式
  function startEditFile(file: SkillFile) {
    setEditingFile(file.name);
    setEditingFileContent(file.content);
  }

  // 保存按钮是否可用
  const canSave = isEditing
    ? !isSaving
    : id.trim().length > 0 && !isSaving;

  // 徽章显示的首字母，优先取 id
  const badgeLetter = (() => {
    const label = isEditing ? skill.id : id;
    return label ? label.charAt(0).toUpperCase() : "S";
  })();

  return (
    <div className="skill-drawer-container">
      <div className="skill-modal" role="dialog" aria-modal="true">
        <form onSubmit={handleSubmit}>
          {/* 顶部操作栏 */}
          <div className="skill-modal-header">
            <button
              type="button"
              className="skill-back-btn"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h2>{isEditing ? t("skills.editTitle") : t("skills.addTitle")}</h2>
            <button type="submit" className="skill-save-btn" disabled={!canSave}>
              {t("skills.save")}
            </button>
          </div>

          {/* 正文区域 */}
          <div className="skill-modal-body">
            {/* 大徽章头像 */}
            <div className="skill-badge-large">
              <span>{badgeLetter}</span>
            </div>

            {/* Skill 名称（id）：新建时可编辑，编辑时只读 */}
            <div className="form-group">
              <label htmlFor="skill-id" className="label-required">
                <span>{t("skills.name")}</span>
                <span className="required-badge">{t("form.required")}</span>
              </label>
              {isEditing ? (
                <input
                  id="skill-id"
                  type="text"
                  value={skill.id}
                  readOnly
                  className="input-readonly"
                />
              ) : (
                <input
                  id="skill-id"
                  type="text"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  placeholder={t("skills.namePlaceholder")}
                  required
                />
              )}
              <span className="field-hint">{t("skills.nameHint")}</span>
            </div>

            {/* 显示名称（可选，对应 frontmatter name 字段） */}
            <div className="form-group">
              <label htmlFor="skill-name">{t("skills.displayName")}</label>
              <input
                id="skill-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isEditing ? skill.id : id || t("skills.displayNamePlaceholder")}
              />
              <span className="field-hint">{t("skills.displayNameHint")}</span>
            </div>

            {/* 描述 */}
            <div className="form-group">
              <label htmlFor="skill-description">{t("skills.descriptionLabel")}</label>
              <textarea
                id="skill-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("skills.descriptionPlaceholder")}
                rows={3}
              />
            </div>

            {/* 高级开关：disable-model-invocation 和 user-invocable */}
            <div className="form-group skill-checkboxes">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={disableModelInvocation}
                  onChange={(e) => setDisableModelInvocation(e.target.checked)}
                />
                <span className="checkbox-custom" />
                <span>{t("skills.disableModelInvocation")}</span>
              </label>
              <p className="field-hint">{t("skills.disableModelInvocationHint")}</p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={userInvocable}
                  onChange={(e) => setUserInvocable(e.target.checked)}
                />
                <span className="checkbox-custom" />
                <span>{t("skills.userInvocable")}</span>
              </label>
              <p className="field-hint">{t("skills.userInvocableHint")}</p>
            </div>

            {/* Markdown 内容编辑器 */}
            <div className="form-group">
              <label>{t("skills.content")}</label>
              <div className="skill-editor-wrap">
                <CodeMirror
                  value={content}
                  onChange={setContent}
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
            </div>

            {/* 支持文件区（仅编辑模式可用） */}
            {isEditing && (
              <CollapsibleSection
                title={t("skills.files")}
                badge={files.length}
                defaultExpanded
              >
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
                                onClick={() => setEditingFile(null)}
                              >
                                {t("skills.cancelEdit")}
                              </button>
                              <button
                                type="button"
                                className="file-btn save"
                                onClick={() => handleSaveFile(file.name)}
                              >
                                {t("skills.saveFile")}
                              </button>
                            </div>
                          </div>
                          <textarea
                            className="skill-file-textarea"
                            value={editingFileContent}
                            onChange={(e) => setEditingFileContent(e.target.value)}
                            rows={8}
                          />
                        </div>
                      ) : (
                        // 文件列表行
                        <div className="skill-file-row">
                          <span className="skill-file-name">
                            {file.name}
                            {file.isBinary && (
                              <span className="skill-file-binary-tag">{t("skills.binaryFile")}</span>
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
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                      />
                      <textarea
                        className="skill-file-textarea"
                        placeholder={t("skills.fileContent")}
                        value={newFileContent}
                        onChange={(e) => setNewFileContent(e.target.value)}
                        rows={6}
                      />
                      <div className="skill-add-file-actions">
                        <button
                          type="button"
                          className="file-btn cancel"
                          onClick={() => {
                            setShowAddFile(false);
                            setNewFileName("");
                            setNewFileContent("");
                          }}
                        >
                          {t("skills.cancelEdit")}
                        </button>
                        <button
                          type="button"
                          className="file-btn save"
                          onClick={handleAddFile}
                          disabled={!newFileName.trim()}
                        >
                          {t("skills.saveFile")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    // 添加文件按钮
                    <button
                      type="button"
                      className="skill-add-file-btn"
                      onClick={() => setShowAddFile(true)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
              handleDeleteFile(pendingDeleteFile);
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
