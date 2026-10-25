import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { ENV, type Env } from "../env";
import { PrismaService } from "../prisma/prisma.service";
import { SubmissionsService } from "../submissions/submissions.service";
import { readInboundEmail } from "./inbound-email";

/** Where handled mail goes, so the inbox only ever holds mail still to process. */
export const PROCESSED_MAILBOX = "Processed";
export const REJECTED_MAILBOX = "Rejected";

const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 60_000;

/**
 * Watches the app's mailbox over IMAP (IDLE, so new mail arrives within seconds) and turns emails
 * from contacts into submissions. Every handled message is moved out of the inbox; one that fails
 * to process stays there and is retried the next time mail arrives or the connection restarts.
 */
@Injectable()
export class InboxService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(InboxService.name);
  private client: ImapFlow | undefined;
  private stopped = false;
  private retryMs = MIN_RETRY_MS;
  private retryTimer: NodeJS.Timeout | undefined;
  private draining: Promise<void> | undefined;
  private drainAgain = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly submissions: SubmissionsService,
  ) {}

  onApplicationBootstrap(): void {
    // In the background: the API keeps serving while the mail server is unreachable.
    void this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    await this.draining;
    await this.client?.logout().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    const client = new ImapFlow({
      host: this.env.MAIL_IMAP_HOST,
      port: this.env.MAIL_IMAP_PORT,
      secure: this.env.MAIL_IMAP_SECURE,
      auth: { user: this.env.MAIL_ADDRESS, pass: this.env.MAIL_PASSWORD },
      logger: false,
      // IDLE (how new mail is noticed) starts after this much inactivity; the default is 15s.
      autoIdleDelay: 1_000,
    });
    client.on("error", (error: unknown) => this.logger.warn(`IMAP error: ${String(error)}`));
    client.on("close", () => {
      if (this.client === client) this.client = undefined;
      this.reconnectLater();
    });
    // New mail while idling.
    client.on("exists", () => void this.drain());

    try {
      await client.connect();
      const existing = new Set((await client.list()).map((mailbox) => mailbox.path));
      for (const mailbox of [PROCESSED_MAILBOX, REJECTED_MAILBOX]) {
        if (!existing.has(mailbox)) await client.mailboxCreate(mailbox);
      }
      // Kept open: once no command is running, imapflow idles on it.
      await client.mailboxOpen("INBOX");
    } catch (error) {
      this.logger.warn(`Couldn't connect to ${this.env.MAIL_IMAP_HOST}: ${String(error)}`);
      client.close();
      this.reconnectLater();
      return;
    }
    if (this.stopped) {
      await client.logout();
      return;
    }
    this.client = client;
    this.retryMs = MIN_RETRY_MS;
    this.logger.log(`Watching ${this.env.MAIL_ADDRESS} on ${this.env.MAIL_IMAP_HOST}`);
    await this.drain();
  }

  private reconnectLater(): void {
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.connect();
    }, this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
  }

  /** Processes everything in the inbox, one run at a time; mail arriving mid-run gets another run. */
  private drain(): Promise<void> {
    if (this.draining) {
      this.drainAgain = true;
      return this.draining;
    }
    this.draining = (async () => {
      do {
        this.drainAgain = false;
        await this.processInbox();
      } while (this.drainAgain && !this.stopped);
    })().finally(() => (this.draining = undefined));
    return this.draining;
  }

  private async processInbox(): Promise<void> {
    const client = this.client;
    if (!client) return;
    try {
      const uids = (await client.search({ all: true }, { uid: true })) || [];
      for (const uid of uids) {
        if (this.stopped) return;
        await this.processMessage(client, uid);
      }
    } catch (error) {
      this.logger.error(`Reading the inbox failed: ${String(error)}`);
    }
  }

  private async processMessage(client: ImapFlow, uid: number): Promise<void> {
    const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!message || !message.source) return;
    const mail = await simpleParser(message.source);

    const result = await readInboundEmail(
      mail,
      this.env.MAIL_ADDRESS,
      (token) => this.prisma.client.contact.findUnique({ where: { inboundToken: token } }),
      this.logger,
    );
    if (!result.accepted) {
      this.logger.warn(`Rejected message ${uid}: ${result.reason}`);
      await client.messageMove(String(uid), REJECTED_MAILBOX, { uid: true });
      return;
    }

    const { contactId, text, images, messageId } = result.email;
    try {
      await this.submissions.create({ contactId, text, emailMessageId: messageId }, images);
    } catch (error) {
      this.logger.error(
        `Processing message ${uid} failed, leaving it in the inbox: ${String(error)}`,
      );
      return;
    }
    await client.messageMove(String(uid), PROCESSED_MAILBOX, { uid: true });
    this.logger.log(
      `Accepted message ${uid} from contact ${contactId} (${images.length} image(s))`,
    );
  }
}
