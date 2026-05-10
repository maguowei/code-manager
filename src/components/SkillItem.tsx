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
        "skill-item group relative flex cursor-pointer flex-col gap-4 rounded-lg border border-border bg-card p-4 text-foreground shadow-panel transition-[transform,border-color,box-shadow,background-color,opacity] duration-200 hover:-translate-y-px hover:border-primary hover:bg-accent/40",
        skill.isActive ? "active border-primary ring-1 ring-primary/30" : "inactive",
        isEditing && "editing border-chart-3 ring-1 ring-chart-3/30 hover:border-chart-3",
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
        <div className="skill-info flex min-w-0 flex-1 flex-col gap-1.5 pt-px">
          <h3 className="skill-name m-0 truncate text-base leading-snug font-semibold text-foreground">
            {skill.name}
          </h3>
          {showSlashId && (
            <span className="skill-slash-id truncate font-mono text-xs text-muted-foreground">
              /{skill.id}
            </span>
          )}
        </div>

        {/* 右侧操作区：启用/禁用开关 */}
        <div className="skill-header-actions flex shrink-0 flex-wrap items-center justify-end gap-1.5 pt-0.5 group-[.compressed]/list:col-span-full group-[.compressed]/list:w-full group-[.compressed]/list:justify-start group-[.compressed]/list:pt-0">
          {isEditing && (
            <Badge className="skill-status editing rounded-md bg-chart-3/10 px-2.5 py-1.5 text-xs font-semibold text-chart-3">
              {t("skills.editing")}
            </Badge>
          )}
          {/* 开关按钮 */}
          <div
            className="skill-toggle-control inline-flex cursor-pointer select-none items-center gap-2 rounded-full border border-transparent bg-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border/80 hover:bg-card/80 hover:text-foreground focus-within:border-border/80 focus-within:bg-card/80"
            data-slot="switch-hit-area"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(skill);
            }}
          >
            <Switch
              size="sm"
              checked={skill.isActive}
              onCheckedChange={() => onToggle(skill)}
              onClick={(event) => event.stopPropagation()}
              aria-label={skill.isActive ? t("skills.enabled") : t("skills.disabled")}
              className="toggle-switch toggle-blue data-[state=checked]:bg-chart-2"
            />
            <span
              className={cn("toggle-label whitespace-nowrap", skill.isActive && "text-chart-2")}
            >
              {skill.isActive ? t("skills.enabled") : t("skills.disabled")}
            </span>
          </div>
        </div>
      </div>

      {/* 描述预览（最多 2 行，CSS 截断） */}
      {skill.description && (
        <p className="skill-description m-0 line-clamp-2 text-xs leading-normal text-muted-foreground">
          {skill.description}
        </p>
      )}

      {/* 悬停显示的操作按钮区 */}
      <div className="skill-actions pointer-events-none mt-[calc(1rem*-1)] flex max-h-0 translate-y-2 flex-wrap justify-end gap-2 self-end overflow-hidden opacity-0 transition-[max-height,margin-top,opacity,transform] duration-200 group-hover:mt-0 group-hover:max-h-12 group-hover:translate-y-0 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:mt-0 group-focus-within:max-h-12 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
        {/* 同步按钮 */}
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="skill-action-btn sync border border-border bg-muted text-foreground hover:border-chart-2 hover:text-chart-2"
          onClick={(e) => {
            e.stopPropagation();
            onSync(skill);
          }}
          aria-label={t("skills.syncToCodex")}
          title={t("skills.syncToCodex")}
        >
          <RefreshCw aria-hidden="true" />
        </Button>

        {/* 删除按钮 */}
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="skill-action-btn delete border border-border bg-muted text-foreground hover:border-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(skill);
          }}
          aria-label={t("skills.delete")}
          title={t("skills.delete")}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );
}

export default memo(SkillItem);
