import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { zodResolver } from "@hookform/resolvers/zod";
import { invoke } from "@tauri-apps/api/core";
import CodeMirror from "@uiw/react-codemirror";
import { ChevronLeft, CircleAlert, ExternalLink, FileText, Folder, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { showOperationError } from "@/lib/user-facing-error";
import { useCodeMirrorTheme } from "../hooks/useCodeMirrorTheme";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import { cn } from "../lib/utils";
import type { FieldConfig } from "../schemas/form-fields";
import {
  buildSkillDefaultValues,
  buildSkillPrimaryFields,
  SKILL_BOOLEAN_FIELDS,
  type SkillFormData,
  SkillSchema,
  toSkillPayload,
} from "../schemas/skill-schema";
import type { Skill, SkillFileTreeEntry } from "../types";
import CollapsibleSection from "./CollapsibleSection";
import ProfileNameBadge from "./ProfileNameBadge";
import {
  CONTROL_SURFACE_CLASS,
  PANEL_SURFACE_CLASS,
  SUBTLE_SURFACE_CLASS,
  TOOLBAR_SURFACE_CLASS,
} from "./surface-classes";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
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
  const isReadOnly = skill?.isSymlink === true;
  const primaryFields = buildSkillPrimaryFields(isEditing);

  const form = useForm<SkillFormData>({
    resolver: zodResolver(SkillSchema) as Resolver<SkillFormData>,
    defaultValues: buildSkillDefaultValues(skill),
    mode: "onBlur",
  });
  const { control, handleSubmit, watch } = form;

  // 支持文件相关状态
  const [fileTree, setFileTree] = useState<SkillFileTreeEntry[]>([]);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const watchId = watch("id");
  const canSave = watchId.trim().length > 0 && !isSaving && !isReadOnly;

  // 编辑模式下进入页面时自动懒加载支持文件
  // CollapsibleSection 暂不支持 onExpand 回调，故在 isEditing && !filesLoaded 时通过 useEffect 触发
  // biome-ignore lint/correctness/useExhaustiveDependencies: 仅在 isEditing 变化时触发，filesLoaded/loadFiles 为稳定引用
  useEffect(() => {
    if (isEditing && !isReadOnly && !filesLoaded) {
      void loadFiles();
    }
  }, [isEditing, isReadOnly]);

  // 懒加载支持文件（仅编辑模式下）
  async function loadFiles() {
    if (!skill || filesLoaded) return;
    try {
      const result = await invoke<SkillFileTreeEntry[]>("get_skill_file_tree", {
        id: skill.id,
        isActive: skill.isActive,
      });
      setFileTree(result);
      setFilesLoaded(true);
    } catch (err) {
      showOperationError(showToast, t("toast.skillLoadError"), err);
    }
  }

  // 提交表单，新建或更新 Skill
  async function handleSkillSubmit(data: SkillFormData) {
    if (isReadOnly) return;
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
      showOperationError(
        showToast,
        t(isEditing ? "toast.skillSaveError" : "toast.skillAddError"),
        err,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleOpenInEditor() {
    if (!skill) return;
    try {
      await invoke("open_skill_in_editor", { id: skill.id, isActive: skill.isActive });
      showToast(t("toast.skillOpenEditorRequested"));
    } catch (err) {
      showOperationError(showToast, t("toast.skillOpenEditorError"), err);
    }
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
                  disabled={isReadOnly}
                  readOnly={fieldConfig.readOnly || isReadOnly}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  className={cn(
                    "rounded-md border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    CONTROL_SURFACE_CLASS,
                    isReadOnly && "cursor-default opacity-75",
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
                  disabled={isReadOnly}
                  readOnly={fieldConfig.readOnly || isReadOnly}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  className={cn(
                    "h-auto rounded-md border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    CONTROL_SURFACE_CLASS,
                    fieldConfig.inputClassName,
                    (fieldConfig.readOnly || isReadOnly) &&
                      "cursor-default font-mono text-xs opacity-75",
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
                  disabled={isReadOnly}
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

  function renderFileTreeEntry(entry: SkillFileTreeEntry) {
    const Icon = entry.kind === "directory" ? Folder : FileText;
    return (
      <li
        key={entry.path}
        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-t border-border/70 px-3 py-2 first:border-t-0"
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <code className="min-w-0 truncate font-mono text-xs text-foreground">{entry.path}</code>
        {entry.kind === "file" ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {entry.isBinary ? (
              <Badge
                variant="secondary"
                className="skill-file-binary-tag rounded bg-muted px-1.5 py-px text-xs font-semibold text-muted-foreground"
              >
                {t("skills.binaryFile")}
              </Badge>
            ) : null}
            <span className="font-mono text-xs text-muted-foreground">
              {t("skills.fileSizeBytes").replace("{size}", String(entry.size))}
            </span>
          </div>
        ) : (
          <Badge variant="outline" className="rounded px-1.5 py-px text-xs font-normal">
            {t("skills.directory")}
          </Badge>
        )}
      </li>
    );
  }

  return (
    <Form {...form}>
      <div className="flex h-full min-h-0 w-full min-w-[560px] bg-secondary">
        <div
          className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-secondary"
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
              <div className="flex shrink-0 items-center gap-2">
                {isEditing ? (
                  <Button type="button" variant="outline" size="sm" onClick={handleOpenInEditor}>
                    <FolderOpen className="size-3.5" aria-hidden="true" />
                    <span>{t("skills.openInEditor")}</span>
                  </Button>
                ) : null}
                {!isReadOnly ? (
                  <Button type="submit" disabled={!canSave}>
                    {t("skills.save")}
                  </Button>
                ) : null}
              </div>
            </div>

            {/* 正文区域 */}
            <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto bg-secondary px-6 py-6 pb-6 [&>*]:shrink-0 [&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]">
              {/* 大徽章头像 */}
              <ProfileNameBadge name={watchId || skill?.id} size="lg" fallbackChar="S" />

              {isReadOnly ? (
                <section
                  data-slot="skill-editor-section"
                  className={cn("flex flex-col gap-2 rounded-lg border p-4", SUBTLE_SURFACE_CLASS)}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <CircleAlert className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span>{t("skills.symlinkReadonlyTitle")}</span>
                  </div>
                  <p className="m-0 text-xs leading-normal text-muted-foreground">
                    {t("skills.symlinkReadonlyDescription")}
                  </p>
                  {skill?.linkTarget ? (
                    <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {skill.linkTarget}
                    </code>
                  ) : null}
                </section>
              ) : null}

              <section
                data-slot="skill-editor-section"
                className={cn("flex flex-col gap-4 rounded-lg border p-4", PANEL_SURFACE_CLASS)}
              >
                {primaryFields.map(renderSkillField)}

                {/* 高级开关：disable-model-invocation 和 user-invocable */}
                <div className="flex flex-col gap-1">
                  {SKILL_BOOLEAN_FIELDS.map(renderSkillBooleanField)}
                </div>
              </section>

              {/* Markdown 内容编辑器 */}
              <section
                data-slot="skill-editor-section"
                className={cn("flex flex-col gap-3 rounded-lg border p-4", PANEL_SURFACE_CLASS)}
              >
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
                        onChange={isReadOnly ? undefined : field.onChange}
                        readOnly={isReadOnly}
                        editable={!isReadOnly}
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
              </section>

              {/* 支持文件区（仅编辑模式可用） */}
              {isEditing && !isReadOnly && (
                <CollapsibleSection
                  title={t("skills.files")}
                  badge={fileTree.length}
                  defaultExpanded
                >
                  <div
                    className={cn(
                      "skill-files-tree overflow-hidden rounded-md border",
                      PANEL_SURFACE_CLASS,
                    )}
                  >
                    {fileTree.length > 0 ? (
                      <ul className="m-0 flex flex-col p-0">{fileTree.map(renderFileTreeEntry)}</ul>
                    ) : (
                      <div className="px-3 py-3 text-xs text-muted-foreground">
                        {t("skills.fileTreeEmpty")}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 border-t border-border/70 px-3 py-2">
                      <p className="m-0 text-xs text-muted-foreground">
                        {t("skills.fileTreeReadonlyHint")}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={handleOpenInEditor}
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        {t("skills.openInEditor")}
                      </Button>
                    </div>
                  </div>
                </CollapsibleSection>
              )}
            </div>
          </form>
        </div>
      </div>
    </Form>
  );
}

export default SkillEditor;
