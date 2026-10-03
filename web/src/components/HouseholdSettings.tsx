import { useEffect, useRef, useState } from 'react';
import { describeError } from '../api';
import { createInvitation, createPasswordResetLink, deleteFormerAccount, loadHousehold, removeMember, revokeInvitation, type Household } from '../household/household';

function when(ms: number): string {
  return new Date(ms).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
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
    if (!confirm(`¿Generar un enlace para que ${email ?? 'esta persona'} ponga una contraseña nueva? Sirve una vez y caduca en 24 horas.`)) {
      return;
    }
    await run(async () => {
      const created = await createPasswordResetLink(userId);
      setLink({ url: created.url, expiresMs: created.expiresMs, resetFor: created.email ?? email ?? 'esta persona' });
      setCopied(false);
    });
  }

  async function share() {
    if (!link) {
      return;
    }
    const text = link.resetFor
      ? `Para poner una contraseña nueva en la app Viajes abre este enlace (sirve una vez): ${link.url}`
      : `Únete a mis viajes en la app Viajes: ${link.url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: link.resetFor ? 'Nueva contraseña en Viajes' : 'Invitación a Viajes', text, url: link.url });
        return;
      } catch {
        // Cancelado: queda el botón de copiar.
      }
    }
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setMessage('No se ha podido copiar; selecciona el enlace y cópialo a mano.');
    }
  }

  async function remove(userId: string, email: string | null) {
    if (!confirm(`¿Quitar a ${email ?? 'esta persona'} del hogar? Dejará de ver los viajes en su próxima sincronización.`)) {
      return;
    }
    await run(() => removeMember(userId));
  }

  async function deleteAccount(userId: string, email: string | null) {
    if (
      !confirm(
        `¿Borrar la cuenta de ${email ?? 'esta persona'}? Su email quedará libre: con un enlace de invitación podrá crear una cuenta nueva con ese mismo email y la contraseña que quiera. Las reservas privadas que tuviera se pierden.`,
      )
    ) {
      return;
    }
    await run(() => deleteFormerAccount(userId));
  }

  async function revokeAll(ids: string[]) {
    if (!confirm(`¿Anular las ${ids.length} invitaciones pendientes? Esos enlaces dejarán de funcionar.`)) {
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
    if (!confirm('¿Anular esta invitación? El enlace dejará de funcionar.')) {
      return;
    }
    await run(() => revokeInvitation(id));
  }

  return (
    <section className="card">
      <h3>Hogar</h3>
      <p className="small muted">
        Las personas del hogar comparten los viajes. Las reservas de quien administra las ven todos; las que añade un invitado solo
        las ven ese invitado y quien administra. Cualquier miembro puede invitar; solo quien administra puede quitar.
      </p>
      {home ? (
        <>
          {home.members.map((member) => (
            <div key={member.userId} className="row between small" style={{ margin: '6px 0' }}>
              <span>
                {member.email ?? member.userId}
                {member.me ? ' (tú)' : ''}
                {member.role === 'admin' ? ' · administra' : ''}
              </span>
              {home.iAmAdmin && !member.me && (
                <span className="row" style={{ gap: 6 }}>
                  <button className="btn small" type="button" disabled={busy} onClick={() => void resetLink(member.userId, member.email)}>
                    Contraseña
                  </button>
                  <button className="btn small danger" type="button" disabled={busy} onClick={() => void remove(member.userId, member.email)}>
                    Quitar
                  </button>
                </span>
              )}
            </div>
          ))}
          {home.iAmAdmin && (home.formerMembers ?? []).length > 0 && (
            <>
              <div className="small muted" style={{ margin: '12px 0 4px' }}>
                Estuvieron en el hogar. Si alguien no recuerda su contraseña, borra su cuenta y mándale una invitación: podrá crearla de
                nuevo con el mismo email.
              </div>
              {(home.formerMembers ?? []).map((former) => (
                <div key={former.userId} className="row between small muted" style={{ margin: '6px 0' }}>
                  <span>{former.email ?? former.userId}</span>
                  <button className="btn small danger" type="button" disabled={busy} onClick={() => void deleteAccount(former.userId, former.email)}>
                    Borrar cuenta
                  </button>
                </div>
              ))}
            </>
          )}
          {home.invitations.length > 0 && (
            <div className="row between small muted" style={{ margin: '10px 0 6px' }}>
              <span>
                {home.invitations.length === 1 ? '1 invitación pendiente' : `${home.invitations.length} invitaciones pendientes`} (enlaces
                enviados que nadie ha usado aún)
              </span>
              <button className="btn small" type="button" onClick={() => setShowInvitations(!showInvitations)}>
                {showInvitations ? 'Ocultar' : 'Ver'}
              </button>
            </div>
          )}
          {showInvitations &&
            [...home.invitations]
              .sort((a, b) => b.createdMs - a.createdMs)
              .map((invitation) => (
                <div key={invitation.id} className="row between small muted" style={{ margin: '6px 0' }}>
                  <span>
                    Creada {when(invitation.createdMs)}
                    {invitation.createdByEmail ? ` por ${invitation.createdByEmail}` : ''} · caduca {when(invitation.expiresMs)}
                  </span>
                  <button className="btn small danger" type="button" disabled={busy} onClick={() => void revoke(invitation.id)}>
                    Anular
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
              Anular todas
            </button>
          )}
        </>
      ) : (
        <p className="muted small">Consultando…</p>
      )}
      {link && (
        <div className="notice">
          <div className="small">
            {link.resetFor
              ? `Enlace para que ${link.resetFor} ponga una contraseña nueva (un solo uso, caduca ${when(link.expiresMs)}). Mándaselo solo a esa persona:`
              : `Enlace de invitación (un solo uso, caduca ${when(link.expiresMs)}). Mándaselo a quien quieras:`}
          </div>
          <code style={{ wordBreak: 'break-all', display: 'block', margin: '6px 0' }}>{link.url}</code>
          <button className="btn small" type="button" onClick={() => void share()}>
            {copied ? 'Copiado ✓' : 'share' in navigator ? 'Compartir' : 'Copiar'}
          </button>
        </div>
      )}
      <button className="btn block" type="button" disabled={busy} onClick={() => void invite()}>
        Invitar a alguien
      </button>
      {message && <p className="error small">{message}</p>}
    </section>
  );
}
