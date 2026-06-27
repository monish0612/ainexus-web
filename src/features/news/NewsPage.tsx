import { useMemo, useState } from 'react';
import { Newspaper, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader, SubTabs } from '@/components/layout/PageHeader';
import { EmptyState, SkeletonCard, Spinner } from '@/components/ui/primitives';
import { NEWS_CATEGORIES } from '@/lib/constants';
import { Article } from '@/lib/api/news';
import { useNews, useRefreshNews } from './hooks';
import { ArticleCard } from './ArticleCard';
import { ArticleReader } from './ArticleReader';

type Tab = 'foryou' | 'saved';

export default function NewsPage() {
  const { data: articles = [], isLoading } = useNews();
  const refresh = useRefreshNews();
  const [tab, setTab] = useState<Tab>('foryou');
  const [category, setCategory] = useState<string>('All');
  const [active, setActive] = useState<Article | null>(null);

  const filtered = useMemo(() => {
    let list = tab === 'saved' ? articles.filter((a) => a.isSaved) : articles;
    if (category !== 'All') list = list.filter((a) => a.category === category);
    return list;
  }, [articles, tab, category]);

  const featured = tab === 'foryou' && category === 'All' ? filtered[0] : undefined;
  const rest = featured ? filtered.slice(1) : filtered;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="News"
        subtitle="Curated finance, AI, movies & more"
        actions={
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="btn-ghost px-3 py-2 text-sm"
          >
            {refresh.isPending ? <Spinner size={16} /> : <RefreshCw size={16} />}
            <span className="hidden sm:inline">Refresh</span>
          </button>
        }
        tabs={
          <div className="flex flex-col gap-3">
            <SubTabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'foryou', label: 'For You' },
                { value: 'saved', label: 'Saved' },
              ]}
            />
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {['All', ...NEWS_CATEGORIES].map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={clsx(
                    'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
                    category === c
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-line bg-bg2 text-fg3 hover:text-fg',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className="mx-auto w-full max-w-content flex-1 px-4 py-5 sm:px-6">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} className="h-64" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Newspaper size={28} />}
            title={tab === 'saved' ? 'No saved articles' : 'No articles here yet'}
            hint={
              tab === 'saved'
                ? 'Tap the bookmark on any article to save it for later.'
                : 'Pull a refresh to fetch the latest stories.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured && <ArticleCard article={featured} onOpen={setActive} featured />}
            {rest.map((a) => (
              <ArticleCard key={a.id} article={a} onOpen={setActive} />
            ))}
          </div>
        )}
      </div>

      <ArticleReader article={active} onClose={() => setActive(null)} />
    </div>
  );
}
