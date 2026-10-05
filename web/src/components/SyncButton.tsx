import { useState } from 'react';
import { syncNow, useSyncStatus } from '../data/syncClient';
import { t } from '../i18n';

/** Botón redondo «↻»: sincroniza ya, sin esperar a la automática. Gira mientras trabaja y dice cómo ha ido. */
export function SyncButton() {
  const sync = useSyncStatus();
  const [result, setResult] = useState<'ok' | 'offline' | null>(null);

  async function run() {
    setResult(null);
    const outcome = await syncNow().catch(() => null);
    setResult(!outcome || outcome.incomplete ? 'offline' : 'ok');
    setTimeout(() => setResult(null), 2500);
  }

  const label = sync.running ? t('Sincronizando…') : result === 'offline' ? t('Sin conexión con el servidor') : t('Sincronizar ahora');
  return (
    <button className={`btn icon sync${sync.running ? ' spinning' : ''}`} type="button" onClick={() => void run()} disabled={sync.running} aria-label={label} title={label}>
      {result === 'ok' ? (
        '✓'
      ) : result === 'offline' ? (
        '⚠️'
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
