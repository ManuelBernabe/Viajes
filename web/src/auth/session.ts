import { api, ApiError } from '../api';
import { getMeta, setMeta } from '../data/db';
import { clearAll } from '../data/repo';

export const EMAIL_KEY = 'session.email';

export type SessionCheck = { status: 'in'; email: string } | { status: 'out' } | { status: 'offline' };

export async function cachedEmail(): Promise<string | null> {
  return (await getMeta<string>(EMAIL_KEY)) ?? null;
}

/** Pregunta al servidor. Sin red no se puede saber: la app sigue con la copia local. */
export async function checkSession(): Promise<SessionCheck> {
  try {
    const me = await api<{ email: string }>('/api/auth/me');
    await setMeta(EMAIL_KEY, me.email);
    return { status: 'in', email: me.email };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { status: 'out' };
    }
    return { status: 'offline' };
  }
}

/** Si entra otra persona en el mismo móvil, lo local de la anterior se borra antes. */
async function forgetOtherUser(email: string): Promise<void> {
  const previous = await cachedEmail();
  if (previous && previous.toLowerCase() !== email.toLowerCase()) {
    await clearAll();
  }
}

export async function login(email: string, password: string): Promise<string> {
  const me = await api<{ email: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  await forgetOtherUser(me.email);
  await setMeta(EMAIL_KEY, me.email);
  return me.email;
}

export interface SignUpWith {
  code?: string;
  invitation?: string;
}

/** Alta con el código de registro o con el token de una invitación al hogar. */
export async function register(email: string, password: string, with_: SignUpWith): Promise<string> {
  const me = await api<{ email: string }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, code: with_.code ?? null, invitation: with_.invitation ?? null }) });
  await forgetOtherUser(me.email);
  await setMeta(EMAIL_KEY, me.email);
  return me.email;
}

export async function logout(): Promise<void> {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
  await clearAll();
}
