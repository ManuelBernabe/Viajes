import { Link } from 'react-router-dom';
import { BackLink } from '../app/Layout';
import { listInbox } from '../data/repo';
import { useLiveQuery } from '../data/useLive';
import { TYPE_INFO } from '../domain/agenda';
import { locale, t } from '../i18n';

/** «vie 26 sept, 15:28»: con varios correos parecidos, el día y la hora los distinguen. */
function received(ms: number): string {
  return new Date(ms).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function InboxPage() {
  const items = useLiveQuery(listInbox, []);

  return (
    <main className="page">
      <div className="topbar">
        <BackLink to="/" />
        <h1>{t('Por revisar')}</h1>
      </div>
      {items && items.length === 0 && (
        <div className="empty">
          <p>{t('No hay correos por revisar.')}</p>
          <p className="small">{t('Reenvía una reserva a tu Gmail con «+viajes» y aparecerá aquí en uno o dos minutos.')}</p>
        </div>
      )}
      {items?.map((item) => (
        <Link key={item.id} className="card" to={`/inbox/${item.id}`}>
          <div className="row between">
            <h3 className="grow">
              {item.suggestedType ? `${TYPE_INFO[item.suggestedType].icon} ` : '✉️ '}
              {item.suggestedTitle ?? item.subject}
            </h3>
            {item.attachments.length > 0 && <span className="badge">📎 {item.attachments.length}</span>}
          </div>
          <div className="muted small">
            {received(item.receivedMs)} · {t('De {from}', { from: item.fromAddress })}
          </div>
          {item.attachments.length > 0 && <div className="muted small">{item.attachments.map((a) => a.name).join(', ')}</div>}
        </Link>
      ))}
    </main>
  );
}
