import { Link } from 'react-router-dom';
import { AttachmentThumbs } from '../components/AttachmentThumbs';
import { listAllAttachments, listDocuments, listTrips } from '../data/repo';
import type { Attachment, TravelDocument } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { todayLocal } from '../domain/agenda';
import { DOCUMENT_INFO, documentAlerts, formatDate, groupByPerson, SOON_DAYS } from '../domain/documents';
import { shiftDate } from '../domain/alternatives';
import { t } from '../i18n';

function DocumentCard({ document, files, today }: { document: TravelDocument; files: Attachment[]; today: string }) {
  const info = DOCUMENT_INFO[document.kind];
  const expiry = document.expiryDate;
  const state = !expiry ? null : expiry < today ? 'expired' : expiry <= shiftDate(today, SOON_DAYS) ? 'soon' : null;
  return (
    <section className="card">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <strong>
            {info.icon} {info.label}
          </strong>
          {document.visibility === 'private' && <span className="badge">🔒 {t('Solo para mí')}</span>}
          {(document.number || document.country) && (
            <div className="small">{[document.number, document.country].filter(Boolean).join(' · ')}</div>
          )}
          {expiry && (
            <div className={`small${state === 'expired' ? ' error' : ''}`}>
              {t('Caduca el {date}', { date: formatDate(expiry) })}
              {state === 'expired' && ` · ${t('caducado')}`}
              {state === 'soon' && ` · ⚠️ ${t('caduca pronto')}`}
            </div>
          )}
          {document.notes && <div className="small muted">{document.notes}</div>}
        </div>
        <Link className="btn small" to={`/documents/${document.id}`} aria-label={t('Editar {name}', { name: `${info.label} · ${document.person}` })}>
          {t('Editar')}
        </Link>
      </div>
      <AttachmentThumbs attachments={files} />
    </section>
  );
}

/** «Documentos»: pasaportes, visados, seguros… de todo el hogar, con sus fotos (también sin conexión) y avisos de caducidad. */
export function DocumentsPage() {
  const documents = useLiveQuery(listDocuments, []);
  const trips = useLiveQuery(listTrips, []);
  const attachments = useLiveQuery(listAllAttachments, []);

  if (documents === undefined || trips === undefined || attachments === undefined) {
    return <main className="page muted">{t('Cargando…')}</main>;
  }

  const today = todayLocal();
  const alive = documents.filter((d) => d.deletedAtMs === null);
  const alerts = documentAlerts(alive, trips, today);

  return (
    <main className="page">
      <div className="topbar">
        <h1>{t('Documentos')}</h1>
        <Link className="btn primary small" to="/documents/new">
          {t('+ Añadir')}
        </Link>
      </div>

      {alerts.length > 0 && (
        <section className="card highlight">
          <h3>⚠️ {t('Revisa')}</h3>
          <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
            {alerts.map((alert, index) => (
              <li key={index} className={alert.level === 'danger' ? 'error' : ''} style={{ margin: '4px 0' }}>
                {alert.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {alive.length === 0 && (
        <p className="empty">
          {t('Guarda aquí los pasaportes, DNI, visados, seguros y vacunas de la familia, con una foto o el PDF. Se ven sin conexión y la app avisa si algo caduca antes de un viaje.')}
        </p>
      )}

      {groupByPerson(alive).map((group) => (
        <div key={group.person}>
          <h2>{group.person}</h2>
          {group.documents.map((document) => (
            <DocumentCard key={document.id} document={document} files={attachments.filter((a) => a.bookingId === document.id)} today={today} />
          ))}
        </div>
      ))}
    </main>
  );
}
