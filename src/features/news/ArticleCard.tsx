import { motion } from 'framer-motion';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { Article } from '@/lib/api/news';
import { NEWS_CAT_COLOR } from '@/lib/constants';
import { relativeTime } from '@/lib/format';
import { useToggleSave } from './hooks';

interface Props {
  article: Article;
  onOpen: (a: Article) => void;
  featured?: boolean;
}

export function ArticleCard({ article, onOpen, featured }: Props) {
  const toggleSave = useToggleSave();
  const catColor = NEWS_CAT_COLOR[article.category] ?? '#38BDF8';

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onOpen(article)}
      className={`card group flex cursor-pointer flex-col overflow-hidden transition hover:border-line2 hover:shadow-card ${
        featured ? 'sm:col-span-2 lg:col-span-3' : ''
      }`}
    >
      {article.imageUrl && (
        <div className={`relative w-full overflow-hidden ${featured ? 'h-52 sm:h-72' : 'h-40'}`}>
          <img
            src={article.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            onError={(e) => ((e.target as HTMLImageElement).parentElement!.style.display = 'none')}
          />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
          {!article.isRead && (
            <span className="absolute left-3 top-3 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-black/40" />
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2 text-xs">
          <span
            className="rounded-full px-2 py-0.5 font-semibold"
            style={{ background: `${catColor}22`, color: catColor }}
          >
            {article.category}
          </span>
          <span className="truncate text-fg3">{article.source}</span>
        </div>

        <h3
          className={`font-bold leading-snug text-fg ${
            featured ? 'text-xl sm:text-2xl' : 'text-base'
          } line-clamp-3`}
        >
          {article.title}
        </h3>

        {(featured || !article.imageUrl) && article.excerpt && (
          <p className="line-clamp-2 text-sm text-fg3">{article.excerpt}</p>
        )}

        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-xs text-fg4">
            {relativeTime(article.publishedAt || article.date)}
            {article.readTime ? ` · ${article.readTime}` : ''}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleSave.mutate(article.id);
            }}
            className={`rounded-lg p-1.5 transition ${
              article.isSaved ? 'text-accent' : 'text-fg4 hover:text-fg'
            }`}
            aria-label={article.isSaved ? 'Unsave' : 'Save'}
          >
            {article.isSaved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
          </button>
        </div>
      </div>
    </motion.article>
  );
}
