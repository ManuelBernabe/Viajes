import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { describeError } from '../api';
import { BackLink } from '../app/Layout';
import { useSession } from '../app/SessionContext';
import { parseBoardingPass, prefillFromBoardingPass } from '../attachments/bcbp';
import { splitQrCodes } from '../attachments/qrCodes';
import { extractWithAi, toSuggestion } from '../attachments/aiExtract';
import { suggestFromText, type TextSuggestion } from '../attachments/extract';
import { isPdf } from '../attachments/files';
import { extractPdfText } from '../attachments/pdfText';
import { readFiles, useAttachFiles, type ReadFile } from '../attachments/useAttachFiles';
import { importInboxAttachments } from '../data/inboxImport';
import { allTimeZones, dateOf, deviceTimeZone, isValidLocal, isValidZone, timeOf, zoneLabel } from '../data/localTime';
import { getBooking, listAllBookings, saveBooking } from '../data/repo';
import { loadHousehold, type Household } from '../household/household';
import type { Booking, BookingVisibility } from '../data/types';
import { applyChanges, diffBooking, findExistingBooking, type Change, type Proposal } from '../domain/changes';
import { BOOKING_TYPES, type BookingType } from '../data/types';
import { TYPE_INFO } from '../domain/agenda';
import type { InboxPrefill } from './InboxItemPage';
import { t } from '../i18n';

