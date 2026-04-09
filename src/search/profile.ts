import { parse } from "yaml";
import type { SearchProfile } from "../types.ts";

export async function loadSearchProfile(filePath: string): Promise<SearchProfile> {
  const file = Bun.file(filePath);
  const content = await file.text();
  const parsed = parse(content) as SearchProfile;
  return parsed;
}
