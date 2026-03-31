import { NextResponse } from "next/server";
import { fullScan } from "@/lib/scanner";
import { VAULT_PATH, validateVaultPath } from "@/lib/env";

export async function POST() {
  const check = validateVaultPath();
  if (!check.ok) {
    return NextResponse.json({ error: check.message }, { status: 500 });
  }
  const result = fullScan(VAULT_PATH);
  return NextResponse.json(result);
}
