import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  /** What to show instead of the children once they've thrown. */
  fallback: (error: Error) => ReactNode;
  /** When this changes (new data, say), the children get another try. */
  resetKey?: unknown;
  children: ReactNode;
}

/**
 * Catches a render error in its children and shows `fallback` instead, so
 * one broken part of the page doesn't blank the rest.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}

/** The whole page broke: say so, and offer a reload. */
export function PageError({ error }: { error: Error }) {
  return (
    <div className="app">
      <h1>Time Off Tracker</h1>
      <p className="app-error" role="alert">
        Something went wrong: {error.message}
      </p>
      <p>
        <button type="button" className="button primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </p>
    </div>
  );
}
