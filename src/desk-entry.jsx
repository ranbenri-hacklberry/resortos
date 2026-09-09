import React from 'react';
import ReactDOM from 'react-dom/client';
import './guest.css';
import './desk.css';
import DeskApp from './components/DeskApp.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DeskApp />
  </React.StrictMode>
);
