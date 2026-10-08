import { expect } from "vitest";
import type { Stack } from "../harness/stack.ts";

export type JsonObject = Record<string, unknown>;

export interface ApiResponse {
  status: number;
  body: JsonObject;
}

export interface CreatedPlayer {
  id: string;
  body: JsonObject;
  player: JsonObject;
}

export async function api(
  stack: Stack,
  path: string,
  options: RequestInit & { token?: string; json?: unknown } = {},
): Promise<ApiResponse> {
  const { token, json, ...init } = options;
  const headers = new Headers(init.headers);
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  if (json !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(json);
  }
  const response = await fetch(`${stack.baseUrl}${path}`, { ...init, headers });
  const body = (await response.json().catch(() => ({}))) as JsonObject;
  if (path !== "/api/players") expectNoPlayerId(body);
  return { status: response.status, body };
}

export function expectServerTime(body: JsonObject): string {
  const serverTime = body.serverTime;
  expect(typeof serverTime).toBe("string");
  expect(serverTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  expect(Number.isFinite(Date.parse(serverTime as string))).toBe(true);
  return serverTime as string;
}

export function expectSuccess(response: ApiResponse, status: number): JsonObject {
  expect(response.status).toBe(status);
  expectServerTime(response.body);
  return response.body;
}

export function asObject(value: unknown): JsonObject {
  expect(value).not.toBeNull();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  return value as JsonObject;
}

export function expectNoPlayerId(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) expectNoPlayerId(item);
    return;
  }
  if (value !== null && typeof value === "object") {
    const object = value as JsonObject;
    expect(Object.hasOwn(object, "playerId")).toBe(false);
    for (const nested of Object.values(object)) expectNoPlayerId(nested);
  }
}

export async function createPlayer(stack: Stack): Promise<CreatedPlayer> {
  const response = await api(stack, "/api/players", { method: "POST" });
  const body = expectSuccess(response, 201);
  expect(typeof body.playerId).toBe("string");
  const player = asObject(body.player);
  expectNoPlayerId(player);
  return { id: body.playerId as string, body, player };
}

export async function getMe(stack: Stack, id: string): Promise<JsonObject> {
  const response = await api(stack, "/api/me", { token: id });
  const body = expectSuccess(response, 200);
  expectNoPlayerId(body);
  return body;
}

export async function createPrediction(
  stack: Stack,
  id: string,
  direction: "up" | "down",
): Promise<JsonObject> {
  const response = await api(stack, "/api/me/predictions", {
    method: "POST",
    token: id,
    json: { direction },
  });
  const body = expectSuccess(response, 201);
  expectNoPlayerId(body);
  return asObject(body.prediction);
}

/** API timestamp fields may be represented as epoch milliseconds or ISO-8601. */
export function epochMs(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value);
  return Number.NaN;
}

export function expectPlayerStats(
  player: JsonObject,
  expected: Partial<{
    score: number;
    wins: number;
    losses: number;
    gamesPlayed: number;
    accuracy: number | null;
    adjustedAccuracy: number;
    currentStreak: number;
    bestStreak: number;
  }>,
): void {
  for (const [key, value] of Object.entries(expected)) expect(player[key]).toBe(value);
}
