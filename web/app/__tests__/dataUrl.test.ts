import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { dataUrl } from "../dataUrl";

describe("dataUrl", () => {
  let originalDocument: typeof globalThis.document;

  beforeEach(() => {
    // Reset DOM between tests
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("returns root-relative path when no basePath scripts exist", () => {
    // No script tags with basePath prefix
    const result = dataUrl("data/kent/profiles.json");
    expect(result).toBe("/data/kent/profiles.json");
  });

  it("detects basePath from script src and prepends it", () => {
    // Simulate GitHub Pages with basePath /homeo-magic
    const script = document.createElement("script");
    script.src = "/homeo-magic/_next/static/chunks/some-chunk.js";
    document.head.appendChild(script);

    const result = dataUrl("data/kent/profiles.json");
    expect(result).toBe("/homeo-magic/data/kent/profiles.json");
  });

  it("works for symptom index path", () => {
    const script = document.createElement("script");
    script.src = "/homeo-magic/_next/static/chunks/app.js";
    document.head.appendChild(script);

    expect(dataUrl("data/symptoms/index.json")).toBe("/homeo-magic/data/symptoms/index.json");
  });

  it("works for remedies index path", () => {
    const script = document.createElement("script");
    script.src = "/homeo-magic/_next/static/chunks/app.js";
    document.head.appendChild(script);

    expect(dataUrl("data/remedies/index.json")).toBe("/homeo-magic/data/remedies/index.json");
  });

  it("works for dynamic symptom subcategory paths", () => {
    const script = document.createElement("script");
    script.src = "/homeo-magic/_next/static/chunks/app.js";
    document.head.appendChild(script);

    expect(dataUrl("data/symptoms/Head/pain.json")).toBe("/homeo-magic/data/symptoms/Head/pain.json");
  });

  it("works for remedy markdown paths", () => {
    const script = document.createElement("script");
    script.src = "/homeo-magic/_next/static/chunks/app.js";
    document.head.appendChild(script);

    expect(dataUrl("data/kent/remedy_markdown/nux_vomica.md")).toBe("/homeo-magic/data/kent/remedy_markdown/nux_vomica.md");
  });

  it("handles no basePath (local dev) correctly", () => {
    // Script without basePath prefix
    const script = document.createElement("script");
    script.src = "/_next/static/chunks/app.js";
    document.head.appendChild(script);

    expect(dataUrl("data/kent/profiles.json")).toBe("/data/kent/profiles.json");
  });

  it("does not double-slash when path starts with /", () => {
    const result = dataUrl("data/kent/profiles.json");
    expect(result).not.toContain("//data");
  });

  it("works from any page depth (remedy subpage)", () => {
    // This is the key test - dataUrl must return absolute paths
    // so it works from /remedy/slug/ as well as /
    const script = document.createElement("script");
    script.src = "/homeo-magic/_next/static/chunks/app.js";
    document.head.appendChild(script);

    const result = dataUrl("data/kent/profiles.json");
    // Must be absolute (starts with /) so it works from any page
    expect(result.startsWith("/")).toBe(true);
    expect(result).toBe("/homeo-magic/data/kent/profiles.json");
  });

  it("handles deeply nested basePath", () => {
    const script = document.createElement("script");
    script.src = "/org/project/_next/static/chunks/app.js";
    document.head.appendChild(script);

    // Should detect full path prefix as basePath
    const result = dataUrl("data/kent/profiles.json");
    expect(result).toBe("/org/project/data/kent/profiles.json");
  });
});
