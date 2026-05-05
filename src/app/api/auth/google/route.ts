import { initiateGoogleOAuth } from "@/server/auth/oauth-google";

export async function GET() {
  await initiateGoogleOAuth();
}
