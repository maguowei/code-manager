import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, FolderInput, Plus, RefreshCw, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import useTauriEvent from "../hooks/useTauriEvent";
import { useToast } from "../hooks/useToast";
import { type Language, type TranslationKey, useI18n } from "../i18n";
import type { ClaudeDirectoryChangedEvent, Skill, SkillDirectoryImportResult } from "../types";
import ConfirmAlertDialog from "./ConfirmAlertDialog";
import EmptyState from "./EmptyState";
import { LIST_DETAIL_DRAWER_OFFSET_CLASS } from "./layout-size-classes";
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

function isSkillsFileChangePath(path: string) {
  return path === "skills" || path.startsWith("skills/");
}

function formatDirectoryImportSummary(
  template: string,
  importedCount: number,
  skippedCount: number,
) {
  return template
    .replace("{imported}", String(importedCount))
    .replace("{skipped}", String(skippedCount));
}

function sortSkillsForList(items: Skill[]) {
  return [...items].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

type RefreshSkillsOptions = {
  errorMessage: TranslationKey;
  setBusy?: boolean;
  successMessage?: TranslationKey;
};

function SkillsPage({ onDrawerChange }: { onDrawerChange?: (isOpen: boolean) => void }) {
  const { language, t } = useI18n();
  const { showToast } = useToast();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImportingDirectory, setIsImportingDirectory] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [pendingDeleteSkill, setPendingDeleteSkill] = useState<Skill | null>(null);

  // 加载 Skills 列表
  const refreshSkills = useCallback(
    async ({ errorMessage, setBusy, successMessage }: RefreshSkillsOptions) => {
      if (setBusy) {
        setIsRefreshing(true);
      }
      try {
        const list = await invoke<Skill[]>("get_skills");
        setSkills(list);
        if (successMessage) {
          showToast(t(successMessage));
        }
      } catch {
        showToast(t(errorMessage), "error");
      } finally {
        if (setBusy) {
          setIsRefreshing(false);
        }
      }
    },
    [showToast, t],
  );

  useEffect(() => {
    refreshSkills({ errorMessage: "toast.skillLoadError" });
  }, [refreshSkills]);

  useTauriEvent<ClaudeDirectoryChangedEvent>("claude-directory-changed", (event) => {
    if (event.paths.some(isSkillsFileChangePath)) {
      refreshSkills({ errorMessage: "toast.skillRefreshError" });
    }
  });

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
    if (skill.isManaged === false) {
      showToast(t("skills.symlinkNotEditableHint"), "error");
      return;
    }
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

  async function handleImportDirectory() {
    setIsImportingDirectory(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("skills.importDirectoryDialogTitle"),
      });
      const sourceDir = Array.isArray(selected) ? selected[0] : selected;
      if (!sourceDir) {
        return;
      }

      const result = await invoke<SkillDirectoryImportResult>("import_skills_from_directory", {
        sourceDir,
      });
      setSkills(result.skills);
      if (result.imported.length === 0 && result.skipped.length === 0) {
        showToast(t("toast.skillDirectoryImportEmpty"));
        return;
      }
      showToast(
        formatDirectoryImportSummary(
          t("toast.skillDirectoryImportSummary"),
          result.imported.length,
          result.skipped.length,
        ),
      );
    } catch (_err) {
      showToast(t("toast.skillDirectoryImportError"), "error");
    } finally {
      setIsImportingDirectory(false);
    }
  }

  const handleRefreshSkills = useCallback(() => {
    refreshSkills({
      errorMessage: "toast.skillRefreshError",
      setBusy: true,
      successMessage: "toast.skillRefreshed",
    });
  }, [refreshSkills]);

  const managedSkills = useMemo(
    () => sortSkillsForList(skills.filter((skill) => skill.isManaged !== false)),
    [skills],
  );
  const unmanagedSkills = useMemo(
    () => sortSkillsForList(skills.filter((skill) => skill.isManaged === false)),
    [skills],
  );
  const hasAnySkill = skills.length > 0;
  const claudeSkillsDocsUrl = useMemo(() => getClaudeSkillsDocsUrl(language), [language]);

  const handleOpenDocs = useCallback(async () => {
    try {
      await openUrl(claudeSkillsDocsUrl);
    } catch {
      showToast(t("skills.openDocsError"), "error");
    }
  }, [claudeSkillsDocsUrl, showToast, t]);

  function renderSkillGroup(title: string, description: string, items: Skill[]) {
    if (items.length === 0) return null;
    return (
      <section className="skill-group flex flex-col gap-3">
        <div className="skill-group-header flex min-w-0 flex-col gap-1 px-1">
          <h2 className="m-0 text-base leading-snug font-bold text-foreground">{title}</h2>
          <p className="m-0 text-xs leading-normal text-muted-foreground [overflow-wrap:anywhere]">
            {description}
          </p>
        </div>
        <div className="list-container flex flex-col gap-3">
          {items.map((skill) => (
            <SkillItem
              key={skill.id}
              skill={skill}
              isEditing={isDrawerOpen && editingSkill?.id === skill.id}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDelete={setPendingDeleteSkill}
              onSync={handleSync}
            />
          ))}
        </div>
      </section>
    );
  }

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
          <>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="skills-import-directory-btn border-border bg-transparent px-2.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:bg-accent hover:text-foreground"
              aria-label={
                isImportingDirectory ? t("skills.importingDirectory") : t("skills.importDirectory")
              }
              aria-busy={isImportingDirectory}
              title={
                isImportingDirectory
                  ? t("skills.importingDirectory")
                  : t("skills.importDirectoryHint")
              }
              onClick={handleImportDirectory}
              disabled={isImportingDirectory}
            >
              <FolderInput className="size-3.5" aria-hidden="true" />
              <span>
                {isImportingDirectory
                  ? t("skills.importingDirectory")
                  : t("skills.importDirectory")}
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="skills-refresh-btn border-border bg-transparent px-2.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:bg-accent hover:text-foreground"
              aria-label={isRefreshing ? t("skills.refreshing") : t("skills.refresh")}
              aria-busy={isRefreshing}
              title={isRefreshing ? t("skills.refreshing") : t("skills.refresh")}
              onClick={handleRefreshSkills}
              disabled={isRefreshing}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              <span>{isRefreshing ? t("skills.refreshing") : t("skills.refresh")}</span>
            </Button>
          </>
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
      {!hasAnySkill ? (
        <EmptyState title={t("skills.empty")} hint={t("skills.emptyHint")} icon={Zap} />
      ) : (
        <div className="skill-groups flex flex-col gap-5 p-4">
          {renderSkillGroup(
            t("skills.group.managed"),
            t("skills.group.managedDescription"),
            managedSkills,
          )}
          {renderSkillGroup(
            t("skills.group.unmanaged"),
            t("skills.group.unmanagedDescription"),
            unmanagedSkills,
          )}
        </div>
      )}

      {/* 删除确认对话框 */}
      {pendingDeleteSkill && (
        <ConfirmAlertDialog
          title={t(
            pendingDeleteSkill.isManaged === false
              ? "confirm.deleteSymlinkSkillTitle"
              : "confirm.deleteSkillTitle",
          )}
          message={t(
            pendingDeleteSkill.isManaged === false
              ? "confirm.deleteSymlinkSkillMessage"
              : "confirm.deleteSkillMessage",
          )}
          confirmText={t("confirm.delete")}
          cancelText={t("confirm.cancel")}
          danger
          onConfirm={() => {
            handleDelete(pendingDeleteSkill.id);
            setPendingDeleteSkill(null);
          }}
          onCancel={() => setPendingDeleteSkill(null)}
        />
      )}

      {/* 编辑/新建抽屉 */}
      {isDrawerOpen && (
        <Sheet open onOpenChange={(open) => !open && closeDrawer()}>
          <SheetContent
            side="right"
            showCloseButton={false}
            className={cn(
              LIST_DETAIL_DRAWER_OFFSET_CLASS,
              "w-auto border-l-0 bg-secondary p-0 shadow-floating sm:max-w-none",
            )}
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
