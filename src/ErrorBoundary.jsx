import React, { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[REACT ERROR BOUNDARY]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#0A0A0C',
          color: '#F8FAFC',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            background: '#141416',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '20px',
            padding: '2rem',
            maxWidth: '420px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⚠️</div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#F43F5E', margin: '0 0 0.5rem 0' }}>
              שגיאה בטעינת המסך
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#94A3B8', lineHeight: 1.6, marginBottom: '1rem' }}>
              {this.state.error?.message || 'אירעה שגיאה בלתי צפויה ברכיב.'}
            </p>
            {this.state.error?.stack ? (
              <pre style={{
                maxHeight: '160px',
                overflow: 'auto',
                background: '#0D0D11',
                padding: '0.75rem',
                borderRadius: '8px',
                fontSize: '0.72rem',
                color: '#CBD5E1',
                textAlign: 'left',
                direction: 'ltr',
                marginBottom: '1.25rem',
                border: '1px solid rgba(255,255,255,0.08)'
              }}>
                {this.state.error.stack}
              </pre>
            ) : null}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.delete('_r');
                  url.searchParams.set('_r', String(Date.now()));
                  window.location.replace(url.toString());
                }}
                style={{
                  background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '0.75rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)'
                }}
              >
                רענן עמוד 🔄
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem('hotelos_active_tab');
                    sessionStorage.clear();
                  } catch {}
                  window.location.href = window.location.pathname;
                }}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: '#F8FAFC',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  padding: '0.75rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                חזור לראשי 🏠
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
