import { BuildOptions, DynamicPageKeyValue, NextConfig } from "./types";
import { ApiManifest, Manifest, PageManifest, RoutesManifest } from "../types";
import { isDynamicRoute, isOptionalCatchAllRoute } from "./isDynamicRoute";
import { normaliseDomainRedirects } from "./normaliseDomainRedirects";
import { pathToRegexStr } from "./pathToRegexStr";
import { DynamicSsgRoute, PrerenderManifest, SsgRoute } from "next/dist/build";
import { getSortedRoutes } from "./sortedRoutes";

export const prepareBuildManifests = async (
  buildOptions: BuildOptions,
  nextConfig: NextConfig | undefined,
  routesManifest: RoutesManifest,
  pagesManifest: { [key: string]: string },
  prerenderManifest: PrerenderManifest,
  publicFiles: string[]
): Promise<{
  pageManifest: PageManifest;
  apiManifest: ApiManifest;
  imageManifest: Manifest;
}> => {
  const {
    authentication,
    buildId,
    domainRedirects: unnormalisedDomainRedirects
  } = buildOptions;
  const domainRedirects = normaliseDomainRedirects(unnormalisedDomainRedirects);

  const pageManifest: PageManifest = {
    buildId,
    pages: {
      dynamic: [],
      ssr: {
        dynamic: {},
        catchAll: {},
        nonDynamic: {}
      },
      html: {
        dynamic: {},
        nonDynamic: {}
      },
      ssg: {
        dynamic: {},
        nonDynamic: {}
      }
    },
    publicFiles: {},
    trailingSlash: nextConfig?.trailingSlash ?? false,
    domainRedirects,
    authentication
  };

  const apiManifest: ApiManifest = {
    apis: {
      dynamic: [],
      nonDynamic: {}
    },
    domainRedirects,
    authentication
  };

  const ssgPages = pageManifest.pages.ssg;
  const ssrPages = pageManifest.pages.ssr;
  const htmlPages = pageManifest.pages.html;
  const apiPages = apiManifest.apis;
  const dynamicApi: DynamicPageKeyValue = {};

  const isHtmlPage = (path: string): boolean => path.endsWith(".html");
  const isApiPage = (path: string): boolean => path.startsWith("pages/api");

  Object.entries(pagesManifest).forEach(([route, pageFile]) => {
    // Check for optional catch all dynamic routes vs. other types of dynamic routes
    // We also add another route without dynamic parameter for optional catch all dynamic routes
    const isOptionalCatchAllDynamicRoute = isOptionalCatchAllRoute(route);
    const isOtherDynamicRoute =
      !isOptionalCatchAllDynamicRoute && isDynamicRoute(route);

    // The base path of optional catch-all without parameter
    const optionalBaseRoute = isOptionalCatchAllDynamicRoute
      ? route.split("/[[")[0] || "/"
      : "";

    if (isHtmlPage(pageFile)) {
      if (isOtherDynamicRoute) {
        htmlPages.dynamic[route] = {
          file: pageFile,
          regex: pathToRegexStr(route)
        };
      } else if (isOptionalCatchAllDynamicRoute) {
        htmlPages.dynamic[route] = {
          file: pageFile,
          regex: pathToRegexStr(route)
        };
        htmlPages.nonDynamic[optionalBaseRoute] = pageFile;
      } else {
        htmlPages.nonDynamic[route] = pageFile;
      }
    } else if (isApiPage(pageFile)) {
      if (isOtherDynamicRoute) {
        dynamicApi[route] = {
          file: pageFile,
          regex: pathToRegexStr(route)
        };
      } else if (isOptionalCatchAllDynamicRoute) {
        dynamicApi[route] = {
          file: pageFile,
          regex: pathToRegexStr(route)
        };
        apiPages.nonDynamic[optionalBaseRoute] = pageFile;
      } else {
        apiPages.nonDynamic[route] = pageFile;
      }
    } else if (isOtherDynamicRoute) {
      ssrPages.dynamic[route] = {
        file: pageFile,
        regex: pathToRegexStr(route)
      };
    } else if (isOptionalCatchAllDynamicRoute) {
      ssrPages.dynamic[route] = {
        file: pageFile,
        regex: pathToRegexStr(route)
      };
      ssrPages.nonDynamic[optionalBaseRoute] = pageFile;
    } else {
      ssrPages.nonDynamic[route] = pageFile;
    }
  });

  // Add non-dynamic SSG routes
  Object.entries(prerenderManifest.routes).forEach(([route, ssgRoute]) => {
    // Somehow Next.js generates prerender manifest with default locale prefixed, normalize it
    const defaultLocale = routesManifest.i18n?.defaultLocale;
    if (defaultLocale) {
      const normalizedRoute = route.replace(`/${defaultLocale}/`, "/");
      ssgRoute.dataRoute = ssgRoute.dataRoute.replace(
        `/${defaultLocale}/`,
        "/"
      );
      ssgPages.nonDynamic[normalizedRoute] = ssgRoute;
    } else {
      ssgPages.nonDynamic[route] = ssgRoute;
    }
  });

  // Add dynamic SSG routes
  Object.entries(prerenderManifest.dynamicRoutes ?? {}).forEach(
    ([route, dynamicSsgRoute]) => {
      ssgPages.dynamic[route] = dynamicSsgRoute;
    }
  );

  // Duplicate routes for all specified locales. This is easy matching locale-prefixed routes in handler
  if (routesManifest.i18n) {
    const localeHtmlPages: {
      dynamic: DynamicPageKeyValue;
      nonDynamic: {
        [key: string]: string;
      };
    } = {
      dynamic: {},
      nonDynamic: {}
    };

    const localeSsgPages: {
      dynamic: {
        [key: string]: DynamicSsgRoute;
      };
      nonDynamic: {
        [key: string]: SsgRoute;
      };
    } = {
      dynamic: {},
      nonDynamic: {}
    };

    const localeSsrPages: {
      nonDynamic: {
        [key: string]: string;
      };
      dynamic: DynamicPageKeyValue;
    } = {
      nonDynamic: {},
      dynamic: {}
    };

    for (const locale of routesManifest.i18n.locales) {
      htmlPagesNonDynamicLoop: for (const key in htmlPages.nonDynamic) {
        // Locale-prefixed pages don't need to be duplicated
        for (const locale of routesManifest.i18n.locales) {
          if (key.startsWith(`/${locale}/`) || key === `/${locale}`) {
            break htmlPagesNonDynamicLoop;
          }
        }

        const newKey = key === "/" ? `/${locale}` : `/${locale}${key}`;
        localeHtmlPages.nonDynamic[newKey] = htmlPages.nonDynamic[key].replace(
          "pages/",
          `pages/${locale}/`
        );
      }

      for (const key in htmlPages.dynamic) {
        const newKey = key === "/" ? `/${locale}` : `/${locale}${key}`;

        // Initial default value
        localeHtmlPages.dynamic[newKey] = { file: "", regex: "" };
        const newDynamicHtml = Object.assign(
          localeHtmlPages.dynamic[newKey],
          htmlPages.dynamic[key]
        );

        // Need to update the file and regex
        newDynamicHtml.file = newDynamicHtml.file.replace(
          "pages/",
          `pages/${locale}/`
        );
        newDynamicHtml.regex = pathToRegexStr(newKey);
      }

      for (const key in ssrPages.nonDynamic) {
        const newKey = key === "/" ? `/${locale}` : `/${locale}${key}`;
        localeSsrPages.nonDynamic[newKey] = ssrPages.nonDynamic[key];
      }

      for (const key in ssrPages.dynamic) {
        const newKey = key === "/" ? `/${locale}` : `/${locale}${key}`;

        // Initial default value
        localeSsrPages.dynamic[newKey] = { file: "", regex: "" };
        const newDynamicSsr = Object.assign(
          localeSsrPages.dynamic[newKey],
          ssrPages.dynamic[key]
        );

        // Need to update the regex
        newDynamicSsr.regex = pathToRegexStr(newKey);
      }

      for (const key in ssgPages.nonDynamic) {
        const newKey = key === "/" ? `/${locale}` : `/${locale}${key}`;

        // Initial default value
        localeSsgPages.nonDynamic[newKey] = {
          initialRevalidateSeconds: false,
          srcRoute: null,
          dataRoute: ""
        };

        const newSsgRoute = Object.assign(
          localeSsgPages.nonDynamic[newKey],
          ssgPages.nonDynamic[key]
        );

        // Replace with localized value. For non-dynamic index page, this is in format "en.json"
        if (key === "/") {
          newSsgRoute.dataRoute = newSsgRoute.dataRoute.replace(
            `/_next/data/${buildId}/index.json`,
            `/_next/data/${buildId}/${locale}.json`
          );
        } else {
          newSsgRoute.dataRoute = newSsgRoute.dataRoute.replace(
            `/_next/data/${buildId}/`,
            `/_next/data/${buildId}/${locale}/`
          );
        }

        newSsgRoute.srcRoute = newSsgRoute.srcRoute
          ? `/${locale}${newSsgRoute.srcRoute}`
          : newSsgRoute.srcRoute;
      }

      for (const key in ssgPages.dynamic) {
        const newKey = key === "/" ? `/${locale}` : `/${locale}${key}`;
        localeSsgPages.dynamic[newKey] = { ...ssgPages.dynamic[key] };

        const newDynamicSsgRoute = localeSsgPages.dynamic[newKey];

        // Replace with localized values
        newDynamicSsgRoute.dataRoute = newDynamicSsgRoute.dataRoute.replace(
          `/_next/data/${buildId}/`,
          `/_next/data/${buildId}/${locale}/`
        );
        newDynamicSsgRoute.dataRouteRegex = newDynamicSsgRoute.dataRouteRegex.replace(
          `/_next/data/${buildId}/`,
          `/_next/data/${buildId}/${locale}/`
        );
        newDynamicSsgRoute.fallback =
          typeof newDynamicSsgRoute.fallback === "string"
            ? newDynamicSsgRoute.fallback.replace("/", `/${locale}/`)
            : newDynamicSsgRoute.fallback;
        newDynamicSsgRoute.routeRegex = localeSsgPages.dynamic[
          newKey
        ].routeRegex.replace("^/", `^/${locale}/`);
      }
    }

    const allDynamicRoutes = {
      ...ssrPages.dynamic,
      ...localeSsrPages.dynamic
    };

    pageManifest.pages.ssr = {
      dynamic: allDynamicRoutes,
      catchAll: {},
      nonDynamic: {
        ...ssrPages.nonDynamic,
        ...localeSsrPages.nonDynamic
      }
    };

    pageManifest.pages.ssg = {
      nonDynamic: {
        ...ssgPages.nonDynamic,
        ...localeSsgPages.nonDynamic
      },
      dynamic: {
        ...ssgPages.dynamic,
        ...localeSsgPages.dynamic
      }
    };

    pageManifest.pages.html = {
      nonDynamic: {
        ...htmlPages.nonDynamic,
        ...localeHtmlPages.nonDynamic
      },
      dynamic: {
        ...htmlPages.dynamic,
        ...localeHtmlPages.dynamic
      }
    };
  }

  // Split dynamic routes to non-catch all and catch all dynamic routes for later use for route precedence
  const nonCatchAllRoutes: DynamicPageKeyValue = {};
  const catchAllRoutes: DynamicPageKeyValue = {};
  const allDynamicRoutes: DynamicPageKeyValue = pageManifest.pages.ssr.dynamic;

  for (const key in allDynamicRoutes) {
    if (key.includes("[...")) {
      catchAllRoutes[key] = allDynamicRoutes[key];
    } else {
      nonCatchAllRoutes[key] = allDynamicRoutes[key];
    }
  }

  pageManifest.pages.ssr = {
    ...pageManifest.pages.ssr,
    dynamic: nonCatchAllRoutes,
    catchAll: catchAllRoutes
  };

  // Sort page routes
  const dynamicRoutes = Object.keys(pageManifest.pages.html.dynamic)
    .concat(Object.keys(pageManifest.pages.ssg.dynamic))
    .concat(Object.keys(pageManifest.pages.ssr.dynamic))
    .concat(Object.keys(pageManifest.pages.ssr.catchAll));
  const sortedRoutes = getSortedRoutes(dynamicRoutes);
  pageManifest.pages.dynamic = sortedRoutes.map((route) => {
    return {
      route: route,
      regex: pathToRegexStr(route)
    };
  });

  // Sort api routes
  const sortedApi = getSortedRoutes(Object.keys(dynamicApi));
  apiManifest.apis.dynamic = sortedApi.map((route) => {
    return {
      file: dynamicApi[route].file,
      regex: pathToRegexStr(route)
    };
  });

  // Public files
  const files: { [key: string]: string } = {};
  publicFiles.forEach((file) => {
    files[`/${file}`] = file;
  });
  pageManifest.publicFiles = files;

  // Image manifest
  const imageManifest: Manifest = {
    authentication,
    domainRedirects: domainRedirects
  };

  return {
    pageManifest,
    apiManifest,
    imageManifest
  };
};

export * from "./types";