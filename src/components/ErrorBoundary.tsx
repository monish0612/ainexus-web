import { Component, ErrorInfo, ReactNode } from 'react';
import { logClient } from '@/lib/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Top-level safety net: catches render-time crashes, reports them to the
 *  backend/Telegram relay, and shows a recoverable fallback instead of a white
 *  screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logClient(error.message || 'React render error', {
      context: 'ErrorBoundary',
      stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}`,
    });
  }

  private handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-bg px-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 text-2xl">
            ⚠️
          </div>
          <h1 className="text-lg font-semibold text-fg">Something went wrong</h1>
          <p className="text-sm text-fg3">
            The screen hit an unexpected error. It has been reported. You can
            reload to continue.
          </p>
          <button
            onClick={this.handleReload}
            className="mt-1 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
