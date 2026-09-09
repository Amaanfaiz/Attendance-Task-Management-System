import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

// Shared by password reset (always sends when configured - it's the only way a user
// gets their reset link) and NotificationsService's optional email channel (gated by
// the notificationsEmailEnabled setting). Never throws - a failed or unconfigured send
// must never break the operation it's attached to.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('email.resendApiKey');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    }
  }

  get isConfigured(): boolean {
    return this.resend !== null;
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY is not configured - skipping email to ${to} ("${subject}").`,
      );
      return;
    }
    try {
      // The Resend SDK does NOT throw on API-level rejections - it resolves with
      // { data: null, error: {...} } instead, so `error` must be checked explicitly
      // or a rejected send (bad from-address, sandbox restriction, quota, etc.) looks
      // identical to success and is silently swallowed.
      const { data, error } = await this.resend.emails.send({
        from: this.config.get<string>('email.from')!,
        to,
        subject,
        text,
      });
      if (error) {
        this.logger.error(
          `Resend rejected email to ${to} ("${subject}"): [${error.name}] ${error.message}`,
        );
        return;
      }
      this.logger.log(
        `Email sent to ${to} ("${subject}") - Resend id=${data?.id}`,
      );
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}`, err as Error);
    }
  }
}
