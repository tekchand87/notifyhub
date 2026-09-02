import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './index.css';

// Apply saved theme on startup before render
const savedTheme = localStorage.getItem('nh_theme');
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark');
}

const root = document.getElementById('root');
if (!root) throw new Error('No #root element found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
