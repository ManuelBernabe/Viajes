/**
 * Traducción de la app: español (el original), inglés, francés e italiano.
 *
 * Estilo «gettext»: la clave es el propio texto en español, así que un texto sin traducir se ve en español en vez de
 * romperse. Las traducciones viven en `messages/*.ts` (una por zona de la app) y se juntan aquí. Un test comprueba que
 * cada `t('…')` del código tiene sus cuatro idiomas.
 *
 * Variables con llaves: t('{n} reservas', { n: 3 }). Los plurales son claves distintas ('1 reserva' / '{n} reservas').
 *
 * El idioma sale del móvil la primera vez y se puede cambiar en Ajustes (se guarda en este navegador). Cambiarlo recarga
 * la app, así que `t()` es una función normal que se puede llamar en cualquier sitio, sin hooks.
 */
import { MESSAGES } from './messages';

export type Lang = 'es' | 'en' | 'fr' | 'it';

export const LANGS: { code: Lang; name: string }[] = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
];

const STORAGE_KEY = 'viajes.lang';

const LOCALES: Record<Lang, string> = { es: 'es-ES', en: 'en-GB', fr: 'fr-FR', it: 'it-IT' };

function isLang(value: unknown): value is Lang {
  return value === 'es' || value === 'en' || value === 'fr' || value === 'it';
}

/** El idioma del móvil si es uno de los cuatro; si no, inglés (o español si el móvil está en español). */
export function detectLang(languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]): Lang {
  for (const tag of languages) {
    const base = tag?.slice(0, 2).toLowerCase();
    if (isLang(base)) {
      return base;
    }
  }
  return languages.length > 0 ? 'en' : 'es';
}

function stored(): Lang | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
}

// En los tests, siempre español: los textos esperados están escritos en español.
let current: Lang = import.meta.env?.MODE === 'test' ? 'es' : (stored() ?? detectLang());

/** El idioma con el que está pintada la app. */
export function lang(): Lang {
  return current;
}

/** Etiqueta para Intl (fechas, horas): «es-ES», «en-GB»… */
export function locale(): string {
  return LOCALES[current];
}

/** Si el idioma lo eligió la persona en Ajustes (y no el del móvil). */
export function langIsChosen(): boolean {
  return stored() !== null;
}

/** Cambia el idioma y recarga la app para repintarla entera. `null` vuelve al idioma del móvil. */
export function setLang(next: Lang | null): void {
  try {
    if (next === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, next);
    }
  } catch {
    // Sin almacenamiento (modo privado): vale para esta sesión.
  }
  current = next ?? detectLang();
  if (typeof location !== 'undefined') {
    location.reload();
  }
}

/** Solo para tests. */
export function setLangForTests(next: Lang): void {
  current = next;
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) {
    return text;
  }
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Traduce un texto escrito en español. Sin traducción, se queda en español. */
export function t(spanish: string, vars?: Record<string, string | number>): string {
  const entry = current === 'es' ? undefined : MESSAGES[spanish];
  return fill(entry?.[current as Exclude<Lang, 'es'>] ?? spanish, vars);
}

/**
 * Los mensajes del servidor llegan en español. Si son uno de los conocidos se traducen; si no, se dejan tal cual.
 */
export function translateServer(message: string): string {
  return t(message);
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = current;
}
