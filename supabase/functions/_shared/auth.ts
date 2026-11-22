// Central authentication / authorisation for all Edge Functions.
//
// Identity comes ONLY from the verified bearer token (auth.getUser) and the
// role ONLY from public.profiles. Nothing the client sends is trusted.
//
// MFA: a staff member who has a verified TOTP factor must present an AAL2
// token (password + code). With only a password-level (AAL1) token they are
// treated as NOT staff. Set STAFF_MFA_REQUIRED=1 to additionally require every
// staff account to have enrolled TOTP (recommended once staff have enrolled).
import { admin } from "./supabase.ts";

export type Caller = {
  id: string;
  email: string;
  createdAt: string;
  name: string;
  role: string;
  /** staff whose token has not completed the MFA step */
  mfaPending: boolean;
};

const STAFF = ["admin", "editor"];
const STAFF_MFA_REQUIRED = Deno.env.get("STAFF_MFA_REQUIRED") === "1";

export function claimsOf(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
  } catch {
    return {};
  }
}

// deno-lint-ignore no-explicit-any
export async function getCaller(req: Request, client: any = admin): Promise<Caller | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: userData, error } = await client.auth.getUser(token);
  if (error || !userData?.user) return null;
  const user = userData.user;
  const { data: profile } = await client.from("profiles").select("name, role").eq("id", user.id).maybeSingle();
  if (!profile) return null;

  let mfaPending = false;
  if (STAFF.includes(profile.role) && claimsOf(token).aal !== "aal2") {
    const { data: factorData } = await client.auth.admin.mfa.listFactors({ userId: user.id });
    const hasVerified = (factorData?.factors || []).some((f: { status: string }) => f.status === "verified");
    mfaPending = hasVerified || STAFF_MFA_REQUIRED;
  }

  return {
    id: user.id,
    email: user.email || "",
    createdAt: user.created_at,
    name: profile.name,
    role: profile.role,
    mfaPending,
  };
}

export const isStaff = (c: Caller | null): boolean => !!c && STAFF.includes(c.role) && !c.mfaPending;
export const isAdmin = (c: Caller | null): boolean => !!c && c.role === "admin" && !c.mfaPending;
