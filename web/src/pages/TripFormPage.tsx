import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '../app/Layout';
import { useSession } from '../app/SessionContext';
import { getTrip, saveTrip } from '../data/repo';
import { t } from '../i18n';

export function TripFormPage() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loaded, setLoaded] = useState(!tripId);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tripId) {
      return;
    }
    getTrip(tripId).then((trip) => {
      if (trip) {
        setTitle(trip.title);
        setDestination(trip.destination ?? '');
        setStartDate(trip.startDate ?? '');
        setEndDate(trip.endDate ?? '');
      }
      setLoaded(true);
    });
  }, [tripId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError(t('Ponle un título al viaje.'));
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError(t('La vuelta no puede ser antes de la ida.'));
      return;
    }
    const trip = await saveTrip(
      { title: title.trim(), destination: destination.trim() || null, startDate: startDate || null, endDate: endDate || null },
      session.email ?? '',
      tripId,
    );
    navigate(`/trips/${trip.id}`, { replace: true });
  }

  if (!loaded) {
    return <main className="page muted">{t('Cargando…')}</main>;
  }

  return (
    <main className="page">
      <div className="topbar">
        <BackLink to={tripId ? `/trips/${tripId}` : '/'} />
        <h1>{tripId ? t('Editar viaje') : t('Nuevo viaje')}</h1>
      </div>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="title">{t('Título')}</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('Japón 2026')} autoFocus={!tripId} />
        </div>
        <div className="field">
          <label htmlFor="destination">{t('Destino')}</label>
          <input id="destination" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={t('Tokio')} />
        </div>
        <div className="field">
          <label htmlFor="start">{t('Ida')}</label>
          <input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="end">{t('Vuelta')}</label>
          <input id="end" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" type="submit">
          {t('Guardar')}
        </button>
      </form>
    </main>
  );
}
