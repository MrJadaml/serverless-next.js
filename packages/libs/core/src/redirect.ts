import { STATUS_CODES } from "http";
import { addDefaultLocaleToPath, getAcceptLanguageLocale } from "./locale";
import { compileDestination, matchPath } from "./match";
import { Manifest, Request, RedirectRoute, RoutesManifest } from "./types";

/**
 * Create a redirect response with the given status code
 * @param uri
 * @param querystring
 * @param statusCode
 */
export function createRedirectResponse(
  uri: string,
  querystring: string | undefined,
  statusCode: number
): RedirectRoute {
  let location;

  // Properly join query strings
  if (querystring) {
    const [uriPath, uriQuery] = uri.split("?");
    location = `${uriPath}?${querystring}${uriQuery ? `&${uriQuery}` : ""}`;
  } else {
    location = uri;
  }

  const status = statusCode;
  const statusDescription = STATUS_CODES[status];

  const refresh =
    statusCode === 308
      ? [
          // Required for IE11 compatibility
          {
            key: "Refresh",
            value: `0;url=${location}`
          }
        ]
      : [];

  return {
    isRedirect: true,
    status: status,
    statusDescription: statusDescription || "",
    headers: {
      location: [
        {
          key: "Location",
          value: location
        }
      ],
      refresh: refresh
    }
  };
}

/**
 * Get a domain redirect such as redirecting www to non-www domain.
 * @param request
 * @param manifest
 */
export function getDomainRedirectPath(
  request: Request,
  manifest: Manifest
): string | undefined {
  const hostHeaders = request.headers["host"];
  if (hostHeaders && hostHeaders.length > 0) {
    const host = hostHeaders[0].value;
    const domainRedirects = manifest.domainRedirects;

    if (domainRedirects && domainRedirects[host]) {
      return `${domainRedirects[host]}${request.uri}`;
    }
  }
}

/**
 * Redirect from root to locale.
 * @param request
 * @param routesManifest
 * @param manifest
 */
export async function getLanguageRedirectPath(
  req: Request,
  manifest: Manifest,
  routesManifest: RoutesManifest
): Promise<string | undefined> {
  const languageHeader = req.headers["accept-language"];
  const acceptLanguage = languageHeader && languageHeader[0]?.value;
  const basePath = routesManifest.basePath;
  const trailingSlash = manifest.trailingSlash;
  const rootUri = basePath ? `${basePath}${trailingSlash ? "/" : ""}` : "/";

  if (req.uri === rootUri || acceptLanguage) {
    return await getAcceptLanguageLocale(
      acceptLanguage,
      manifest,
      routesManifest
    );
  }
}

/**
 * Get the redirect of the given path, if it exists.
 * @param path
 * @param manifest
 */
export function getRedirectPath(
  request: Request,
  routesManifest: RoutesManifest
): { path: string; statusCode: number } | null {
  const path = addDefaultLocaleToPath(request.uri, routesManifest);

  const redirects = routesManifest.redirects ?? [];

  for (const redirect of redirects) {
    const match = matchPath(path, redirect.source);

    if (match) {
      const compiledDestination = compileDestination(
        redirect.destination,
        match.params
      );

      if (!compiledDestination) {
        return null;
      }

      return {
        path: compiledDestination,
        statusCode: redirect.statusCode
      };
    }
  }

  return null;
}

/**
 * Get a domain redirect such as redirecting www to non-www domain.
 * @param request
 * @param manifest
 */
export function getTrailingSlashPath(
  request: Request,
  manifest: Manifest,
  isFile: boolean
): string | undefined {
  const { uri } = request;
  if (isFile) {
    // Data requests and public files with trailing slash URL always get
    // redirected to non-trailing slash URL
    if (uri.endsWith("/")) {
      return uri.slice(0, -1);
    }
  } else if (/^\/[^/]/.test(request.uri)) {
    // HTML/SSR pages get redirected based on trailingSlash in next.config.js
    // We do not redirect:
    // Unnormalised URI is "/" or "" as this could cause a redirect loop
    const trailingSlash = manifest.trailingSlash;

    if (!trailingSlash && uri.endsWith("/")) {
      return uri.slice(0, -1);
    }

    if (trailingSlash && !uri.endsWith("/")) {
      return uri + "/";
    }
  }
}
