console.log('[悬浮窗] content.tsx start', location.href);

import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { OVERLAY_CSS } from './styles';

let root: Root | null = null;

function mount() {
  if (root) { console.log('[悬浮窗] 已挂载跳过'); return; }
  console.log('[悬浮窗] mount()');

  const host = document.createElement('div');
  host.id = 'money-helper-float-root';
  // Fixed container at viewport origin — immune to page transforms
  host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483646;pointer-events:none';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });
  const styleEl = document.createElement('style');
  styleEl.textContent = OVERLAY_CSS;
  shadow.appendChild(styleEl);

  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  root = createRoot(mountPoint);
  root.render(<App />);
  console.log('[悬浮窗] React rendered');
}

mount();
console.log('[悬浮窗] mount called');
