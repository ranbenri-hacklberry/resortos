import React from 'react';
import ReactDOM from 'react-dom/client';
import { ResortOSApp } from './components/resortos/ResortOSApp';
import ErrorBoundary from './ErrorBoundary';
import './mialees.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ResortOSApp />
    </ErrorBoundary>
  </React.StrictMode>
);
