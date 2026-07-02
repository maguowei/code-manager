import { enCheatsheet } from "./en/cheatsheet";
import { enCommon } from "./en/common";
import { enHistory } from "./en/history";
import { enMemory } from "./en/memory";
import { enProfiles } from "./en/profiles";
import { enProjects } from "./en/projects";
import { enSettings } from "./en/settings";
import { enSkills } from "./en/skills";
import { enStats } from "./en/stats";
import { enUsage } from "./en/usage";
import { zhCheatsheet } from "./zh/cheatsheet";
import { zhCommon } from "./zh/common";
import { zhHistory } from "./zh/history";
import { zhMemory } from "./zh/memory";
import { zhProfiles } from "./zh/profiles";
import { zhProjects } from "./zh/projects";
import { zhSettings } from "./zh/settings";
import { zhSkills } from "./zh/skills";
import { zhStats } from "./zh/stats";
import { zhUsage } from "./zh/usage";

export const catalogs = {
  zh: {
    common: zhCommon,
    settings: zhSettings,
    profiles: zhProfiles,
    memory: zhMemory,
    skills: zhSkills,
    projects: zhProjects,
    history: zhHistory,
    stats: zhStats,
    usage: zhUsage,
    cheatsheet: zhCheatsheet,
  },
  en: {
    common: enCommon,
    settings: enSettings,
    profiles: enProfiles,
    memory: enMemory,
    skills: enSkills,
    projects: enProjects,
    history: enHistory,
    stats: enStats,
    usage: enUsage,
    cheatsheet: enCheatsheet,
  },
} as const;

export const translations = {
  zh: {
    ...zhCommon,
    ...zhSettings,
    ...zhProfiles,
    ...zhMemory,
    ...zhSkills,
    ...zhProjects,
    ...zhHistory,
    ...zhStats,
    ...zhUsage,
    ...zhCheatsheet,
  },
  en: {
    ...enCommon,
    ...enSettings,
    ...enProfiles,
    ...enMemory,
    ...enSkills,
    ...enProjects,
    ...enHistory,
    ...enStats,
    ...enUsage,
    ...enCheatsheet,
  },
} as const;

export const i18nNamespaces = [
  "common",
  "settings",
  "profiles",
  "memory",
  "skills",
  "projects",
  "history",
  "stats",
  "usage",
  "cheatsheet",
] as const;
