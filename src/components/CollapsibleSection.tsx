import { useState } from "react";

interface CollapsibleSectionProps {
  title: string;
  badge?: number;
  children: React.ReactNode;
}

function CollapsibleSection({ title, badge, children }: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`collapsible-section ${expanded ? "expanded" : ""}`}>
      <div className="collapsible-header" onClick={() => setExpanded(!expanded)}>
        <div className="collapsible-header-left">
          <span className="collapsible-title">{title}</span>
          {badge !== undefined && badge > 0 && (
            <span className="collapsible-badge">{badge}</span>
          )}
        </div>
        <svg
          className="collapsible-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      <div className="collapsible-content">
        <div className="collapsible-body">{children}</div>
      </div>
    </div>
  );
}

export default CollapsibleSection;
