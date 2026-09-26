import { describe, expect, it } from 'vitest';
import { isStandalone, type DisplayEnv } from './standalone';

function env(displayModeStandalone: boolean, navigatorStandalone?: boolean): DisplayEnv {
  return {
    matchMedia: () => ({ matches: displayModeStandalone }),
    navigator: { standalone: navigatorStandalone },
  };
}

describe('isStandalone', () => {
  it('detecta la app instalada por display-mode', () => {
    expect(isStandalone(env(true))).toBe(true);
  });

  it('detecta la app instalada por navigator.standalone de iOS', () => {
    expect(isStandalone(env(false, true))).toBe(true);
  });

  it('dentro de Safari no está instalada', () => {
    expect(isStandalone(env(false, false))).toBe(false);
    expect(isStandalone(env(false))).toBe(false);
  });
});
