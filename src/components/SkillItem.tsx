import { RefreshCw, Trash2 } from "lucide-react";
import { type KeyboardEvent, memo } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "../i18n";
import type { Skill } from "../types";
import ProfileNameBadge from "./ProfileNameBadge";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Switch } from "./ui/switch";

// SkillItem 组件属性定义
interface SkillItemProps {
  skill: Skill;
  isEditing?: boolean;
  onEdit: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
  onToggle: (skill: Skill) => void;
  onSync: (skill: Skill) => void;
}

function SkillItem({ skill, isEditing, onEdit, onDelete, onToggle, onSync }: SkillItemProps) {
  const { t } = useI18n();

  // 当 name 与 id 不同时显示 slash-command 路径
  const showSlashId = skill.name !== skill.id;

  function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onEdit(skill);
    }
  }

  return (
    <Card
      className={cn(
        "skill-item group relative flex cursor-pointer flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--border-default)] bg-[linear-gradient(180deg,var(--bg-primary),var(--bg-secondary))] p-4 text-[var(--text-primary)] shadow-none transition-[transform,border-color,box-shadow,background-color,opacity] duration-200 hover:-translate-y-px hover:border-[var(--accent-blue)] hover:shadow-[0_4px_12px_rgb(59_130_246_/_0.15)]",
        skill.isActive
          ? "active border-[var(--accent-blue)] shadow-[0_0_0_1px_var(--accent-blue)_inset,0_0_16px_rgb(59_130_246_/_0.2)]"
          : "inactive",
        isEditing &&
          "editing border-[var(--accent-orange)] shadow-[0_0_0_1px_var(--accent-orange)_inset,0_0_18px_rgb(247_129_102_/_0.24)] hover:border-[var(--accent-orange)]",
      )}
      role="button"
      tabIndex={0}
      aria-label={skill.name}
      onClick={() => onEdit(skill)}
      onKeyDown={handleCardKeyDown}
    >
      <div className="skill-header flex items-start justify-between gap-3 group-[.compressed]/list:grid group-[.compressed]/list:grid-cols-[auto_minmax(0,1fr)] group-[.compressed]/list:justify-stretch">
        <ProfileNameBadge name={skill.name} colorSeedScope={skill.id} size="sm" fallbackChar="S" />

        {/* 名称区域 */}
        <div className="skill-info flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="skill-name m-0 truncate text-[length:var(--font-lg)] font-semibold text-[var(--text-primary)]">
            {skill.name}
          </h3>
          {showSlashId && (
            <span className="skill-slash-id truncate font-mono text-[length:var(--font-xs)] text-[var(--text-muted)]">
              /{skill.id}
            </span>
          )}
        </div>

        {/* 右侧操作区：启用/禁用开关 */}
        <div className="skill-header-actions flex shrink-0 flex-wrap items-center justify-end gap-1.5 group-[.compressed]/list:col-span-full group-[.compressed]/list:w-full group-[.compressed]/list:justify-start">
          {isEditing && (
            <Badge className="skill-status editing rounded-[var(--radius-md)] bg-[var(--accent-orange-bg)] px-2.5 py-1.5 text-[length:var(--font-sm)] font-semibold text-[var(--accent-orange)]">
              {t("skills.editing")}
            </Badge>
          )}
          {/* 开关按钮 */}
          <div className="skill-toggle-control inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[length:var(--font-sm)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
            <Switch
              size="sm"
              checked={skill.isActive}
              onCheckedChange={() => onToggle(skill)}
              onClick={(event) => event.stopPropagation()}
              aria-label={skill.isActive ? t("skills.enabled") : t("skills.disabled")}
              className="toggle-switch toggle-blue data-[state=checked]:bg-[var(--accent-blue)]"
            />
            <span
              className={cn(
                "toggle-label whitespace-nowrap",
                skill.isActive && "text-[var(--accent-blue)]",
              )}
            >
              {skill.isActive ? t("skills.enabled") : t("skills.disabled")}
            </span>
          </div>
        </div>
      </div>

      {/* 描述预览（最多 2 行，CSS 截断） */}
      {skill.description && (
        <p className="skill-description m-0 line-clamp-2 text-[length:var(--font-sm)] leading-normal text-[var(--text-secondary)]">
          {skill.description}
        </p>
      )}

      {/* 悬停显示的操作按钮区 */}
      <div className="skill-actions pointer-events-none mt-[calc(var(--space-4)*-1)] flex max-h-0 translate-y-2 flex-wrap justify-end gap-2 self-end overflow-hidden opacity-0 transition-[max-height,margin-top,opacity,transform] duration-200 group-hover:mt-0 group-hover:max-h-12 group-hover:translate-y-0 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:mt-0 group-focus-within:max-h-12 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
        {/* 同步按钮 */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="skill-action-btn sync border border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:border-[var(--accent-green)] hover:text-[var(--accent-green)]"
          onClick={(e) => {
            e.stopPropagation();
            onSync(skill);
          }}
          aria-label={t("skills.syncToCodex")}
          title={t("skills.syncToCodex")}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
        </Button>

        {/* 删除按钮 */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="skill-action-btn delete border border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:border-[var(--accent-red)] hover:text-[var(--accent-red)]"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(skill);
          }}
          aria-label={t("skills.delete")}
          title={t("skills.delete")}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );
}

export default memo(SkillItem);
