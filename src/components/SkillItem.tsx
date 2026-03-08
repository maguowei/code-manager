import { MouseEvent } from "react";
import { Skill } from "../types";
import { useI18n } from "../i18n";
import "./SkillItem.css";

// SkillItem 组件 Props 定义
interface SkillItemProps {
  skill: Skill;
  onEdit: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
  onToggle: (skill: Skill) => void;
}

// 根据字符串生成稳定的颜色索引（用于徽章背景色）
function getBadgeColorIndex(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
  }
  return hash % 6;
}

function SkillItem({ skill, onEdit, onDelete, onToggle }: SkillItemProps) {
  const { t } = useI18n();

  // 截断描述，最多显示 2 行（通过 CSS 控制）
  const descriptionPreview = skill.description || "";

  // 当 name 与 id 不同时显示 slash-command 路径
  const showSlashId = skill.name !== skill.id;

  // 阻止事件冒泡并执行操作
  function handleActionClick(e: MouseEvent<HTMLElement>, action: () => void) {
    e.stopPropagation();
    action();
  }

  const colorIndex = getBadgeColorIndex(skill.id);

  return (
    <div
      className={[
        "skill-item",
        skill.isActive ? "active" : "inactive",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onEdit(skill)}
    >
      <div className="skill-header">
        {/* 徽章：显示 name 首字母 */}
        <div className={`skill-badge skill-badge--color-${colorIndex}`}>
          <span className="badge-text">
            {skill.name ? skill.name.charAt(0).toUpperCase() : "S"}
          </span>
        </div>

        {/* 名称区域 */}
        <div className="skill-info">
          <h3 className="skill-name">{skill.name}</h3>
          {showSlashId && (
            <span className="skill-slash-id">/{skill.id}</span>
          )}
        </div>

        {/* 右侧操作区：启用/禁用开关 */}
        <div className="skill-header-actions">
          {/* toggle switch 开关 */}
          <button
            className={`skill-toggle${skill.isActive ? " enabled" : ""}`}
            onClick={(e) =>
              handleActionClick(e, () => onToggle(skill))
            }
            title={skill.isActive ? t("skills.enabled") : t("skills.disabled")}
          >
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
            <span className="toggle-label">
              {skill.isActive ? t("skills.enabled") : t("skills.disabled")}
            </span>
          </button>
        </div>
      </div>

      {/* 描述预览（最多 2 行，CSS 截断） */}
      {descriptionPreview && (
        <p className="skill-description">{descriptionPreview}</p>
      )}

      {/* 悬停显示的操作按钮区 */}
      <div className="skill-actions">
        {/* 编辑按钮 */}
        <button
          className="skill-action-btn edit"
          onClick={(e) => handleActionClick(e, () => onEdit(skill))}
          title={t("skills.editTitle")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>

        {/* 删除按钮 */}
        <button
          className="skill-action-btn delete"
          onClick={(e) => handleActionClick(e, () => onDelete(skill))}
          title={t("skills.delete")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default SkillItem;
