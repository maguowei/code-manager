import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FolderInput,
  Plus,
  RefreshCw,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showOperationError } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";
import useTauriEvent from "../hooks/useTauriEvent";
import { useToast } from "../hooks/useToast";
import { type Language, type TranslationKey, useI18n } from "../i18n";
import type {
  ClaudeDirectoryChangedEvent,
  Skill,
  SkillDirectoryImportResult,
  SkillDirectoryImportSkipReason,
} from "../types";
import ConfirmAlertDialog from "./ConfirmAlertDialog";
import EmptyState from "./EmptyState";
import type { EditorExitGuard } from "./editor-exit-guard";
import { LIST_DETAIL_DRAWER_OFFSET_CLASS } from "./layout-size-classes";
import PageHeader from "./PageHeader";
import SkillEditor, { type SkillEditorHandle } from "./SkillEditor";
import SkillItem from "./SkillItem";
import UnsavedChangesAlertDialog from "./UnsavedChangesAlertDialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./ui/sheet";

const CLAUDE_CODE_DOCS_BASE_URL = "https://code.claude.com/docs";
const CLAUDE_SKILLS_DOCS_PATH = "skills";

function getClaudeSkillsDocsUrl(language: Language) {
  const docsLocale = language === "zh" ? "zh-CN" : "en";
  return `${CLAUDE_CODE_DOCS_BASE_URL}/${docsLocale}/${CLAUDE_SKILLS_DOCS_PATH}`;
}

function isSkillsFileChangePath(path: string) {
  return path === "skills" || path.startsWith("skills/");
}

function formatImportResultSummary(template: string, importedCount: number, skippedCount: number) {
  return template
    .replace("{imported}", String(importedCount))
    .replace("{skipped}", String(skippedCount));
}

const importSkipReasonLabels: Record<SkillDirectoryImportSkipReason, TranslationKey> = {
  "invalid-id": "skills.importResultReason.invalidId",
  exists: "skills.importResultReason.exists",
  "missing-skill-md": "skills.importResultReason.missingSkillMd",
};

function formatImportCount(template: string, count: number) {
  return template.replace("{count}", String(count));
}

interface SkillImportResultDialogProps {
  result: SkillDirectoryImportResult;
  onConfirm: () => void;
}

