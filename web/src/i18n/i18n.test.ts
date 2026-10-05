import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectLang, setLangForTests, t } from './index';
import { MESSAGES, SOURCES } from './messages';

const ROOT = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === 'i18n' ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Los textos literales que el código pasa a t('…'). */
function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  const pattern = /\bt\(\s*(['"`])((?:\\.|(?!\1).)*)\1/gs;
  for (const file of sourceFiles(ROOT)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(pattern)) {
      const key = match[2].replace(/\\(['"`\\])/g, '$1');
      if (match[1] === '`' && key.includes('${')) {
        throw new Error(`${file}: t() con plantilla \`…\${}\`; usa t('… {var}', { var })`);
      }
      keys.set(key, file.slice(ROOT.length + 1));
    }
  }
  return keys;
}

describe('traducciones', () => {
  it('cada texto del código tiene inglés, francés e italiano', () => {
    const missing = [...usedKeys()]
      .filter(([key]) => {
        const entry = MESSAGES[key];
        return !entry || !entry.en?.trim() || !entry.fr?.trim() || !entry.it?.trim();
      })
      .map(([key, file]) => `${file}: «${key}»`);
    expect(missing).toEqual([]);
  });

  it('las variables {x} del español están en las traducciones', () => {
    const wrong: string[] = [];
    for (const [key, entry] of Object.entries(MESSAGES)) {
      const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
      for (const lang of ['en', 'fr', 'it'] as const) {
        if (vars(entry[lang]) !== vars(key)) {
          wrong.push(`${lang}: «${key}»`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('una clave repetida en dos ficheros tiene la misma traducción', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [file, messages] of Object.entries(SOURCES)) {
      for (const [key, entry] of Object.entries(messages)) {
        const value = JSON.stringify(entry);
        if (seen.has(key) && seen.get(key) !== value) {
          clashes.push(`${file}: «${key}»`);
        }
        seen.set(key, value);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('t() traduce, rellena variables y deja el español si falta', () => {
    setLangForTests('es');
    expect(t('{n} reservas', { n: 3 })).toBe('3 reservas');
    setLangForTests('en');
    expect(t('Texto que no existe {x}', { x: 1 })).toBe('Texto que no existe 1');
    setLangForTests('es');
  });

  it('el idioma sale del móvil', () => {
    expect(detectLang(['fr-FR', 'en'])).toBe('fr');
    expect(detectLang(['de-DE', 'it-IT'])).toBe('it');
    expect(detectLang(['de-DE'])).toBe('en');
    expect(detectLang(['es-AR'])).toBe('es');
    expect(detectLang([])).toBe('es');
  });
});
