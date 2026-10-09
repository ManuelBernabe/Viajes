import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BackLink } from '../app/Layout';
import { describeError } from '../api';
import { formatLongDay } from '../data/localTime';
import { getTrip } from '../data/repo';
import { useLiveQuery } from '../data/useLive';
import { todayLocal } from '../domain/agenda';
import { cachedJournal, journalApi, journalDates, shrinkPhoto, type Journal, type JournalDay } from '../domain/journal';
import { locale, t } from '../i18n';

/**
 * «📔 Diario del viaje»: una nota y unas fotos por día, que escribe cualquiera del hogar, y arriba el resumen (vuelos,
 * kilómetros, noches, países y ciudades). Si el viaje tiene enlace para compartir, el diario sale también allí.
 */
export function JournalPage() {
  const { tripId = '' } = useParams();
  const trip = useLiveQuery(() => getTrip(tripId), [tripId]);
  const [journal, setJournal] = useState<Journal | null>(() => cachedJournal(tripId));
  const [message, setMessage] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);

  async function reload() {
    try {
      setJournal(await journalApi.get(tripId));
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  useEffect(() => {
    void reload();
  }, [tripId]);

  const today = todayLocal();
  const byDate = new Map((journal?.days ?? []).map((d) => [d.date, d]));
  const dates = journalDates(trip?.startDate ?? null, trip?.endDate ?? null, today, [...byDate.keys()]);
  const stats = journal?.stats;

  async function removePhoto(photoId: string) {
    if (!confirm(t('¿Quitar esta foto del diario?'))) {
      return;
    }
    try {
      await journalApi.removePhoto(tripId, photoId);
      setViewing(null);
      await reload();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  return (
    <main className="page">
      <div className="topbar">
        <BackLink to={`/trips/${tripId}`} />
        <h1>📔 {t('Diario del viaje')}</h1>
      </div>
      {trip && <div className="muted">{trip.title}</div>}

      {stats && (stats.flights > 0 || stats.nights > 0 || stats.trains > 0) && (
        <section className="card journal-stats">
          <div className="journal-figures">
            {stats.flights > 0 && <Figure value={stats.flights} label={t('vuelos')} />}
            {stats.km > 0 && <Figure value={stats.km} label={t('km volados')} />}
            {stats.trains > 0 && <Figure value={stats.trains} label={t('trenes')} />}
            {stats.nights > 0 && <Figure value={stats.nights} label={t('noches')} />}
          </div>
          {(stats.countries.length > 0 || stats.cities.length > 0) && (
            <div className="small muted" style={{ marginTop: 8 }}>
              {[...stats.countries.map((c) => `${c.flag ?? ''} ${c.country}`.trim()), ...stats.cities].join(' · ')}
            </div>
          )}
        </section>
      )}

      <p className="small muted">
        {t('Una nota y unas fotos por día; las ve todo el hogar.')}{' '}
        <Link to={`/trips/${tripId}/share`}>{t('Si compartes el itinerario, el diario sale también.')}</Link>
      </p>
      {message && <p className="error">{message}</p>}

      {dates.map((date) => (
        <DayEntry key={date} tripId={tripId} date={date} day={byDate.get(date)} onChanged={reload} onView={setViewing} />
      ))}

      {viewing && (
        <div className="journal-viewer" role="dialog" aria-modal="true" onClick={() => setViewing(null)}>
          <img src={journalApi.photoUrl(tripId, viewing)} alt="" />
          <div className="row" style={{ gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <button className="btn" type="button" onClick={() => setViewing(null)}>
              {t('Cerrar')}
            </button>
            <button className="btn danger" type="button" onClick={() => void removePhoto(viewing)}>
              {t('Quitar')}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <b>{value.toLocaleString(locale())}</b>
      <span>{label}</span>
    </div>
  );
}

function DayEntry({
  tripId,
  date,
  day,
  onChanged,
  onView,
}: {
  tripId: string;
  date: string;
  day: JournalDay | undefined;
  onChanged: () => Promise<void>;
  onView: (photoId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(day?.text ?? '');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function save() {
    setBusy('text');
    setMessage('');
    try {
      await journalApi.saveText(tripId, date, text);
      setEditing(false);
      await onChanged();
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy('');
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }
    setBusy('photo');
    setMessage('');
    try {
      for (const file of Array.from(files)) {
        await journalApi.addPhoto(tripId, date, await shrinkPhoto(file));
      }
      await onChanged();
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy('');
      if (input.current) {
        input.current.value = '';
      }
    }
  }

  const photos = day?.photos ?? [];
  return (
    <section className="card journal-day">
      <h2 className="journal-date">{formatLongDay(date)}</h2>
      {editing ? (
        <>
          <textarea rows={4} value={text} autoFocus onChange={(e) => setText(e.target.value)} placeholder={t('¿Qué tal el día?')} aria-label={t('Nota del día')} />
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn primary" type="button" disabled={busy !== ''} onClick={() => void save()}>
              {t('Guardar')}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setText(day?.text ?? '');
                setEditing(false);
              }}
            >
              {t('Cancelar')}
            </button>
          </div>
        </>
      ) : day?.text ? (
        <p className="journal-text" onClick={() => setEditing(true)}>
          {day.text}
        </p>
      ) : null}

      {photos.length > 0 && (
        <div className="journal-photos">
          {photos.map((photo) => (
            <button key={photo.id} type="button" onClick={() => onView(photo.id)} aria-label={t('Ver foto')}>
              <img src={journalApi.photoUrl(tripId, photo.id)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {!editing && (
        <div className="row small" style={{ gap: 16, marginTop: 8 }}>
          <button type="button" className="linklike" onClick={() => setEditing(true)}>
            ✏️ {day?.text ? t('Editar la nota') : t('Escribir')}
          </button>
          <button type="button" className="linklike" disabled={busy !== ''} onClick={() => input.current?.click()}>
            📷 {busy === 'photo' ? t('Subiendo…') : t('Añadir fotos')}
          </button>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void addPhotos(e.target.files)} />
        </div>
      )}
      {day?.updatedBy && !editing && <div className="small muted" style={{ marginTop: 4 }}>{day.updatedBy}</div>}
      {message && <p className="error small">{message}</p>}
    </section>
  );
}
