import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, describeError } from '../api';
import { listTrips } from '../data/repo';
import { syncNow } from '../data/syncClient';
import type { Trip } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { formatRange } from '../data/localTime';
import { likelySameTrip } from '../domain/tripMatch';
import { t } from '../i18n';

async function merge(trip: Trip, into: Trip): Promise<void> {
  await api(`/api/trips/${trip.id}/merge`, { method: 'POST', body: JSON.stringify({ into: into.id }) });
  await syncNow();
}

/**
 * Unir este viaje con otro: todo (reservas, lugares, ideas, equipaje) pasa al otro, que amplía sus fechas, y este se borra.
 * Arriba, si parece parte de otro («Brasil» junto a «Argentina Brasil»), se propone; abajo, siempre, para elegir a mano.
 */
export function TripMerge({ trip, mode }: { trip: Trip; mode: 'suggest' | 'menu' }) {
  const navigate = useNavigate();
  const trips = useLiveQuery(listTrips, []);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const others = (trips ?? []).filter((x) => x.id !== trip.id && x.deletedAtMs === null);
  const suggestion = likelySameTrip(trip, others);

  async function run(into: Trip) {
    if (!confirm(t('¿Pasar todo lo de «{from}» a «{to}» y borrar «{from}»?', { from: trip.title, to: into.title }))) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await merge(trip, into);
      navigate(`/trips/${into.id}`, { replace: true });
    } catch (error) {
      setMessage(describeError(error));
      setBusy(false);
    }
  }

  if (mode === 'suggest') {
    if (!suggestion) {
      return null;
    }
    return (
      <section className="card merge-hint">
        <div>
          🔗 {t('¿Es parte de «{trip}» ({dates})?', { trip: suggestion.title, dates: formatRange(suggestion.startDate, suggestion.endDate) })}
        </div>
        <button className="btn primary" type="button" disabled={busy} onClick={() => void run(suggestion)}>
          {t('Unir con «{trip}»', { trip: suggestion.title })}
        </button>
        {message && <p className="error small">{message}</p>}
      </section>
    );
  }

  if (others.length === 0) {
    return null;
  }
  const chosen = others.find((x) => x.id === target);
  return (
    <>
      {!open ? (
        <button className="btn block" type="button" style={{ marginBottom: 8 }} onClick={() => setOpen(true)}>
          🔗 {t('Unir con otro viaje…')}
        </button>
      ) : (
        <section className="card">
          <p className="small muted" style={{ marginTop: 0 }}>
            {t('Todo lo de este viaje (reservas, lugares, ideas y equipaje) pasa al que elijas, que amplía sus fechas, y este se borra.')}
          </p>
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t('Viaje')} style={{ width: '100%' }}>
            <option value="">{t('Elige el viaje…')}</option>
            {others.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title} · {formatRange(x.startDate, x.endDate)}
              </option>
            ))}
          </select>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn primary" type="button" disabled={!chosen || busy} onClick={() => chosen && void run(chosen)}>
              {t('Unir')}
            </button>
            <button className="btn" type="button" onClick={() => setOpen(false)}>
              {t('Cancelar')}
            </button>
          </div>
          {message && <p className="error small">{message}</p>}
        </section>
      )}
    </>
  );
}
