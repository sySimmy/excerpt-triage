import { NextResponse } from "next/server";
import { fullScan } from "@/lib/scanner";

const VAULT_PATH = process.env.VAULT_PATH!;

export async function POST() {
  const result = fullScan(VAULT_PATH);
  return NextResponse.json(result);
}
