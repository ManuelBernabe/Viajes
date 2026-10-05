import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, describeError } from '../api';
import { BackLink } from '../app/Layout';
import { applySuggestion, suggestFromText } from '../attachments/extract';
import { formatSize, isPdf } from '../attachments/files';
import { extractPdfText } from '../attachments/pdfText';
import { useSession } from '../app/SessionContext';
import { importInboxAttachments } from '../data/inboxImport';
import { getInboxItem, listAllBookings, listTrips, saveBooking, saveTrip } from '../data/repo';
import { downloadInboxAttachment, reExtractInbox, setInboxStatus } from '../data/syncClient';
import type { Booking, InboxItem, TripBody } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { sortTrips, todayLocal, TYPE_INFO } from '../domain/agenda';
import { applyChanges, diffBooking, findExistingBooking, type Change } from '../domain/changes';
import { draftTrip, matchTrip, type IncomingBooking } from '../domain/tripMatch';
import { lang, t } from '../i18n';

/** Valor del desplegable para «viaje nuevo». */
const NEW_TRIP = '__new__';

function incomingOf(item: InboxItem): IncomingBooking {
  return {
    type: item.suggestedType,
    title: item.suggestedTitle ?? item.subject,
    startLocal: item.suggestedStartLocal,
    endLocal: item.suggestedEndLocal,
    startPlace: item.suggestedStartPlace,
    endPlace: item.suggestedEndPlace,
    address: item.suggestedAddress,
  };
}

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
  /** El viaje nuevo que se propone cuando la reserva no encaja en ninguno; se crea al crear la reserva. */
  const [draft, setDraft] = useState<TripBody | null>(null);
  /** Si se ha tocado a mano, el nombre que llega luego de la IA ya no lo pisa. */
  const draftEdited = useRef(false);

  /**
   * Qué viaje propone la IA: undefined mientras pregunta (o sin IA), null = viaje nuevo, o el id de uno del hogar.
   * Antes de preguntar se lee el billete si al llegar no se pudo (así la decisión usa las fechas y lugares del PDF).
   */
  const [aiTrip, setAiTrip] = useState<string | null | undefined>(undefined);
  const [deciding, setDeciding] = useState(false);

  // Borrador del viaje nuevo: al momento con los datos del correo y, con conexión, lo que propone la IA.
  const itemLoaded = item?.id;
  useEffect(() => {
    if (!item) {
      return;
    }
    setDraft(draftTrip(incomingOf(item), item.subject));
    draftEdited.current = false;
    setAiTrip(undefined);
    let alive = true;
    setDeciding(true);
    void (async () => {
      try {
        let source = item;
        if (source.suggestedNotes === null || source.suggestedNotes === undefined) {
          source = (await reExtractInbox(source.id)) ?? source;
          if (alive && !draftEdited.current) {
            setDraft(draftTrip(incomingOf(source), source.subject));
          }
        }
        // Como mucho 15 s: si la IA tarda más, se sigue con lo que digan las fechas y el destino.
        const proposal = await Promise.race([
          api<{ tripId: string | null; title: string; destination: string | null }>(`/api/inbox/${source.id}/trip-proposal`, {
            method: 'POST',
            body: JSON.stringify({ lang: lang() }),
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15_000)),
        ]);
        if (!alive) {
          return;
        }
        setAiTrip(proposal.tripId ?? null);
        if (!draftEdited.current) {
          setDraft((current) => (current ? { ...current, title: proposal.tripId ? current.title : proposal.title, destination: proposal.destination ?? current.destination } : current));
        }
      } catch {
        // Sin IA o sin conexión: se decide con las fechas y el destino, y el borrador queda con los datos del correo.
      } finally {
        if (alive) {
          setDeciding(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [itemLoaded]);

  if (item === undefined || trips === undefined) {
    return <main className="page muted">{t('Cargando…')}</main>;
  }
  if (!item) {
    return (
      <main className="page">
        <div className="topbar">
          <BackLink to="/inbox" />
          <h1>{t('Correo')}</h1>
        </div>
        <p className="empty">{t('Este borrador ya se ha tratado.')}</p>
      </main>
    );
  }

  const sorted = sortTrips(trips, todayLocal());
  const options = [...sorted.active, ...sorted.past];
  const incoming = incomingOf(item);
  const matched = matchTrip(trips, incoming);
  // Encaja en un viaje: ese. Si no, viaje nuevo cuando la reserva trae fecha (si no la trae, no se sabe: el primero).
  // La IA sabe que «IGR» está en Argentina: si contesta, manda ella (un viaje del hogar o uno nuevo). Si no, fechas y destino.
  const aiChoice = aiTrip === undefined ? undefined : aiTrip !== null && options.some((o) => o.id === aiTrip) ? aiTrip : null;
  const suggested = aiChoice !== undefined ? aiChoice : (matched?.id ?? null);
  const chosen =
    tripId || (aiChoice !== undefined ? (aiChoice ?? NEW_TRIP) : matched?.id || (incoming.startLocal || options.length === 0 ? NEW_TRIP : options[0].id));

  /** El viaje donde va la reserva; si es uno nuevo, se crea ahora (también sin conexión). */
  async function tripForBooking(): Promise<string> {
    if (chosen !== NEW_TRIP) {
      return chosen;
    }
    const body: TripBody = {
      title: draft?.title.trim() || item!.subject.slice(0, 60),
      destination: draft?.destination?.trim() || null,
      startDate: draft?.startDate || null,
      endDate: draft?.endDate || draft?.startDate || null,
    };
    const trip = await saveTrip(body, session.email ?? '');
    setTripId(trip.id);
    return trip.id;
  }

  function editDraft(change: Partial<TripBody>) {
    draftEdited.current = true;
    setDraft((current) => ({ ...(current ?? { title: '', destination: null, startDate: null, endDate: null }), ...change }));
  }

  /**
   * Los datos estructurados del servidor van primero. Lo que falte se completa leyendo el texto del correo y,
   * después, el texto de los PDF adjuntos (un reenvío pierde los datos estructurados, pero no el billete).
   */
  async function createBooking() {
    setPreparing(true);
    setMessage('');
    // Si el correo entró sin IA (antes de configurarla o con el modelo saturado), se pide ahora una lectura.
    let source = item!;
    const sources: string[] = [];
    if (source.suggestedNotes === null || source.suggestedNotes === undefined) {
      const again = await reExtractInbox(source.id);
      if (again) {
        source = again;
        sources.push(t('la lectura con IA del correo'));
      }
    } else {
      sources.push(t('la lectura con IA del correo'));
    }
    let prefill: InboxPrefill = {
      inboxItemId: source.id,
      type: source.suggestedType,
      title: source.suggestedTitle,
      startLocal: source.suggestedStartLocal,
      startTz: source.suggestedStartTz,
      startPlace: source.suggestedStartPlace,
      endLocal: source.suggestedEndLocal,
      endTz: source.suggestedEndTz,
      endPlace: source.suggestedEndPlace,
      reference: source.suggestedReference,
      address: source.suggestedAddress,
      notes: source.suggestedNotes ?? null,
    };
    const complete = () =>
      !!(prefill.type && prefill.startLocal && prefill.reference && prefill.startPlace && prefill.endPlace);
    const warnings: string[] = [];
    if (prefill.type && sources.length === 0) {
      sources.push(t('los datos estructurados del correo'));
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
            warnings.push(t('{name}: sin datos reconocibles ({n} caracteres de texto).', { name: attachment.name, n: text.length }));
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
        sources.push(t('el texto del correo'));
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
    navigate(`/trips/${await tripForBooking()}/bookings/new`, { state: { prefill } });
  }

  /** Aplica los cambios del correo a la reserva existente, le añade los adjuntos y marca el aviso. */
  async function updateExisting() {
    if (!match) {
      return;
    }
    setWorking(t('Actualizando la reserva…'));
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
    setWorking(t('Añadiendo los adjuntos…'));
    try {
      await importInboxAttachments(item!.id, match.existing.id, session.email ?? '', setWorking);
      navigate(`/bookings/${match.existing.id}`, { replace: true });
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setWorking('');
    }
  }

  async function createAnyway() {
    if (match) {
      navigate(`/trips/${await tripForBooking()}/bookings/new`, { state: { prefill: match.prefill } });
    }
  }

  async function discard() {
    if (!confirm(t('¿Descartar este correo? No se creará ninguna reserva.'))) {
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
        <div className="small muted">{t('De {from}', { from: item.fromAddress })}</div>
        <div className="small muted">{t('Asunto: {subject}', { subject: item.subject })}</div>
        {item.suggestedType && (
          <p>
            {TYPE_INFO[item.suggestedType].icon} {TYPE_INFO[item.suggestedType].label}
            {item.suggestedStartLocal && ` · ${item.suggestedStartLocal.replace('T', ' ')}`}
            {item.suggestedReference && ` · ${item.suggestedReference}`}
          </p>
        )}
        {!item.suggestedType && <p className="small">{t('No se han encontrado datos estructurados: la reserva se rellena a mano con el asunto y los adjuntos.')}</p>}
        {item.attachments.length > 0 && (
          <ul className="small">
            {item.attachments.map((a) => (
              <li key={a.id}>
                {a.name} · {formatSize(a.size)}
                {a.qrText && ` · ${t('código de barras leído')}`}
              </li>
            ))}
          </ul>
        )}
        {item.bodyText && (
          <button className="btn small" type="button" onClick={() => setShowBody(!showBody)}>
            {showBody ? t('Ocultar el correo') : t('Ver el texto del correo')}
          </button>
        )}
        {showBody && <pre className="small" style={{ whiteSpace: 'pre-wrap' }}>{item.bodyText}</pre>}
      </section>

      <div className="field">
        <label htmlFor="trip">{t('Viaje')}</label>
        <select id="trip" value={chosen} onChange={(e) => setTripId(e.target.value)}>
          <option value={NEW_TRIP}>➕ {t('Viaje nuevo')}{draft?.title ? `: ${draft.title}` : ''}</option>
          {options.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.title}
              {!deciding && trip.id === suggested ? ` · ${t('encaja con la reserva')}` : ''}
            </option>
          ))}
        </select>
        {deciding && <div className="small muted">{t('Mirando a qué viaje pertenece…')}</div>}
        {!deciding && chosen !== NEW_TRIP && chosen === suggested && (
          <div className="small muted">{t('Es el viaje que coincide con la fecha o el destino de la reserva.')}</div>
        )}
      </div>

      {chosen === NEW_TRIP && (
        <section className="card">
          <h3>➕ {t('Viaje nuevo')}</h3>
          <p className="small muted" style={{ marginTop: 0 }}>
            {suggested === null && incoming.startLocal
              ? t('Esta reserva no encaja en ningún viaje: se creará este al crear la reserva. Puedes cambiar el nombre y las fechas.')
              : t('Se creará al crear la reserva. Puedes cambiar el nombre y las fechas.')}
          </p>
          <div className="field">
            <label htmlFor="new-title">{t('Título')}</label>
            <input id="new-title" value={draft?.title ?? ''} onChange={(e) => editDraft({ title: e.target.value })} placeholder={t('Japón 2026')} />
          </div>
          <div className="field">
            <label htmlFor="new-destination">{t('Destino')}</label>
            <input id="new-destination" value={draft?.destination ?? ''} onChange={(e) => editDraft({ destination: e.target.value })} placeholder={t('Tokio')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
            <div className="field">
              <label htmlFor="new-start">{t('Ida')}</label>
              <input id="new-start" type="date" style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }} value={draft?.startDate ?? ''} onChange={(e) => editDraft({ startDate: e.target.value || null })} />
            </div>
            <div className="field">
              <label htmlFor="new-end">{t('Vuelta')}</label>
              <input id="new-end" type="date" style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }} value={draft?.endDate ?? ''} min={draft?.startDate ?? undefined} onChange={(e) => editDraft({ endDate: e.target.value || null })} />
            </div>
          </div>
        </section>
      )}

      {message && <p className="error">{message}</p>}

      {match ? (
        <section className="card highlight">
          <h3>{t('Esta reserva ya está en la app')}</h3>
          <p>
            {TYPE_INFO[match.existing.type].icon} {match.existing.title}
            {match.existing.reference && ` · ${match.existing.reference}`}
          </p>
          {match.changes.length > 0 ? (
            <>
              <p className="error">
                <strong>{t('El correo trae cambios:')}</strong>
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
                  {working || t('Actualizar la reserva')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small">{t('Los datos del correo coinciden con los de la reserva.')}</p>
              {item.attachments.length > 0 && (
                <div className="actions">
                  <button className="btn primary" disabled={!!working} onClick={() => void attachToExisting()}>
                    {working || t('Añadir los adjuntos a la reserva')}
                  </button>
                </div>
              )}
            </>
          )}
          <div className="actions">
            <button className="btn" disabled={!!working} onClick={() => void createAnyway()}>
              {t('Crear como reserva nueva')}
            </button>
            <button className="btn danger" disabled={!!working} onClick={() => void discard()}>
              {t('Descartar el correo')}
            </button>
          </div>
        </section>
      ) : (
        <div className="actions">
          <button className="btn primary" disabled={preparing || deciding} onClick={() => void createBooking()}>
            {preparing ? t('Leyendo el correo…') : t('Crear reserva')}
          </button>
          <button className="btn danger" onClick={() => void discard()}>
            {t('Descartar')}
          </button>
        </div>
      )}
    </main>
  );
}
