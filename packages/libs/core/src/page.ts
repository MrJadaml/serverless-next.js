import { normalise } from "./basepath";
import { addDefaultLocaleToPath } from "./locale";
import { matchDynamic, matchDynamicRoute } from "./match";
import { getRewritePath, isExternalRewrite } from "./rewrite";
import {
  ExternalRoute,
  PageManifest,
  PageRoute,
  RoutesManifest
} from "./types";

const pageHtml = (localeUri: string) => {
  if (localeUri == "/") {
    return "pages/index.html";
  }
  return `pages${localeUri}.html`;
};

const handle404 = (manifest: PageManifest): PageRoute => {
  if (manifest.pages.html.nonDynamic["/404"]) {
    return {
      isData: false,
      isStatic: true,
      file: "pages/404.html"
    };
  }
  return {
    isData: false,
    isRender: true,
    page: "pages/_error.js"
  };
};

export const handlePageReq = (
  uri: string,
  manifest: PageManifest,
  routesManifest: RoutesManifest,
  isPreview: boolean,
  isRewrite?: boolean
): ExternalRoute | PageRoute => {
  const { pages } = manifest;
  const localeUri = normalise(
    addDefaultLocaleToPath(uri, routesManifest),
    routesManifest
  );
  if (pages.html.nonDynamic[localeUri]) {
    return {
      isData: false,
      isStatic: true,
      file: pages.html.nonDynamic[localeUri]
    };
  }
  if (pages.ssg.nonDynamic[localeUri] && !isPreview) {
    return {
      isData: false,
      isStatic: true,
      file: pageHtml(localeUri)
    };
  }
  if (pages.ssr.nonDynamic[localeUri]) {
    return {
      isData: false,
      isRender: true,
      page: pages.ssr.nonDynamic[localeUri]
    };
  }

  const rewrite = !isRewrite && getRewritePath(uri, routesManifest);
  if (rewrite) {
    const [path, querystring] = rewrite.split("?");
    if (isExternalRewrite(path)) {
      return {
        isExternal: true,
        path,
        querystring
      };
    }
    const route = handlePageReq(
      path,
      manifest,
      routesManifest,
      isPreview,
      true
    );
    return {
      ...route,
      querystring
    };
  }

  const dynamic = matchDynamicRoute(localeUri, pages.dynamic);
  if (!dynamic) {
    return handle404(manifest);
  }

  const dynamicSSG = pages.ssg.dynamic[dynamic];
  if (dynamicSSG) {
    return {
      isData: false,
      isStatic: true,
      file: pageHtml(localeUri)
    };
  }
  const dynamicSSR = pages.ssr.dynamic[dynamic];
  if (dynamicSSR) {
    return {
      isData: false,
      isRender: true,
      page: dynamicSSR.file
    };
  }
  const dynamicHTML = pages.html.dynamic[dynamic];
  if (dynamicHTML) {
    return {
      isData: false,
      isStatic: true,
      file: dynamicHTML.file
    };
  }
  const catchAll = pages.ssr.catchAll[dynamic];
  if (catchAll) {
    return {
      isData: false,
      isRender: true,
      page: catchAll.file
    };
  }

  return handle404(manifest);
};