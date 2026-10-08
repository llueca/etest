import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Stack, startStack } from "../harness/stack.ts";

// Design D7: every API response, errors included, carries the server clock.
describe("API error responses", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack?.stop());

  const createPlayer = async (): Promise<string> =>
    (await (await fetch(`${stack.baseUrl}/api/players`, { method: "POST" })).json()).playerId;

  const predict = (token: string, direction: string) =>
    fetch(`${stack.baseUrl}/api/me/predictions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ direction }),
    });

  const expectError = async (response: Response, status: number, code: string) => {
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.error.code).toBe(code);
    expect(body.serverTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  };

  it("includes serverTime on 401", async () => {
    await expectError(await fetch(`${stack.baseUrl}/api/me`), 401, "unauthorized");
  });

  it("includes serverTime on 400 for an invalid name", async () => {
    const token = await createPlayer();
    const response = await fetch(`${stack.baseUrl}/api/me`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ displayName: "   " }),
    });
    await expectError(response, 400, "validation_failed");
  });

  it("includes serverTime on 400 for an invalid direction", async () => {
    await expectError(await predict(await createPlayer(), "sideways"), 400, "invalid_request");
  });

  it("includes serverTime on 409 and 503", async () => {
    const token = await createPlayer();
    stack.market.update({ restFailure: "error" });
    await expectError(await predict(token, "up"), 503, "price_unavailable");
    stack.market.update({ restFailure: "none" });

    expect((await predict(token, "up")).status).toBe(201);
    await expectError(await predict(token, "down"), 409, "prediction_already_active");
  });

  it("answers an unknown API path with 404 and serverTime", async () => {
    await expectError(await fetch(`${stack.baseUrl}/api/nothing-here`), 404, "not_found");
  });
});
