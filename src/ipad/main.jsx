// Einstieg der iPad-Version (alte Safari-Versionen). Die normale App nutzt src/main.jsx.
import './polyfills.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App.jsx';
import '../styles.css';
import './ipad.css';

document.documentElement.lang = 'de';

const readOnly = /[?&]ansicht(=|&|$)/.test(window.location.search);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App readOnly={readOnly} />
  </StrictMode>,
);
