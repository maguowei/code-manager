import { describe, expect, it } from "vitest";
import type { TranslationKey } from "@/i18n";
import type { ClaudeDirectoryEntry, ClaudeFilePreview } from "@/types";
import {
  absolutePreviewPath,
  defaultViewModeForPath,
  fileContentsForPreview,
  formatBytes,
  formatModifiedAt,
  formatPreviewEncoding,
  formatPreviewSymlinkFooter,
  formatSymlinkTargetLabel,
  isMarkdownPath,
  normalizeTreePath,
  pathCrossesSymlink,
  treePathForEntry,
} from "../file-viewer-utils";

// 测试用 t：默认回显 key 便于断言分支落点；viaSymlink 保留占位模板以覆盖 replace 分支
const t = (key: TranslationKey) =>
  key === "claudeOverview.viaSymlink" ? "经软链 {path} → {target}" : (key as string);

function makeEntry(overrides: Partial<ClaudeDirectoryEntry>): ClaudeDirectoryEntry {
  return {
    path: "a",
    name: "a",
    kind: "file",
    size: 0,
    modifiedAt: 0,
    isSymlink: false,
    isBroken: false,
    isCycle: false,
    ...overrides,
  };
}

function makePreview(overrides: Partial<ClaudeFilePreview>): ClaudeFilePreview {
  return {
    path: "notes.md",
    name: "notes.md",
    content: "",
    isBinary: false,
    truncated: false,
    size: 0,
    modifiedAt: 0,
    encoding: "utf-8",
    isSymlink: false,
    isBroken: false,
    ...overrides,
  };
}

describe("isMarkdownPath", () => {
  it("识别 md / markdown 后缀且忽略大小写", () => {
    expect(isMarkdownPath("README.md")).toBe(true);
    expect(isMarkdownPath("notes.MARKDOWN")).toBe(true);
  });

  it("非 markdown 或无后缀返回 false", () => {
    expect(isMarkdownPath("config.json")).toBe(false);
    expect(isMarkdownPath("Makefile")).toBe(false);
  });
});

describe("defaultViewModeForPath", () => {
  it("markdown 默认预览，其它源码", () => {
    expect(defaultViewModeForPath("a.md")).toBe("preview");
    expect(defaultViewModeForPath("a.txt")).toBe("source");
  });

  it("空路径回退源码", () => {
    expect(defaultViewModeForPath(null)).toBe("source");
    expect(defaultViewModeForPath(undefined)).toBe("source");
    expect(defaultViewModeForPath("")).toBe("source");
  });
});

describe("treePathForEntry", () => {
  it("目录补尾斜杠，文件保持原样", () => {
    expect(treePathForEntry(makeEntry({ path: "dir", kind: "directory" }))).toBe("dir/");
    expect(treePathForEntry(makeEntry({ path: "dir/file", kind: "file" }))).toBe("dir/file");
  });
});

describe("normalizeTreePath", () => {
  it("去掉尾斜杠，空串直接返回", () => {
    expect(normalizeTreePath("dir/")).toBe("dir");
    expect(normalizeTreePath("dir")).toBe("dir");
    expect(normalizeTreePath("")).toBe("");
  });
});

describe("pathCrossesSymlink", () => {
  it("路径自身或任一祖先为软链时返回 true", () => {
    const map = new Map<string, ClaudeDirectoryEntry>([
      ["a", makeEntry({ path: "a", isSymlink: true })],
    ]);
    expect(pathCrossesSymlink("a/b/c", map)).toBe(true);
  });

  it("链路上无软链时返回 false", () => {
    const map = new Map<string, ClaudeDirectoryEntry>([
      ["a", makeEntry({ path: "a" })],
      ["a/b", makeEntry({ path: "a/b" })],
    ]);
    expect(pathCrossesSymlink("a/b", map)).toBe(false);
  });
});

