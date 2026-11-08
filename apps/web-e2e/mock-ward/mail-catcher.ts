/**
 * A tiny SMTP server that accepts every message and saves it as JSON, so
 * the local suite can read password-reset and confirmation emails the app
 * really sent (SYSTEM_EMAIL_MODE=live, SYSTEM_EMAIL_PROVIDER=smtp). The app
 * redacts email bodies in its own database after sending, so this is the
 * only place the links exist — just like a member's real inbox.
 *
 * Listens on localhost only. Never point a real mail client at it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { applyLocalE2eEnv, mailDir } from './env';

applyLocalE2eEnv();
const port = Number(process.env.SYSTEM_EMAIL_SMTP_PORT);
mkdirSync(mailDir, { recursive: true });

function decodeQuotedPrintable(input: string): string {
  const softBreaksRemoved = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < softBreaksRemoved.length; i += 1) {
    const char = softBreaksRemoved[i] ?? '';
    const hex = softBreaksRemoved.slice(i + 1, i + 3);
    if (char === '=' && /^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(char, 'utf8'));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function decodeHeaderValue(value: string): string {
  return value.replace(
    /=\?utf-8\?([bq])\?([^?]*)\?=/gi,
    (_match, encoding: string, text: string) =>
      encoding.toLowerCase() === 'b'
        ? Buffer.from(text, 'base64').toString('utf8')
        : decodeQuotedPrintable(text.replace(/_/g, ' ')),
  );
}

function parseMessage(raw: string): { subject: string; body: string } {
  const separator = raw.search(/\r?\n\r?\n/);
  const headerText = separator === -1 ? raw : raw.slice(0, separator);
  let body = separator === -1 ? '' : raw.slice(separator).replace(/^\r?\n\r?\n/, '');
  const headers = new Map<string, string>();
  for (const line of headerText.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0)
      headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  const encoding = (headers.get('content-transfer-encoding') ?? '').toLowerCase();
  if (encoding === 'quoted-printable') body = decodeQuotedPrintable(body);
  if (encoding === 'base64')
    body = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  return { subject: decodeHeaderValue(headers.get('subject') ?? ''), body };
}

const server = net.createServer((socket) => {
  let buffer = '';
  let inData = false;
  let awaitingLogin = 0;
  let recipients: string[] = [];
  const reply = (line: string): void => {
    socket.write(`${line}\r\n`);
  };
  reply('220 fictional-mail-catcher ready');

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    while (buffer.length > 0) {
      if (inData) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end === -1) return;
        const raw = buffer.slice(0, end).replace(/\r\n\.\./g, '\r\n.');
        buffer = buffer.slice(end + 5);
        inData = false;
        const parsed = parseMessage(raw);
        for (const to of recipients) {
          const file = path.join(mailDir, `${Date.now()}-${randomUUID()}.json`);
          writeFileSync(
            file,
            JSON.stringify({
              to: to.toLowerCase(),
              receivedAt: new Date().toISOString(),
              ...parsed,
            }),
          );
        }
        recipients = [];
        reply('250 OK: saved');
        continue;
      }
      const lineEnd = buffer.indexOf('\r\n');
      if (lineEnd === -1) return;
      const line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 2);
      const command = line.toUpperCase();
      if (awaitingLogin > 0) {
        awaitingLogin -= 1;
        reply(awaitingLogin > 0 ? '334 UGFzc3dvcmQ6' : '235 Authentication successful');
      } else if (command.startsWith('EHLO')) {
        reply('250-fictional-mail-catcher');
        reply('250-AUTH PLAIN LOGIN');
        reply('250-8BITMIME');
        reply('250 SMTPUTF8');
      } else if (command.startsWith('HELO')) {
        reply('250 fictional-mail-catcher');
      } else if (command.startsWith('AUTH PLAIN')) {
        reply(command.trim() === 'AUTH PLAIN' ? '334 ' : '235 Authentication successful');
        if (command.trim() === 'AUTH PLAIN') awaitingLogin = 1;
      } else if (command.startsWith('AUTH LOGIN')) {
        reply('334 VXNlcm5hbWU6');
        awaitingLogin = 2;
      } else if (command.startsWith('MAIL FROM')) {
        recipients = [];
        reply('250 OK');
      } else if (command.startsWith('RCPT TO')) {
        const match = /<([^>]+)>/.exec(line);
        if (match?.[1]) recipients.push(match[1]);
        reply('250 OK');
      } else if (command === 'DATA') {
        inData = true;
        reply('354 End data with <CR><LF>.<CR><LF>');
      } else if (command === 'QUIT') {
        reply('221 Bye');
        socket.end();
      } else {
        reply('250 OK');
      }
    }
  });
  socket.on('error', () => undefined);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Fictional mail catcher listening on 127.0.0.1:${port}, saving to ${mailDir}`);
});
