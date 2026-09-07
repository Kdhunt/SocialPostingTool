/**
 * Ward-scoped Facebook Page identity. Each ward stores its own Page token
 * under `providerAccountReference = pageId`. Tokens and destinations must
 * never be shared across wards.
 */

export function facebookPageProviderAccountReference(pageId: string): string {
  const trimmed = pageId.trim();
  if (trimmed.length === 0) {
    throw new Error('Facebook Page id is required.');
  }
  if (trimmed.length > 64) {
    throw new Error('Facebook Page id is too long.');
  }
  if (!/^[0-9A-Za-z._-]+$/.test(trimmed)) {
    throw new Error('Facebook Page id contains invalid characters.');
  }
  return trimmed;
}

export function facebookPageCredentialsJson(input: {
  pageId: string;
  pageAccessToken: string;
}): string {
  const pageId = facebookPageProviderAccountReference(input.pageId);
  const pageAccessToken = input.pageAccessToken.trim();
  if (pageAccessToken.length === 0) {
    throw new Error('Facebook Page access token is required.');
  }
  return JSON.stringify({ pageAccessToken, pageId });
}

export function facebookPageDestinationName(pageName: string | null | undefined, pageId: string): string {
  const reference = facebookPageProviderAccountReference(pageId);
  const trimmedName = pageName?.trim() ?? '';
  if (trimmedName.length === 0) {
    return `Facebook Page ${reference}`;
  }
  return trimmedName.slice(0, 255);
}
