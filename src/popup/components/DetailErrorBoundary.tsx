import { Component } from 'react';

type Props = { children: React.ReactNode; onBack: () => void };
type State = { hasError: boolean; errorMessage: string };

export default class DetailErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message || String(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[DetailErrorBoundary]', error?.message, error?.stack, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
          <p style={{ marginBottom: 8, fontSize: 14 }}>详情加载异常，请重试</p>
          <p style={{ marginBottom: 12, fontSize: 11, wordBreak: 'break-all', maxWidth: 320, margin: '0 auto 12px' }}>{this.state.errorMessage}</p>
          <button type="button" onClick={this.props.onBack} style={{ padding: '6px 16px', cursor: 'pointer' }}>
            返回列表
          </button>
          <button type="button" onClick={() => this.setState({ hasError: false, errorMessage: '' })} style={{ padding: '6px 16px', cursor: 'pointer', marginLeft: 8 }}>
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
