import { Link } from 'react-router-dom';
import { BackLink } from '../app/Layout';
import { listInbox } from '../data/repo';
import { useLiveQuery } from '../data/useLive';
import { TYPE_INFO } from '../domain/agenda';

function received(ms: number): string {
  return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function InboxPage() {
  const items = useLiveQuery(listInbox, []);

  return (
    <main className="page">
      <div className="topbar">
        <BackLink to="/" />
        <h1>Por revisar</h1>
      </div>
      {items && items.length === 0 && (
        <div className="empty">
          <p>No hay correos por revisar.</p>
          <p className="small">Reenvía una reserva a tu Gmail con «+viajes» y aparecerá aquí en uno o dos minutos.</p>
        </div>
      )}
      {items?.map((item) => (
        <Link key={item.id} className="card" to={`/inbox/${item.id}`}>
          <div className="row between">
            <h3 className="grow">
              {item.suggestedType ? `${TYPE_INFO[item.suggestedType].icon} ` : '✉️ '}
              {item.suggestedTitle ?? item.subject}
            </h3>
            <span className="badge">{received(item.receivedMs)}</span>
          </div>
          <div className="muted small">De {item.fromAddress}</div>
          {item.attachments.length > 0 && (
            <div className="muted small">
              {item.attachments.length} {item.attachments.length === 1 ? 'adjunto' : 'adjuntos'}
            </div>
          )}
        </Link>
      ))}
    </main>
  );
}
