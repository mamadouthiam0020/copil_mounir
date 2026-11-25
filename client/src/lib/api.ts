import type { ApiList, User } from '@/types';

const SESSION_KEY = 'copil.session.v1';

export interface Session {
  token: string;
  user: User;
}

export class ApiError extends Error {
  status: number;
  issues?: Array<{ path: string; message: string }>;

  constructor(message: string, status: number, issues?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

/**
 * Le token d'accès reste en mémoire (jamais dans localStorage ni dans un cookie
 * lisible par JS). Le refresh token est géré par le navigateur via un cookie
 * HttpOnly positionné par l'API.
 */
let memoryToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setMemoryToken(token: string | null) {
  memoryToken = token;
}

export function getMemoryToken() {
  return memoryToken;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed?.user || !parsed.user.id) return null;
    return { token: memoryToken ?? '', user: parsed.user as User };
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  memoryToken = session.token || null;
  // Seules les informations publiques du profil sont conservées côté client.
  localStorage.setItem(SESSION_KEY, JSON.stringify({ user: session.user }));
}

export function clearSession() {
  memoryToken = null;
  localStorage.removeItem(SESSION_KEY);
}

function authHeader(): Record<string, string> {
  return memoryToken ? { Authorization: `Bearer ${memoryToken}` } : {};
}

async function rawRequest<T>(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(),
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new ApiError('Impossible de joindre le serveur. Vérifiez votre connexion.', 0);
  }
  return response;
}

async function readPayload(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

const isAuthPath = (path: string) => /^\/auth\/(login|refresh|logout)/.test(path);

async function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const response = await rawRequest<{ data: Session }>('/auth/refresh', { method: 'POST' });
      if (!response.ok) return false;
      const payload = await readPayload(response);
      if (!payload?.data?.token || !payload.data.user) return false;
      memoryToken = payload.data.token;
      localStorage.setItem(SESSION_KEY, JSON.stringify({ user: payload.data.user }));
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await rawRequest<T>(path, init);

  if (response.status === 401 && !isAuthPath(path) && memoryToken) {
    const refreshed = await refreshSession();
    if (refreshed) response = await rawRequest<T>(path, init);
  }

  const payload = await readPayload(response);

  if (response.status === 401 && !isAuthPath(path)) {
    clearSession();
    window.dispatchEvent(new CustomEvent('copil:unauthorized'));
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.error || 'Une erreur est survenue. Veuillez réessayer.',
      response.status,
      payload?.issues,
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export async function getData<T>(path: string): Promise<T> {
  const result = await api.get<{ data: T }>(path);
  return result.data;
}

export async function getList<T>(path: string): Promise<ApiList<T>> {
  return api.get<ApiList<T>>(path);
}

export function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** Valide la data URI et télécharge le fichier via un Blob (jamais comme href). */
export function downloadDataUri(dataUri: string, fileName: string) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUri);
  if (!match) throw new ApiError('Format de document invalide.', 400);
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: match[1] }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadDocument(id: string) {
  const result = await api.get<{ data: { name: string; mime?: string; data?: string } }>(`/documents/${id}`);
  if (!result.data.data) {
    throw new ApiError('Le contenu de ce document n’est pas disponible dans la démonstration.', 404);
  }
  downloadDataUri(result.data.data, result.data.name);
}

/** Neutralise les formules dans les exports CSV (injection Excel). */
export const neutralizeCsvCell = (value: unknown) => {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Une erreur inattendue est survenue.';
}
