/**
 * Test-only stand-in for the provider HTTP APIs. The live adapters call fixed provider URLs, so tests replace
 * global `fetch` with this recorder: each call is captured and answered by the test's handler, which can
 * return a response, simulate a network failure, or hang until the caller's timeout fires.
 */
import { vi } from 'vitest';

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

export type FakeReply =
  | { status: number; json?: unknown; text?: string; headers?: Record<string, string> }
  | { networkError: string }
  | { hang: true };

export interface FakeFetch {
  requests: RecordedRequest[];
  /** Answers every later call with this reply (or with the handler's reply for that request). */
  reply(handler: FakeReply | ((request: RecordedRequest) => FakeReply)): void;
}

export function installFakeFetch(): FakeFetch {
  const requests: RecordedRequest[] = [];
  let handler: (request: RecordedRequest) => FakeReply = () => ({ status: 500, text: 'No fake reply set.' });

  const fakeFetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const request: RecordedRequest = {
      url: input instanceof Request ? input.url : String(input),
      method: init.method ?? 'GET',
      headers,
      body: typeof init.body === 'string' ? init.body : '',
    };
    requests.push(request);
    const answer = handler(request);

    if ('hang' in answer) {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal;
        if (!signal) return;
        signal.addEventListener('abort', () => reject(signal.reason as Error), { once: true });
      });
    }
    if ('networkError' in answer) {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error(answer.networkError), { code: answer.networkError }) });
    }
    const body = answer.json !== undefined ? JSON.stringify(answer.json) : (answer.text ?? '');
    return new Response(body, {
      status: answer.status,
      headers: { 'content-type': answer.json !== undefined ? 'application/json' : 'text/plain', ...answer.headers },
    });
  };

  vi.stubGlobal('fetch', fakeFetch);
  return {
    requests,
    reply(next) {
      handler = typeof next === 'function' ? next : () => next;
    },
  };
}
