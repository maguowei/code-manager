import { readObject } from "./editor-utils";

export const RECOMMENDED_SANDBOX_PRESET = {
  enabled: true,
  autoAllowBashIfSandboxed: true,
  credentials: {
    envVars: [
      { name: "AWS_ACCESS_KEY_ID", mode: "deny" },
      { name: "AWS_SECRET_ACCESS_KEY", mode: "deny" },
      { name: "AWS_SESSION_TOKEN", mode: "deny" },
      { name: "CLOUDSDK_PROXY_PASSWORD", mode: "deny" },
      { name: "GH_TOKEN", mode: "deny" },
      { name: "GITHUB_TOKEN", mode: "deny" },
      { name: "GITLAB_TOKEN", mode: "deny" },
      { name: "NPM_TOKEN", mode: "deny" },
    ],
    files: [
      { path: "~/.ssh", mode: "deny" },
      { path: "~/.aws", mode: "deny" },
      { path: "~/.gnupg", mode: "deny" },
      { path: "~/.kube", mode: "deny" },
      { path: "~/.docker/config.json", mode: "deny" },
      { path: "~/.config/gh", mode: "deny" },
      { path: "~/.config/gcloud", mode: "deny" },
      { path: "~/.git-credentials", mode: "deny" },
      { path: "~/.netrc", mode: "deny" },
      { path: "~/.npmrc", mode: "deny" },
      { path: "~/.pypirc", mode: "deny" },
    ],
  },
  // 仅排除需要联网、凭据或会写 .git/hooks 的命令，本地 git 操作仍留在沙箱内
  excludedCommands: [
    "git commit *",
    "git push *",
    "git pull *",
    "git fetch *",
    "git clone *",
    "git ls-remote *",
    "git remote *",
    "git submodule *",
    "git subtree *",
    "docker *",
    "gh *",
    "aws *",
    "gcloud *",
    "kubectl *",
    "helm *",
    "ssh *",
    "scp *",
  ],
  network: {
    allowLocalBinding: true,
    allowUnixSockets: ["/var/run/docker.sock"],
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

  const allowUnixSockets = appendMissingStrings(
    nextNetwork.allowUnixSockets,
    RECOMMENDED_SANDBOX_PRESET.network.allowUnixSockets,
  );
  if (allowUnixSockets.changed) {
    nextNetwork.allowUnixSockets = allowUnixSockets.value;
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
