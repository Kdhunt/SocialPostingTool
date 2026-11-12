import { useState, useRuntimeConfig } from '#imports';
import { WardCommsApiClient, ApiRequestError } from '@ward-comms/api-client';
import type { AuthUser } from '@ward-comms/validation';

export type AuthState =
  | { kind: 'unknown' }
  | { kind: 'anonymous' }
  | { kind: 'authenticated'; user: AuthUser }
  | { kind: 'totp_required'; loginTicket: string }
  | { kind: 'ward_code_required'; loginTicket: string };

export interface UseAuthReturn {
  state: ReturnType<typeof useState<AuthState>>;
  /** Always asks the API. Use after something that changes the session (email, password, 2FA). */
  refreshSession: () => Promise<void>;
  /**
   * Resolves the session once and reuses it: no request when it is already
   * known and recent, and concurrent callers share one request. The auth
   * route middleware calls this before every signed-in page.
   */
  ensureSession: () => Promise<AuthState>;
  /** Marks the session as gone, e.g. after the API answers 401. */
  markSignedOut: () => void;
  login: (username: string, password: string, unitCode?: string) => Promise<{ ok: boolean; error?: string }>;
  submitTotp: (code: string) => Promise<{ ok: boolean; error?: string }>;
  submitWardCode: (wardCode: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

/**
 * Session-cookie-based auth composable for the web app. Never stores a
 * token in localStorage/sessionStorage — the HTTP-only `session_token`
 * cookie set by the API is the only credential, and this composable only
 * ever reflects server-confirmed state (see AGENTS.md: "do not use
 * localStorage for browser authentication tokens").
 */
/** How long a confirmed session is reused before the middleware checks it again. */
export const SESSION_RECHECK_MS = 5 * 60_000;

let pendingSessionCheck: Promise<void> | null = null;

export function useAuth(): UseAuthReturn {
  const state = useState<AuthState>('auth-state', () => ({ kind: 'unknown' }));
  const checkedAt = useState<number>('auth-checked-at', () => 0);
  const config = useRuntimeConfig();
  const client = new WardCommsApiClient({ baseUrl: config.public.apiBaseUrl });

  async function refreshSession(): Promise<void> {
    try {
      const session = await client.getSession();
      state.value = { kind: 'authenticated', user: session.user };
    } catch {
      state.value = { kind: 'anonymous' };
    }
    checkedAt.value = Date.now();
  }

  async function ensureSession(): Promise<AuthState> {
    const fresh = Date.now() - checkedAt.value < SESSION_RECHECK_MS;
    if (fresh && (state.value.kind === 'authenticated' || state.value.kind === 'anonymous')) {
      return state.value;
    }
    // Only the browser shares this promise; the server never calls ensureSession.
    pendingSessionCheck ??= refreshSession().finally(() => {
      pendingSessionCheck = null;
    });
    await pendingSessionCheck;
    return state.value;
  }

  function markSignedOut(): void {
    state.value = { kind: 'anonymous' };
    checkedAt.value = Date.now();
  }

  async function login(
    username: string,
    password: string,
    unitCode?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const result = await client.login(username, password, 'web', unitCode);
      if (result.status === 'totp_required') {
        state.value = { kind: 'totp_required', loginTicket: result.loginTicket };
        return { ok: true };
      }
      if (result.status === 'ward_code_required') {
        state.value = { kind: 'ward_code_required', loginTicket: result.loginTicket };
        return { ok: true };
      }
      state.value = { kind: 'authenticated', user: result.user };
      checkedAt.value = Date.now();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof ApiRequestError ? error.message : 'Unable to sign in.' };
    }
  }

  async function submitTotp(code: string): Promise<{ ok: boolean; error?: string }> {
    if (state.value.kind !== 'totp_required') {
      return { ok: false, error: 'No sign-in attempt is in progress.' };
    }
    try {
      const result = await client.verifyTotp(state.value.loginTicket, code, 'web');
      if (result.status === 'ward_code_required') {
        state.value = { kind: 'ward_code_required', loginTicket: result.loginTicket };
        return { ok: true };
      }
      state.value = { kind: 'authenticated', user: result.user };
      checkedAt.value = Date.now();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof ApiRequestError ? error.message : 'Unable to verify authenticator code.' };
    }
  }

  async function submitWardCode(wardCode: string): Promise<{ ok: boolean; error?: string }> {
    if (state.value.kind !== 'ward_code_required') {
      return { ok: false, error: 'No sign-in attempt is in progress.' };
    }
    try {
      const result = await client.verifyWardCode(state.value.loginTicket, wardCode, 'web');
      state.value = { kind: 'authenticated', user: result.user };
      checkedAt.value = Date.now();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof ApiRequestError ? error.message : 'Unable to verify ward code.' };
    }
  }

  async function logout(): Promise<void> {
    await client.logout().catch(() => undefined);
    markSignedOut();
  }

  return { state, refreshSession, ensureSession, markSignedOut, login, submitTotp, submitWardCode, logout };
}