function isType(value: string | null): value is BookingType {
  return value !== null && (BOOKING_TYPES as readonly string[]).includes(value);
}

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
  const { attachRead, progress } = useAttachFiles(session.email ?? '');
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<ReadFile[]>([]);
  const [readMessage, setReadMessage] = useState('');
  /** Texto tal cual lo lee pdf.js: para comprobar por qué una regla no encuentra algo. */
  const [rawText, setRawText] = useState<string | null>(null);

  // Desde la bandeja de entrada llega una propuesta: rellena el formulario y, al guardar, trae los adjuntos del correo.
  const prefill = (useLocation().state as { prefill?: InboxPrefill } | null)?.prefill;
  const zoneOr = (tz: string | null) => (tz && isValidZone(tz) ? tz : deviceTimeZone());

  const [tripId, setTripId] = useState(tripFromRoute ?? '');
  const [type, setType] = useState<BookingType>(isType(prefill?.type ?? null) ? (prefill!.type as BookingType) : 'flight');
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [startDate, setStartDate] = useState(prefill?.startLocal ? dateOf(prefill.startLocal) : '');
  const [startTime, setStartTime] = useState(prefill?.startLocal ? timeOf(prefill.startLocal) : '');
  const [startTz, setStartTz] = useState(zoneOr(prefill?.startTz ?? null));
  const [startPlace, setStartPlace] = useState(prefill?.startPlace ?? '');
  const [withEnd, setWithEnd] = useState(!!prefill?.endLocal);
  const [endDate, setEndDate] = useState(prefill?.endLocal ? dateOf(prefill.endLocal) : '');
  const [endTime, setEndTime] = useState(prefill?.endLocal ? timeOf(prefill.endLocal) : '');
  const [endTz, setEndTz] = useState(zoneOr(prefill?.endTz ?? prefill?.startTz ?? null));
  const [endPlace, setEndPlace] = useState(prefill?.endPlace ?? '');
  const [reference, setReference] = useState(prefill?.reference ?? '');
  const [address, setAddress] = useState(prefill?.address ?? '');
  const [notes, setNotes] = useState(prefill?.notes ?? '');
  const [changeNote, setChangeNote] = useState<string | null>(null);
  // Quién la ve: las de quien administra nacen para todo el hogar; las de un invitado, solo para él y quien administra.
  const [visibility, setVisibility] = useState<BookingVisibility>('household');
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [home, setHome] = useState<Household | null>(null);
  useEffect(() => {
    loadHousehold().then(
      (h) => {
        setHome(h);
        if (!bookingId && !h.iAmAdmin) {
          setVisibility('private');
        }
      },
      () => setHome(null),
    );
  }, [bookingId]);

  useEffect(() => {
    if (prefill?.rawText) {
      setRawText(prefill.rawText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [loaded, setLoaded] = useState(!bookingId);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  /** Al guardar una reserva nueva que ya existe (mismo localizador o misma ruta), se propone actualizar la existente. */
  const [match, setMatch] = useState<{ existing: Booking; proposal: Proposal; changes: Change[] } | null>(null);
  const [ignoreMatch, setIgnoreMatch] = useState(false);

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
        setChangeNote(booking.changeNote);
        setVisibility(booking.visibility ?? 'household');
        setSharedWith(booking.sharedWith ?? []);
      }
      setLoaded(true);
    });
  }, [bookingId]);

  const info = TYPE_INFO[type];

  /** Al elegir ficheros se leen ya: si alguno es una tarjeta de embarque, rellena lo que esté vacío. */
  async function onFilesChosen(files: FileList) {
    setReadMessage(t('Leyendo…'));
    const read = await readFiles(files, setReadMessage);
    setPendingFiles(read);
    const errors = read.filter((r) => r.error).map((r) => r.error);
    const pass = read.flatMap((r) => splitQrCodes(r.qrText)).map((code) => parseBoardingPass(code)).find((p) => p !== null);
    if (pass) {
      const fill = prefillFromBoardingPass(pass);
      setType('flight');
      if (!title.trim()) setTitle(fill.title);
      if (!reference.trim()) setReference(fill.reference);
      if (!startDate) setStartDate(fill.startDate);
      if (!startPlace.trim()) setStartPlace(fill.startPlace);
      if (!endPlace.trim()) setEndPlace(fill.endPlace);
      if (!notes.trim()) setNotes(fill.notes);
      setReadMessage(t('Tarjeta de embarque leída ({passenger}): comprueba la fecha y pon la hora de salida.', { passenger: pass.passenger }));
    } else {
      const withQr = read.reduce((sum, r) => sum + splitQrCodes(r.qrText).length, 0);
      setReadMessage(withQr ? (withQr === 1 ? t('1 QR leído.') : t('{n} QR leídos.', { n: withQr })) : read.some((r) => !r.error) ? t('Ficheros listos para adjuntar.') : '');
      await suggestFromPdfs(read);
    }
    if (errors.length) {
      setReadMessage((m) => `${m} ${errors.join(' ')}`.trim());
    }
  }

  /**
   * Sin tarjeta de embarque: primero se pide al servidor que lea el fichero con IA (PDF o imagen); si no hay red o
   * el servidor no tiene clave, el texto del primer PDF legible propone los campos con las reglas locales.
   */
  async function suggestFromPdfs(read: ReadFile[]) {
    for (const item of read) {
      if (item.error || !(isPdf(item.mime) || item.mime.startsWith('image/'))) {
        continue;
      }
      setReadMessage(t('Leyendo {name} con IA…', { name: item.file.name }));
      const ai = await extractWithAi(item.bytes, item.mime, item.file.name);
      let s: TextSuggestion;
      let source: string;
      if (ai.status === 'ok') {
        s = toSuggestion(ai.extraction);
        source = t('{name} (leído con IA)', { name: item.file.name });
      } else {
        if (!isPdf(item.mime)) {
          setReadMessage(ai.status === 'nothing' ? t('No se ha encontrado ninguna reserva en {name}.', { name: item.file.name }) : '');
          continue;
        }
        let text = '';
        try {
          text = await extractPdfText(item.bytes);
        } catch {
          continue;
        }
        setRawText(text);
        s = suggestFromText(text, item.file.name);
        source = ai.status === 'unavailable' ? item.file.name : t('{name} (sin IA: sin conexión con el servidor)', { name: item.file.name });
      }
      if (!s.type && !s.reference && !s.startDate) {
        setReadMessage(t('No se ha encontrado nada nuevo en {name}.', { name: item.file.name }));
        continue;
      }
      let filled = 0;
      const fill = (current: string, value: string | null, set: (v: string) => void) => {
        if (!current.trim() && value) {
          set(value);
          filled++;
        }
      };
      if (s.type) setType(s.type);
      if (s.startTz) setStartTz(s.startTz);
      if (s.endTz) setEndTz(s.endTz);
      fill(title, s.title, setTitle);
      fill(reference, s.reference, setReference);
      fill(startDate, s.startDate, setStartDate);
      fill(startTime, s.startTime, setStartTime);
      fill(startPlace, s.startPlace, setStartPlace);
      fill(address, s.address, setAddress);
      fill(notes, s.notes, setNotes);
      if (s.endDate || s.endTime || s.endPlace) {
        setWithEnd(true);
        fill(endDate, s.endDate ?? s.startDate, setEndDate);
        fill(endTime, s.endTime, setEndTime);
        fill(endPlace, s.endPlace, setEndPlace);
      }
      setReadMessage(
        filled > 0
          ? t('Datos propuestos a partir de {source}: revísalos antes de guardar.', { source })
          : t('No se ha encontrado nada nuevo en {name}.', { name: item.file.name }),
      );
      return;
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!title.trim()) {
      setError(t('Ponle un título a la reserva.'));
      return;
    }
    const startLocal = `${startDate}T${startTime || '00:00'}`;
    if (!startDate || !isValidLocal(startLocal)) {
      setError(t('Falta la fecha de {label}.', { label: info.startLabel.toLowerCase() }));
      return;
    }
    const endLocal = withEnd && endDate ? `${endDate}T${endTime || '00:00'}` : null;
    if (endLocal && !isValidLocal(endLocal)) {
      setError(t('La {label} no es válida.', { label: info.endLabel.toLowerCase() }));
      return;
    }
    // Una reserva nueva que coincide con una ya cargada (cambio de horario recibido por PDF, por ejemplo) no se duplica.
    if (!bookingId && !ignoreMatch) {
      const proposal: Proposal = {
        type,
        title: title.trim(),
        startLocal,
        startTz,
        startPlace: startPlace.trim() || null,
        endLocal,
        endTz: endLocal ? endTz : null,
        endPlace: endLocal ? endPlace.trim() || null : null,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      };
      const existing = findExistingBooking(await listAllBookings(), proposal);
      if (existing) {
        setMatch({ existing, proposal, changes: diffBooking(existing, proposal) });
        return;
      }
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
          changeNote,
          visibility,
          sharedWith: visibility === 'some' ? sharedWith : [],
        },
        session.email ?? '',
        bookingId,
      );
      if (pendingFiles.length > 0) {
        await attachRead(booking.id, pendingFiles);
      }
      if (prefill?.inboxItemId) {
        await importInboxAttachments(prefill.inboxItemId, booking.id, session.email ?? '', setReadMessage);
      }
      navigate(`/bookings/${booking.id}`, { replace: true });
    } catch (error) {
      setError(describeError(error));
    } finally {
      setSaving(false);
    }
  }

  /** Aplica a la reserva existente lo que trae el formulario, le añade los adjuntos y deja el aviso rojo. */
  async function updateExisting() {
    if (!match) {
      return;
    }
    setSaving(true);
    try {
      const body = applyChanges(match.existing, match.proposal, match.changes, new Date());
      await saveBooking(body, session.email ?? '', match.existing.id);
      if (pendingFiles.length > 0) {
        await attachRead(match.existing.id, pendingFiles);
      }
      if (prefill?.inboxItemId) {
        await importInboxAttachments(prefill.inboxItemId, match.existing.id, session.email ?? '', setReadMessage);
      }
      navigate(`/bookings/${match.existing.id}`, { replace: true });
    } catch (error) {
      setError(describeError(error));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <main className="page muted">{t('Cargando…')}</main>;
  }

  return (
    <main className="page">
      <div className="topbar">
        <BackLink to={bookingId ? `/bookings/${bookingId}` : `/trips/${tripId}`} />
        <h1>{bookingId ? t('Editar reserva') : t('Nueva reserva')}</h1>
      </div>
      {match && (
        <section className="card highlight">
          <h3>{t('Esta reserva ya está en la app')}</h3>
          <p>
            {TYPE_INFO[match.existing.type].icon} {match.existing.title}
            {match.existing.reference && ` · ${match.existing.reference}`}
          </p>
          {match.changes.length > 0 ? (
            <>
              <p className="error">
                <strong>{t('Lo que has metido trae cambios:')}</strong>
              </p>
              <ul>
                {match.changes.map((change) => (
                  <li key={change.field}>
                    {change.label}: {change.before} → <strong>{change.after}</strong>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted small">{t('Los datos coinciden con los de la reserva guardada.')}</p>
          )}
          <div className="actions">
            <button className="btn primary" type="button" disabled={saving} onClick={() => void updateExisting()}>
              {match.changes.length > 0 ? t('Actualizar esa reserva') : t('Añadir los adjuntos a esa reserva')}
            </button>
            <button className="btn" type="button" disabled={saving} onClick={() => { setIgnoreMatch(true); setMatch(null); }}>
              {t('Crear otra de todos modos')}
            </button>
          </div>
        </section>
      )}
      {prefill && (
        <p className="notice">
          {t('Datos propuestos a partir de {source}. Revisa la fecha, la hora y la zona horaria; los adjuntos del correo se añadirán al guardar.', {
            source: prefill.sources?.length ? prefill.sources.join(` ${t('y')} `) : t('el asunto del correo'),
          })}
          {prefill.warnings?.length ? <span className="error"> {prefill.warnings.join(' ')}</span> : null}
        </p>
      )}
      <form onSubmit={submit}>
        <div className="field">
          <label>{t('Tipo')}</label>
          <div className="segmented">
            {BOOKING_TYPES.map((bt) => (
              <button key={bt} type="button" className={type === bt ? 'on' : ''} onClick={() => setType(bt)}>
                {TYPE_INFO[bt].icon} {TYPE_INFO[bt].label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="title">{t('Título')}</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'flight' ? t('IB 6800 Madrid – Tokio') : t('Nombre')} />
        </div>

        <h2>{info.startLabel}</h2>
        <div className="field">
          <div className="inline">
            <input type="date" aria-label={t('Fecha')} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input type="time" aria-label={t('Hora')} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="startTz">{t('Zona horaria del lugar')}</label>
          <ZoneSelect id="startTz" value={startTz} onChange={(tz) => { setStartTz(tz); if (!withEnd) setEndTz(tz); }} />
        </div>
        <div className="field">
          <label htmlFor="startPlace">{t('Lugar')}</label>
          <input id="startPlace" value={startPlace} onChange={(e) => setStartPlace(e.target.value)} placeholder={type === 'flight' ? 'MAD T4' : t('Dirección o nombre')} />
        </div>

        {!withEnd ? (
          <button type="button" className="btn block" onClick={() => { setWithEnd(true); setEndDate(startDate); setEndTz(startTz); }}>
            {t('+ Añadir {label}', { label: info.endLabel.toLowerCase() })}
          </button>
        ) : (
          <>
            <div className="row between">
              <h2>{info.endLabel}</h2>
              <button type="button" className="btn small" onClick={() => setWithEnd(false)}>
                {t('Quitar')}
              </button>
            </div>
            <div className="field">
              <div className="inline">
                <input type="date" aria-label={t('Fecha')} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                <input type="time" aria-label={t('Hora')} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="endTz">{t('Zona horaria del lugar')}</label>
              <ZoneSelect id="endTz" value={endTz} onChange={setEndTz} />
            </div>
            <div className="field">
              <label htmlFor="endPlace">{t('Lugar')}</label>
              <input id="endPlace" value={endPlace} onChange={(e) => setEndPlace(e.target.value)} />
            </div>
          </>
        )}

        <h2>{t('Detalles')}</h2>
        <div className="field">
          <label htmlFor="reference">{t('Localizador')}</label>
          <input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} autoCapitalize="characters" />
        </div>
        <div className="field">
          <label htmlFor="address">{t('Dirección')}</label>
          <input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="notes">{t('Notas')}</label>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {home && (
          <div className="field">
            <label>{t('Quién la ve')}</label>
            <div className="segmented">
              {(
                [
                  ['household', t('Todo el hogar')],
                  ['private', home.iAmAdmin ? t('Solo yo') : t('Solo yo y quien administra')],
                  ['some', t('Personas concretas')],
                ] as [BookingVisibility, string][]
              ).map(([value, label]) => (
                <button key={value} type="button" className={visibility === value ? 'on' : ''} onClick={() => setVisibility(value)}>
                  {label}
                </button>
              ))}
            </div>
            {visibility === 'some' && (
              <div style={{ marginTop: 8 }}>
                {home.members.filter((m) => !m.me && m.role !== 'admin').length === 0 && (
                  <p className="muted small">{t('Todavía no hay más personas en el hogar con quien compartirla.')}</p>
                )}
                {home.members
                  .filter((m) => !m.me && m.role !== 'admin')
                  .map((m) => (
                    <label key={m.userId} className="row small" style={{ gap: 10, margin: '6px 0' }}>
                      <input
                        type="checkbox"
                        checked={sharedWith.includes(m.userId)}
                        onChange={(e) => setSharedWith(e.target.checked ? [...sharedWith, m.userId] : sharedWith.filter((id) => id !== m.userId))}
                      />
                      {m.email ?? m.userId}
                    </label>
                  ))}
                <p className="muted small">{t('Quien administra el hogar la ve siempre.')}</p>
              </div>
            )}
          </div>
        )}
        {!bookingId && (
          <div className="field">
            <label htmlFor="files">{t('Adjuntos (tarjetas de embarque, PDF, fotos)')}</label>
            <input
              id="files"
              ref={fileInput}
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={(e) => {
                if (e.target.files) {
                  void onFilesChosen(e.target.files);
                }
              }}
            />
            {readMessage && <p className="muted small">{readMessage}</p>}
          </div>
        )}
        {progress.message && <p className="muted small">{progress.message}</p>}
        {prefill && readMessage && <p className="muted small">{readMessage}</p>}
        {rawText && (
          <details className="small muted" style={{ margin: '8px 0' }}>
            <summary>{t('Texto leído del PDF (para afinar las reglas)')}</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>{rawText.slice(0, 4000)}</pre>
            <p>{t('En bruto, con los caracteres invisibles como códigos:')}</p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.7rem', wordBreak: 'break-all' }}>
              {JSON.stringify(rawText.slice(Math.max(0, rawText.search(/asiento/i) - 200), rawText.search(/asiento/i) + 700))}
            </pre>
          </details>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" type="submit" disabled={saving || progress.busy}>
          {saving ? t('Guardando…') : t('Guardar')}
        </button>
      </form>
    </main>
  );
}
