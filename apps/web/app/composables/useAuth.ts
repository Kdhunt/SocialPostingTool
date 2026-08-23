import { useState, useRuntimeConfig } from '#imports';
import { WardCommsApiClient, ApiRequestError } from '@ward-comms/api-client';
import type { AuthUser } from '@ward-comms/validation';

export type AuthState =
  | { kind: 'unknown' }
  | { kind: 'anonymous' }
  | { kind: 'authenticated'; user: AuthUser }
  | { kind: 'ward_code_required'; loginTicket: string };

export interface UseAuthReturn {
  state: ReturnType<typeof useState<AuthState>>;
  refreshSession: () => Promise<void>;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
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
export function useAuth(): UseAuthReturn {
  const state = useState<AuthState>('auth-state', () => ({ kind: 'unknown' }));
  const config = useRuntimeConfig();
  const client = new WardCommsApiClient({ baseUrl: config.public.apiBaseUrl });

  async function refreshSession(): Promise<void> {
    try {
      const session = await client.getSession();
      state.value = { kind: 'authenticated', user: session.user };
    } catch {
      state.value = { kind: 'anonymous' };
    }
  }

  async function login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const result = await client.login(username, password, 'web');
      if (result.status === 'ward_code_required') {
        state.value = { kind: 'ward_code_required', loginTicket: result.loginTicket };
        return { ok: true };
      }
      state.value = { kind: 'authenticated', user: result.user };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof ApiRequestError ? error.message : 'Unable to sign in.' };
    }
  }

  async function submitWardCode(wardCode: string): Promise<{ ok: boolean; error?: string }> {
    if (state.value.kind !== 'ward_code_required') {
      return { ok: false, error: 'No sign-in attempt is in progress.' };
    }
    try {
      const result = await client.verifyWardCode(state.value.loginTicket, wardCode, 'web');
      state.value = { kind: 'authenticated', user: result.user };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof ApiRequestError ? error.message : 'Unable to verify ward code.' };
    }
  }

  async function logout(): Promise<void> {
    await client.logout().catch(() => undefined);
    state.value = { kind: 'anonymous' };
  }

  return { state, refreshSession, login, submitWardCode, logout };
}
