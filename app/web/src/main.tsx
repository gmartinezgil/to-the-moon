import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Register the PWA service worker (auto-update; push notifications handled in the SW).
registerSW({
  immediate: true,
  onNeedRefresh() {},
  onOfflineReady() {
    console.log('[pwa] app ready for offline use');
  },
});

createRoot(document.getElementById('root')!).render(<App />);
