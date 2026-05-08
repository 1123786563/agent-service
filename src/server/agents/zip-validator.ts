import JSZip from "jszip";
import { validateSingleAgentZip, type SingleValidationResult } from "./single-validator";
import { validateTeamZip, type TeamValidationResult } from "./team-validator";

export const MAX_ZIP_BYTES = 25 * 1024 * 1024;
export const MAX_TEAM_ZIP_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_COUNT = 250;
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

export type ZipValidationResult =
  | ({ packageType: "single" } & SingleValidationResult)
  | ({ packageType: "team" } & TeamValidationResult);

export async function validateAgentZip(buffer: Buffer): Promise<ZipValidationResult> {
  if (buffer.byteLength > MAX_TEAM_ZIP_BYTES) {
    return {
      packageType: "single",
      ok: false,
      errors: [`ZIP exceeds ${MAX_TEAM_ZIP_BYTES} bytes`],
      risks: [],
      fileNames: [],
    };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return {
      packageType: "single",
      ok: false,
      errors: ["Uploaded file is not a readable ZIP archive"],
      risks: [],
      fileNames: [],
    };
  }

  const hasTeamMd = Boolean(zip.file("TEAM.md"));

  if (hasTeamMd) {
    return { packageType: "team", ...(await validateTeamZip(buffer)) };
  }

  return { packageType: "single", ...(await validateSingleAgentZip(buffer)) };
}
