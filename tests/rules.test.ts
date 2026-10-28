// Certification guard: scans the source for things YouTube Playables forbid.
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>('../src/**/*.{ts,css}', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const files = Object.entries(sources).map(([path, text]) => ({ path: path.replace('../', ''), text }));

/** Source with comments removed, so rules can be explained in comments. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function offenders(pattern: RegExp, allowed: string[] = []): string[] {
  return files.filter((f) => !allowed.includes(f.path) && pattern.test(code(f.text))).map((f) => f.path);
}

describe('YouTube Playables rules', () => {
  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('only the bridge touches ytgame', () => {
    expect(offenders(/\bytgame\b/, ['src/platform/youtube.ts', 'src/platform/ytgame.d.ts'])).toEqual([]);
  });

  it('localStorage only in the dev fallback, behind import.meta.env.DEV', () => {
    expect(offenders(/localStorage|sessionStorage|indexedDB|document\.cookie/, ['src/platform/devPlatform.ts'])).toEqual([]);
    const dev = code(files.find((f) => f.path === 'src/platform/devPlatform.ts')!.text);
    const uses = dev.split('localStorage').length - 1;
    const guarded = dev.match(/if \(import\.meta\.env\.DEV\) \{\s*try \{\s*[^\n]*localStorage/g) ?? [];
    expect(guarded.length).toBe(uses);
  });

  it('no Page Visibility API or navigator.language', () => {
    expect(offenders(/visibilitychange|document\.hidden|visibilityState|navigator\.languages?\b/)).toEqual([]);
  });

  it('no network calls or outside URLs', () => {
    expect(offenders(/\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|https?:\/\//)).toEqual([]);
  });

  it('no eval, new Function, workers or WebAssembly', () => {
    expect(offenders(/\beval\(|new Function\(|\bWorker\(|WebAssembly/)).toEqual([]);
  });

  it('no orientation lock', () => {
    expect(offenders(/screen\.orientation\.lock|lockOrientation/)).toEqual([]);
  });
});

describe('shipped files', () => {
  // Everything in public/ goes into the build as-is.
  const shipped = Object.keys(import.meta.glob('../public/**/*')).map((p) => p.replace('../public/', ''));

  it('finds the shipped files', () => {
    expect(shipped.length).toBeGreaterThan(20);
  });

  it('file names use only letters, digits, _, - and .', () => {
    for (const path of shipped) for (const part of path.split('/')) expect(part, path).toMatch(/^[A-Za-z0-9_.-]+$/);
  });
});
