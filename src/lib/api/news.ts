import { api } from './client';
import { useSettingsStore, Provider } from '@/store/settingsStore';
import { buildModelHints, ModelMode } from '@/lib/modelHints';

export interface Article {
  id: string;
  title: string;
  excerpt: string;
  source: string;
  category: string;
  imageUrl: string | null;
  readTime: string | null;
  timeAgo: string | null;
  date: string | null;
  tag: string | null;
  isFeatured: boolean;
  isSaved: boolean;
  isRead: boolean;
  originalUrl: string;
  publishedAt: string | null;
  isFullContent: boolean;
  summaryMarkdown: string;
}

export interface ChatMessage {
  id: string;
  article_id: string;
  role: 'user' | 'assistant';
  text: string;
  model: string;
  sources_json: string;
  created_at: string;
}

export interface Source {
  index?: number;
  title: string;
  url: string;
}

export async function fetchNews(): Promise<Article[]> {
  const { data } = await api.get<{ articles: Article[] }>('/news');
  return data.articles ?? [];
}

export async function refreshNews(): Promise<{ count?: number }> {
  const { data } = await api.post('/news/refresh');
  return data ?? {};
}

export async function fetchArticle(id: string): Promise<Article> {
  const { data } = await api.get<{ article: Article }>(`/news/${id}`);
  return data.article;
}

export async function toggleSave(id: string): Promise<{ article: Article; saved: boolean }> {
  const { data } = await api.post(`/news/${id}/save`);
  return data;
}

export async function markRead(id: string): Promise<Article> {
  const { data } = await api.post<{ article: Article }>(`/news/${id}/read`);
  return data.article;
}

export async function markAllRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await api.post('/news/mark-all-read', { ids });
}

/** On-demand single-article AI summary (reuses the batch endpoint). */
export async function summarizeArticle(article: Article): Promise<string> {
  const { liteModel } = useSettingsStore.getState();
  const { data } = await api.post('/ai/summarize-articles-batch', {
    liteModel,
    articles: [
      {
        id: article.id,
        title: article.title,
        source: article.source || '',
        category: article.category || '',
        content: article.summaryMarkdown || article.excerpt || article.title,
      },
    ],
  });
  const summary = data?.summaries?.[0]?.summary;
  return summary || article.summaryMarkdown;
}

// ── Follow-up chat ──────────────────────────────────────────────────────────

export async function fetchArticleChats(articleId: string): Promise<ChatMessage[]> {
  const { data } = await api.get<ChatMessage[]>(`/article-chats/${articleId}`);
  return Array.isArray(data) ? data : [];
}

export async function saveArticleChat(msg: {
  id: string;
  articleId: string;
  role: string;
  text: string;
  model?: string;
  sourcesJson?: string;
  createdAt?: string;
}): Promise<void> {
  await api.post(`/article-chats/${msg.articleId}`, {
    id: msg.id,
    role: msg.role,
    text: msg.text,
    model: msg.model ?? '',
    sourcesJson: msg.sourcesJson ?? '[]',
    createdAt: msg.createdAt ?? new Date().toISOString(),
  });
}

export async function clearArticleChats(articleId: string): Promise<void> {
  await api.delete(`/article-chats/${articleId}`);
}

export interface FollowUpResult {
  answer: string;
  model: string;
  sources: Source[];
  searchQueries: string[];
}

export async function articleFollowUp(params: {
  article: Article;
  question: string;
  history: { role: string; text: string }[];
  provider?: Provider;
  mode?: ModelMode;
}): Promise<FollowUpResult> {
  const s = useSettingsStore.getState();
  const hints = buildModelHints({
    provider: params.provider ?? s.defaultFollowUpProvider,
    mode: params.mode ?? 'lite',
    deepModel: s.deepModel,
    liteModel: s.liteModel,
    xgrokLiteModel: s.xgrokLiteModel,
    xgrokDeepModel: s.xgrokDeepModel,
    xgrokThinkingModel: s.xgrokThinkingModel,
  });
  const { data } = await api.post('/ai/article-followup', {
    articleUrl: params.article.originalUrl,
    articleTitle: params.article.title,
    question: params.question,
    history: params.history,
    ...hints,
  });
  return {
    answer: data.answer ?? '',
    model: data.model ?? '',
    sources: data.sources ?? [],
    searchQueries: data.searchQueries ?? [],
  };
}
