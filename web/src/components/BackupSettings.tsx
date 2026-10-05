import { useEffect, useState } from 'react';
import { api, describeError } from '../api';
import { formatSize } from '../attachments/files';
import { locale, t } from '../i18n';

interface LocalBackup {
  name: string;
  size: number;
  createdMs: number;
}

interface TokenRow {
  id: string;
  label: string;
  scope: 'import' | 'backup';
  createdMs: number;
  revokedMs: number | null;
  lastUsedMs: number | null;
}

function when(ms: number | null): string {
  return ms ? new Date(ms).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : t('nunca');
}

/** Sección «Copias de seguridad» de Ajustes: copias diarias del servidor y token para la copia en Google Drive. */
export function BackupSettings({ admin = false }: { admin?: boolean }) {
  const [local, setLocal] = useState<LocalBackup[] | null>(null);
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const [backups, all] = await Promise.all([api<LocalBackup[]>('/api/backup/local'), api<TokenRow[]>('/api/import-tokens/')]);
      setLocal(backups);
      setTokens(all.filter((t) => t.scope === 'backup' && !t.revokedMs));
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setMessage('');
    try {
      const created = await api<{ token: string }>('/api/import-tokens/', { method: 'POST', body: JSON.stringify({ label: 'Copia en Drive', scope: 'backup' }) });
      setFresh(created.token);
      setCopied(false);
      await load();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function revoke(id: string) {
    if (!confirm(t('¿Revocar este token? El script dejará de poder descargar copias con él.'))) {
      return;
    }
    try {
      await api(`/api/import-tokens/${id}`, { method: 'DELETE' });
      await load();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function copy() {
    if (!fresh) {
      return;
    }
    try {
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
    } catch {
      setMessage(t('No se ha podido copiar; selecciónalo y cópialo a mano.'));
    }
  }

  const latest = local?.[0];

  return (
    <section className="card">
      <h3>{t('Copias de seguridad')}</h3>
      <p className="small">
        {t('En el servidor:')}{' '}
        {local === null
          ? t('consultando…')
          : latest
            ? t('última copia {date} ({size}), {n} guardadas', { date: latest.name.slice(7, 17), size: formatSize(latest.size), n: local.length })
            : t('todavía ninguna')}
        .{' '}{t('Se hace una al día y se conservan las 14 últimas.')}
      </p>
      <p className="small muted">
        {t(
          'Para tener también una copia fuera del servidor, el script de Google puede guardar cada noche un zip con todo (base de datos, billetes y claves) en tu Drive. Necesita un token de copia; las instrucciones están en',
        )}{' '}
        <code>integrations/gmail</code>.
      </p>
      {fresh && (
        <div className="notice">
          <div className="small">{t('Token de copia nuevo. Cópialo ahora: no se volverá a mostrar.')}</div>
          <code style={{ wordBreak: 'break-all', display: 'block', margin: '6px 0' }}>{fresh}</code>
          <button className="btn small" type="button" onClick={() => void copy()}>
            {copied ? t('Copiado ✓') : t('Copiar')}
          </button>
        </div>
      )}
      {tokens?.map((token) => (
        <div key={token.id} className="row between small" style={{ margin: '6px 0' }}>
          <span>
            {token.label} · {t('creado {when}', { when: when(token.createdMs) })} · {t('última copia {when}', { when: when(token.lastUsedMs) })}
          </span>
          {admin && (
            <button className="btn small danger" type="button" onClick={() => void revoke(token.id)}>
              {t('Revocar')}
            </button>
          )}
        </div>
      ))}
      {admin ? (
        <button className="btn block" type="button" onClick={() => void create()}>
          {t('Generar token de copia para Drive')}
        </button>
      ) : (
        <p className="muted small">{t('Solo quien administra el hogar puede generar o revocar el token de copia.')}</p>
      )}
      {message && <p className="error small">{message}</p>}
    </section>
  );
}
