import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import { registerNavIcons } from './app/register-icons';
import './styles.css';

registerNavIcons();

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

// No <StrictMode>: buro 0.6's cursor lists (`useInfiniteList`) dispose their page observer in
// StrictMode's simulated unmount and never show the first page in development (append-only
// logs such as detections and device events stayed empty). `tasks/ui/buro-gaps.md` G38.
createRoot(container).render(<App />);
