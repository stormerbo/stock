import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { OVERLAY_CSS } from './styles';

let root: Root | null = null;

function mount() {
  if (root) return;

  const host = document.createElement('div');
  host.id = 'money-helper-float-root';
  host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483646;pointer-events:none;backdrop-filter:blur(40px) saturate(1.6);-webkit-backdrop-filter:blur(40px) saturate(1.6)';
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
