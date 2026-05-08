import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Plus, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "../hooks/useToast";
import { type Language, useI18n } from "../i18n";
import type { Skill } from "../types";
import ConfirmAlertDialog from "./ConfirmAlertDialog";
import PageHeader from "./PageHeader";
import SkillEditor from "./SkillEditor";
import SkillItem from "./SkillItem";
import { Button } from "./ui/button";
import { Sheet, SheetContent } from "./ui/sheet";

const CLAUDE_CODE_DOCS_BASE_URL = "https://code.claude.com/docs";
const CLAUDE_SKILLS_DOCS_PATH = "skills";

function getClaudeSkillsDocsUrl(language: Language) {
  const docsLocale = language === "zh" ? "zh-CN" : "en";
  return `${CLAUDE_CODE_DOCS_BASE_URL}/${docsLocale}/${CLAUDE_SKILLS_DOCS_PATH}`;
}

function SkillsPage({ onDrawerChange }: { onDrawerChange?: (isOpen: boolean) => void }) {
  const { language, t } = useI18n();
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

  // 同步 Skill 到 Codex
  async function handleSync(skill: Skill) {
    try {
      await invoke("sync_skill_to_codex", { id: skill.id, isActive: skill.isActive });
      showToast(t("toast.skillSynced"));
    } catch {
      showToast(t("toast.skillSyncError"), "error");
    }
  }

  // 保存（新建或编辑）后更新列表并关闭抽屉
  function handleSave(saved: Skill) {
    setSkills((prev) => {
      const exists = prev.some((s) => s.id === saved.id);
      return exists ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved];
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
  const sortedSkills = useMemo(
    () =>
      [...skills].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.id.localeCompare(b.id);
      }),
    [skills],
  );
  const claudeSkillsDocsUrl = useMemo(() => getClaudeSkillsDocsUrl(language), [language]);

  const handleOpenDocs = useCallback(async () => {
    try {
      await openUrl(claudeSkillsDocsUrl);
    } catch {
      showToast(t("skills.openDocsError"), "error");
    }
  }, [claudeSkillsDocsUrl, showToast, t]);

  return (
    <div
      className={cn("list-page group/list flex min-h-full flex-col", isDrawerOpen && "compressed")}
    >
      <PageHeader
        title={t("skills.title")}
        surface="secondary"
        variant="list"
        actionsClassName="skills-page-actions"
        actions={
          <Button
            variant="outline"
            size="sm"
            asChild
            className="skills-docs-link border-border bg-transparent px-2.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:bg-accent hover:text-foreground"
          >
            <a
              href={claudeSkillsDocsUrl}
              aria-label={t("skills.openDocsAriaLabel")}
              title={t("skills.openDocsAriaLabel")}
              onClick={(event) => {
                event.preventDefault();
                void handleOpenDocs();
              }}
            >
              <span>{t("skills.openDocs")}</span>
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </Button>
        }
      />

      {/* 添加按钮 */}
      <Button
        type="button"
        className="mx-2 mt-4 mb-3 h-auto gap-2 rounded-lg p-3.5 text-base font-semibold"
        onClick={openAdd}
      >
        <Plus className="size-4" aria-hidden="true" />
        <span>{t("skills.addSkill")}</span>
      </Button>

      {/* Skills 列表 */}
      {sortedSkills.length === 0 ? (
        <div className="list-empty flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <div className="empty-icon mb-4 text-muted-foreground">
            <Zap className="size-12" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <p className="empty-text mb-2 text-lg font-medium">{t("skills.empty")}</p>
          <p className="empty-hint max-w-[360px] text-sm leading-normal text-muted-foreground">
            {t("skills.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="list-container flex flex-col gap-3 p-4">
          {sortedSkills.map((skill) => (
            <SkillItem
              key={skill.id}
              skill={skill}
              isEditing={isDrawerOpen && editingSkill?.id === skill.id}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDelete={(s) => setPendingDeleteId(s.id)}
              onSync={handleSync}
            />
          ))}
        </div>
      )}

      {/* 删除确认对话框 */}
      {pendingDeleteId && (
        <ConfirmAlertDialog
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
        <Sheet open onOpenChange={(open) => !open && closeDrawer()}>
          <SheetContent
            side="right"
            showCloseButton={false}
            className="left-[340px] w-auto border-l-0 bg-card p-0 shadow-[-4px_0_24px_rgb(0_0_0_/_0.2)] sm:max-w-none max-[1000px]:left-[60px] max-[700px]:left-[48px]"
          >
            <SkillEditor
              key={editingSkill?.id ?? "new"}
              skill={editingSkill}
              onSave={handleSave}
              onClose={closeDrawer}
            />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

export default SkillsPage;
