import { parse } from "yaml";
import type { SearchProfile } from "../types.ts";

export function parsePostedWithin(value: string): number {
  const m = /^\s*(\d+)\s*([hdw])\s*$/i.exec(value ?? "");
  if (!m) return 1;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === "h") return Math.max(1, Math.ceil(n / 24));
  if (unit === "d") return Math.max(1, n);
  if (unit === "w") return Math.max(1, n * 7);
  return 1;
}

export async function loadSearchProfile(filePath: string): Promise<SearchProfile> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`Search profile not found at ${filePath}`);
  }

  let content: string;
  try {
    content = await file.text();
  } catch (error) {
    throw new Error(`Failed to read search profile at ${filePath}: ${error}`);
  }

  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch (error) {
    throw new Error(`Invalid YAML in search profile at ${filePath}: ${error}`);
  }

  const profile = parsed as SearchProfile;
  if (!profile?.searches?.length) {
    throw new Error(
      `Search profile at ${filePath} must contain a non-empty 'searches' array`,
    );
  }
  if (!profile.filters) {
    throw new Error(
      `Search profile at ${filePath} must contain a 'filters' object`,
    );
  }

  profile.filters.daysPosted = parsePostedWithin(profile.filters.postedWithin ?? "");

  return profile;
}
