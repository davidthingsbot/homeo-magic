/**
 * Resolve a data file path relative to the app root.
 * Works on both local dev (no basePath) and GitHub Pages (basePath: /homeo-magic).
 * 
 * Usage: dataUrl("data/kent/profiles.json")
 * Returns: "/homeo-magic/data/kent/profiles.json" on GitHub Pages
 *          "/data/kent/profiles.json" on local
 */
export function dataUrl(path: string): string {
  // Detect basePath from the current page's script tags
  // Next.js static export includes basePath in script src attributes
  if (typeof window !== "undefined") {
    const scripts = document.querySelectorAll("script[src]");
    for (const script of scripts) {
      const src = script.getAttribute("src") || "";
      const match = src.match(/^(\/[^/]+)\/_next\//);
      if (match) {
        return `${match[1]}/${path}`;
      }
    }
  }
  // No basePath detected (local dev) — use root-relative path
  return `/${path}`;
}
