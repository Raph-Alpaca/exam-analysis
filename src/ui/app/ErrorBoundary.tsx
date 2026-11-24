import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

interface Props {
  children: ReactNode
  /** 이 값(주소)이 바뀌면 오류 화면을 풀고 다시 그려 본다 */
  resetKey?: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State {
    return { error }
  }
  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
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
