import { Module } from '@nestjs/common';
import { MailController } from './mail.controller';
import {
  MAIL_CONFIG,
  MAIL_CONFIG_ERRORS,
  MAIL_TRANSPORT,
  MailService,
} from './mail.service';
import { resolveMailConfig, type MailConfig } from './mail.config';
import { LogMailTransport } from './transports/log-mail.transport';
import { SmtpMailTransport } from './transports/smtp-mail.transport';
import type { MailTransport } from './mail.types';
import { MailQueueScheduler } from './mail-queue.scheduler';

@Module({
  controllers: [MailController],
  providers: [
    {
      provide: MAIL_CONFIG_ERRORS,
      useFactory: (): string[] => resolveMailConfig().errors,
    },
    {
      provide: MAIL_CONFIG,
      useFactory: (): MailConfig => resolveMailConfig().config,
    },
    {
      provide: MAIL_TRANSPORT,
      useFactory: (config: MailConfig): MailTransport =>
        config.transport === 'smtp'
          ? new SmtpMailTransport(config)
          : new LogMailTransport(),
      inject: [MAIL_CONFIG],
    },
    MailService,
    MailQueueScheduler,
  ],
  exports: [MailService],
})
export class MailModule {}
