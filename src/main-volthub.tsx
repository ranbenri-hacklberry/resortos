import React from 'react';
import ReactDOM from 'react-dom/client';
import { VoltHubLanding } from './components/volthub/VoltHubLanding';
import ErrorBoundary from './ErrorBoundary';
import './volthub.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <VoltHubLanding />
    </ErrorBoundary>
  </React.StrictMode>
);
