import './ui/base.css';
import './ui/meta.css';
import { boot } from './core/boot';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
// A long press or right click on the game never opens the browser's menu.
root.addEventListener('contextmenu', (e) => e.preventDefault());
void boot(root);
