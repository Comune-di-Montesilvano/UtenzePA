import { ImapFlow } from 'imapflow';

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

// Senza host, utente o password l'import è "non configurato": nessun errore.
export function imapConfigFromEnv(env: NodeJS.ProcessEnv): ImapConfig | null {
  const host = env.PEC_IMAP_HOST?.trim();
  const user = env.PEC_IMAP_USER?.trim();
  const password = env.PEC_IMAP_PASSWORD;
  if (!host || !user || !password) return null;
  return {
    host,
    port: Number(env.PEC_IMAP_PORT || 993),
    secure: (env.PEC_IMAP_TLS ?? 'true').trim().toLowerCase() !== 'false',
    user,
    password,
  };
}

// Spegnimento forzato dall'ambiente, per import/export del DB senza sorprese.
export const importForcedOff = (env: NodeJS.ProcessEnv): boolean =>
  (env.INVOICE_IMPORT_DISABLED ?? '').trim().toLowerCase() === 'true';

// Casella PEC in sola lettura: mai flag, spostamenti o cancellazioni.
export interface PecMailbox {
  open(): Promise<{ uidValidity: number }>;
  fetchSince(lastUid: number): AsyncIterable<{ uid: number; raw: Buffer }>;
  /** Messaggio per UID se la casella è la stessa, altrimenti per Message-ID; null se sparito. */
  fetchRaw(uidValidity: number, uid: number, messageId: string): Promise<Buffer | null>;
  close(): Promise<void>;
}

export const PEC_MAILBOX_FACTORY = 'PEC_MAILBOX_FACTORY';
export type PecMailboxFactory = () => PecMailbox;

export class ImapPecMailbox implements PecMailbox {
  private readonly client: ImapFlow;
  private uidValidity = 0;

  constructor(config: ImapConfig) {
    this.client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      logger: false,
    });
  }

  async open(): Promise<{ uidValidity: number }> {
    await this.client.connect();
    const mailbox = await this.client.mailboxOpen('INBOX', { readOnly: true });
    this.uidValidity = Number(mailbox.uidValidity);
    return { uidValidity: this.uidValidity };
  }

  async *fetchSince(lastUid: number): AsyncIterable<{ uid: number; raw: Buffer }> {
    // "n:*" restituisce comunque l'ultimo messaggio anche se ha UID < n.
    for await (const msg of this.client.fetch(
      `${lastUid + 1}:*`,
      { uid: true, source: true },
      { uid: true },
    )) {
      if (msg.uid > lastUid && msg.source) yield { uid: msg.uid, raw: msg.source };
    }
  }

  async fetchRaw(uidValidity: number, uid: number, messageId: string): Promise<Buffer | null> {
    let target: number | undefined = uidValidity === this.uidValidity ? uid : undefined;
    if (target === undefined) {
      const found = await this.client.search(
        { header: { 'message-id': messageId } },
        { uid: true },
      );
      target = Array.isArray(found) ? found[0] : undefined;
    }
    if (target === undefined) return null;
    const msg = await this.client.fetchOne(String(target), { source: true }, { uid: true });
    return msg && msg.source ? msg.source : null;
  }

  async close(): Promise<void> {
    try {
      await this.client.logout();
    } catch {
      this.client.close();
    }
  }
}
