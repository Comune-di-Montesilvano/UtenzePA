import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

const USERNAME_EMAIL = process.env.USERNAME_EMAIL;
const PASSWORD_EMAIL = process.env.PASSWORD_EMAIL;
const HOST_EMAIL = process.env.HOST_EMAIL;
const PORT_EMAIL = Number(process.env.PORT_EMAIL);
const SMTP_SECURE_PROTOCOL = process.env.SMTP_SECURE_PROTOCOL === 'true';

@Injectable()
export class EMailerService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: HOST_EMAIL,
      port: PORT_EMAIL,
      secure: SMTP_SECURE_PROTOCOL,
      auth: {
        user: USERNAME_EMAIL,
        pass: PASSWORD_EMAIL,
      },
      tls: {
        rejectUnauthorized: true,
      },
    });
  }

  async sendMail(to: string, subject: string, text: string, html?: string, fromName = 'UtenzePA') {
    try {
      const info = await this.transporter.sendMail({
        from: `${fromName} <${USERNAME_EMAIL}>`,
        to,
        subject,
        text,
        html,
      });

      console.log('Email inviata: %s', info.messageId);
      return true;
    } catch (error) {
      console.error('Errore invio email:', error);
      return false;
    }
  }
}
