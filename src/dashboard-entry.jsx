import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import './index.css';
import DashboardApp from './components/dashboard/DashboardApp.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <DashboardApp />
    </ErrorBoundary>
  </React.StrictMode>
);
