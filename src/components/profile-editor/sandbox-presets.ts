import { readObject } from "./editor-utils";

// 本预设逐条镜像维护者 dotfiles 的 claude/settings.json 的 sandbox 段；
// 调整预设时需同步该文件，避免应用出来的配置与 dotfiles 漂移。
export const RECOMMENDED_SANDBOX_PRESET = {
  enabled: true,
  autoAllowBashIfSandboxed: true,
  credentials: {
    envVars: [
      { name: "AWS_ACCESS_KEY_ID", mode: "deny" },
      { name: "AWS_SECRET_ACCESS_KEY", mode: "deny" },
      { name: "AWS_SESSION_TOKEN", mode: "deny" },
      { name: "GH_TOKEN", mode: "deny" },
      { name: "GITHUB_TOKEN", mode: "deny" },
      { name: "GITLAB_TOKEN", mode: "deny" },
      { name: "NPM_TOKEN", mode: "deny" },
      { name: "ANTHROPIC_API_KEY", mode: "deny" },
      { name: "OPENAI_API_KEY", mode: "deny" },
    ],
    files: [
      { path: "~/.ssh", mode: "deny" },
      { path: "~/.aws", mode: "deny" },
      { path: "~/.gnupg", mode: "deny" },
      { path: "~/.config/gh", mode: "deny" },
      { path: "~/.config/gcloud", mode: "deny" },
      { path: "~/.kube", mode: "deny" },
      { path: "~/.docker/config.json", mode: "deny" },
      { path: "~/.git-credentials", mode: "deny" },
      { path: "~/.netrc", mode: "deny" },
      { path: "~/.pypirc", mode: "deny" },
    ],
  },
  // 只有联网类 git 子命令在沙箱外执行，以兼容凭据、hooks 与远端访问；
  // 其余 git 子命令仍在沙箱内运行
  excludedCommands: [
    "git push *",
    "git pull *",
    "git fetch *",
    "git clone *",
    "git ls-remote *",
    "git submodule *",
    "gh *",
    "docker *",
  ],
  network: {
    allowLocalBinding: true,
    allowedDomains: [
      "github.com",
      "*.githubusercontent.com",
      "ghcr.io",
      "registry.npmjs.org",
      "pypi.org",
      "files.pythonhosted.org",
      "proxy.golang.org",
      "sum.golang.org",
      "crates.io",
      "*.crates.io",
      "formulae.brew.sh",
    ],
  },
} as const;

interface SandboxPresetMergeResult {
  nextValue: Record<string, unknown>;
  changed: boolean;
}

function appendMissingStrings(value: unknown, additions: readonly string[]) {
  const currentItems = Array.isArray(value) ? [...value] : [];
  const currentStrings = new Set(
    currentItems.filter((item): item is string => typeof item === "string"),
  );
  let changed = !Array.isArray(value);

  for (const addition of additions) {
    if (currentStrings.has(addition)) {
      continue;
    }
    currentItems.push(addition);
    currentStrings.add(addition);
    changed = true;
  }

  return {
    value: currentItems,
    changed,
  };
}

// 按标识字段（name / path）去重追加；schema 只允许 mode: "deny"，已存在的同名条目无需覆盖
function appendMissingEntries(
  value: unknown,
  additions: readonly Record<string, string>[],
  identityKey: string,
) {
  const currentItems = Array.isArray(value) ? [...value] : [];
  const currentIds = new Set(
    currentItems.flatMap((item) => {
      const id = readObject(item)[identityKey];
      return typeof id === "string" ? [id] : [];
    }),
  );
  let changed = !Array.isArray(value);

  for (const addition of additions) {
    const id = addition[identityKey];
    if (currentIds.has(id)) {
      continue;
    }
    currentItems.push({ ...addition });
    currentIds.add(id);
    changed = true;
  }

  return {
    value: currentItems,
    changed,
  };
}

function mergeRecommendedCredentials(value: unknown) {
  const nextCredentials: Record<string, unknown> = { ...readObject(value) };
  const envVars = appendMissingEntries(
    nextCredentials.envVars,
    RECOMMENDED_SANDBOX_PRESET.credentials.envVars,
    "name",
  );
  const files = appendMissingEntries(
    nextCredentials.files,
    RECOMMENDED_SANDBOX_PRESET.credentials.files,
    "path",
  );
  if (envVars.changed) {
    nextCredentials.envVars = envVars.value;
  }
  if (files.changed) {
    nextCredentials.files = files.value;
  }

  return {
    value: nextCredentials,
    changed: envVars.changed || files.changed,
  };
}

export function mergeRecommendedSandboxPreset(value: unknown): SandboxPresetMergeResult {
  const sandboxObject = readObject(value);
  const nextValue: Record<string, unknown> = { ...sandboxObject };
  let changed = false;

  if (nextValue.enabled !== RECOMMENDED_SANDBOX_PRESET.enabled) {
    nextValue.enabled = RECOMMENDED_SANDBOX_PRESET.enabled;
    changed = true;
  }

  if (nextValue.autoAllowBashIfSandboxed !== RECOMMENDED_SANDBOX_PRESET.autoAllowBashIfSandboxed) {
    nextValue.autoAllowBashIfSandboxed = RECOMMENDED_SANDBOX_PRESET.autoAllowBashIfSandboxed;
    changed = true;
  }

  const credentials = mergeRecommendedCredentials(nextValue.credentials);
  if (credentials.changed) {
    nextValue.credentials = credentials.value;
    changed = true;
  }

  const excludedCommands = appendMissingStrings(
    nextValue.excludedCommands,
    RECOMMENDED_SANDBOX_PRESET.excludedCommands,
  );
  if (excludedCommands.changed) {
    nextValue.excludedCommands = excludedCommands.value;
    changed = true;
  }

  const networkObject = readObject(nextValue.network);
  const nextNetwork: Record<string, unknown> = { ...networkObject };
  let networkChanged = false;

  if (nextNetwork.allowLocalBinding !== RECOMMENDED_SANDBOX_PRESET.network.allowLocalBinding) {
    nextNetwork.allowLocalBinding = RECOMMENDED_SANDBOX_PRESET.network.allowLocalBinding;
    networkChanged = true;
  }

  const allowedDomains = appendMissingStrings(
    nextNetwork.allowedDomains,
    RECOMMENDED_SANDBOX_PRESET.network.allowedDomains,
  );
  if (allowedDomains.changed) {
    nextNetwork.allowedDomains = allowedDomains.value;
    networkChanged = true;
  }

  if (networkChanged) {
    nextValue.network = nextNetwork;
    changed = true;
  }

  return {
    nextValue,
    changed,
  };
}

export function hasRecommendedSandboxPreset(value: unknown): boolean {
  return !mergeRecommendedSandboxPreset(value).changed;
}
