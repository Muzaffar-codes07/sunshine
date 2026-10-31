import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** A rendering failure must leave staff a recovery route instead of a blank screen. */
export class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section role="alert"><h1>Unable to display this workspace</h1>
      <p>Try displaying this page again, or return to your available workspaces.</p>
      <button onClick={() => this.setState({ failed: false })}>Retry display</button>
      <p><Link to="/workspace">Back to available workspaces</Link></p>
    </section>;
  }
}
