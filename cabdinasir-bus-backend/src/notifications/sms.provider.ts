import { Logger } from '@nestjs/common';

export interface SmsProvider {
  send(to: string, body: string): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/** Development: SMS-ka waa la log-gareeyaa oo keliya. */
export class LogSmsProvider implements SmsProvider {
  private readonly logger = new Logger('SMS');
  readonly sent: { to: string; body: string }[] = [];

  async send(to: string, body: string) {
    this.sent.push({ to, body });
    if (process.env.NODE_ENV !== 'test') this.logger.log(`→ ${to}: ${body}`);
  }
}

/**
 * Provider guud oo HTTP ah (Telesom / Somtel / aggregator): POST JSON { to, from, message }.
 * Haddii provider-ku qaab kale rabo, halkan ayaa laga beddelaa — meel kale ma taabanayso.
 */
export class HttpSmsProvider implements SmsProvider {
  constructor(private readonly url: string, private readonly token: string, private readonly sender: string) {}

  async send(to: string, body: string) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.token && { Authorization: `Bearer ${this.token}` }) },
      body: JSON.stringify({ to, from: this.sender, message: body }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`SMS provider HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}
