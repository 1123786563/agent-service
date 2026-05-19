import { Resend } from "resend";

export async function sendNotificationEmail(
  to: string,
  title: string,
  body: string,
  actionUrl?: string
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[notification-mailer] Would send to ${to}: ${title}`);
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const html = buildNotificationHtml(title, body, actionUrl, appUrl);

  const { error } = await resend.emails.send({
    from,
    to,
    subject: title,
    html,
    text: `${title}\n\n${body}${actionUrl ? `\n\n查看详情: ${actionUrl}` : ""}`,
  });

  if (error) {
    throw new Error(`Failed to send notification email: ${error.message}`);
  }
}

function buildNotificationHtml(
  title: string,
  body: string,
  actionUrl: string | undefined,
  appUrl: string
) {
  const actionButton = actionUrl
    ? `<a href="${actionUrl}" style="display:inline-block;padding:12px 24px;background:#ff385c;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">查看详情</a>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;margin-top:24px;">
    <tr>
      <td style="padding:32px;">
        <div style="margin-bottom:24px;">
          <a href="${appUrl}" style="color:#ff385c;font-size:19px;font-weight:800;text-decoration:none;">Hermes Agents</a>
        </div>
        <h1 style="font-size:22px;font-weight:700;margin:0 0 16px;color:#222222;">${escapeHtml(title)}</h1>
        <p style="font-size:16px;line-height:1.55;color:#3f3f3f;margin:0 0 24px;">${escapeHtml(body)}</p>
        ${actionButton ? `<div style="margin:0 0 24px;">${actionButton}</div>` : ""}
        <hr style="border:none;border-top:1px solid #ebebeb;margin:24px 0;">
        <p style="font-size:12px;color:#929292;margin:0;">此邮件由 Hermes Agent Marketplace 自动发送。<a href="${appUrl}/account/notifications" style="color:#6a6a6a;">管理通知偏好</a></p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
