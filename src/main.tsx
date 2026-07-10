/**
 * Application entry point.
 *
 * Mounts the React application onto the #root element declared in index.html.
 * All game logic lives in src/engine; this file and the ui/ tree are purely
 * presentational plumbing.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  // index.html guarantees #root exists; failing loudly beats a blank page.
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
