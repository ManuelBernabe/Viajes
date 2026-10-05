import { useEffect, useRef, useState } from 'react';
import { describeError } from '../api';
import { createInvitation, createPasswordResetLink, deleteFormerAccount, loadHousehold, removeMember, revokeInvitation, type Household } from '../household/household';
import { locale, t } from '../i18n';

function when(ms: number): string {
  return new Date(ms).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' });
}

/** Sección «Hogar» de Ajustes: quién ve los viajes, invitar a alguien y quitar miembros. */
export function HouseholdSettings() {
  const [home, setHome] = useState<Household | null>(null);
  // El último enlace generado: una invitación o el de cambiar la contraseña de alguien.
  const [link, setLink] = useState<{ url: string; expiresMs: number; resetFor?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showInvitations, setShowInvitations] = useState(false);
  // Evita que un doble toque en «Invitar a alguien» cree dos enlaces antes de que el botón se desactive.
  const inviting = useRef(false);

  async function load() {
    try {
      setHome(await loadHousehold());
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await action();
      await load();
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function invite() {
    if (inviting.current) {
      return;
    }
    inviting.current = true;
    try {
      await run(async () => {
        setLink(await createInvitation());
        setCopied(false);
      });
    } finally {
      inviting.current = false;
    }
  }

  async function resetLink(userId: string, email: string | null) {
    if (!confirm(t('¿Generar un enlace para que {who} ponga una contraseña nueva? Sirve una vez y caduca en 24 horas.', { who: email ?? t('esta persona') }))) {
      return;
    }
    await run(async () => {
      const created = await createPasswordResetLink(userId);
      setLink({ url: created.url, expiresMs: created.expiresMs, resetFor: created.email ?? email ?? t('esta persona') });
      setCopied(false);
    });
  }

  async function share() {
    if (!link) {
      return;
    }
    const text = link.resetFor
      ? t('Para poner una contraseña nueva en la app Viajes abre este enlace (sirve una vez): {url}', { url: link.url })
      : t('Únete a mis viajes en la app Viajes: {url}', { url: link.url });
    if (navigator.share) {
      try {
        await navigator.share({ title: link.resetFor ? t('Nueva contraseña en Viajes') : t('Invitación a Viajes'), text, url: link.url });
        return;
      } catch {
        // Cancelado: queda el botón de copiar.
      }
    }
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setMessage(t('No se ha podido copiar; selecciona el enlace y cópialo a mano.'));
    }
  }

  async function remove(userId: string, email: string | null) {
    if (!confirm(t('¿Quitar a {who} del hogar? Dejará de ver los viajes en su próxima sincronización.', { who: email ?? t('esta persona') }))) {
      return;
    }
    await run(() => removeMember(userId));
  }

  async function deleteAccount(userId: string, email: string | null) {
    if (
      !confirm(
        t(
          '¿Borrar la cuenta de {who}? Su email quedará libre: con un enlace de invitación podrá crear una cuenta nueva con ese mismo email y la contraseña que quiera. Las reservas privadas que tuviera se pierden.',
          { who: email ?? t('esta persona') },
        ),
      )
    ) {
      return;
    }
    await run(() => deleteFormerAccount(userId));
  }

  async function revokeAll(ids: string[]) {
    if (!confirm(t('¿Anular las {n} invitaciones pendientes? Esos enlaces dejarán de funcionar.', { n: ids.length }))) {
      return;
    }
    await run(async () => {
      for (const id of ids) {
        await revokeInvitation(id);
      }
    });
    setShowInvitations(false);
  }

  async function revoke(id: string) {
    if (!confirm(t('¿Anular esta invitación? El enlace dejará de funcionar.'))) {
      return;
    }
    await run(() => revokeInvitation(id));
  }

  return (
    <section className="card">
      <h3>{t('Hogar')}</h3>
      <p className="small muted">
        {t(
          'Las personas del hogar comparten los viajes. Las reservas de quien administra las ven todos; las que añade un invitado solo las ven ese invitado y quien administra. Cualquier miembro puede invitar; solo quien administra puede quitar.',
        )}
      </p>
      {home ? (
        <>
          {home.members.map((member) => (
            <div key={member.userId} className="row between small" style={{ margin: '6px 0' }}>
              <span>
                {member.email ?? member.userId}
                {member.me ? ` (${t('tú')})` : ''}
                {member.role === 'admin' ? ` · ${t('administra')}` : ''}
              </span>
              {home.iAmAdmin && !member.me && (
                <span className="row" style={{ gap: 6 }}>
                  <button className="btn small" type="button" disabled={busy} onClick={() => void resetLink(member.userId, member.email)}>
                    {t('Contraseña')}
                  </button>
                  <button className="btn small danger" type="button" disabled={busy} onClick={() => void remove(member.userId, member.email)}>
                    {t('Quitar')}
                  </button>
                </span>
              )}
            </div>
          ))}
          {home.iAmAdmin && (home.formerMembers ?? []).length > 0 && (
            <>
              <div className="small muted" style={{ margin: '12px 0 4px' }}>
                {t(
                  'Estuvieron en el hogar. Si alguien no recuerda su contraseña, borra su cuenta y mándale una invitación: podrá crearla de nuevo con el mismo email.',
                )}
              </div>
              {(home.formerMembers ?? []).map((former) => (
                <div key={former.userId} className="row between small muted" style={{ margin: '6px 0' }}>
                  <span>{former.email ?? former.userId}</span>
                  <button className="btn small danger" type="button" disabled={busy} onClick={() => void deleteAccount(former.userId, former.email)}>
                    {t('Borrar cuenta')}
                  </button>
                </div>
              ))}
            </>
          )}
          {home.invitations.length > 0 && (
            <div className="row between small muted" style={{ margin: '10px 0 6px' }}>
              <span>
                {home.invitations.length === 1 ? t('1 invitación pendiente') : t('{n} invitaciones pendientes', { n: home.invitations.length })} (
                {t('enlaces enviados que nadie ha usado aún')})
              </span>
              <button className="btn small" type="button" onClick={() => setShowInvitations(!showInvitations)}>
                {showInvitations ? t('Ocultar') : t('Ver')}
              </button>
            </div>
          )}
          {showInvitations &&
            [...home.invitations]
              .sort((a, b) => b.createdMs - a.createdMs)
              .map((invitation) => (
                <div key={invitation.id} className="row between small muted" style={{ margin: '6px 0' }}>
                  <span>
                    {t('Creada {when}', { when: when(invitation.createdMs) })}
                    {invitation.createdByEmail ? ` ${t('por {email}', { email: invitation.createdByEmail })}` : ''} ·{' '}
                    {t('caduca {when}', { when: when(invitation.expiresMs) })}
                  </span>
                  <button className="btn small danger" type="button" disabled={busy} onClick={() => void revoke(invitation.id)}>
                    {t('Anular')}
                  </button>
                </div>
              ))}
          {showInvitations && home.invitations.length > 1 && (
            <button
              className="btn small danger block"
              type="button"
              disabled={busy}
              onClick={() => void revokeAll(home.invitations.map((i) => i.id))}
            >
              {t('Anular todas')}
            </button>
          )}
        </>
      ) : (
        <p className="muted small">{t('Consultando…')}</p>
      )}
      {link && (
        <div className="notice">
          <div className="small">
            {link.resetFor
              ? t('Enlace para que {who} ponga una contraseña nueva (un solo uso, caduca {when}). Mándaselo solo a esa persona:', {
                  who: link.resetFor,
                  when: when(link.expiresMs),
                })
              : t('Enlace de invitación (un solo uso, caduca {when}). Mándaselo a quien quieras:', { when: when(link.expiresMs) })}
          </div>
          <code style={{ wordBreak: 'break-all', display: 'block', margin: '6px 0' }}>{link.url}</code>
          <button className="btn small" type="button" onClick={() => void share()}>
            {copied ? t('Copiado ✓') : 'share' in navigator ? t('Compartir') : t('Copiar')}
          </button>
        </div>
      )}
      <button className="btn block" type="button" disabled={busy} onClick={() => void invite()}>
        {t('Invitar a alguien')}
      </button>
      {message && <p className="error small">{message}</p>}
    </section>
  );
}
