import React from "react";
import { ErrorCard } from "../common";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("FikarNot render error:", error, info);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="container page-pad">
        <ErrorCard message={this.state.error?.message || "An unexpected error occurred."} onRetry={this.reset} />
      </div>
    );
  }
}
