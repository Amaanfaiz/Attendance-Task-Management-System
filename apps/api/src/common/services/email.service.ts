import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailClient, KnownEmailSendStatus } from '@azure/communication-email';

// Shared by password reset (always sends when configured - it's the only way a user
// gets their reset link) and NotificationsService's optional email channel (gated by
// the notificationsEmailEnabled setting). Never throws - a failed or unconfigured send
// must never break the operation it's attached to.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private client: EmailClient | null = null;

  constructor(private readonly config: ConfigService) {
    const connectionString = this.config.get<string>(
      'email.acsConnectionString',
    );
    if (connectionString) {
      this.client = new EmailClient(connectionString);
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.client) {
      this.logger.warn(
        `ACS_EMAIL_CONNECTION_STRING is not configured - skipping email to ${to} ("${subject}").`,
      );
      return;
    }
    try {
      // beginSend() returns a long-running-operation poller, not a resolved result -
      // the send is not actually complete (and may still fail) when the promise
      // returned by beginSend() resolves. It must be polled to completion and the
      // final status checked explicitly, or a rejected send looks identical to
      // success and is silently swallowed.
      const poller = await this.client.beginSend({
        senderAddress: this.config.get<string>('email.from')!,
        content: { subject, plainText: text },
        recipients: { to: [{ address: to }] },
      });
      const result = await poller.pollUntilDone();
      if (result.status !== KnownEmailSendStatus.Succeeded) {
        this.logger.error(
          `ACS rejected email to ${to} ("${subject}"): status=${result.status} error=${JSON.stringify(result.error)}`,
        );
        return;
      }
      this.logger.log(
        `Email sent to ${to} ("${subject}") - ACS operationId=${result.id}`,
      );
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}`, err as Error);
    }
  }
}
