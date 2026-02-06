'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { WidgetError } from './WidgetError'

interface WidgetErrorBoundaryProps {
  title: string
  children: ReactNode
}

interface WidgetErrorBoundaryState {
  hasError: boolean
}

export class WidgetErrorBoundary extends Component<
  WidgetErrorBoundaryProps,
  WidgetErrorBoundaryState
> {
  constructor(props: WidgetErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): WidgetErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[WidgetErrorBoundary] ${this.props.title}:`, error, errorInfo)
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return <WidgetError title={this.props.title} onRetry={this.handleRetry} />
    }

    return this.props.children
  }
}
