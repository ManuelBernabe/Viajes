import { useState } from 'react';
import { formatDay } from '../data/localTime';
import type { Booking } from '../data/types';
import { airlineCode, flightRoute, flightSearches, shiftDate, trainRoute, trainSearches, type SearchLink } from '../domain/alternatives';
import { lang, t } from '../i18n';

function Links({ links, primary = false }: { links: SearchLink[]; primary?: boolean }) {
  return (
    <div className="actions" style={{ marginTop: 6 }}>
      {links.map((link) => (
        <a key={link.url} className={`btn small${primary ? ' primary' : ''}`} href={link.url} target="_blank" rel="noreferrer">
          {link.site} ↗
        </a>
      ))}
    </div>
  );
}

/**
 * «Buscar otros horarios» en un vuelo o un tren: abre las búsquedas del mismo trayecto (el día de la reserva, el anterior o
 * el siguiente), con los vuelos directos primero y después los de escalas. Cambiar el billete se hace en la aerolínea.
 */
export function Alternatives({ booking }: { booking: Booking }) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const route = booking.type === 'flight' ? flightRoute(booking) : booking.type === 'train' ? trainRoute(booking) : null;
  if (!route) {
    return null;
  }

  const day = { ...route, date: shiftDate(route.date, offset) };
  const airline = booking.type === 'flight' ? airlineCode(booking.title) : null;

  if (!open) {
    return (
      <button className="btn block" type="button" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>
        🔁 {booking.type === 'flight' ? t('Buscar otros vuelos') : t('Buscar otros trenes')}
      </button>
    );
  }

  return (
    <section className="card">
      <div className="row between">
        <h3 style={{ margin: 0 }}>
          🔁 {route.from} → {route.to}
        </h3>
        <button className="btn small" type="button" onClick={() => setOpen(false)}>
          {t('Cerrar')}
        </button>
      </div>

      <div className="chips" role="radiogroup" aria-label={t('Día')} style={{ marginTop: 10 }}>
        {[-1, 0, 1].map((delta) => (
          <button key={delta} type="button" role="radio" aria-checked={offset === delta} className={offset === delta ? 'on' : ''} onClick={() => setOffset(delta)}>
            {formatDay(shiftDate(route.date, delta))}
          </button>
        ))}
      </div>

      {booking.type === 'flight' ? (
        <>
          <div className="small" style={{ marginTop: 10 }}>
            <strong>1. {t('Vuelos directos')}</strong>
          </div>
          <Links links={flightSearches(day, lang()).direct} primary />
          <div className="small" style={{ marginTop: 6 }}>
            <strong>2. {t('También con escalas')}</strong>
          </div>
          <Links links={flightSearches(day, lang()).withStops} />
          {airline && (
            <a
              className="btn small block"
              style={{ marginTop: 6 }}
              href={`https://www.google.com/search?q=${encodeURIComponent(`${airline} airline ${t('gestionar reserva')}`)}&hl=${lang()}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('Cambiar el billete en la aerolínea ({code})', { code: airline })} ↗
            </a>
          )}
        </>
      ) : (
        <Links links={trainSearches(day, lang(), { trains: t('trenes') })} primary />
      )}

      <p className="small muted" style={{ marginBottom: 0 }}>
        {t(
          'Se abre la búsqueda ya hecha con el mismo trayecto y día. El cambio se hace en la web de la compañía; cuando llegue el correo del cambio, la app actualizará esta reserva.',
        )}
      </p>
    </section>
  );
}
