import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ORDIS_VOICE_LINES,
  randomOrdisVoiceLine,
} from "../lib/ordis-voice-lines.ts";

test("Ordis messages can select the full configured range", () => {
  assert.equal(
    randomOrdisVoiceLine(() => 0),
    ORDIS_VOICE_LINES[0],
  );
  assert.equal(
    randomOrdisVoiceLine(() => 0.999_999),
    ORDIS_VOICE_LINES.at(-1),
  );
});

test("the original Ordis message set remains intact", () => {
  assert.equal(ORDIS_VOICE_LINES.length, 36);
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(ORDIS_VOICE_LINES))
      .digest("hex"),
    "2048705b0b4bf6fe7220f4208a1808414c73d92a3a9f4101e8cb528cf4e4bc04",
  );
});
