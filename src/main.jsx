import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.jsx';
import './styles/base.css';
import './styles/workspace.css';
import './styles/sidebar.css';
import './styles/vendors.css';
import './styles/connectivo.css';
createRoot(document.getElementById('root')).render(<App />);
