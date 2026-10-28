import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./primitives";

/**
 * Last line of defence against a render error blanking the whole desk. A
 * failing chart or table is shown as a recoverable panel instead of a white
 * page; retrying remounts the subtree with the current controls.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Desk render failed", error, info.componentStack);
  }

  componentDidUpdate(previous: { resetKey?: string }) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          message={`${this.state.error.message} — the view was reset instead of blanking the page.`}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
