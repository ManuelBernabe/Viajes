import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '../app/Layout';
import { useSession } from '../app/SessionContext';
import { useAttachFiles } from '../attachments/useAttachFiles';
import { allTimeZones, dateOf, deviceTimeZone, isValidLocal, timeOf, zoneLabel } from '../data/localTime';
import { getBooking, saveBooking } from '../data/repo';
import { BOOKING_TYPES, type BookingType } from '../data/types';
import { TYPE_INFO } from '../domain/agenda';

function ZoneSelect({ id, value, onChange }: { id: string; value: string; onChange: (tz: string) => void }) {
  const zones = allTimeZones();
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {!zones.includes(value) && <option value={value}>{value}</option>}
      {zones.map((tz) => (
        <option key={tz} value={tz}>
          {zoneLabel(tz)} ({tz})
        </option>
      ))}
    </select>
  );
}

export function BookingFormPage() {
  const { tripId: tripFromRoute, bookingId } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const { attach, progress } = useAttachFiles(session.email ?? '');
  const fileInput = useRef<HTMLInputElement>(null);

  const [tripId, setTripId] = useState(tripFromRoute ?? '');
  const [type, setType] = useState<BookingType>('flight');
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [startTz, setStartTz] = useState(deviceTimeZone());
  const [startPlace, setStartPlace] = useState('');
  const [withEnd, setWithEnd] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [endTz, setEndTz] = useState(deviceTimeZone());
  const [endPlace, setEndPlace] = useState('');
  const [reference, setReference] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [loaded, setLoaded] = useState(!bookingId);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!bookingId) {
      return;
    }
    getBooking(bookingId).then((booking) => {
      if (booking) {
        setTripId(booking.tripId);
        setType(booking.type);
        setTitle(booking.title);
        setStartDate(dateOf(booking.startLocal));
        setStartTime(timeOf(booking.startLocal));
        setStartTz(booking.startTz);
        setStartPlace(booking.startPlace ?? '');
        setWithEnd(!!booking.endLocal);
        setEndDate(booking.endLocal ? dateOf(booking.endLocal) : '');
        setEndTime(booking.endLocal ? timeOf(booking.endLocal) : '');
        setEndTz(booking.endTz ?? booking.startTz);
        setEndPlace(booking.endPlace ?? '');
        setReference(booking.reference ?? '');
        setAddress(booking.address ?? '');
        setNotes(booking.notes ?? '');
      }
      setLoaded(true);
    });
  }, [bookingId]);

  const info = TYPE_INFO[type];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!title.trim()) {
      setError('Ponle un título a la reserva.');
      return;
    }
    const startLocal = `${startDate}T${startTime || '00:00'}`;
    if (!startDate || !isValidLocal(startLocal)) {
      setError(`Falta la fecha de ${info.startLabel.toLowerCase()}.`);
      return;
    }
    const endLocal = withEnd && endDate ? `${endDate}T${endTime || '00:00'}` : null;
    if (endLocal && !isValidLocal(endLocal)) {
      setError(`La ${info.endLabel.toLowerCase()} no es válida.`);
      return;
    }
    setSaving(true);
    try {
      const booking = await saveBooking(
        {
          tripId,
          type,
          title: title.trim(),
          startLocal,
          startTz,
          startPlace: startPlace.trim() || null,
          endLocal,
          endTz: endLocal ? endTz : null,
          endPlace: endLocal ? endPlace.trim() || null : null,
          reference: reference.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
        },
        session.email ?? '',
        bookingId,
      );
      const files = fileInput.current?.files;
      if (files && files.length > 0) {
        await attach(booking.id, files);
      }
      navigate(`/bookings/${booking.id}`, { replace: true });
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <main className="page muted">Cargando…</main>;
  }

  return (
    <main className="page">
      <div className="topbar">
        <BackLink to={bookingId ? `/bookings/${bookingId}` : `/trips/${tripId}`} />
        <h1>{bookingId ? 'Editar reserva' : 'Nueva reserva'}</h1>
      </div>
      <form onSubmit={submit}>
        <div className="field">
          <label>Tipo</label>
          <div className="segmented">
            {BOOKING_TYPES.map((t) => (
              <button key={t} type="button" className={type === t ? 'on' : ''} onClick={() => setType(t)}>
                {TYPE_INFO[t].icon} {TYPE_INFO[t].label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="title">Título</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'flight' ? 'IB 6800 Madrid – Tokio' : 'Nombre'} />
        </div>

        <h2>{info.startLabel}</h2>
        <div className="field">
          <div className="inline">
            <input type="date" aria-label="Fecha" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input type="time" aria-label="Hora" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="startTz">Zona horaria del lugar</label>
          <ZoneSelect id="startTz" value={startTz} onChange={(tz) => { setStartTz(tz); if (!withEnd) setEndTz(tz); }} />
        </div>
        <div className="field">
          <label htmlFor="startPlace">Lugar</label>
          <input id="startPlace" value={startPlace} onChange={(e) => setStartPlace(e.target.value)} placeholder={type === 'flight' ? 'MAD T4' : 'Dirección o nombre'} />
        </div>

        {!withEnd ? (
          <button type="button" className="btn block" onClick={() => { setWithEnd(true); setEndDate(startDate); setEndTz(startTz); }}>
            + Añadir {info.endLabel.toLowerCase()}
          </button>
        ) : (
          <>
            <div className="row between">
              <h2>{info.endLabel}</h2>
              <button type="button" className="btn small" onClick={() => setWithEnd(false)}>
                Quitar
              </button>
            </div>
            <div className="field">
              <div className="inline">
                <input type="date" aria-label="Fecha" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                <input type="time" aria-label="Hora" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="endTz">Zona horaria del lugar</label>
              <ZoneSelect id="endTz" value={endTz} onChange={setEndTz} />
            </div>
            <div className="field">
              <label htmlFor="endPlace">Lugar</label>
              <input id="endPlace" value={endPlace} onChange={(e) => setEndPlace(e.target.value)} />
            </div>
          </>
        )}

        <h2>Detalles</h2>
        <div className="field">
          <label htmlFor="reference">Localizador</label>
          <input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} autoCapitalize="characters" />
        </div>
        <div className="field">
          <label htmlFor="address">Dirección</label>
          <input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="notes">Notas</label>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {!bookingId && (
          <div className="field">
            <label htmlFor="files">Adjuntos (tarjetas de embarque, PDF, fotos)</label>
            <input id="files" ref={fileInput} type="file" accept="image/*,application/pdf" multiple />
          </div>
        )}
        {progress.message && <p className="muted small">{progress.message}</p>}
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" type="submit" disabled={saving || progress.busy}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </main>
  );
}
