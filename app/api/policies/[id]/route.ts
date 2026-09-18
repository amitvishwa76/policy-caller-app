import { NextRequest, NextResponse } from "next/server";
import getSupabaseAdmin, { POLICY_TABLE } from "@/lib/supabase";
import { validatePartialPolicyInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const policyId = parseInt(id, 10);
    if (Number.isNaN(policyId)) {
      return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
    }

    const body = await req.json();
    const validationError = validatePartialPolicyInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(POLICY_TABLE)
      .update(body)
      .eq("id", policyId)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `Policy number "${body.policy_no}" already exists.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ policy: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