function SkillImportResultDialog({ result, onConfirm }: SkillImportResultDialogProps) {
  const { t } = useI18n();
  const hasImported = result.imported.length > 0;
  const hasSkipped = result.skipped.length > 0;
  const isEmpty = !hasImported && !hasSkipped;
  const isAllSuccess = hasImported && !hasSkipped;
  const isAllFailed = !hasImported && hasSkipped;
  const statusTitle = isAllSuccess
    ? t("skills.importResultAllSuccessTitle")
    : isAllFailed
      ? t("skills.importResultAllFailedTitle")
      : hasSkipped
        ? t("skills.importResultPartialTitle")
        : t("skills.importResultEmptyTitle");
  const statusDescription = isAllSuccess
    ? formatImportResultSummary(
        t("skills.importResultImportedCount"),
        result.imported.length,
        result.skipped.length,
      )
    : hasSkipped
      ? formatImportResultSummary(
          t("skills.importResultSummary"),
          result.imported.length,
          result.skipped.length,
        )
      : t("skills.importResultEmptyDescription");
  const StatusIcon = hasSkipped || isEmpty ? CircleAlert : CheckCircle2;
  const summaryIconClass = hasSkipped
    ? "text-destructive"
    : isEmpty
      ? "text-muted-foreground"
      : "text-primary";

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        className="skills-import-result-dialog sm:max-w-xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("skills.importResultTitle")}</DialogTitle>
          <DialogDescription>{t("skills.importResultDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Card className="gap-0 py-0 shadow-none">
            <CardHeader className="grid-cols-[auto_1fr_auto] grid-rows-1 items-center gap-x-3 px-4 py-4">
              <StatusIcon className={cn("size-5 shrink-0", summaryIconClass)} aria-hidden="true" />
              <div className="min-w-0">
                <CardTitle>{statusTitle}</CardTitle>
                <CardDescription className="mt-1">{statusDescription}</CardDescription>
              </div>
              <CardAction className="col-start-3 row-span-1 row-start-1 flex flex-wrap justify-end gap-2">
                {hasImported ? (
                  <Badge variant="secondary">
                    {formatImportCount(
                      t("skills.importResultSuccessCount"),
                      result.imported.length,
                    )}
                  </Badge>
                ) : null}
                {hasSkipped ? (
                  <Badge variant="destructive">
                    {formatImportCount(t("skills.importResultFailureCount"), result.skipped.length)}
                  </Badge>
                ) : null}
              </CardAction>
            </CardHeader>
          </Card>

          {hasImported ? (
            <Card className="gap-0 py-0 shadow-none">
              <CardHeader className="px-4 py-3">
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                  <span>{t("skills.importResultSuccessTitle")}</span>
                </CardTitle>
                <CardAction>
                  <Badge variant="outline">
                    {formatImportCount(t("skills.importResultItemCount"), result.imported.length)}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="px-0 pb-1">
                <ScrollArea className="max-h-44">
                  <ul className="m-0 flex flex-col p-0">
                    {result.imported.map((id) => (
                      <li
                        key={id}
                        className="grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-border/70 px-4 py-2.5"
                      >
                        <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
                        <code className="min-w-0 truncate font-mono text-sm text-foreground">
                          {id}
                        </code>
                        <Badge variant="secondary">{t("skills.importResultImportedBadge")}</Badge>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>
          ) : null}

          {hasSkipped ? (
            <Card className="gap-0 py-0 shadow-none">
              <CardHeader className="px-4 py-3">
                <CardTitle className="flex items-center gap-2">
                  <CircleAlert className="size-4 text-destructive" aria-hidden="true" />
                  <span>{t("skills.importResultFailureTitle")}</span>
                </CardTitle>
                <CardAction>
                  <Badge variant="destructive">
                    {formatImportCount(t("skills.importResultItemCount"), result.skipped.length)}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="px-0 pb-1">
                <ScrollArea className="max-h-52">
                  <ul className="m-0 flex flex-col p-0">
                    {result.skipped.map((item) => (
                      <li
                        key={`${item.id}-${item.reason}`}
                        className="grid min-w-0 grid-cols-[auto_1fr_auto] items-start gap-3 border-t border-border/70 px-4 py-2.5"
                      >
                        <CircleAlert
                          className="mt-0.5 size-3.5 text-destructive"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <code className="block truncate font-mono text-sm text-foreground">
                            {item.id}
                          </code>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {t(importSkipReasonLabels[item.reason])}
                          </span>
                        </div>
                        <Badge variant="outline">{t("skills.importResultFailedBadge")}</Badge>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" onClick={onConfirm}>
            {t("skills.importResultConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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

interface SkillsPageProps {
  onDrawerChange?: (isOpen: boolean) => void;
  onEditorExitGuardChange?: (guard: EditorExitGuard | null) => void;
}

function SkillsPage({ onDrawerChange, onEditorExitGuardChange }: SkillsPageProps) {
  const { language, t } = useI18n();
  const { showToast } = useToast();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImportingDirectory, setIsImportingDirectory] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [pendingDuplicateSkill, setPendingDuplicateSkill] = useState<Skill | null>(null);
  const [pendingDeleteSkill, setPendingDeleteSkill] = useState<Skill | null>(null);
  const [pendingEditorExitAction, setPendingEditorExitAction] = useState<(() => void) | null>(null);
  const [isSavingEditorExit, setIsSavingEditorExit] = useState(false);
  const [directoryImportResult, setDirectoryImportResult] =
    useState<SkillDirectoryImportResult | null>(null);
  const skillEditorRef = useRef<SkillEditorHandle | null>(null);

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
      } catch (err) {
        showOperationError(showToast, t(errorMessage), err);
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
    } catch (err) {
      showOperationError(showToast, t("toast.skillToggleError"), err);
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
    } catch (err) {
      showOperationError(showToast, t("toast.skillDeleteError"), err);
    }
  }

  // 同步 Skill 到 Codex
  async function handleSync(skill: Skill) {
    try {
      await invoke("sync_skill_to_codex", { id: skill.id, isActive: skill.isActive });
      showToast(t("toast.skillSynced"));
    } catch (err) {
      showOperationError(showToast, t("toast.skillSyncError"), err);
    }
  }

  // 复制 Skill 为未启用的本地模板副本
  async function handleDuplicate(skill: Skill) {
    try {
      const duplicated = await invoke<Skill>("duplicate_skill", {
        id: skill.id,
        isActive: skill.isActive,
        nameSuffix: t("skills.duplicateSuffix"),
      });
      setSkills((prev) => {
        const next = prev.filter((item) => item.id !== duplicated.id);
        const sourceIndex = next.findIndex((item) => item.id === skill.id);
        if (sourceIndex === -1) {
          return [...next, duplicated];
        }
        return [...next.slice(0, sourceIndex + 1), duplicated, ...next.slice(sourceIndex + 1)];
      });
      showToast(t("toast.skillDuplicated"));
    } catch (err) {
      showOperationError(showToast, t("toast.skillDuplicateError"), err);
    }
  }

  function handleRequestDuplicate(skill: Skill) {
    if (skill.hasSymlinkContent) {
      setPendingDuplicateSkill(skill);
      return;
    }

    void handleDuplicate(skill);
  }

  // 保存（新建或编辑）后更新列表并关闭抽屉
  function handleSave(saved: Skill) {
    setSkills((prev) => {
      const exists = prev.some((s) => s.id === saved.id);
      return exists ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved];
    });
    closeDrawer();
  }

  const requestEditorExit = useCallback((action: () => void) => {
    if (skillEditorRef.current?.isDirty()) {
      setPendingEditorExitAction(() => action);
      return;
    }

    action();
  }, []);

  async function saveAndRunPendingEditorExit() {
    const action = pendingEditorExitAction;
    const editor = skillEditorRef.current;
    if (!action || !editor?.canSave()) {
      return;
    }

    setIsSavingEditorExit(true);
    try {
      const saved = await editor.save();
      if (saved) {
        setPendingEditorExitAction(null);
        action();
      }
    } finally {
      setIsSavingEditorExit(false);
    }
  }

  function discardAndRunPendingEditorExit() {
    const action = pendingEditorExitAction;
    setPendingEditorExitAction(null);
    action?.();
  }

  useEffect(() => {
    if (!onEditorExitGuardChange) {
      return;
    }

    if (!isDrawerOpen) {
      onEditorExitGuardChange(null);
      return;
    }

    onEditorExitGuardChange({ requestExit: requestEditorExit });
    return () => onEditorExitGuardChange(null);
  }, [isDrawerOpen, onEditorExitGuardChange, requestEditorExit]);

  // 打开新建抽屉
  function openAdd() {
    requestEditorExit(() => {
      setEditingSkill(null);
      setIsDrawerOpen(true);
      onDrawerChange?.(true);
    });
  }

  // 打开编辑抽屉
  function openEdit(skill: Skill) {
    requestEditorExit(() => {
      setEditingSkill(skill);
      setIsDrawerOpen(true);
      onDrawerChange?.(true);
    });
  }

  // 关闭抽屉并重置编辑状态
  function closeDrawer() {
    setEditingSkill(null);
    setIsDrawerOpen(false);
    setPendingEditorExitAction(null);
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
      setDirectoryImportResult(result);
    } catch (err) {
      showOperationError(showToast, t("toast.skillDirectoryImportError"), err);
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

  const sortedSkills = useMemo(() => sortSkillsForList(skills), [skills]);
  const hasAnySkill = skills.length > 0;
  const claudeSkillsDocsUrl = useMemo(() => getClaudeSkillsDocsUrl(language), [language]);

  const handleOpenDocs = useCallback(async () => {
    try {
      await openUrl(claudeSkillsDocsUrl);
    } catch (err) {
      showOperationError(showToast, t("skills.openDocsError"), err);
    }
  }, [claudeSkillsDocsUrl, showToast, t]);

  async function handleOpenInEditor(skill: Skill) {
    try {
      await invoke("open_skill_in_editor", { id: skill.id, isActive: skill.isActive });
      showToast(t("toast.skillOpenEditorRequested"));
    } catch (err) {
      showOperationError(showToast, t("toast.skillOpenEditorError"), err);
    }
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
        <section className="skill-groups flex flex-col gap-3 p-4" aria-label={t("skills.list")}>
          <div className="list-container flex flex-col gap-3">
            {sortedSkills.map((skill) => (
              <SkillItem
                key={skill.id}
                skill={skill}
                isEditing={isDrawerOpen && editingSkill?.id === skill.id}
                onToggle={handleToggle}
                onEdit={openEdit}
                onDelete={setPendingDeleteSkill}
                onDuplicate={handleRequestDuplicate}
                onSync={handleSync}
                onOpenExternal={handleOpenInEditor}
              />
            ))}
          </div>
        </section>
      )}

      {/* 删除确认对话框 */}
      {pendingDeleteSkill && (
        <ConfirmAlertDialog
          title={t(
            pendingDeleteSkill.isSymlink
              ? "confirm.deleteSymlinkSkillTitle"
              : "confirm.deleteSkillTitle",
          )}
          message={t(
            pendingDeleteSkill.isSymlink
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

      {pendingDuplicateSkill && (
        <ConfirmAlertDialog
          title={t("confirm.duplicateSymlinkSkillTitle")}
          message={t("confirm.duplicateSymlinkSkillMessage")}
          confirmText={t("skills.duplicate")}
          cancelText={t("confirm.cancel")}
          onConfirm={() => {
            const skill = pendingDuplicateSkill;
            setPendingDuplicateSkill(null);
            void handleDuplicate(skill);
          }}
          onCancel={() => setPendingDuplicateSkill(null)}
        />
      )}

      {directoryImportResult ? (
        <SkillImportResultDialog
          result={directoryImportResult}
          onConfirm={() => setDirectoryImportResult(null)}
        />
      ) : null}

      {/* 编辑/新建抽屉 */}
      {isDrawerOpen && (
        <Sheet open onOpenChange={(open) => !open && requestEditorExit(closeDrawer)}>
          <SheetContent
            side="right"
            showCloseButton={false}
            className={cn(
              LIST_DETAIL_DRAWER_OFFSET_CLASS,
              "w-auto border-l-0 bg-secondary p-0 shadow-floating sm:max-w-none",
            )}
          >
            <SheetTitle className="sr-only">{t("skills.title")}</SheetTitle>
            <SheetDescription className="sr-only">{t("skills.title")}</SheetDescription>
            <SkillEditor
              key={editingSkill?.id ?? "new-skill"}
              ref={skillEditorRef}
              skill={editingSkill}
              onSave={handleSave}
              onClose={() => requestEditorExit(closeDrawer)}
            />
          </SheetContent>
        </Sheet>
      )}

      {pendingEditorExitAction && (
        <UnsavedChangesAlertDialog
          canSave={skillEditorRef.current?.canSave() ?? false}
          isSaving={isSavingEditorExit}
          onCancel={() => setPendingEditorExitAction(null)}
          onDiscard={discardAndRunPendingEditorExit}
          onSaveAndExit={() => {
            void saveAndRunPendingEditorExit();
          }}
        />
      )}
    </div>
  );
}

export default SkillsPage;
