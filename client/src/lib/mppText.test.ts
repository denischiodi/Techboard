import { describe, expect, it } from "vitest";
import { encodeUnicode } from "mppwriter";
import { readMppText } from "@shared/mppText";

describe("campos de texto do MPP", () => {
  it("preserva textos e percentuais Unicode válidos", () => {
    for (const text of ["36%", "2.5", "Aprovação — ação", "Entrega 📅"])
      expect(readMppText(encodeUnicode(text))).toBe(text);
  });
  it("não interpreta referências binárias de listas como texto", () => {
    const reference = Uint8Array.from([
      1, 4, 255, 255, 255, 255, 170, 86, 174, 223, 102, 242, 17, 231, 156, 24,
      0, 224, 76, 47, 213, 167, 0, 0, 0, 0,
    ]);
    expect(readMppText(reference)).toBeNull();
    expect(JSON.stringify({ field: readMppText(reference) })).not.toMatch(
      /\\udfae/i
    );
  });
  it("rejeita surrogates isolados e campos vazios", () => {
    expect(readMppText(Uint8Array.from([0, 220, 0, 0]))).toBeNull();
    expect(readMppText(Uint8Array.from([0, 216, 0, 0]))).toBeNull();
    expect(readMppText(new Uint8Array())).toBeNull();
    expect(readMppText(encodeUnicode(" "))).toBeNull();
  });
});
