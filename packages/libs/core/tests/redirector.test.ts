import { createRedirectResponse, getRedirectPath } from "../src/redirect";
import { Request, RoutesManifest } from "../src/types";

describe("Redirector Tests", () => {
  describe("getRedirectPath()", () => {
    let routesManifest: RoutesManifest;

    beforeAll(() => {
      routesManifest = {
        basePath: "",
        redirects: [
          {
            source: "/old-blog/:slug",
            destination: "/news/:slug",
            statusCode: 308,
            regex: "^/old-blog(?:/([^/]+?))$"
          },
          { source: "/a", destination: "/b", statusCode: 308, regex: "^/a$" },
          {
            source: "/:nextInternalLocale(en|nl|fr)/a",
            destination: "/:nextInternalLocale/b",
            statusCode: 308,
            regex: "^(?:/(en|nl|fr))/a$"
          },
          { source: "/c", destination: "/d", statusCode: 302, regex: "^/c$" },
          {
            source: "/old-users/:id(\\d{1,})",
            destination: "/users/:id",
            statusCode: 307,
            regex: "^/old-users(?:/(\\d{1,}))$"
          },
          {
            source: "/external",
            destination: "https://example.com",
            statusCode: 308,
            regex: "^/external$"
          },
          {
            source: "/invalid-destination",
            destination: "ftp://example.com",
            statusCode: 308,
            regex: "^/invalid-destination$"
          }
        ]
      };
    });

    it.each`
      path                      | expectedRedirect         | expectedStatusCode
      ${"/a"}                   | ${"/b"}                  | ${308}
      ${"/c"}                   | ${"/d"}                  | ${302}
      ${"/old-blog/abc"}        | ${"/news/abc"}           | ${308}
      ${"/old-users/1234"}      | ${"/users/1234"}         | ${307}
      ${"/old-users/abc"}       | ${null}                  | ${null}
      ${"/external"}            | ${"https://example.com"} | ${308}
      ${"/invalid-destination"} | ${null}                  | ${null}
      ${"/en/a"}                | ${"/en/b"}               | ${308}
      ${"/fr/a"}                | ${"/fr/b"}               | ${308}
    `(
      "redirects path $path to $expectedRedirect",
      ({ path, expectedRedirect, expectedStatusCode }) => {
        const request = ({ uri: path } as unknown) as Request;
        const redirect = getRedirectPath(request, routesManifest);

        if (expectedRedirect) {
          expect(redirect).toEqual({
            path: expectedRedirect,
            statusCode: expectedStatusCode
          });
        } else {
          expect(redirect).toBeNull();
        }
      }
    );
  });

  describe("createRedirectResponse()", () => {
    it("does a permanent redirect", () => {
      const response = createRedirectResponse("/terms", "", 308);
      expect(response).toEqual({
        isRedirect: true,
        status: 308,
        statusDescription: "Permanent Redirect",
        headers: {
          location: [
            {
              key: "Location",
              value: "/terms"
            }
          ],
          refresh: [
            // Required for IE11 compatibility
            {
              key: "Refresh",
              value: `0;url=/terms`
            }
          ]
        }
      });
    });

    it("does a temporary redirect with query parameters", () => {
      const response = createRedirectResponse("/terms", "a=123", 307);
      expect(response).toEqual({
        isRedirect: true,
        status: 307,
        statusDescription: "Temporary Redirect",
        headers: {
          location: [
            {
              key: "Location",
              value: "/terms?a=123"
            }
          ],
          refresh: []
        }
      });
    });
  });
});
