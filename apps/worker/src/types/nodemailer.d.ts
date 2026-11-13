declare module 'nodemailer' {
  export interface SendMailOptions {
    from?: string;
    to?: string;
    subject?: string;
    text?: string;
  }

  export interface SentMessageInfo {
    messageId?: string;
  }

  export interface Transporter {
    sendMail(options: SendMailOptions): Promise<SentMessageInfo>;
  }

  export interface TransportOptions {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: { user: string; pass: string };
    /** Milliseconds to wait for the TCP connection. */
    connectionTimeout?: number;
    /** Milliseconds to wait for the server greeting after connecting. */
    greetingTimeout?: number;
    /** Milliseconds of socket inactivity allowed. */
    socketTimeout?: number;
  }

  export function createTransport(options: TransportOptions): Transporter;
}
