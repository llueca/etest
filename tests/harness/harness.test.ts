import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Stack, startStack } from "./stack.ts";
import { StubMarketControl } from "./stub-market.ts";

describe("test harness", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack?.stop());

  it("boots the stack and serves the API and config.json", async () => {
    const config = await (await fetch(`${stack.baseUrl}/config.json`)).json();
    expect(config.nameMaxLength).toBe(24);
    expect((await fetch(`${stack.baseUrl}/api/me`)).status).toBeGreaterThanOrEqual(400);
  });

  it("serves controllable Coinbase-shaped REST prices", async () => {
    const control = new StubMarketControl(stack.market.controlUrl);
    await control.setPrice("67503.42");
    const ticker = await (await fetch(`${stack.market.restUrl}/products/BTC-USD/ticker`)).json();
    expect(ticker.price).toBe("67503.42");

    await control.update({ restFailure: "error" });
    expect((await fetch(`${stack.market.restUrl}/products/BTC-USD/ticker`)).status).toBe(503);
    await control.reset();
  });

  it("streams ticker messages, goes silent and drops connections on command", async () => {
    const socket = new WebSocket(stack.market.wsUrl);
    const messages: { type: string; price?: string }[] = [];
    socket.onmessage = (event) => messages.push(JSON.parse(String(event.data)));
    await new Promise((resolve) => {
      socket.onopen = resolve;
    });
    socket.send(
      JSON.stringify({ type: "subscribe", product_ids: ["BTC-USD"], channels: ["ticker"] }),
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(messages.some((m) => m.type === "ticker" && m.price === "67500.00")).toBe(true);

    stack.market.update({ silent: true });
    const before = messages.length;
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(messages.length).toBe(before);

    const closed = new Promise((resolve) => {
      socket.onclose = resolve;
    });
    stack.market.update({ drop: true });
    await closed;
  });

  it("reset() restores a healthy market and empties the players table", async () => {
    const control = new StubMarketControl(stack.market.controlUrl);
    const { playerId } = await (
      await fetch(`${stack.baseUrl}/api/players`, { method: "POST" })
    ).json();
    const me = () =>
      fetch(`${stack.baseUrl}/api/me`, { headers: { authorization: `Bearer ${playerId}` } });
    expect((await me()).status).toBe(200);

    await control.update({ restFailure: "error", price: "1.00" });
    await control.reset();

    expect((await me()).status).toBe(401);
    expect(stack.market.state).toMatchObject({ restFailure: "none", price: "67500.00" });
  });
});
