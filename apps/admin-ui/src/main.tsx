import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { registerNavIcons } from './app/register-icons';
import './styles.css';

registerNavIcons();

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
