import { Resend } from 'resend';

const ALERT_EMAIL = 'invest@gb.capital';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || !connectionSettings.settings.api_key) {
    throw new Error('Resend not connected');
  }
  return {
    apiKey: connectionSettings.settings.api_key,
    fromEmail: connectionSettings.settings.from_email
  };
}

async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

const lastAlertTimes = new Map<string, number>();
const COOLDOWN_MS = 30 * 60 * 1000;

export async function sendAlert(subject: string, details: string, category: string = 'general'): Promise<void> {
  const now = Date.now();
  const lastSent = lastAlertTimes.get(category) || 0;
  if (now - lastSent < COOLDOWN_MS) {
    console.log(`[alert] Skipping "${category}" alert (cooldown: ${Math.round((COOLDOWN_MS - (now - lastSent)) / 60000)}min remaining)`);
    return;
  }

  try {
    const { client, fromEmail } = await getResendClient();

    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

    await client.emails.send({
      from: fromEmail,
      to: ALERT_EMAIL,
      subject: `[TradeDeck Alert] ${subject}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0a0a0a; color: #e0e0e0; border-radius: 12px;">
          <div style="border-bottom: 1px solid #333; padding-bottom: 12px; margin-bottom: 16px;">
            <h2 style="margin: 0; color: #ff453a; font-size: 18px;">TradeDeck System Alert</h2>
            <p style="margin: 4px 0 0; color: #888; font-size: 13px;">${timestamp} ET</p>
          </div>
          <div style="background: #1a1a1a; border-radius: 8px; padding: 16px; border-left: 3px solid #ff453a;">
            <h3 style="margin: 0 0 8px; color: #ffffff; font-size: 15px;">${subject}</h3>
            <pre style="margin: 0; white-space: pre-wrap; word-break: break-word; color: #ccc; font-size: 13px; font-family: 'JetBrains Mono', monospace;">${details}</pre>
          </div>
          <p style="margin: 16px 0 0; color: #666; font-size: 11px;">Category: ${category} | Cooldown: 30 min per category</p>
        </div>
      `,
    });

    lastAlertTimes.set(category, now);
    console.log(`[alert] Email sent: "${subject}" to ${ALERT_EMAIL}`);
  } catch (err: any) {
    console.error(`[alert] Failed to send email: ${err.message}`);
  }
}
