/**
 Provides matching capabilities to support custom redirects, rewrites, and headers.
 */

import { compile, Match, match } from "path-to-regexp";
import { Dynamic, DynamicSSG } from "./types";

/**
 * Match the given path against a source path.
 * @param path
 * @param source
 */
export function matchPath(path: string, source: string): Match {
  const matcher = match(source, { decode: decodeURIComponent });
  return matcher(path);
}

/**
 * Compile a destination for redirects or rewrites.
 * @param destination
 * @param params
 */
export function compileDestination(
  destination: string,
  params: object
): string | null {
  try {
    const destinationLowerCase = destination.toLowerCase();
    if (
      destinationLowerCase.startsWith("https://") ||
      destinationLowerCase.startsWith("http://")
    ) {
      // Handle external URLs
      const { origin, pathname } = new URL(destination);
      const toPath = compile(pathname, { encode: encodeURIComponent });
      const compiledDestination = `${origin}${toPath(params)}`;

      // Remove trailing slash if original destination didn't have it
      if (!destination.endsWith("/") && compiledDestination.endsWith("/")) {
        return compiledDestination.slice(0, -1);
      } else {
        return compiledDestination;
      }
    } else {
      // Handle all other paths. Escape all ? in case of query parameters
      const escapedDestination = destination.replace(/\?/g, "\\?");
      const toPath = compile(escapedDestination, {
        encode: encodeURIComponent
      });
      return toPath(params);
    }
  } catch (error) {
    console.error(
      `Could not compile destination ${destination}, returning null instead. Error: ${error}`
    );
    return null;
  }
}

export const matchDynamic = (
  uri: string,
  routes: Dynamic[]
): string | undefined => {
  for (const { file, regex } of routes) {
    const re = new RegExp(regex, "i");
    if (re.test(uri)) {
      return file;
    }
  }
};

export const matchDynamicSSG = (
  uri: string,
  routes: { [key: string]: DynamicSSG },
  isData: boolean
): string | undefined => {
  for (const [key, route] of Object.entries(routes)) {
    const regex = isData ? route.dataRouteRegex : route.routeRegex;
    const re = new RegExp(regex, "i");
    if (re.test(uri)) {
      return key;
    }
  }
};
