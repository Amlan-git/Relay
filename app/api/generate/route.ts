import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "not_implemented", message: "Pipeline lands in steps 2-6 of the build plan." },
    { status: 501 },
  );
}
