import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type { RefObject } from "react";
import type { TranslationKey } from "../i18n";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "./ui/input-group";

/** 对话详情应用内查找栏：输入框 + 匹配计数 + 上一个/下一个 + 关闭 */
export function ConversationSearchBar({
  query,
  onQueryChange,
  matchCount,
  currentIndex,
  onNext,
  onPrev,
  onClose,
  inputRef,
  t,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  matchCount: number;
  currentIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  t: (k: TranslationKey) => string;
}) {
  const hasQuery = query.trim().length > 0;
  const countLabel =
    hasQuery && matchCount === 0
      ? t("history.searchNoResults")
      : matchCount > 0
        ? `${currentIndex + 1} / ${matchCount}`
        : "";

  return (
    <div
      data-slot="conversation-search-bar"
      className="flex shrink-0 justify-end border-b bg-card/95 px-5 py-2 shadow-toolbar max-sm:px-3"
    >
      <InputGroup className="w-full max-w-sm bg-background shadow-xs">
        <InputGroupAddon align="inline-start">
          <Search className="text-muted-foreground" aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          value={query}
          placeholder={t("history.searchPlaceholder")}
          aria-label={t("history.searchPlaceholder")}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) onPrev();
              else onNext();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          {countLabel && (
            <InputGroupText className="tabular-nums text-xs">{countLabel}</InputGroupText>
          )}
          <InputGroupButton
            size="icon-xs"
            aria-label={t("history.searchPrev")}
            disabled={matchCount === 0}
            onClick={onPrev}
          >
            <ChevronUp aria-hidden="true" />
          </InputGroupButton>
          <InputGroupButton
            size="icon-xs"
            aria-label={t("history.searchNext")}
            disabled={matchCount === 0}
            onClick={onNext}
          >
            <ChevronDown aria-hidden="true" />
          </InputGroupButton>
          <InputGroupButton size="icon-xs" aria-label={t("history.searchClose")} onClick={onClose}>
            <X aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
