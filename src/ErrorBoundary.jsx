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
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔄</div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#6366F1', margin: '0 0 0.5rem 0' }}>
              מערכת ResortOS מתעדכנת...
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#94A3B8', lineHeight: 1.6, marginBottom: '1.25rem' }}>
              משהו נשבר בטעינת המסך. רענון קצר בדרך כלל מחזיר את המערכת.
            </p>
            <button
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.delete('_r');
                url.searchParams.set('_r', String(Date.now()));
                sessionStorage.removeItem('hotelos-eb-reload');
                window.location.replace(url.toString());
              }}
              style={{
                background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                color: '#FFF',
                border: 'none',
                borderRadius: '12px',
                padding: '0.75rem 1.5rem',
                fontSize: '0.9rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)'
              }}
            >
              רענן עמוד עכשיו 🔄
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
