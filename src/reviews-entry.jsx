import React from 'react';
import ReactDOM from 'react-dom/client';
import ReviewsApp from './components/ReviewsApp.jsx';

document.documentElement.setAttribute('dir', 'rtl');
document.title = 'WhaStar';
document.body.style.margin = '0';
try {
  const hasSession = Boolean(JSON.parse(localStorage.getItem('resortos-review-session') || 'null')?.token);
  const theme = localStorage.getItem('resortos-review-theme');
  const page = hasSession
    ? (theme === 'dark' ? '#0C0A09' : '#F6F3EC')
    : '#F6F3EC';
  document.documentElement.style.background = page;
  document.body.style.background = page;
} catch (_) {
  document.documentElement.style.background = '#F6F3EC';
  document.body.style.background = '#F6F3EC';
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { message: '' };
  }

  static getDerivedStateFromError(error) {
    return { message: String(error?.message || error || 'טעינה נכשלה') };
  }

  render() {
    if (this.state.message) {
      return (
        <div dir="rtl" style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 420, margin: '40px auto' }}>
          <h1 style={{ fontSize: 20 }}>לא הצלחנו לטעון</h1>
          <p style={{ color: '#78716C' }}>{this.state.message}</p>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: '10px 16px', fontWeight: 800 }}>
            רענון
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ReviewsApp />
    </ErrorBoundary>
  </React.StrictMode>
);

if (window.Capacitor?.Plugins?.App?.addListener) {
  window.Capacitor.Plugins.App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack || window.history.length > 1) window.history.back();
    else window.Capacitor.Plugins.App.exitApp?.();
  });
}
