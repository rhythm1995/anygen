/**
 * 提示词远程源（D12 D-3b）——复用 vendor 默认 GitHub 源中的 JSON 型源，
 * 浏览器直读 raw.githubusercontent（CORS *），localStorage 24h 缓存，失败回退内置集。
 * 其余 markdown 型源（需逐仓库解析器/admin 管理）随 v2 开放。
 * 源与字段对齐 vendor/infinite-canvas service/prompt_fetch.go（AGPL-3.0）。
 */

export type RemotePrompt = {
    id: string;
    title: string;
    prompt: string;
    tag: string;
    coverUrl?: string;
};

type DavidWuPrompt = {
    id?: number;
    title_en?: string;
    title_cn?: string;
    category?: string;
    category_cn?: string;
    prompt?: string;
    image?: string;
};

const SOURCES: Array<{ key: string; base: string; file: string }> = [
    { key: "davidwu-gpt-image2-prompts", base: "https://raw.githubusercontent.com/davidwuw0811-boop/awesome-gpt-image2-prompts/main", file: "prompts.json" },
];

const CACHE_KEY = "anygen:canvas:prompt_sources";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheShape = { at: number; items: RemotePrompt[] };

function readCache(): RemotePrompt[] | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const cache = JSON.parse(raw) as CacheShape;
        if (!cache?.items?.length || Date.now() - cache.at > CACHE_TTL_MS) return null;
        return cache.items;
    } catch {
        return null;
    }
}

function writeCache(items: RemotePrompt[]) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items } satisfies CacheShape));
    } catch {
        // 存储不可用时静默降级为直连
    }
}

/** 拉取远程提示词（带缓存）；任一失败返回空数组（UI 回退内置集并如实标注） */
export async function fetchRemotePrompts(): Promise<RemotePrompt[]> {
    const cached = readCache();
    if (cached) return cached;

    const items: RemotePrompt[] = [];
    await Promise.all(
        SOURCES.map(async (source) => {
            try {
                const res = await fetch(`${source.base}/${source.file}`, { signal: AbortSignal.timeout?.(12_000) });
                if (!res.ok) return;
                const data = (await res.json()) as DavidWuPrompt[];
                if (!Array.isArray(data)) return;
                for (const item of data) {
                    const title = (item.title_cn ?? item.title_en ?? "").trim();
                    const prompt = (item.prompt ?? "").trim();
                    if (!title || !prompt) continue;
                    const image = item.image?.trim();
                    items.push({
                        id: `${source.key}-${item.id ?? title.slice(0, 24)}`,
                        title,
                        prompt,
                        tag: (item.category_cn ?? item.category ?? "GPT-Image").trim(),
                        ...(image ? { coverUrl: image.startsWith("http") ? image : `${source.base}/${image.replace(/^\.\//, "")}` } : {}),
                    });
                }
            } catch {
                // 单源失败不影响其余
            }
        }),
    );

    if (items.length) writeCache(items.slice(0, 400));
    return items.slice(0, 400);
}
