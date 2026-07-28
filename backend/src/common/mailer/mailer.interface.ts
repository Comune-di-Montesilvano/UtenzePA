import { Transporter } from 'nodemailer';
import * as SMTPTransport from 'nodemailer/lib/smtp-transport';

export const MAILER_OPTIONS = Symbol('MAILER_OPTIONS');

export interface MailerOptions {
  transport: SMTPTransport.Options | string | Transporter;
  defaults?: SMTPTransport.Options;
  preview?: boolean;
  template?: {
    dir?: string;
    adapter?: unknown;
    options?: Record<string, unknown>;
  };
}

export interface SendMailOptions {
  from?: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename?: string;
    content?: string | Buffer;
    path?: string;
    contentType?: string;
  }>;
  template?: string;
  context?: Record<string, unknown>;
}
