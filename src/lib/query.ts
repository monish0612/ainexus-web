import {
  QueryClient,
  QueryCache,
  MutationCache,
} from '@tanstack/react-query';
import { logClient } from './logger';
import { apiErrorMessage } from './api/client';
import axios from 'axios';

// 401s are handled (and logged) by the axios interceptor + login flow, and
// user-cancelled requests are not failures — skip both to keep Telegram clean.
function shouldReport(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ERR_CANCELED') return false;
    if (error.response?.status === 401) return false;
  }
  return true;
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (!shouldReport(error)) return;
      logClient(apiErrorMessage(error), {
        level: 'warn',
        context: `query:${String(query.queryKey?.[0] ?? 'unknown')}`,
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (!shouldReport(error)) return;
      logClient(apiErrorMessage(error), { level: 'warn', context: 'mutation' });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
