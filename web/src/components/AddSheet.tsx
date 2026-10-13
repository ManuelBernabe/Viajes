import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listTrips } from '../data/repo';
import { useLiveQuery } from '../data/useLive';
import { sortTrips, todayLocal } from '../domain/agenda';
import { formatRange } from '../data/localTime';
import { t } from '../i18n';

/**
 * Botón «＋» de «Hoy» y «Viajes»: añadir una reserva a cualquier viaje (desde un billete, PDF, foto o a mano) o crear un
 * viaje, sin entrar antes en él. Recuerda también cómo mandar una reserva desde Mail.
 */
export function AddButton({ label }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const trips = useLiveQuery(listTrips, []);
  const active = trips ? sortTrips(trips.filter((x) => x.deletedAtMs === null), todayLocal()).active.slice(0, 6) : [];

  return (
    <>
      <button type="button" className="btn primary add" aria-label={t('Añadir')} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 7v10M7 12h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        {label}
      </button>
      {open && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="add-title" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" aria-hidden="true" />
            <h2 id="add-title">{t('Añadir')}</h2>
            {active.length > 0 && (
              <>
                <div className="sheet-label">{t('Reserva nueva en…')}</div>
                <div className="sheet-list">
                  {active.map((trip) => (
                    <Link key={trip.id} to={`/trips/${trip.id}/bookings/new`} className="sheet-item" onClick={() => setOpen(false)}>
                      <span>
                        <strong>{trip.title}</strong>
                        <span className="small muted"> · {formatRange(trip.startDate, trip.endDate)}</span>
                      </span>
                      <span className="muted">›</span>
                    </Link>
                  ))}
                </div>
                <p className="small muted" style={{ margin: '4px 0 0' }}>{t('Dentro puedes leerla de un billete, un PDF o una foto, dictarla o escribirla.')}</p>
              </>
            )}
            <Link to="/trips/new" className="sheet-item strong" onClick={() => setOpen(false)}>
              <span>🧳 {t('Viaje nuevo')}</span>
              <span className="muted">›</span>
            </Link>
            <div className="sheet-hint">
              ✉️ {t('¿La reserva está en un correo? En Mail o Gmail toca Compartir → «Enviar a Viajes» y llegará a «Por revisar».')}{' '}
              <Link to="/settings#atajo" onClick={() => setOpen(false)}>
                {t('Instalar el atajo')}
              </Link>
            </div>
            <button type="button" className="btn block" onClick={() => setOpen(false)}>
              {t('Cancelar')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
