import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          background: 'var(--card-bg)',
          borderRadius: '8px',
          margin: '2rem auto',
          maxWidth: '600px'
        }}>
          <h2 style={{ color: 'var(--accent)', marginBottom: '1rem' }}>
            ⚠️ Something went wrong
          </h2>
          <p style={{ color: 'var(--foreground)', marginBottom: '1rem' }}>
            The application encountered an unexpected error while rendering the results.
          </p>
          <details style={{
            marginTop: '1rem',
            textAlign: 'left',
            background: 'var(--background)',
            padding: '1rem',
            borderRadius: '4px'
          }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Error Details
            </summary>
            <pre style={{
              fontSize: '0.85rem',
              overflow: 'auto',
              color: '#ff6b6b'
            }}>
              {this.state.error && this.state.error.toString()}
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </pre>
          </details>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null, errorInfo: null });
              window.location.reload();
            }}
            style={{
              marginTop: '1.5rem',
              padding: '0.75rem 1.5rem',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