describe("formatSymlinkTargetLabel", () => {
  it("损坏软链带原始目标时拼接目标", () => {
    expect(formatSymlinkTargetLabel({ linkTarget: " ../x ", isBroken: true, t })).toBe(
      "claudeOverview.symlinkBroken: ../x",
    );
  });

  it("损坏软链无目标时只回退文案", () => {
    expect(formatSymlinkTargetLabel({ linkTarget: "  ", isBroken: true, t })).toBe(
      "claudeOverview.symlinkBroken",
    );
  });

  it("循环软链优先绝对目标再回退原始目标", () => {
    expect(formatSymlinkTargetLabel({ linkTargetAbsolute: " /abs ", isCycle: true, t })).toBe(
      "claudeOverview.symlinkCycle: /abs",
    );
    expect(formatSymlinkTargetLabel({ linkTarget: "rel", isCycle: true, t })).toBe(
      "claudeOverview.symlinkCycle: rel",
    );
  });

  it("循环软链无任何目标时只回退文案", () => {
    expect(formatSymlinkTargetLabel({ isCycle: true, t })).toBe("claudeOverview.symlinkCycle");
  });

  it("绝对与原始目标不同则并列展示", () => {
    expect(formatSymlinkTargetLabel({ linkTargetAbsolute: "/abs/x", linkTarget: "../x", t })).toBe(
      "/abs/x ← ../x",
    );
  });

  it("绝对目标缺失时回退原始目标，均缺失回退 badge 文案", () => {
    expect(formatSymlinkTargetLabel({ linkTarget: "rel", t })).toBe("rel");
    expect(formatSymlinkTargetLabel({ t })).toBe("claudeOverview.symlinkBadge");
  });
});

describe("formatPreviewSymlinkFooter", () => {
  it("损坏软链走损坏分支", () => {
    expect(formatPreviewSymlinkFooter(makePreview({ isBroken: true, linkTarget: "../x" }), t)).toBe(
      "claudeOverview.symlinkBroken: ../x",
    );
  });

  it("既非软链也非经软链时返回 null", () => {
    expect(formatPreviewSymlinkFooter(makePreview({}), t)).toBeNull();
  });

  it("叶子自身为软链时带 badge 箭头", () => {
    expect(
      formatPreviewSymlinkFooter(makePreview({ isSymlink: true, linkTargetAbsolute: "/abs/x" }), t),
    ).toBe("claudeOverview.symlinkBadge → /abs/x");
  });

  it("经软链可达时替换 path 与 target 占位", () => {
    expect(
      formatPreviewSymlinkFooter(
        makePreview({ viaSymlinkPath: "link", linkTargetAbsolute: "/abs/x" }),
        t,
      ),
    ).toBe("经软链 link → /abs/x");
  });

  it("经软链但 viaSymlinkPath 为空时占位替换为空串", () => {
    expect(
      formatPreviewSymlinkFooter(
        makePreview({ viaSymlinkPath: null, isSymlink: true, linkTarget: "rel" }),
        t,
      ),
    ).toBe("claudeOverview.symlinkBadge → rel");
  });
});

describe("formatBytes", () => {
  it("按 B / KB / MB 分级", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("formatModifiedAt", () => {
  it("0 时间戳返回占位符", () => {
    expect(formatModifiedAt(0)).toBe("-");
  });

  it("非零时间戳格式化为本地时间字符串", () => {
    expect(formatModifiedAt(1_700_000_000)).toBe(new Date(1_700_000_000 * 1000).toLocaleString());
  });
});

describe("formatPreviewEncoding", () => {
  it("映射已知编码", () => {
    expect(formatPreviewEncoding("utf-8", t)).toBe("claudeOverview.encodingUtf8");
    expect(formatPreviewEncoding("utf-8-lossy", t)).toBe("claudeOverview.encodingUtf8Lossy");
    expect(formatPreviewEncoding("binary", t)).toBe("claudeOverview.encodingBinary");
  });

  it("未知编码回显原值，缺失回退未知文案", () => {
    expect(formatPreviewEncoding("gbk", t)).toBe("gbk");
    expect(formatPreviewEncoding(undefined, t)).toBe("claudeOverview.encodingUnknown");
  });
});

describe("fileContentsForPreview", () => {
  it("缺 name 时回退 path，并按 path/size/modifiedAt 组 cacheKey", () => {
    const contents = fileContentsForPreview(
      makePreview({ name: "", path: "a/b.md", content: "hi", size: 3, modifiedAt: 9 }),
    );
    expect(contents.name).toBe("a/b.md");
    expect(contents.contents).toBe("hi");
    expect(contents.cacheKey).toBe("a/b.md:3:9");
  });
});

describe("absolutePreviewPath", () => {
  it("拼接时去掉根路径尾斜杠", () => {
    expect(absolutePreviewPath("/root/", "a/b.md")).toBe("/root/a/b.md");
    expect(absolutePreviewPath("/root", "a/b.md")).toBe("/root/a/b.md");
  });
});
