import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Article,
  fetchNews,
  markRead,
  refreshNews,
  toggleSave,
} from '@/lib/api/news';
import { toast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/lib/api/client';

const NEWS = ['news'];

export function useNews() {
  return useQuery({ queryKey: NEWS, queryFn: fetchNews, staleTime: 60_000 });
}

function patchArticle(qc: ReturnType<typeof useQueryClient>, id: string, patch: Partial<Article>) {
  qc.setQueryData<Article[]>(NEWS, (prev) =>
    (prev ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)),
  );
}

export function useToggleSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleSave,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: NEWS });
      const prev = qc.getQueryData<Article[]>(NEWS) ?? [];
      const cur = prev.find((a) => a.id === id);
      patchArticle(qc, id, { isSaved: !cur?.isSaved });
      return { prev };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(NEWS, ctx.prev);
      toast.error(apiErrorMessage(err, 'Could not update save'));
    },
    onSuccess: (res) => {
      patchArticle(qc, res.article.id, { isSaved: res.saved });
      toast.success(res.saved ? 'Saved' : 'Removed from saved');
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markRead,
    onMutate: async (id: string) => {
      patchArticle(qc, id, { isRead: true });
    },
  });
}

export function useRefreshNews() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: refreshNews,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NEWS });
      toast.success('News refreshed');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not refresh')),
  });
}
