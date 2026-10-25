export type Direction = "inbound" | "outbound-api" | "outbound-reply";

export type MessageStatus = "received" | "queued" | "sending" | "sent" | "delivered" | "failed";

export type Media = { sid: string; contentType: string; data: Buffer };

export type Message = {
  sid: string;
  direction: Direction;
  from: string;
  to: string;
  body: string;
  media: Media[];
  /** Attachments requested; outgoing media is only in `media` once fetched. */
  numMedia: number;
  status: MessageStatus;
  dateCreated: Date;
  /** Problems the simulator hit, e.g. the webhook failing or media that couldn't be fetched. */
  errors: string[];
  statusCallback?: string;
};

/** In-memory state. Restarting the simulator clears it, like a fresh phone. */
export class Store {
  readonly messages: Message[] = [];

  add(message: Message): Message {
    this.messages.push(message);
    return message;
  }

  find(sid: string): Message | undefined {
    return this.messages.find((m) => m.sid === sid);
  }

  findMedia(messageSid: string, mediaSid: string): Media | undefined {
    return this.find(messageSid)?.media.find((m) => m.sid === mediaSid);
  }

  clear(): void {
    this.messages.length = 0;
  }
}
