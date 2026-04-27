// -----------------------------------------------------------
// Tag system — types, storage, and constants
// -----------------------------------------------------------

export type TagDefinition = {
  name: string;
  color?: string;
  createdAt: number;
};

export type TagConfig = {
  tags: TagDefinition[];
};

export const TAG_STORAGE_KEY = 'tagConfig';

export const MAX_TAGS_PER_HOLDING = 5;
export const MAX_TAG_NAME_LENGTH = 10;
export const MAX_GLOBAL_TAGS = 30;

export const DEFAULT_TAG_CONFIG: TagConfig = {
  tags: [],
};

export async function loadTagConfig(): Promise<TagConfig> {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    const result = await chrome.storage.sync.get(TAG_STORAGE_KEY);
    const raw = result[TAG_STORAGE_KEY] as Partial<TagConfig> | undefined;
    if (!raw) return DEFAULT_TAG_CONFIG;
    return normalizeTagConfig(raw);
  }
  try {
    const raw = window.localStorage.getItem(TAG_STORAGE_KEY);
    if (!raw) return DEFAULT_TAG_CONFIG;
    return normalizeTagConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_TAG_CONFIG;
  }
}

export async function saveTagConfig(config: TagConfig): Promise<void> {
  const normalized = normalizeTagConfig(config);
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    await chrome.storage.sync.set({ [TAG_STORAGE_KEY]: normalized });
    return;
  }
  window.localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(normalized));
}

function normalizeTagConfig(raw: Partial<TagConfig>): TagConfig {
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is TagDefinition =>
        t && typeof t.name === 'string' && t.name.trim().length > 0
      ).map(t => ({
        name: t.name.trim().slice(0, MAX_TAG_NAME_LENGTH),
        color: typeof t.color === 'string' ? t.color : undefined,
        createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
      }))
    : [];
  return { tags };
}

/**
 * Deterministic color from tag name — consistent hash-to-color
 */
const TAG_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

export function getTagColor(tagName: string): string {
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    hash = ((hash << 5) - hash) + tagName.charCodeAt(i);
    hash |= 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}
