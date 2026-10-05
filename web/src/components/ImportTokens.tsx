import { useEffect, useState } from 'react';
import { api, describeError } from '../api';
import { locale, t } from '../i18n';

interface TokenRow {
  id: string;
  label: string;
  scope?: 'import' | 'backup';
  createdMs: number;
  revokedMs: number | null;
  lastUsedMs: number | null;
}

function when(ms: number | null): string {
  return ms ? new Date(ms).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : t('nunca');
}

/** Tokens con los que el script de Gmail puede crear borradores. El valor solo se enseña al crearlo. */
export function ImportTokens({ admin = false }: { admin?: boolean }) {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [fresh, setFresh] = useState<{ label: string; token: string } | null>(null);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      setTokens(await api<TokenRow[]>('/api/import-tokens/'));
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
      const created = await api<{ id: string; label: string; token: string }>('/api/import-tokens/', {
        method: 'POST',
        body: JSON.stringify({ label: 'Gmail' }),
      });
      setFresh({ label: created.label, token: created.token });
      setCopied(false);
      await load();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function revoke(id: string) {
    if (!confirm(t('¿Revocar este token? El script de Gmail dejará de poder importar con él.'))) {
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
      await navigator.clipboard.writeText(fresh.token);
      setCopied(true);
    } catch {
      setMessage(t('No se ha podido copiar; selecciónalo y cópialo a mano.'));
    }
  }

  const active = tokens?.filter((t) => !t.revokedMs && (t.scope ?? 'import') === 'import') ?? [];

  return (
    <section className="card">
      <h3>{t('Importar desde Gmail')}</h3>
      <p className="small muted">
        {t('Un script en tu cuenta de Google envía a la app los correos con la etiqueta «Viajes». Necesita un token; las instrucciones están en el repositorio, en')}{' '}
        <code>integrations/gmail</code>.
      </p>
      {fresh && (
        <div className="notice">
          <div className="small">{t('Token nuevo. Cópialo ahora: no se volverá a mostrar.')}</div>
          <code style={{ wordBreak: 'break-all', display: 'block', margin: '6px 0' }}>{fresh.token}</code>
          <button className="btn small" type="button" onClick={() => void copy()}>
            {copied ? t('Copiado ✓') : t('Copiar')}
          </button>
        </div>
      )}
      {active.map((token) => (
        <div key={token.id} className="row between small" style={{ margin: '6px 0' }}>
          <span>
            {token.label} · {t('creado {when}', { when: when(token.createdMs) })} · {t('último uso {when}', { when: when(token.lastUsedMs) })}
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
          {t('Generar token nuevo')}
        </button>
      ) : (
        <p className="muted small">{t('Solo quien administra el hogar puede generar o revocar tokens.')}</p>
      )}
      {message && <p className="error small">{message}</p>}
    </section>
  );
}
