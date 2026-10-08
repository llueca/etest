import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Stack, startStack } from "../harness/stack.ts";

// Implementation-level checks that complement the protected contract suite.
describe("POST /api/me/predictions with an active prediction", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack?.stop());

  const post = (token: string, direction: string) =>
    fetch(`${stack.baseUrl}/api/me/predictions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ direction }),
    });

  it("answers 409, not 503, and does not call the provider, even when the provider is down", async () => {
    const { playerId } = await (
      await fetch(`${stack.baseUrl}/api/players`, { method: "POST" })
    ).json();
    expect((await post(playerId, "up")).status).toBe(201);

    stack.market.update({ restFailure: "error" });
    const before = stack.market.restRequests;
    const response = await post(playerId, "down");

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("prediction_already_active");
    expect(stack.market.restRequests).toBe(before);
    stack.market.update({ restFailure: "none" });
  });
});
