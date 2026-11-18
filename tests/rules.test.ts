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

  // Saves live in the browser only on the dev server and in the tester build: both switches are fixed when
  // Vite builds, so the build for YouTube drops that code (scripts/size.mjs checks the build itself).
  it('localStorage only in the dev and tester fallbacks, behind build-time switches', () => {
    const text = (path: string) => code(files.find((f) => f.path === path)!.text);
    expect(offenders(/localStorage|sessionStorage|indexedDB|document\.cookie/, ['src/platform/devPlatform.ts', 'src/platform/tester.ts'])).toEqual([]);
    const dev = text('src/platform/devPlatform.ts');
    expect(dev).toContain('const KEEP = import.meta.env.DEV || TESTER;');
    const uses = dev.split('localStorage').length - 1;
    const guarded = dev.match(/if \(KEEP\) \{\s*try \{\s*[^\n]*localStorage/g) ?? [];
    expect(guarded.length).toBe(uses);
    expect(text('src/platform/tester.ts')).toContain("export const TESTER = import.meta.env.MODE === 'tester';");
    // The tester build's own storage (its "an hour away" shortcut): read in boot behind TESTER, set only from its panel,
    // which boot loads only behind TESTER.
    expect(offenders(/setAwayShift|takeAwayShift/, ['src/platform/tester.ts', 'src/core/boot.ts', 'src/ui/testerPanel.ts'])).toEqual([]);
    const boot = text('src/core/boot.ts');
    expect(boot).toMatch(/TESTER && [^\n]*takeAwayShift\(\)/);
    expect(boot).toMatch(/if \(TESTER\) \{\s*const \{ createTesterPanel \} = await import\('\.\.\/ui\/testerPanel'\)/);
    expect(offenders(/testerPanel/, ['src/core/boot.ts', 'src/ui/testerPanel.ts'])).toEqual([]);
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
