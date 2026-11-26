// Einstieg der App für das TJ Padel Masters (29.11.2026). Läuft auch auf alten iPads
// (gleiche Ergänzungen wie die iPad-Version).
import '../ipad/polyfills.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '../styles.css';
import '../ipad/ipad.css';
import './masters.css';

document.documentElement.lang = 'de';
document.documentElement.setAttribute('data-theme', 'dark'); // Dunkelblau mit Gold – unabhängig von der Systemeinstellung

const search = window.location.search;
const readOnly = /[?&](ansicht|tv)(=|&|$)/.test(search);
const tv = /[?&]tv(=|&|$)/.test(search);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App readOnly={readOnly} tv={tv} />
  </StrictMode>,
);
