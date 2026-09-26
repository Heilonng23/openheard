const DEFAULT_FROM = { email: "hello@openheard.com", name: "openheard" };

// Self-hosters send from their own Email Sending domain via EMAIL_FROM / EMAIL_FROM_NAME.
function sender(vars: { EMAIL_FROM?: string; EMAIL_FROM_NAME?: string }) {
  return vars.EMAIL_FROM
    ? { email: vars.EMAIL_FROM, name: vars.EMAIL_FROM_NAME || DEFAULT_FROM.name }
    : DEFAULT_FROM;
}
const TEXT_STYLE = "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;";

// `brand` is the workspace name, already HTML-escaped; it heads the email.
export function emailLayout(content: string, footer = "", brand?: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin: 0; padding: 0; background: #f7f7f7;">
  <div style="max-width: 520px; margin: 0 auto; padding: 48px 20px;">
    <div style="background: #ffffff; border-radius: 12px; padding: 40px 36px; border: 1px solid #eee;">
      <div style="margin-bottom: 28px;">
        <span style="${TEXT_STYLE} font-size: 16px; font-weight: 700; color: #111; letter-spacing: -0.3px;">${brand ?? "openheard"}</span>
      </div>
      ${content}
    </div>
    <p style="${TEXT_STYLE} font-size: 11px; color: #aaa; text-align: center; margin-top: 24px; line-height: 1.6;">
      ${brand ? `${brand} &middot; feedback board` : "openheard &middot; open source feedback board"}
    </p>${footer}
  </div>
</body>
</html>`;
}

export function emailButton(href: string, label: string) {
  return `<div style="margin: 28px 0;">
    <a href="${href}" style="display: inline-block; padding: 12px 28px; background: #111; color: #ffffff; text-decoration: none; border-radius: 8px; ${TEXT_STYLE} font-size: 14px; font-weight: 600;">${label}</a>
  </div>`;
}

export type SendResult = { ok: boolean; code?: string };

// Never throws: a failed send is logged and reported, the caller carries on.
export async function sendEmail(to: string, subject: string, html: string, text: string, opts?: { headers?: Record<string, string> }): Promise<SendResult> {
  try {
    const { env } = await import("@openheard/env/server");
    if (!(env as any).EMAIL) {
      console.log(`[email] No EMAIL binding — logging instead\n  To: ${to}\n  Subject: ${subject}\n  ${text.replace(/\n/g, "\n  ")}`);
      return { ok: true };
    }
    const result = await (env as any).EMAIL.send({ to, from: sender(env as any), subject, html, text, ...(opts?.headers ? { headers: opts.headers } : {}) });
    console.log(`[email] sent: ${subject}`, result?.messageId ?? "");
    return { ok: true };
  } catch (err: any) {
    console.error("[email] send failed:", err.code ?? "", err.message ?? err);
    return { ok: false, code: typeof err?.code === "string" ? err.code : undefined };
  }
}

export async function sendMagicLinkEmail(to: string, url: string) {
  await sendEmail(
    to,
    "Your sign-in link",
    emailLayout(`
      <h1 style="${TEXT_STYLE} font-size: 20px; font-weight: 700; color: #111; margin: 0 0 12px;">Sign in to openheard</h1>
      <p style="${TEXT_STYLE} font-size: 15px; color: #555; line-height: 1.7; margin: 0 0 4px;">Click the button below to sign in. This link expires in 5 minutes.</p>
      ${emailButton(url, "Sign In")}
      <p style="${TEXT_STYLE} font-size: 13px; color: #999; line-height: 1.6; margin: 0;">If you didn't request this, you can safely ignore this email.</p>
    `),
    `Sign in to openheard\n\nClick the link below to sign in. This link expires in 5 minutes.\n\n${url}\n\nIf you didn't request this, ignore this email.`,
  );
}

export async function sendPasswordResetEmail(to: string, url: string) {
  await sendEmail(
    to,
    "Reset your password",
    emailLayout(`
      <h1 style="${TEXT_STYLE} font-size: 20px; font-weight: 700; color: #111; margin: 0 0 12px;">Reset your password</h1>
      <p style="${TEXT_STYLE} font-size: 15px; color: #555; line-height: 1.7; margin: 0 0 4px;">Click the button below to set a new password. This link expires in 1 hour.</p>
      ${emailButton(url, "Reset Password")}
      <p style="${TEXT_STYLE} font-size: 13px; color: #999; line-height: 1.6; margin: 0;">If you didn't request this, you can safely ignore this email.</p>
    `),
    `Reset your password\n\nClick the link below to set a new password. This link expires in 1 hour.\n\n${url}\n\nIf you didn't request this, ignore this email.`,
  );
}

export async function sendInviteEmail(to: string, inviterName: string, workspaceName: string, joinUrl: string) {
  await sendEmail(
    to,
    `${inviterName} invited you to ${workspaceName}`,
    emailLayout(`
      <h1 style="${TEXT_STYLE} font-size: 20px; font-weight: 700; color: #111; margin: 0 0 12px;">You've been invited</h1>
      <p style="${TEXT_STYLE} font-size: 15px; color: #555; line-height: 1.7; margin: 0 0 4px;">
        ${inviterName} invited you to join <strong>${workspaceName}</strong>.
      </p>
      ${emailButton(joinUrl, "Accept Invite")}
      <p style="${TEXT_STYLE} font-size: 13px; color: #999; line-height: 1.6; margin: 0;">This invite link expires in 7 days.</p>
    `, "", workspaceName),
    `${inviterName} invited you to ${workspaceName}\n\nJoin here: ${joinUrl}\n\nThis invite link expires in 7 days.`,
  );
}
