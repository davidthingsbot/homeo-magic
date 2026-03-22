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
      const match = src.match(/^(\/.*?)\/_next\//);
      if (match && match[1] !== "") {
        return `${match[1]}/${path}`;
      }
    }
  }
  // No basePath detected (local dev) — use root-relative path
  return `/${path}`;
}

/**
 * Resolve a navigation URL relative to the app root.
 * Similar to dataUrl but for page navigation (links, not data fetches).
 * 
 * Usage: navUrl("/remedy/nux_vomica")
 * Returns: "/homeo-magic/remedy/nux_vomica" on GitHub Pages
 *          "/remedy/nux_vomica" on local
 */
export function navUrl(path: string): string {
  if (typeof window !== "undefined") {
    const scripts = document.querySelectorAll("script[src]");
    for (const script of scripts) {
      const src = script.getAttribute("src") || "";
      const match = src.match(/^(\/.*?)\/_next\//);
      if (match && match[1] !== "") {
        return `${match[1]}${path.startsWith("/") ? path : "/" + path}`;
      }
    }
  }
  return path.startsWith("/") ? path : "/" + path;
}
