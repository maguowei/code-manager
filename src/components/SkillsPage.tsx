import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Skill } from "../types";
import { useI18n } from "../i18n";
import { useToast } from "../hooks/useToast";
import SkillItem from "./SkillItem";
import SkillEditor from "./SkillEditor";
import ConfirmDialog from "./ConfirmDialog";
import useEscapeKey from "../hooks/useEscapeKey";
import "./MemoryPage.css"; // 复用相同布局样式

function SkillsPage({ onDrawerChange }: { onDrawerChange?: (isOpen: boolean) => void }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // 加载 Skills 列表
  const loadSkills = useCallback(async () => {
    try {
      const list = await invoke<Skill[]>("get_skills");
      setSkills(list);
    } catch {
      showToast(t("toast.skillLoadError"), "error");
    }
  }, [showToast, t]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // ESC 键关闭编辑抽屉
  useEscapeKey(
    useCallback(() => {
      setEditingSkill(null);
      setIsDrawerOpen(false);
      onDrawerChange?.(false);
    }, [onDrawerChange]),
    isDrawerOpen
  );

  // 切换 Skill 启用/禁用状态
  async function handleToggle(skill: Skill) {
    try {
      const toggled = await invoke<Skill>("toggle_skill", {
        id: skill.id,
        isActive: skill.isActive,
      });
      setSkills((prev) => prev.map((s) => (s.id === toggled.id ? toggled : s)));
    } catch {
      showToast(t("toast.skillToggleError"), "error");
    }
  }

  // 删除指定 Skill
  async function handleDelete(id: string) {
    const skill = skills.find((s) => s.id === id);
    if (!skill) return;
    try {
      await invoke("delete_skill", { id, isActive: skill.isActive });
      setSkills((prev) => prev.filter((s) => s.id !== id));
      showToast(t("toast.skillDeleted"));
    } catch {
      showToast(t("toast.skillDeleteError"), "error");
    }
  }

  // 保存（新建或编辑）后更新列表并关闭抽屉
  function handleSave(saved: Skill) {
    setSkills((prev) => {
      const exists = prev.some((s) => s.id === saved.id);
      return exists
        ? prev.map((s) => (s.id === saved.id ? saved : s))
        : [...prev, saved];
    });
    closeDrawer();
  }

  // 打开新建抽屉
  function openAdd() {
    setEditingSkill(null);
    setIsDrawerOpen(true);
    onDrawerChange?.(true);
  }

  // 打开编辑抽屉
  function openEdit(skill: Skill) {
    setEditingSkill(skill);
    setIsDrawerOpen(true);
    onDrawerChange?.(true);
  }

  // 关闭抽屉并重置编辑状态
  function closeDrawer() {
    setEditingSkill(null);
    setIsDrawerOpen(false);
    onDrawerChange?.(false);
  }

  // 启用的 Skill 排在前面，同状态内按 id 字典序排列
  const sortedSkills = [...skills].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  return (
    <div className="memory-page">
      {/* 页面标题 */}
      <div className="page-header">
        <h1 className="page-title">{t("skills.title")}</h1>
      </div>

      {/* 添加按钮 */}
      <button className="add-config-btn" onClick={openAdd}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>{t("skills.addSkill")}</span>
      </button>

      {/* Skills 列表 */}
      {sortedSkills.length === 0 ? (
        <div className="memory-empty">
          <div className="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <p className="empty-text">{t("skills.empty")}</p>
          <p className="empty-hint">{t("skills.emptyHint")}</p>
        </div>
      ) : (
        <div className="memory-list">
          {sortedSkills.map((skill) => (
            <SkillItem
              key={skill.id}
              skill={skill}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDelete={(s) => setPendingDeleteId(s.id)}
            />
          ))}
        </div>
      )}

      {/* 删除确认对话框 */}
      {pendingDeleteId && (
        <ConfirmDialog
          title={t("confirm.deleteSkillTitle")}
          message={t("confirm.deleteSkillMessage")}
          confirmText={t("confirm.delete")}
          cancelText={t("confirm.cancel")}
          danger
          onConfirm={() => {
            handleDelete(pendingDeleteId);
            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}

      {/* 编辑/新建抽屉 */}
      {isDrawerOpen && (
        <>
          <div className="drawer-overlay visible" onClick={closeDrawer} />
          <div className="drawer open">
            <SkillEditor
              key={editingSkill?.id ?? "new"}
              skill={editingSkill}
              onSave={handleSave}
              onClose={closeDrawer}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default SkillsPage;
