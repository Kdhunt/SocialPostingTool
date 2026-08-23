import { loadConfig } from '@ward-comms/config';

function isCrossOriginDeployment(webUrl: string, apiUrl: string): boolean {
  try {
    return new URL(webUrl).origin !== new URL(apiUrl).origin;
  } catch {
    return false;
  }
}

/** Cookie options for session and device cookies (web auth on Vercel uses cross-origin `none`). */
export function getAuthCookieOptions(
  maxAgeOrExpires?: { maxAge?: number; expires?: Date },
  envSource: Record<string, string | undefined> = process.env,
): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax' | 'none';
  maxAge?: number;
  expires?: Date;
} {
  const config = loadConfig(envSource);
  const crossOrigin =
    config.nodeEnv === 'production' && isCrossOriginDeployment(config.web.url, config.api.url);

  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production' || crossOrigin,
    sameSite: crossOrigin ? 'none' : 'lax',
    ...maxAgeOrExpires,
  };
}
