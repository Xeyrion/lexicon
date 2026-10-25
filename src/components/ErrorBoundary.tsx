import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
  copied: boolean
}

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, copied: false }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[Lexicon] 页面渲染出错：', error, errorInfo.componentStack)
  }

  private summary(): string {
    const error = this.state.error
    if (!error) return '未知错误'
    return [error.name, error.message, error.stack].filter(Boolean).join('\n\n')
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  private handleHome = (): void => {
    window.location.hash = '#/'
    window.location.reload()
  }

  private handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(this.summary())
      this.setState({ copied: true })
    } catch {
      // 复制失败时保留可手动选中的错误摘要。
    }
  }

  render(): ReactNode {
    const error = this.state.error
    if (!error) return this.props.children

    return (
      <div className="flex min-h-svh items-center justify-center bg-paper px-4 py-10">
        <div className="surface-card w-full max-w-2xl p-7 sm:p-9">
          <p className="kicker">Lexicon</p>
          <h1 className="display mt-3 text-2xl text-ink sm:text-3xl">
            应用遇到了一点问题
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            页面渲染时发生了未捕获的错误。学习数据保存在本地文件中，通常不会因此丢失。可以先重新加载；如果问题反复出现，请把下面的错误摘要反馈给维护者。
          </p>

          <pre className="mt-5 max-h-64 overflow-auto rounded-2xl border border-line bg-paper-deep/40 p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-ink-soft select-text">
            {this.summary()}
          </pre>

          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={this.handleReload}>
              重新加载
            </button>
            <button type="button" className="btn btn-secondary" onClick={this.handleHome}>
              返回首页
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void this.handleCopy()}
            >
              {this.state.copied ? '已复制' : '复制错误信息'}
            </button>
          </div>

          <p className="mt-5 text-[10px] leading-relaxed text-faint">
            如果仍然无法打开，请先备份数据目录，再检查
            <code className="mx-1 rounded bg-sunken px-1 py-0.5">study.json</code>
            等文件，或从
            <code className="mx-1 rounded bg-sunken px-1 py-0.5">backups</code>
            目录恢复。
          </p>
        </div>
      </div>
    )
  }
}
