export type WakeLockStatus = 'activo' | 'no soportado' | 'rechazado';

interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<unknown> };
}

// Se conserva la referencia para que el bloqueo no se libere mientras la página está visible.
export let wakeLockSentinel: unknown;

export async function requestWakeLock(nav: WakeLockNavigator): Promise<WakeLockStatus> {
  if (!nav.wakeLock) {
    return 'no soportado';
  }
  try {
    wakeLockSentinel = await nav.wakeLock.request('screen');
    return 'activo';
  } catch {
    return 'rechazado';
  }
}
