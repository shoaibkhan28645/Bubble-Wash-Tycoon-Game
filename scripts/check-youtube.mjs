// Checks a build folder against the YouTube Playables certification limits that can be read from the files
// (https://developers.google.com/youtube/gaming/playables/certification/requirements): file names, sizes and
// count, relative paths, the SDK first in the page, and none of the language features YouTube may decline
// (WebAssembly, eval, Web Workers) or calls to hosts outside Google and YouTube. What needs a running game
// (firstFrameReady and gameReady, saves, pause, the size loaded before gameReady) is scripts/youtube-smoke.cjs.
//   node scripts/check-youtube.mjs [folder]      (default: dist-youtube)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const MIB = 1024 * 1024;
const LIMITS = {
  /** Every file MUST be under 30 MiB, SHOULD be under 512 KiB. */
  fileMust: 30 * MIB,
  fileShould: 512 * 1024,
  /** The whole game MUST be under 250 MiB (by default). */
  total: 250 * MIB,
  /** At most this many files. */
  files: 8000,
};
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;
const SDK = 'https://www.youtube.com/game_api/v1';
/** Hosts a URL may name without being a call outside Google or YouTube (SVG and XML namespaces). */
const NAMESPACE_HOSTS = new Set(['www.w3.org']);
const ALLOWED_HOSTS = /(^|\.)(youtube\.com|google\.com|googleapis\.com|gstatic\.com)$/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** The problems (each breaks a MUST) and warnings (a SHOULD, or something to look at) for a build folder. */
export function checkYoutube(dir) {
  const problems = [];
  const warnings = [];
  const files = walk(dir);
  const rel = (f) => relative(dir, f).split(/[\\/]/).join('/');
  let total = 0;
  for (const file of files) {
    const size = statSync(file).size;
    total += size;
    const name = rel(file);
    if (name.split('/').some((part) => !SAFE_NAME.test(part))) problems.push(`File name YouTube rejects: ${name}`);
    if (size >= LIMITS.fileMust) problems.push(`${name} is ${(size / MIB).toFixed(1)} MiB (limit 30 MiB)`);
    else if (size >= LIMITS.fileShould) warnings.push(`${name} is ${(size / 1024).toFixed(0)} KiB (target under 512 KiB)`);
  }
  if (files.length > LIMITS.files) problems.push(`${files.length} files (limit ${LIMITS.files})`);
  if (total >= LIMITS.total) problems.push(`${(total / MIB).toFixed(1)} MiB in all (limit 250 MiB)`);

  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  if (scripts[0] !== SDK) problems.push(`The first script must be the YouTube Playables SDK (${SDK}); found ${scripts[0] ?? 'none'}`);
  for (const ref of [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])) {
    if (ref !== SDK && /^(\/|[a-z]+:)/i.test(ref) && !ref.startsWith('data:')) problems.push(`index.html links ${ref}: paths must be relative`);
  }

  const hosts = new Set();
  for (const file of files.filter((f) => ['.js', '.html', '.css', '.json'].includes(extname(f)))) {
    const text = readFileSync(file, 'utf8');
    const name = rel(file);
    if (/\bWebAssembly\b/.test(text)) problems.push(`${name} uses WebAssembly`);
    if (/\bnew Worker\s*\(|\bSharedWorker\s*\(/.test(text)) problems.push(`${name} starts a Web Worker`);
    if (/(^|[^.\w$])eval\s*\(|new Function\s*\(/.test(text)) problems.push(`${name} uses eval or new Function`);
    for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) hosts.add(m[1].toLowerCase());
  }
  const outside = [...hosts].filter((h) => !NAMESPACE_HOSTS.has(h) && !ALLOWED_HOSTS.test(h));
  if (outside.length) warnings.push(`Addresses outside Google and YouTube appear in the code (check none is called): ${outside.join(', ')}`);

  return { problems, warnings, files: files.length, total };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? 'dist-youtube';
  const { problems, warnings, files, total } = checkYoutube(dir);
  console.log(`${dir}: ${files} files, ${(total / MIB).toFixed(1)} MiB`);
  for (const w of warnings) console.log(`  note: ${w}`);
  for (const p of problems) console.error(`  PROBLEM: ${p}`);
  if (problems.length) process.exit(1);
  console.log('  Passes the YouTube Playables file checks.');
}
