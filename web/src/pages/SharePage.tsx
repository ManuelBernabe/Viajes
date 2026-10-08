import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BackLink } from '../app/Layout';
import { api, describeError } from '../api';
import { getTrip } from '../data/repo';
import { useLiveQuery } from '../data/useLive';
import { lang, t } from '../i18n';

interface Share {
  token: string | null;
  url: string | null;
  lang: string | null;
}

const shareApi = {
  get: (tripId: string) => api<Share>(`/api/trips/${tripId}/share`),
  create: (tripId: string) => api<Share>(`/api/trips/${tripId}/share`, { method: 'POST', body: JSON.stringify({ lang: lang() }) }),
  revoke: (tripId: string) => api<void>(`/api/trips/${tripId}/share`, { method: 'DELETE' }),
};

/**
 * «🔗 Compartir itinerario»: un enlace de solo lectura para quien no usa la app (la familia, quien te recoge en el
 * aeropuerto). Sale lo que ve todo el hogar, sin localizadores ni notas; se imprime o se guarda en PDF desde la propia
 * página, y se puede anular cuando se quiera.
 */
export function SharePage() {
  const { tripId = '' } = useParams();
  const trip = useLiveQuery(() => getTrip(tripId), [tripId]);
  const [share, setShare] = useState<Share | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  async function run(action: () => Promise<Share | null>) {
    setBusy(true);
    setMessage('');
    setCopied(false);
    try {
      const next = await action();
      if (next) {
        setShare(next);
      }
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void run(() => shareApi.get(tripId));
  }, [tripId]);

  async function send(url: string) {
    const title = trip?.title ?? t('Itinerario');
    if (navigator.share) {
      try {
        await navigator.share({ title, text: t('Mi itinerario de «{trip}»:', { trip: title }), url });
        return;
      } catch {
        // Cancelado: queda copiar.
      }
    }
    await copy(url);
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setMessage(t('No se ha podido copiar; selecciona el enlace y cópialo a mano.'));
    }
  }

  async function revoke() {
    if (!confirm(t('¿Anular el enlace? Quien lo tenga ya no podrá ver el itinerario.'))) {
      return;
    }
    await run(async () => {
      await shareApi.revoke(tripId);
      return { token: null, url: null, lang: null };
    });
  }

  const url = share?.url;
  return (
    <main className="page">
      <div className="topbar">
        <BackLink to={`/trips/${tripId}`} />
        <h1>🔗 {t('Compartir itinerario')}</h1>
      </div>
      {trip && <div className="muted">{trip.title}</div>}

      <section className="card">
        <p>{t('Un enlace de solo lectura para quien no usa la app: verá las reservas día a día, con horas y lugares.')}</p>
        <ul className="muted small share-points">
          <li>{t('Salen las reservas que ve todo el hogar; las privadas no.')}</li>
          <li>{t('No salen localizadores, notas ni billetes.')}</li>
          <li>{t('Desde la página se puede imprimir o guardar en PDF.')}</li>
          <li>{t('Se actualiza solo y puedes anularlo cuando quieras.')}</li>
        </ul>

        {share && !url && (
          <button className="btn primary" type="button" disabled={busy} onClick={() => void run(() => shareApi.create(tripId))}>
            {t('Crear enlace')}
          </button>
        )}

        {url && (
          <>
            <input className="share-url" readOnly value={url} onFocus={(e) => e.target.select()} aria-label={t('Enlace')} />
            <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" type="button" onClick={() => void send(url)}>
                📤 {t('Enviar')}
              </button>
              <button className="btn" type="button" onClick={() => void copy(url)}>
                {copied ? `✓ ${t('Copiado')}` : t('Copiar')}
              </button>
              <button className="btn" type="button" onClick={() => window.open(url, '_blank', 'noopener')}>
                📄 {t('Ver o guardar PDF')}
              </button>
            </div>
            <button className="btn danger" type="button" disabled={busy} style={{ marginTop: 16 }} onClick={() => void revoke()}>
              {t('Anular enlace')}
            </button>
          </>
        )}
      </section>
      {message && <p className="error">{message}</p>}
    </main>
  );
}
