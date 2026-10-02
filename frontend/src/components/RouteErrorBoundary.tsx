import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[RouteErrorBoundary] Route failed to render or load chunk:', error, errorInfo);
    // If chunk loading failed and we haven't reloaded yet, reload to pull newest asset bundles
    const isChunkError =
      error.name === 'ChunkLoadError' ||
      /Loading chunk|Failed to fetch dynamically imported module/i.test(error.message);

    if (isChunkError && typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      const reloadKey = 'crm.chunk_reload_attempted';
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, 'true');
        window.location.reload();
      }
    }
  }

  handleRetry = () => {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('crm.chunk_reload_attempted');
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Failed to load page</h2>
          <p className="mt-1 text-sm text-gray-500 max-w-md">
            A network issue or an updated application version prevented this page from loading.
          </p>
          <div className="mt-6 flex gap-3">
            <Button onClick={this.handleRetry}>Reload page</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
