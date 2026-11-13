/**
 * Test-only SMTP server on 127.0.0.1 with a random port. It speaks enough SMTP for nodemailer (EHLO, AUTH
 * PLAIN/LOGIN, MAIL, RCPT, DATA, QUIT) and records each accepted message, so live-mode tests can check what
 * a real mail server would receive. Behaviour switches let a test reject the login, reject a recipient with a
 * chosen reply code, or never greet (to exercise timeouts). Never point a real mail client at it.
 */
import net from 'node:net';

export interface ReceivedEmail {
  from: string;
  to: string[];
  subject: string;
  body: string;
  /** The username the client authenticated with. */
  authUser: string | null;
}

export interface FakeSmtpOptions {
  /** Username and password the server accepts. Anything else gets 535. */
  credentials?: { user: string; pass: string };
  /** Recipient address → SMTP reply code to reject it with (for example 550 or 450). */
  rejectRecipients?: Record<string, number>;
  /** Accept the TCP connection but never send the greeting. */
  silent?: boolean;
}

export interface FakeSmtpServer {
  port: number;
  messages: ReceivedEmail[];
  close(): Promise<void>;
}

export async function startFakeSmtpServer(options: FakeSmtpOptions = {}): Promise<FakeSmtpServer> {
  const messages: ReceivedEmail[] = [];
  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    if (options.silent) return;

    let buffer = '';
    let inData = false;
    let dataLines: string[] = [];
    let from = '';
    let to: string[] = [];
    let authUser: string | null = null;
    let pendingLogin: 'user' | 'pass' | null = null;
    let loginUser = '';

    const reply = (line: string): void => {
      socket.write(`${line}\r\n`);
    };
    const checkLogin = (user: string, pass: string): void => {
      const expected = options.credentials;
      if (!expected || (expected.user === user && expected.pass === pass)) {
        authUser = user;
        reply('235 2.7.0 Authentication successful');
      } else {
        reply('535 5.7.8 Authentication credentials invalid');
      }
    };

    reply('220 fake-smtp.example.test ESMTP ready');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let index = buffer.indexOf('\r\n');
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        index = buffer.indexOf('\r\n');

        if (inData) {
          if (line === '.') {
            inData = false;
            messages.push({ from, to, authUser, ...parseMessage(dataLines) });
            dataLines = [];
            reply('250 2.0.0 Ok: queued as fake-message');
          } else {
            dataLines.push(line.startsWith('..') ? line.slice(1) : line);
          }
          continue;
        }
        if (pendingLogin === 'user') {
          loginUser = Buffer.from(line, 'base64').toString('utf8');
          pendingLogin = 'pass';
          reply(`334 ${Buffer.from('Password:').toString('base64')}`);
          continue;
        }
        if (pendingLogin === 'pass') {
          pendingLogin = null;
          checkLogin(loginUser, Buffer.from(line, 'base64').toString('utf8'));
          continue;
        }

        const command = line.slice(0, 4).toUpperCase();
        if (command === 'EHLO' || command === 'HELO') {
          socket.write('250-fake-smtp.example.test\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n');
        } else if (line.toUpperCase().startsWith('AUTH PLAIN')) {
          const [, user = '', pass = ''] = Buffer.from(line.slice(11).trim(), 'base64').toString('utf8').split('\0');
          checkLogin(user, pass);
        } else if (line.toUpperCase().startsWith('AUTH LOGIN')) {
          pendingLogin = 'user';
          reply(`334 ${Buffer.from('Username:').toString('base64')}`);
        } else if (command === 'MAIL') {
          from = addressIn(line);
          to = [];
          reply('250 2.1.0 Ok');
        } else if (command === 'RCPT') {
          const address = addressIn(line);
          const rejectCode = options.rejectRecipients?.[address];
          if (rejectCode) {
            reply(`${rejectCode} 5.1.1 <${address}>: Recipient address rejected`);
          } else {
            to.push(address);
            reply('250 2.1.5 Ok');
          }
        } else if (command === 'DATA') {
          inData = true;
          reply('354 End data with <CR><LF>.<CR><LF>');
        } else if (command === 'QUIT') {
          reply('221 2.0.0 Bye');
          socket.end();
        } else if (command === 'RSET' || command === 'NOOP') {
          reply('250 2.0.0 Ok');
        } else {
          reply('502 5.5.2 Command not recognized');
        }
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    port,
    messages,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function addressIn(line: string): string {
  return /<([^>]*)>/.exec(line)?.[1] ?? '';
}

function parseMessage(lines: string[]): { subject: string; body: string } {
  const blank = lines.indexOf('');
  const headerLines = blank === -1 ? lines : lines.slice(0, blank);
  const bodyLines = blank === -1 ? [] : lines.slice(blank + 1);

  // Unfold continued header lines.
  const headers: string[] = [];
  for (const line of headerLines) {
    if (/^\s/.test(line) && headers.length > 0) {
      headers[headers.length - 1] += ` ${line.trim()}`;
    } else {
      headers.push(line);
    }
  }
  const header = (name: string): string =>
    headers.find((line) => line.toLowerCase().startsWith(`${name.toLowerCase()}:`))?.slice(name.length + 1).trim() ?? '';

  let body = bodyLines.join('\n');
  const encoding = header('Content-Transfer-Encoding').toLowerCase();
  if (encoding === 'quoted-printable') body = decodeQuotedPrintable(body);
  if (encoding === 'base64') body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8');

  return { subject: decodeEncodedWords(header('Subject')), body };
}

function decodeQuotedPrintable(input: string): string {
  const joined = input.replace(/=\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i += 1) {
    const char = joined[i] ?? '';
    const hex = joined.slice(i + 1, i + 3);
    if (char === '=' && /^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(char, 'utf8'));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function decodeEncodedWords(value: string): string {
  return value.replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi, (_match, kind: string, text: string) =>
    kind.toLowerCase() === 'b'
      ? Buffer.from(text, 'base64').toString('utf8')
      : decodeQuotedPrintable(text.replace(/_/g, ' ')),
  );
}
