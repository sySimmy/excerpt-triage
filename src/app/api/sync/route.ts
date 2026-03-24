import { NextResponse } from "next/server";
import { fullScan } from "@/lib/scanner";
import { VAULT_PATH } from "@/lib/env";

export async function POST() {
  const result = fullScan(VAULT_PATH);
  return NextResponse.json(result);
}
