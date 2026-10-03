import { api } from '../api';
import { setMeta } from '../data/db';
import { VERSION_KEY } from '../data/sync';
import { syncNow } from '../data/syncClient';

export interface Member {
  userId: string;
  email: string | null;
  role: 'admin' | 'member';
  me: boolean;
}

export interface PendingInvitation {
  id: string;
  createdByEmail: string | null;
  createdMs: number;
  expiresMs: number;
}

export interface Household {
  id: string;
  name: string;
  iAmAdmin: boolean;
  members: Member[];
  invitations: PendingInvitation[];
  /** Quien estuvo y ya no está (solo lo ve quien administra). */
  formerMembers?: { userId: string; email: string | null }[];
}

export type InvitationState = 'valid' | 'unknown' | 'expired' | 'used' | 'revoked';

export interface InvitationInfo {
  state: InvitationState;
  householdName: string | null;
  invitedBy: string | null;
  expiresMs: number | null;
}

export function loadHousehold(): Promise<Household> {
  return api<Household>('/api/household/');
}

/** Crea una invitación y devuelve el enlace completo para compartir. */
export async function createInvitation(): Promise<{ url: string; expiresMs: number }> {
  const created = await api<{ id: string; token: string; expiresMs: number }>('/api/household/invitations', { method: 'POST', body: '{}' });
  return { url: invitationUrl(created.token), expiresMs: created.expiresMs };
}

export function invitationUrl(token: string): string {
  return `${location.origin}/invitacion/${token}`;
}

export function revokeInvitation(id: string): Promise<void> {
  return api(`/api/household/invitations/${id}`, { method: 'DELETE' });
}

export function removeMember(userId: string): Promise<void> {
  return api(`/api/household/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

export function lookupInvitation(token: string): Promise<InvitationInfo> {
  return api<InvitationInfo>(`/api/invitations/${encodeURIComponent(token)}`);
}

/** Canjea la invitación con la sesión actual y vuelve a bajar todo: los viajes del hogar nuevo son anteriores al cursor. */
export async function acceptInvitation(token: string): Promise<string> {
  const result = await api<{ householdName: string }>(`/api/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', body: '{}' });
  await setMeta(VERSION_KEY, 0);
  await syncNow();
  return result.householdName;
}

export function describeInvitationState(state: InvitationState): string {
  switch (state) {
    case 'valid':
      return '';
    case 'expired':
      return 'Esta invitación ha caducado. Pide otra a quien te la envió.';
    case 'used':
      return 'Esta invitación ya se ha usado. Pide otra a quien te la envió.';
    case 'revoked':
      return 'Esta invitación se ha anulado.';
    default:
      return 'Esta invitación no existe. Comprueba el enlace.';
  }
}

/** Enlace de un solo uso (24 h) para que un miembro ponga una contraseña nueva. Solo quien administra. */
export async function createPasswordResetLink(userId: string): Promise<{ url: string; email: string | null; expiresMs: number }> {
  const created = await api<{ userId: string; email: string | null; token: string; expiresMs: number }>(
    `/api/household/members/${encodeURIComponent(userId)}/password-reset`,
    { method: 'POST', body: '{}' },
  );
  return { url: `${location.origin}/restablecer/${encodeURIComponent(created.userId)}/${created.token}`, email: created.email, expiresMs: created.expiresMs };
}

/** Comprueba el enlace y devuelve el email de la cuenta. */
export async function checkPasswordReset(userId: string, token: string): Promise<string | null> {
  const result = await api<{ email: string | null }>('/api/auth/password-reset/check', { method: 'POST', body: JSON.stringify({ userId, token }) });
  return result.email;
}

/** Pone la contraseña nueva con el enlace. Devuelve el email para entrar con ella. */
export async function resetPassword(userId: string, token: string, password: string): Promise<string | null> {
  const result = await api<{ email: string | null }>('/api/auth/password-reset', { method: 'POST', body: JSON.stringify({ userId, token, password }) });
  return result.email;
}

/** Borra la cuenta de alguien que ya no está en el hogar: su email queda libre para crear una cuenta nueva. */
export function deleteFormerAccount(userId: string): Promise<void> {
  return api(`/api/household/former-members/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}
