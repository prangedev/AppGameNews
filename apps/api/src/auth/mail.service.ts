import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Env } from '../config/env.schema.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.from = config.get('MAIL_FROM', { infer: true });
    this.publicUrl = config.get('PUBLIC_API_URL', { infer: true });
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: config.get('SMTP_SECURE', { infer: true }),
      auth: config.get('SMTP_USER', { infer: true })
        ? {
            user: config.get('SMTP_USER', { infer: true }),
            pass: config.get('SMTP_PASS', { infer: true }),
          }
        : undefined,
    });
  }

  private async send(to: string, subject: string, text: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text, html });
    } catch (err) {
      // não expõe erro de e-mail ao cliente; loga para operação
      this.logger.error(`falha ao enviar "${subject}" para ${to}: ${(err as Error).message}`);
    }
  }

  async sendVerification(to: string, token: string): Promise<void> {
    const link = `${this.publicUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
    await this.send(
      to,
      'Confirme seu e-mail — AppGameNews',
      `Confirme seu e-mail acessando: ${link}\nO link expira em 24 horas.`,
      `<p>Confirme seu e-mail:</p><p><a href="${link}">Confirmar e-mail</a></p><p>O link expira em 24 horas.</p>`,
    );
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const link = `${this.publicUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
    await this.send(
      to,
      'Redefinição de senha — AppGameNews',
      `Para redefinir sua senha, acesse: ${link}\nSe não foi você, ignore este e-mail. O link expira em 1 hora.`,
      `<p>Para redefinir sua senha:</p><p><a href="${link}">Redefinir senha</a></p><p>Se não foi você, ignore. Expira em 1 hora.</p>`,
    );
  }
}
