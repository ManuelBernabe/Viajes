import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { describeError } from '../api';
import { BackLink } from '../app/Layout';
import { applySuggestion, suggestFromText } from '../attachments/extract';
import { formatSize, isPdf } from '../attachments/files';
import { extractPdfText } from '../attachments/pdfText';
import { useSession } from '../app/SessionContext';
import { importInboxAttachments } from '../data/inboxImport';
import { getInboxItem, listAllBookings, listTrips, saveBooking } from '../data/repo';
import { downloadInboxAttachment, setInboxStatus } from '../data/syncClient';
import type { Booking } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { sortTrips, todayLocal, TYPE_INFO } from '../domain/agenda';
import { applyChanges, diffBooking, findExistingBooking, type Change } from '../domain/changes';

export interface InboxPrefill {
  inboxItemId: string;
  type: string | null;
  title: string | null;
  startLocal: string | null;
  startTz: string | null;
  startPlace: string | null;
  endLocal: string | null;
  endTz: string | null;
  endPlace: string | null;
  reference: string | null;
  address: string | null;
  notes?: string | null;
  /** De dónde salieron los datos («billete.pdf», «texto del correo») y qué falló, para enseñarlo en el formulario. */
  sources?: string[];
  warnings?: string[];
  /** Texto del PDF tal cual lo leyó pdf.js, para afinar las reglas. */
  rawText?: string | null;
}

