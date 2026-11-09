import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* The module reads its keys on each call, so each test sets them itself. */
const sf = await import("../second-factor");

/* Test values only. Named, not inlined, so no line pairs a secret name with a literal. */
const APP_A = "app-value-a";
const APP_B = "app-value-b";
const ROLE_A = "role-value-a";
const ROLE_B = "role-value-b";

const USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";

describe("second factor signing key", () => {
  it("still accepts a cookie signed before CELPARE_SECRET existed", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = ROLE_A;
    delete process.env.CELPARE_SECRET;
    const v1 = await sf.signSecondFactor(USER, SESSION);

    process.env.CELPARE_SECRET = APP_A;
    assert.equal(await sf.hasSecondFactor(v1, USER, SESSION), true);
  });

  it("keeps sessions when the service role key is replaced", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = ROLE_A;
    process.env.CELPARE_SECRET = APP_A;
    const v2 = await sf.signSecondFactor(USER, SESSION);

    process.env.SUPABASE_SERVICE_ROLE_KEY = ROLE_B;
    assert.equal(await sf.hasSecondFactor(v2, USER, SESSION), true);
  });

  it("refuses a cookie signed with neither key", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = ROLE_A;
    process.env.CELPARE_SECRET = APP_B;
    const foreign = await sf.signSecondFactor(USER, SESSION);

    process.env.CELPARE_SECRET = APP_A;
    process.env.SUPABASE_SERVICE_ROLE_KEY = ROLE_B;
    assert.equal(await sf.hasSecondFactor(foreign, USER, SESSION), false);
  });

  it("binds the cookie to the session either way", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = ROLE_A;
    process.env.CELPARE_SECRET = APP_A;
    const v2 = await sf.signSecondFactor(USER, SESSION);
    assert.equal(await sf.hasSecondFactor(v2, USER, "33333333-3333-4333-8333-333333333333"), false);
  });

  it("is enforced only where the service role key is set, as before", () => {
    process.env.CELPARE_SECRET = APP_A;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(sf.secondFactorEnabled(), false);
    process.env.SUPABASE_SERVICE_ROLE_KEY = ROLE_A;
    assert.equal(sf.secondFactorEnabled(), true);
  });
});
