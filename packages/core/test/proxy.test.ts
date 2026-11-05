import { describe, expect, it } from "vitest";
import { EIP1967_IMPLEMENTATION_SLOT } from "../src/constants";
import { classifyProxy, parseEip1167, slotToAddress, type ProxyEvidence } from "../src/proxy";

const IMPL = "0x1111111111111111111111111111111111111111";
const ADMIN = "0x2222222222222222222222222222222222222222";
const BEACON = "0x3333333333333333333333333333333333333333";
const word = (addr: string) => "0x" + addr.slice(2).padStart(64, "0");
const ZERO_WORD = "0x" + "0".repeat(64);

const base: ProxyEvidence = {
  code: "0x6080604052",
  implementationSlot: ZERO_WORD,
  adminSlot: ZERO_WORD,
  beaconSlot: ZERO_WORD,
};

describe("slotToAddress", () => {
  it("extracts a left-padded address", () => {
    expect(slotToAddress(word(IMPL))).toBe(IMPL);
  });
  it("returns null for zero, empty, or non-address words", () => {
    expect(slotToAddress(ZERO_WORD)).toBeNull();
    expect(slotToAddress("0x")).toBeNull();
    expect(slotToAddress(null)).toBeNull();
    expect(slotToAddress("0x" + "ff".repeat(32))).toBeNull(); // upper bytes set: not an address
  });
});

describe("parseEip1167", () => {
  it("parses the standard minimal proxy runtime code", () => {
    const code = "0x363d3d373d3d3d363d73" + IMPL.slice(2) + "5af43d82803e903d91602b57fd5bf3";
    expect(parseEip1167(code)).toBe(IMPL);
  });
  it("rejects other code", () => {
    expect(parseEip1167("0x6080604052")).toBeNull();
    expect(parseEip1167("0x")).toBeNull();
  });
});

describe("classifyProxy", () => {
  it("no slots and ordinary code -> none-detected (not 'immutable')", () => {
    const p = classifyProxy(base);
    expect(p.type).toBe("none-detected");
    expect(p.isUpgradeable).toBe(false);
  });

  it("implementation slot + proxiableUUID match -> UUPS", () => {
    const p = classifyProxy({
      ...base,
      implementationSlot: word(IMPL),
      implementationProxiableUUID: EIP1967_IMPLEMENTATION_SLOT,
    });
    expect(p).toMatchObject({ type: "eip1967-uups", isUpgradeable: true, implementation: IMPL });
  });

  it("implementation + admin slot -> transparent", () => {
    const p = classifyProxy({ ...base, implementationSlot: word(IMPL), adminSlot: word(ADMIN) });
    expect(p).toMatchObject({
      type: "eip1967-transparent",
      isUpgradeable: true,
      implementation: IMPL,
      admin: ADMIN,
    });
  });

  it("implementation slot only, no UUPS evidence -> plain eip1967 (still upgradeable)", () => {
    const p = classifyProxy({
      ...base,
      implementationSlot: word(IMPL),
      implementationProxiableUUID: null,
    });
    expect(p).toMatchObject({ type: "eip1967", isUpgradeable: true });
  });

  it("beacon slot -> beacon proxy, implementation from the beacon", () => {
    const p = classifyProxy({ ...base, beaconSlot: word(BEACON), beaconImplementation: word(IMPL) });
    expect(p).toMatchObject({
      type: "eip1967-beacon",
      isUpgradeable: true,
      beacon: BEACON,
      implementation: IMPL,
    });
  });

  it("facets -> diamond", () => {
    const p = classifyProxy({ ...base, diamondFacetCount: 3 });
    expect(p).toMatchObject({ type: "eip2535-diamond", isUpgradeable: true });
  });

  it("EIP-1167 clone -> not upgradeable", () => {
    const code = "0x363d3d373d3d3d363d73" + IMPL.slice(2) + "5af43d82803e903d91602b57fd5bf3";
    const p = classifyProxy({ ...base, code });
    expect(p).toMatchObject({ type: "eip1167-clone", isUpgradeable: false, implementation: IMPL });
  });
});
