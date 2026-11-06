import { performance } from 'node:perf_hooks';

const APPROVED_PUBLIC_PATHS = ['/', '/faq', '/contact', '/privacy-policy'] as const;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_PAGE_CHARS = 6000;
const MAX_KNOWLEDGE_CHARS = 16000;

type KnowledgePage = { path: string; text: string };
type KnowledgeCache = { expiresAt: number; pages: KnowledgePage[] };

const globalKnowledge = globalThis as typeof globalThis & {
  __junkItOutKnowledge?: KnowledgeCache;
};

function getKnowledgeBaseUrl(): URL | null {
  const configured = process.env.KNOWLEDGE_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) return null;

  try {
    const url = new URL(configured);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

function extractText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PAGE_CHARS);
}

async function crawlApprovedPages(): Promise<KnowledgePage[]> {
  const baseUrl = getKnowledgeBaseUrl();
  if (!baseUrl) return [];

  const pages = await Promise.all(
    APPROVED_PUBLIC_PATHS.map(async (path): Promise<KnowledgePage | null> => {
      try {
        const url = new URL(path, baseUrl);
        const startedAt = performance.now();
        const response = await fetch(url, {
          headers: { Accept: 'text/html' },
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return null;
        const text = extractText(await response.text());
        if (!text) return null;
        console.info(JSON.stringify({
          event: 'support.knowledge.crawl',
          path,
          durationMs: Number((performance.now() - startedAt).toFixed(2)),
          chars: text.length,
        }));
        return { path, text };
      } catch (error) {
        console.warn(JSON.stringify({
          event: 'support.knowledge.crawl_failed',
          path,
          error: error instanceof Error ? error.name : 'unknown',
        }));
        return null;
      }
    }),
  );

  return pages.filter((page): page is KnowledgePage => Boolean(page));
}

async function getKnowledgePages(): Promise<KnowledgePage[]> {
  const now = Date.now();
  if (globalKnowledge.__junkItOutKnowledge?.expiresAt > now) {
    return globalKnowledge.__junkItOutKnowledge.pages;
  }

  const pages = await crawlApprovedPages();
  globalKnowledge.__junkItOutKnowledge = {
    expiresAt: now + CACHE_TTL_MS,
    pages,
  };
  return pages;
}

export async function retrievePublicKnowledge(query: string): Promise<string | null> {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
  if (terms.length === 0) return null;

  const pages = await getKnowledgePages();
  const relevant = pages
    .map((page) => ({
      ...page,
      score: terms.reduce(
        (score, term) => score + (page.text.toLowerCase().includes(term) ? 1 : 0),
        0,
      ),
    }))
    .filter((page) => page.score > 0)
    .sort((a, b) => b.score - a.score);

  if (relevant.length === 0) return null;
  return relevant
    .map((page) => `[${page.path}]\n${page.text}`)
    .join('\n\n')
    .slice(0, MAX_KNOWLEDGE_CHARS);
}
