import { test } from "node:test";
import assert from "node:assert/strict";
import { listingKey } from "./types.js";

test("listingKey is namespaced by profile so the same ad is tracked per profile", () => {
  const base = { source: "kleinanzeigen", id: "42" } as const;
  assert.equal(listingKey({ ...base, profile: "room" }), "room:kleinanzeigen:42");
  assert.notEqual(listingKey({ ...base, profile: "room" }), listingKey({ ...base, profile: "salon" }));
});
