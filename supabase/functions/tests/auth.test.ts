import { assertEquals } from "@std/assert";
import { claimsOf, getCaller, isAdmin, isStaff, type Caller } from "../_shared/auth.ts";

function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${header}.${body}.signature`;
}

Deno.test("auth: claimsOf extracts JWT claims or returns empty object", () => {
  const token = fakeJwt({ sub: "user-123", email: "test@example.com", aal: "aal2" });
  const claims = claimsOf(token);
  assertEquals(claims.sub, "user-123");
  assertEquals(claims.email, "test@example.com");
  assertEquals(claims.aal, "aal2");

  assertEquals(claimsOf("not-a-jwt"), {});
  assertEquals(claimsOf(""), {});
});

Deno.test("auth: getCaller returns null when Authorization header is missing or invalid", async () => {
  const reqNoAuth = new Request("http://localhost/");
  assertEquals(await getCaller(reqNoAuth), null);

  const mockClientFail = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: new Error("invalid token") }),
    },
  };
  const reqWithToken = new Request("http://localhost/", {
    headers: { Authorization: "Bearer bad-token" },
  });
  assertEquals(await getCaller(reqWithToken, mockClientFail), null);
});

Deno.test("auth: getCaller resolves customer without MFA requirement", async () => {
  const token = fakeJwt({ sub: "cust-1", aal: "aal1" });
  const mockClient = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "cust-1", email: "cust@example.com", created_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
    },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { name: "Customer Bob", role: "customer" } }),
        }),
      }),
    }),
  };

  const req = new Request("http://localhost/", { headers: { Authorization: `Bearer ${token}` } });
  const caller = await getCaller(req, mockClient);
  assertEquals(caller?.id, "cust-1");
  assertEquals(caller?.role, "customer");
  assertEquals(caller?.mfaPending, false);
  assertEquals(isStaff(caller), false);
  assertEquals(isAdmin(caller), false);
});

Deno.test("auth: getCaller gates staff with enrolled MFA unless AAL2 token is present", async () => {
  // Scenario 1: Staff with AAL1 and enrolled TOTP factor -> mfaPending must be true
  const aal1Token = fakeJwt({ sub: "admin-1", aal: "aal1" });
  const mockClientWithMfa = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "admin-1", email: "admin@example.com", created_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
      admin: {
        mfa: {
          listFactors: async () => ({
            data: { factors: [{ id: "f1", status: "verified" }] },
            error: null,
          }),
        },
      },
    },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { name: "Alice Admin", role: "admin" } }),
        }),
      }),
    }),
  };

  const reqAal1 = new Request("http://localhost/", { headers: { Authorization: `Bearer ${aal1Token}` } });
  const callerAal1 = await getCaller(reqAal1, mockClientWithMfa);
  assertEquals(callerAal1?.mfaPending, true);
  // With MFA pending, neither staff nor admin privileges apply
  assertEquals(isStaff(callerAal1), false);
  assertEquals(isAdmin(callerAal1), false);

  // Scenario 2: Staff with AAL2 token -> mfaPending is false and staff/admin privileges granted
  const aal2Token = fakeJwt({ sub: "admin-1", aal: "aal2" });
  const reqAal2 = new Request("http://localhost/", { headers: { Authorization: `Bearer ${aal2Token}` } });
  const callerAal2 = await getCaller(reqAal2, mockClientWithMfa);
  assertEquals(callerAal2?.mfaPending, false);
  assertEquals(isStaff(callerAal2), true);
  assertEquals(isAdmin(callerAal2), true);
});

Deno.test("auth: isStaff and isAdmin predicate rules", () => {
  assertEquals(isStaff(null), false);
  assertEquals(isAdmin(null), false);

  const editor: Caller = {
    id: "e1",
    email: "editor@example.com",
    createdAt: "",
    name: "Editor",
    role: "editor",
    mfaPending: false,
  };
  assertEquals(isStaff(editor), true);
  assertEquals(isAdmin(editor), false);

  const adminCaller: Caller = {
    id: "a1",
    email: "admin@example.com",
    createdAt: "",
    name: "Admin",
    role: "admin",
    mfaPending: false,
  };
  assertEquals(isStaff(adminCaller), true);
  assertEquals(isAdmin(adminCaller), true);

  const mfaBlockedAdmin: Caller = {
    ...adminCaller,
    mfaPending: true,
  };
  assertEquals(isStaff(mfaBlockedAdmin), false);
  assertEquals(isAdmin(mfaBlockedAdmin), false);
});
