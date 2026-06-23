import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { closeWorkflowDb, DEFAULT_IDS, initWorkflowDb } from "../db/index";
import { upsertConnection } from "../db/repos/app-connection";
import {
  CredentialResolver,
  SOVERIGN_PREFIX,
  type SoverignConnectionSource,
  type ResolvedConnection,
} from "./adapter";

beforeEach(() => {
  initWorkflowDb(":memory:");
});

afterEach(() => {
  closeWorkflowDb();
});

// Lightweight test stubs. The live sources (`SoverignGoogleConnectionSource`,
// `SoverignTelegramConnectionSource`) have their own dedicated test files that
// exercise the per-source contracts. These tests only care that the resolver
// dispatches correctly to whatever Source it's handed.
function stubSource(id: string, externalId: string, value: ResolvedConnection | null): SoverignConnectionSource {
  return {
    id,
    canResolve: (eid) => eid === externalId,
    resolve: async () => value,
  };
}

describe("CredentialResolver", () => {
  test("dispatches soverign:* externalIds to a registered Soverign source", async () => {
    const r = new CredentialResolver();
    r.register(
      stubSource("telegram", `${SOVERIGN_PREFIX}telegram`, {
        type: "SECRET_TEXT",
        value: { secret_text: "live-bot-token" },
      }),
    );
    const got = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "telegram-bot",
      externalId: `${SOVERIGN_PREFIX}telegram`,
    });
    expect(got).toEqual({ type: "SECRET_TEXT", value: { secret_text: "live-bot-token" } });
  });

  test("returns null when a Soverign source cannot resolve (not yet authenticated)", async () => {
    const r = new CredentialResolver();
    r.register(stubSource("google", `${SOVERIGN_PREFIX}gmail`, null));
    const got = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "gmail",
      externalId: `${SOVERIGN_PREFIX}gmail`,
    });
    expect(got).toBeNull();
  });

  test("returns null when no Soverign source claims the externalId", async () => {
    const r = new CredentialResolver();
    const got = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "anything",
      externalId: `${SOVERIGN_PREFIX}unknown`,
    });
    expect(got).toBeNull();
  });

  test("falls back to the app_connection repo for non-soverign externalIds", async () => {
    upsertConnection({
      externalId: "user-supplied",
      displayName: "Notion",
      type: "OAUTH2",
      pieceName: "notion",
      pieceVersion: "1.0.0",
      value: { access_token: "abc", token_type: "Bearer" },
    });
    const r = new CredentialResolver();
    const got = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "notion",
      externalId: "user-supplied",
    });
    expect(got?.type).toBe("OAUTH2");
    expect(got?.value).toMatchObject({ access_token: "abc" });
  });

  test("does not consult the DB for soverign:* externalIds (isolation)", async () => {
    // Even if a row exists with externalId "soverign:gmail", the resolver should
    // route through the Soverign source path and not return DB values. This
    // guarantees the DB cannot shadow live-managed Soverign credentials.
    upsertConnection({
      externalId: `${SOVERIGN_PREFIX}gmail`,
      displayName: "ghost",
      type: "OAUTH2",
      pieceName: "gmail",
      pieceVersion: "1.0.0",
      value: { access_token: "stale-from-db" },
    });
    const r = new CredentialResolver();
    r.register(
      stubSource("google", `${SOVERIGN_PREFIX}gmail`, {
        type: "OAUTH2",
        value: { access_token: "live-token" },
      }),
    );
    const got = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "gmail",
      externalId: `${SOVERIGN_PREFIX}gmail`,
    });
    expect(got?.value.access_token).toBe("live-token");
  });

  test("multiple sources: first matching wins", async () => {
    const r = new CredentialResolver();
    let calls = 0;
    const dummy: SoverignConnectionSource = {
      id: "dummy",
      canResolve: (id) => id === `${SOVERIGN_PREFIX}custom`,
      resolve: async () => {
        calls++;
        return { type: "NO_AUTH", value: {} };
      },
    };
    r.register(dummy);
    r.register(
      stubSource("telegram", `${SOVERIGN_PREFIX}telegram`, {
        type: "SECRET_TEXT",
        value: { secret_text: "tg" },
      }),
    );
    const a = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "x",
      externalId: `${SOVERIGN_PREFIX}custom`,
    });
    const b = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "telegram-bot",
      externalId: `${SOVERIGN_PREFIX}telegram`,
    });
    expect(a?.type).toBe("NO_AUTH");
    expect(b?.value.secret_text).toBe("tg");
    expect(calls).toBe(1);
  });

  test("unregister removes a source by id", async () => {
    const r = new CredentialResolver();
    const source = stubSource("discord", `${SOVERIGN_PREFIX}discord`, {
      type: "SECRET_TEXT",
      value: { secret_text: "dc" },
    });
    r.register(source);
    r.unregister("discord");
    const got = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "discord",
      externalId: `${SOVERIGN_PREFIX}discord`,
    });
    expect(got).toBeNull();
  });
});
