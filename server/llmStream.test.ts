import { describe, expect, it } from "vitest";
import { parseLLMStreamBlock } from "./_core/llm";

describe("LLM SSE parser", () => {
  it("extracts string and structured text deltas", () => {
    const parsed = parseLLMStreamBlock([
      'data: {"model":"model-a","choices":[{"delta":{"content":"Olá "}}]}',
      'data: {"choices":[{"delta":{"content":[{"type":"text","text":"mundo"}]}}]}',
      "data: [DONE]",
    ].join("\n"));
    expect(parsed.model).toBe("model-a");
    expect(parsed.deltas.join("")).toBe("Olá mundo");
  });
});
