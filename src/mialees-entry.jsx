import React from 'react';
import ReactDOM from 'react-dom/client';
import './mialees.css';
import { MialeesResortApp } from './components/mialees/MialeesResortApp';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <MialeesResortApp />
    </React.StrictMode>
  );
}
