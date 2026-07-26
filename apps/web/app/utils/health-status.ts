import type { StatusBadgeTone } from '@ward-comms/ui';

export type HealthPageState =
  | { kind: 'loading' }
  | { kind: 'success'; service: string; timestamp: string }
  | { kind: 'error'; message: string };

export function toStatusBadgeTone(state: HealthPageState): StatusBadgeTone {
  switch (state.kind) {
    case 'success':
      return 'success';
    case 'error':
      return 'error';
    case 'loading':
    default:
      return 'neutral';
  }
}

export function toStatusBadgeLabel(state: HealthPageState): string {
  switch (state.kind) {
    case 'success':
      return `${state.service} is healthy`;
    case 'error':
      return `Unable to reach API: ${state.message}`;
    case 'loading':
    default:
      return 'Checking API health...';
  }
}
