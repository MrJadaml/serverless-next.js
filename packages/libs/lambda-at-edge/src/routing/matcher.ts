/**
 Provides matching capabilities to support custom redirects, rewrites, and headers.
 */

import { Match, match } from "path-to-regexp";

/**
 * Match the given path against a source path.
 * @param path
 * @param source
 */
export function matchPath(path: string, source: string): Match {
  const matcher = match(source, { decode: decodeURIComponent });
  return matcher(path);
}
