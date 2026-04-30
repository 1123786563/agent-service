import { WhitelistStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { getCurrentUser, requireCreator } from "@/server/auth/session";
import { createAgentPackageFromZip } from "@/server/agents/package-service";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.whitelistStatus !== WhitelistStatus.ACTIVE) {
    return Response.json({
      errors: ["Creator whitelist is required"]
    }, {
      status: 403
    });
  }

  const user = await requireCreator();
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({
      errors: ["Missing ZIP file"]
    }, {
      status: 400
    });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await createAgentPackageFromZip({
    ownerId: user.id,
    fileName: file.name,
    buffer
  });

  if (!result.ok) {
    return Response.json({
      errors: result.errors,
      risks: result.risks
    }, {
      status: 400
    });
  }

  redirect(`/agents/${result.package.slug}`);
}
