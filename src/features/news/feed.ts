import { Article } from '@/lib/api/news';
import { NO_SUMMARIZE_CATEGORIES } from '@/lib/constants';

export type NewsTab = 'foryou' | 'saved';

/**
 * Compute the visible news list for a given tab + category chip.
 *
 * Mirrors the Android app exactly
 * (lib/presentation/screens/news/news_screen.dart):
 *   • For You = articles that are UNREAD **and** UNSAVED, so already-read /
 *     saved / outdated stories never linger here. The "All" chip additionally
 *     hides the full-body Movies/General feeds — those appear only under their
 *     own chip (kNoSummarizeCategories on the app side).
 *   • Saved  = every saved article (read or not), optionally narrowed by chip.
 */
export function selectNewsFeed(
  articles: Article[],
  tab: NewsTab,
  category: string,
): Article[] {
  if (tab === 'saved') {
    const saved = articles.filter((a) => a.isSaved);
    return category === 'All' ? saved : saved.filter((a) => a.category === category);
  }
  const unreadUnsaved = articles.filter((a) => !a.isRead && !a.isSaved);
  return category === 'All'
    ? unreadUnsaved.filter((a) => !NO_SUMMARIZE_CATEGORIES.has(a.category))
    : unreadUnsaved.filter((a) => a.category === category);
}
