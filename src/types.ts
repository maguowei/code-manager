export interface ClaudeConfig {
  id: string;
  name: string;
  description: string;
  apiKey: string;
  apiUrl?: string;
  model?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AppState {
  configs: ClaudeConfig[];
  activeConfigId: string | null;
}
