import './api';
import '../src/renderer/src/index.css';
import './style.css';
import { createRoot } from 'react-dom/client';
import App from '../src/renderer/src/App';
import { preview } from './api';

createRoot(document.getElementById('root')!).render(<App />);
for (const [id, action] of Object.entries({ 'open-settings': preview.openSettings, 'show-focus': preview.focus, 'show-reminder': preview.reminder, 'show-break': preview.break, 'show-water': preview.water })) {
  document.getElementById(id)!.addEventListener('click', action);
}
