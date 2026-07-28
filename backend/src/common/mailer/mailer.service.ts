import { Injectable, Inject, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import * as SMTPTransport from 'nodemailer/lib/smtp-transport';
import { MAILER_OPTIONS, MailerOptions, SendMailOptions } from './mailer.interface';

@Injectable()
export class MailerService {
  private transporter: Transporter;
  private readonly logger = new Logger(MailerService.name);

  constructor(@Inject(MAILER_OPTIONS) private readonly options: MailerOptions) {
    this.createTransporter();
  }

  private createTransporter() {
    if (typeof this.options.transport === 'object' && 'sendMail' in this.options.transport) {
      // Already a transporter instance
      this.transporter = this.options.transport as Transporter;
    } else {
      // Create new transporter
      this.transporter = nodemailer.createTransport(
        this.options.transport as SMTPTransport.Options | string,
        this.options.defaults,
      );
    }

    // Verify connection configuration
    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('Mail transporter verification failed:', error);
      } else {
        this.logger.log('Mail transporter is ready to send messages');
      }
    });
  }

  async sendMail(options: SendMailOptions): Promise<SMTPTransport.SentMessageInfo> {
    try {
      // Apply defaults if not specified
      const mailOptions = {
        from: options.from || this.options.defaults?.from,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        cc: options.cc
          ? Array.isArray(options.cc)
            ? options.cc.join(', ')
            : options.cc
          : undefined,
        bcc: options.bcc
          ? Array.isArray(options.bcc)
            ? options.bcc.join(', ')
            : options.bcc
          : undefined,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
      };

      // Remove undefined values
      Object.keys(mailOptions).forEach((key) => {
        if (mailOptions[key] === undefined) {
          delete mailOptions[key];
        }
      });

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent successfully to ${mailOptions.to}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      throw error;
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      this.logger.error('Mail transporter verification failed:', error);
      return false;
    }
  }
}
