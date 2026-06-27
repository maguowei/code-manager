import type { RefObject } from "react";
import type { TranslationKey } from "../i18n";
import { ConversationSearchBar } from "./ConversationSearchBar";
import { useConversationSearch } from "./useConversationSearch";

/**
 * 查找容器：仅在查找栏开启时挂载，把 query/matchCount/currentIndex 等高频 state 局限在此小组件，
 * 输入时不重渲染父抽屉的数百条消息。引擎在 containerRef 内做匹配与高亮。
 */
export function ConversationSearch({
  containerRef,
  onClose,
  t,
}: {
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  t: (k: TranslationKey) => string;
}) {
  const { query, setQuery, matchCount, currentIndex, next, prev, inputRef } = useConversationSearch(
    containerRef,
    onClose,
  );

  return (
    <ConversationSearchBar
      query={query}
      onQueryChange={setQuery}
      matchCount={matchCount}
      currentIndex={currentIndex}
      onNext={next}
      onPrev={prev}
      onClose={onClose}
      inputRef={inputRef}
      t={t}
    />
  );
}
