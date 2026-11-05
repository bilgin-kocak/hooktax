import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, curlFor, demoSimsQuery, hookListQuery, writerAddress } from "../src/arkiv";

// These assert the exact Arkiv query-language text the page sends (shown in its query box).
describe("Arkiv queries built by the page", () => {
  it("has a writer configured for tests", () => {
    expect(writerAddress()).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("list query: schema tag, writer scope, filters, sort", () => {
    const text = hookListQuery({ ...EMPTY_FILTER, swapDelta: true, upgradeable: true, permissions: ["beforeSwap"] }, "poolCount", 0).toString();
    console.log(text);
    expect(text).toContain("arkiv.schema = str('hooktax.v1.hook')");
    expect(text).toMatch(/\$owner = addr\(0x[0-9a-fA-F]{40}\)/);
    expect(text).toContain("canAffectSwapAmounts = true");
    expect(text).toContain("isUpgradeable = true");
    expect(text).toContain("beforeSwap = true");
    expect(text).toMatch(/ORDER BY poolCount:i32 DESC$/);
  });

  it("measured filter uses EXISTS and demo query filters isDemo", () => {
    expect(hookListQuery({ ...EMPTY_FILTER, measured: true }, "lastMeasuredTakeBps", 0).toString()).toContain("EXISTS(lastMeasuredTakeBps)");
    expect(demoSimsQuery().toString()).toContain("isDemo = true");
  });

  it("curl uses arkiv_query and escapes single quotes", () => {
    const c = curlFor("arkiv.schema = str('hooktax.v1.hook')");
    expect(c).toContain('"method":"arkiv_query"');
    expect(c).toContain("str('\\''hooktax.v1.hook'\\'')");
  });
});
