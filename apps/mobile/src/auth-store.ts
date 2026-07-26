import { ref, type Ref } from 'vue';
import { WardCommsApiClient, ApiRequestError } from '@ward-comms/api-client';
import type { AuthUser } from '@ward-comms/validation';

export type MobileAuthState =
  | { kind: 'anonymous' }
  | { kind: 'authenticated'; user: AuthUser }
  | { kind: 'ward_code_required'; loginTicket: string };

/**
 * In-memory token store for the mobile shell (module-level singleton, not
 * component state, so it survives navigation between screens).
 *
 * KNOWN MVP LIMITATION: the refresh token is only held in memory and is
 * lost on app restart, requiring the member to sign in again. A
 * production build should persist it in platform secure storage (e.g. a
 * Capacitor secure-storage plugin) rather than localStorage (see
 * AGENTS.md: "do not use localStorage for browser authentication
 * tokens") — that plugin was intentionally not added in Phase 4 to avoid
 * pulling in additional native dependencies; see the Phase 4 summary in
 * the final report for this gap.
 */
class MobileAuthStore {
  readonly state: Ref<MobileAuthState> = ref({ kind: 'anonymous' });
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  /** Shared client for authenticated requests (directory, audiences, campaigns, ...). */
  readonly client = new WardCommsApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001',
    getAccessToken: () => this.accessToken,
  });

  async login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const result = await this.client.login(username, password, 'mobile');
      if (result.status === 'ward_code_required') {
        this.state.value = { kind: 'ward_code_required', loginTicket: result.loginTicket };
        return { ok: true };
      }
      this.applyTokens(result.tokens ?? null);
      this.state.value = { kind: 'authenticated', user: result.user };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof ApiRequestError ? error.message : 'Unable to sign in.' };
    }
  }

  async submitWardCode(wardCode: string): Promise<{ ok: boolean; error?: string }> {
    if (this.state.value.kind !== 'ward_code_required') {
      return { ok: false, error: 'No sign-in attempt is in progress.' };
    }
    try {
      const result = await this.client.verifyWardCode(this.state.value.loginTicket, wardCode, 'mobile');
      this.applyTokens(result.tokens ?? null);
      this.state.value = { kind: 'authenticated', user: result.user };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof ApiRequestError ? error.message : 'Unable to verify ward code.' };
    }
  }

  async logout(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    this.state.value = { kind: 'anonymous' };
  }

  private applyTokens(tokens: { accessToken: string; refreshToken: string } | null): void {
    this.accessToken = tokens?.accessToken ?? null;
    this.refreshToken = tokens?.refreshToken ?? null;
  }
}

export const mobileAuthStore = new MobileAuthStore();
