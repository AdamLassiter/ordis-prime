import assert from "node:assert/strict";
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
