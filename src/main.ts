import './ui/base.css';
import './ui/meta.css';
import { boot } from './core/boot';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
void boot(root);
