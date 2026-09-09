import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './index.css';

if (import.meta.hot && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '')) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Suspense fallback={
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F172A', color: '#FFF' }}>
          <div style={{ width: '36px', height: '36px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#6366F1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      }>
        <App />
      </Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);
