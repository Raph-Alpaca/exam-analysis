import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[exam-analysis]', error.message, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <main className="container page">
          <div className="card stack">
            <h1>문제가 생겼습니다</h1>
            <p className="muted">{this.state.error.message}</p>
            <p>
              <a className="btn btn-primary" href="#/" onClick={() => this.setState({ error: null })}>
                처음 화면으로
              </a>
            </p>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
