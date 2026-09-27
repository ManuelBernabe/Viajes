import { useEffect, useState } from 'react';
import { describeError } from '../api';
import { createInvitation, loadHousehold, removeMember, revokeInvitation, type Household } from '../household/household';

function when(ms: number): string {
  return new Date(ms).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

/** Sección «Hogar» de Ajustes: quién ve los viajes, invitar a alguien y quitar miembros. */
export function HouseholdSettings() {
  const [home, setHome] = useState<Household | null>(null);
  const [link, setLink] = useState<{ url: string; expiresMs: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

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
    await run(async () => {
      setLink(await createInvitation());
      setCopied(false);
    });
  }

  async function share() {
    if (!link) {
      return;
    }
    const text = `Únete a mis viajes en la app Viajes: ${link.url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Invitación a Viajes', text, url: link.url });
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
                <button className="btn small danger" type="button" disabled={busy} onClick={() => void remove(member.userId, member.email)}>
                  Quitar
                </button>
              )}
            </div>
          ))}
          {home.invitations.map((invitation) => (
            <div key={invitation.id} className="row between small muted" style={{ margin: '6px 0' }}>
              <span>
                Invitación pendiente{invitation.createdByEmail ? ` de ${invitation.createdByEmail}` : ''} · caduca {when(invitation.expiresMs)}
              </span>
              <button className="btn small danger" type="button" disabled={busy} onClick={() => void revoke(invitation.id)}>
                Anular
              </button>
            </div>
          ))}
        </>
      ) : (
        <p className="muted small">Consultando…</p>
      )}
      {link && (
        <div className="notice">
          <div className="small">Enlace de invitación (un solo uso, caduca {when(link.expiresMs)}). Mándaselo a quien quieras:</div>
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
