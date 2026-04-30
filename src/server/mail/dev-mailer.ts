import fs from "node:fs/promises";
import path from "node:path";

export async function sendDevLoginEmail(email: string, loginUrl: string) {
  const outbox = process.env.DEV_EMAIL_OUTBOX ?? ".data/dev-email-outbox.jsonl";
  await fs.mkdir(path.dirname(outbox), { recursive: true });
  await fs.appendFile(
    outbox,
    JSON.stringify({ type: "login", email, loginUrl, sentAt: new Date().toISOString() }) + "\n",
    "utf8"
  );
}
