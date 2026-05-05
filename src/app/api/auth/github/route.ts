import { initiateGitHubOAuth } from "@/server/auth/oauth-github";

export async function GET() {
  await initiateGitHubOAuth();
}
