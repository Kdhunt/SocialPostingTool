/**
 * Plain-text copy for account emails. Tokens appear only in the link.
 * Never include passwords. Campaign member footers are not appended.
 */

export function composeVerificationEmail(input: {
  appName: string;
  displayName: string;
  webUrl: string;
  token: string;
}): { subject: string; body: string } {
  const verifyUrl = `${input.webUrl.replace(/\/+$/, '')}/verify-email?token=${encodeURIComponent(input.token)}`;
  return {
    subject: `Confirm your ${input.appName} email`,
    body: [
      `Hello ${input.displayName},`,
      '',
      `Please confirm your email for ${input.appName} by opening this link:`,
      '',
      verifyUrl,
      '',
      'This link expires in 24 hours. If you did not expect this email, you can ignore it.',
      '',
      `— ${input.appName}`,
    ].join('\n'),
  };
}

export function composePasswordResetEmail(input: {
  appName: string;
  displayName: string;
  webUrl: string;
  token: string;
  wardName?: string;
}): { subject: string; body: string } {
  const resetUrl = `${input.webUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(input.token)}`;
  const wardLine = input.wardName ? ` for ${input.wardName}` : '';
  return {
    subject: `Reset your ${input.appName} password`,
    body: [
      `Hello ${input.displayName},`,
      '',
      `A password reset was requested for your ${input.appName} account${wardLine}.`,
      'Choose a new password by opening this link:',
      '',
      resetUrl,
      '',
      'This link expires in 1 hour. If you did not request a reset, you can ignore this email.',
      'We never send your password by email.',
      '',
      `— ${input.appName}`,
    ].join('\n'),
  };
}
