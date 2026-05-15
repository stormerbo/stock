import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { OVERLAY_CSS } from './styles';

let root: Root | null = null;

function mount() {
  if (root) return; // already mounted

  const host = document.createElement('div');
  host.id = 'money-helper-float-root';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });
  const styleEl = document.createElement('style');
  styleEl.textContent = OVERLAY_CSS;
  shadow.appendChild(styleEl);

  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  root = createRoot(mountPoint);
  root.render(<App />);
}

mount();
