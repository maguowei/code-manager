// 记忆卡片共享的展示格式化工具

import { composeMemoryEditorContent } from "../schemas/memory-schema";

/**
 * 统计记忆的文档行数，与编辑器（CodeMirror）显示完全一致。
 * 后端会把标题剥离到 name，这里用编辑器同款 composeMemoryEditorContent 把标题拼回，
 * 再按 CodeMirror 的「换行符数 + 1」计算，使卡片数字等于编辑器右下角最大行号。
 */
export function countMemoryDocumentLines(name: string, content: string): number {
  const doc = composeMemoryEditorContent(name, content);
  return (doc.match(/\n/g)?.length ?? 0) + 1;
}

/** 把字节数格式化为人类可读体量，例如「1.2 KB」 */
export function formatMemorySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