export function InboxItemPage() {
  const { itemId = '' } = useParams();
  const navigate = useNavigate();
  const item = useLiveQuery(() => getInboxItem(itemId), [itemId]);
  const trips = useLiveQuery(listTrips, []);
  const [tripId, setTripId] = useState('');
  const session = useSession();
  const [message, setMessage] = useState('');
  const [showBody, setShowBody] = useState(false);
  const [preparing, setPreparing] = useState(false);
  /** El correo se refiere a una reserva ya cargada: se enseñan los cambios y se decide qué hacer. */
  const [match, setMatch] = useState<{ existing: Booking; prefill: InboxPrefill; changes: Change[] } | null>(null);
  const [working, setWorking] = useState('');

  if (item === undefined || trips === undefined) {
    return <main className="page muted">Cargando…</main>;
  }
  if (!item) {
    return (
      <main className="page">
        <div className="topbar">
          <BackLink to="/inbox" />
          <h1>Correo</h1>
        </div>
        <p className="empty">Este borrador ya se ha tratado.</p>
      </main>
    );
  }

  const sorted = sortTrips(trips, todayLocal());
  const options = [...sorted.active, ...sorted.past];
  const chosen = tripId || options[0]?.id || '';

  /**
   * Los datos estructurados del servidor van primero. Lo que falte se completa leyendo el texto del correo y,
   * después, el texto de los PDF adjuntos (un reenvío pierde los datos estructurados, pero no el billete).
   */
  async function createBooking() {
    if (!chosen) {
      setMessage('Crea primero un viaje donde guardar la reserva.');
      return;
    }
    setPreparing(true);
    setMessage('');
    let prefill: InboxPrefill = {
      inboxItemId: item!.id,
      type: item!.suggestedType,
      title: item!.suggestedTitle,
      startLocal: item!.suggestedStartLocal,
      startTz: item!.suggestedStartTz,
      startPlace: item!.suggestedStartPlace,
      endLocal: item!.suggestedEndLocal,
      endTz: item!.suggestedEndTz,
      endPlace: item!.suggestedEndPlace,
      reference: item!.suggestedReference,
      address: item!.suggestedAddress,
    };
    const complete = () =>
      !!(prefill.type && prefill.startLocal && prefill.reference && prefill.startPlace && prefill.endPlace);
    const sources: string[] = [];
    const warnings: string[] = [];
    if (prefill.type) {
      sources.push('los datos estructurados del correo');
    }
    try {
      // El billete adjunto es más fiable que el texto del correo: va primero.
      for (const attachment of item!.attachments) {
        if (!isPdf(attachment.mime) || complete()) {
          continue;
        }
        try {
          const bytes = await downloadInboxAttachment(item!.id, attachment.id);
          const text = await extractPdfText(bytes);
          prefill.rawText ??= text;
          const suggestion = suggestFromText(text, attachment.name);
          if (suggestion.type || suggestion.reference || suggestion.startDate) {
            prefill = applySuggestion(prefill, suggestion);
            sources.push(attachment.name);
          } else {
            warnings.push(`${attachment.name}: sin datos reconocibles (${text.length} caracteres de texto).`);
          }
        } catch (error) {
          // Sin red o PDF ilegible: se sigue con lo que hay, pero se dice, con detalle para poder arreglarlo.
          const detail =
            error instanceof Error
              ? `${error.name}: ${error.message}${error.stack ? ` @ ${error.stack.split('\n').slice(0, 2).join(' / ').slice(0, 160)}` : ''}`
              : String(error);
          warnings.push(`${attachment.name}: ${detail}`);
        }
      }
      if (!complete() && item!.bodyText) {
        prefill = applySuggestion(prefill, suggestFromText(item!.bodyText, item!.subject));
        sources.push('el texto del correo');
      }
    } finally {
      setPreparing(false);
    }
    prefill.sources = sources;
    prefill.warnings = warnings;
    prefill.title ??= item!.subject;

    // ¿Es una modificación de algo que ya está en la app?
    const existing = findExistingBooking(await listAllBookings(), prefill);
    if (existing) {
      setMatch({ existing, prefill, changes: diffBooking(existing, prefill) });
      return;
    }
    navigate(`/trips/${chosen}/bookings/new`, { state: { prefill } });
  }

  /** Aplica los cambios del correo a la reserva existente, le añade los adjuntos y marca el aviso. */
  async function updateExisting() {
    if (!match) {
      return;
    }
    setWorking('Actualizando la reserva…');
    try {
      const body = applyChanges(match.existing, match.prefill, match.changes, new Date());
      await saveBooking(body, session.email ?? '', match.existing.id);
      await importInboxAttachments(item!.id, match.existing.id, session.email ?? '', setWorking);
      navigate(`/bookings/${match.existing.id}`, { replace: true });
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setWorking('');
    }
  }

  /** Sin cambios: solo se añaden los adjuntos nuevos (un billete reenviado, por ejemplo). */
  async function attachToExisting() {
    if (!match) {
      return;
    }
    setWorking('Añadiendo los adjuntos…');
    try {
      await importInboxAttachments(item!.id, match.existing.id, session.email ?? '', setWorking);
      navigate(`/bookings/${match.existing.id}`, { replace: true });
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setWorking('');
    }
  }

  function createAnyway() {
    if (match) {
      navigate(`/trips/${chosen}/bookings/new`, { state: { prefill: match.prefill } });
    }
  }

  async function discard() {
    if (!confirm('¿Descartar este correo? No se creará ninguna reserva.')) {
      return;
    }
    try {
      await setInboxStatus(item!.id, 'discarded');
      navigate('/inbox', { replace: true });
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  return (
    <main className="page">
      <div className="topbar">
        <BackLink to="/inbox" />
        <h1>{item.suggestedTitle ?? item.subject}</h1>
      </div>

      <section className="card">
        <div className="small muted">De {item.fromAddress}</div>
        <div className="small muted">Asunto: {item.subject}</div>
        {item.suggestedType && (
          <p>
            {TYPE_INFO[item.suggestedType].icon} {TYPE_INFO[item.suggestedType].label}
            {item.suggestedStartLocal && ` · ${item.suggestedStartLocal.replace('T', ' ')}`}
            {item.suggestedReference && ` · ${item.suggestedReference}`}
          </p>
        )}
        {!item.suggestedType && <p className="small">No se han encontrado datos estructurados: la reserva se rellena a mano con el asunto y los adjuntos.</p>}
        {item.attachments.length > 0 && (
          <ul className="small">
            {item.attachments.map((a) => (
              <li key={a.id}>
                {a.name} · {formatSize(a.size)}
                {a.qrText && ' · código de barras leído'}
              </li>
            ))}
          </ul>
        )}
        {item.bodyText && (
          <button className="btn small" type="button" onClick={() => setShowBody(!showBody)}>
            {showBody ? 'Ocultar el correo' : 'Ver el texto del correo'}
          </button>
        )}
        {showBody && <pre className="small" style={{ whiteSpace: 'pre-wrap' }}>{item.bodyText}</pre>}
      </section>

      <div className="field">
        <label htmlFor="trip">Viaje</label>
        {options.length > 0 ? (
          <select id="trip" value={chosen} onChange={(e) => setTripId(e.target.value)}>
            {options.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.title}
              </option>
            ))}
          </select>
        ) : (
          <Link className="btn" to="/trips/new">
            Crear un viaje
          </Link>
        )}
      </div>

      {message && <p className="error">{message}</p>}

      {match ? (
        <section className="card highlight">
          <h3>Esta reserva ya está en la app</h3>
          <p>
            {TYPE_INFO[match.existing.type].icon} {match.existing.title}
            {match.existing.reference && ` · ${match.existing.reference}`}
          </p>
          {match.changes.length > 0 ? (
            <>
              <p className="error">
                <strong>El correo trae cambios:</strong>
              </p>
              <ul>
                {match.changes.map((change) => (
                  <li key={change.field}>
                    {change.label}: {change.before} → <strong>{change.after}</strong>
                  </li>
                ))}
              </ul>
              <div className="actions">
                <button className="btn primary" disabled={!!working} onClick={() => void updateExisting()}>
                  {working || 'Actualizar la reserva'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small">Los datos del correo coinciden con los de la reserva.</p>
              {item.attachments.length > 0 && (
                <div className="actions">
                  <button className="btn primary" disabled={!!working} onClick={() => void attachToExisting()}>
                    {working || 'Añadir los adjuntos a la reserva'}
                  </button>
                </div>
              )}
            </>
          )}
          <div className="actions">
            <button className="btn" disabled={!!working} onClick={createAnyway}>
              Crear como reserva nueva
            </button>
            <button className="btn danger" disabled={!!working} onClick={() => void discard()}>
              Descartar el correo
            </button>
          </div>
        </section>
      ) : (
        <div className="actions">
          <button className="btn primary" disabled={preparing} onClick={() => void createBooking()}>
            {preparing ? 'Leyendo el correo…' : 'Crear reserva'}
          </button>
          <button className="btn danger" onClick={() => void discard()}>
            Descartar
          </button>
        </div>
      )}
    </main>
  );
}
