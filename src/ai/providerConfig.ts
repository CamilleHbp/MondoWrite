export type AiProvider = "anthropic" | "chatgpt" | "openai" | "openrouter" | "ollama" | "lmstudio" | "apple";
export const AI_PROVIDERS: AiProvider[] = ["anthropic", "chatgpt", "openai", "openrouter", "ollama", "lmstudio", "apple"];
export const isAiProvider = (v: unknown): v is AiProvider => AI_PROVIDERS.includes(v as AiProvider);

interface ProviderInfo {
  /** Service local : adresse modifiable, jeton facultatif (LM Studio « Require Authentication »), les textes ne quittent pas la machine. */
  local: boolean;
  /** Adresse de base par défaut (sans barre finale). */
  url: string;
  /** Modèle proposé par défaut ; vide : à choisir (la liste vient du service). */
  model: string;
  /** Modèle du système (Apple) : ni adresse, ni clé, ni liste de modèles ; proposé selon l'appareil (ai/apple.ts). */
  device?: true;
}

export const PROVIDERS: Record<AiProvider, ProviderInfo> = {
  chatgpt: { local: false, url: "", model: "" },
  anthropic: { local: false, url: "https://api.anthropic.com", model: "claude-sonnet-5-5" },
  openai: { local: false, url: "https://api.openai.com", model: "" },
  openrouter: { local: false, url: "https://openrouter.ai/api", model: "openrouter/auto" },
  ollama: { local: true, url: "http://localhost:11434", model: "" },
  lmstudio: { local: true, url: "http://localhost:1234", model: "" },
  // « local » au sens où rien ne quitte l'appareil ; le modèle est celui du système, sans nom à choisir.
  apple: { local: true, url: "", model: "on-device", device: true },
};

export interface AiConfig {
  provider: AiProvider;
  planReady?: boolean;
  effort?: string;
  /** Clé d'API (services en ligne) ; jeton facultatif d'un serveur local qui en demande un. */
  key: string;
  model: string;
  /** Adresse du service local ; vide : adresse par défaut. */
  url: string;
}
