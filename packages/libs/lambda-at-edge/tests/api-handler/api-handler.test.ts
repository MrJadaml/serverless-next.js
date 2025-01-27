import { createCloudFrontEvent } from "../test-utils";
import { handler } from "../../src/api-handler";
import { CloudFrontResponseResult } from "next-aws-cloudfront/node_modules/@types/aws-lambda";
import { runRedirectTestWithHandler } from "../utils/runRedirectTest";
import { CloudFrontResultResponse } from "aws-lambda";
import { isBlacklistedHeader } from "../../src/headers/removeBlacklistedHeaders";

jest.mock("node-fetch", () => require("fetch-mock-jest").sandbox());

jest.mock(
  "../../src/manifest.json",
  () => require("./api-build-manifest.json"),
  {
    virtual: true
  }
);

jest.mock(
  "../../src/routes-manifest.json",
  () => require("./api-routes-manifest.json"),
  {
    virtual: true
  }
);

const mockPageRequire = (mockPagePath: string): void => {
  jest.mock(
    `../../src/${mockPagePath}`,
    () => require(`../shared-fixtures/built-artifact/${mockPagePath}`),
    {
      virtual: true
    }
  );
};

describe("API lambda handler", () => {
  describe("API routes", () => {
    it("serves api request", async () => {
      const event = createCloudFrontEvent({
        uri: "/api/getCustomers",
        host: "mydistribution.cloudfront.net",
        origin: {
          s3: {
            domainName: "my-bucket.s3.amazonaws.com"
          }
        }
      });

      mockPageRequire("pages/api/getCustomers.js");

      const response = (await handler(event)) as CloudFrontResponseResult;

      const decodedBody = Buffer.from(response.body, "base64").toString("utf8");

      expect(decodedBody).toEqual("pages/api/getCustomers");
      expect(response.status).toEqual(200);
    });

    it("serves dynamic api request", async () => {
      const event = createCloudFrontEvent({
        uri: "/api/users/123",
        host: "mydistribution.cloudfront.net",
        origin: {
          s3: {
            domainName: "my-bucket.s3.amazonaws.com"
          }
        }
      });

      mockPageRequire("pages/api/users/[id].js");

      const response = (await handler(event)) as CloudFrontResponseResult;

      const decodedBody = Buffer.from(response.body, "base64").toString("utf8");

      expect(decodedBody).toEqual("pages/api/[id]");
      expect(response.status).toEqual(200);
    });

    it("returns 404 for not-found api routes", async () => {
      const event = createCloudFrontEvent({
        uri: "/foo/bar",
        host: "mydistribution.cloudfront.net",
        origin: {
          s3: {
            domainName: "my-bucket.s3.amazonaws.com"
          }
        }
      });

      mockPageRequire("pages/api/getCustomers.js");

      const response = (await handler(event)) as CloudFrontResponseResult;

      expect(response.status).toEqual("404");
    });
  });

  let runRedirectTest = async (
    path: string,
    expectedRedirect: string,
    statusCode: number,
    querystring?: string,
    host?: string
  ): Promise<void> => {
    await runRedirectTestWithHandler(
      handler,
      path,
      expectedRedirect,
      statusCode,
      querystring,
      host
    );
  };

  describe("Custom Redirects", () => {
    it.each`
      path                              | expectedRedirect       | expectedRedirectStatusCode
      ${"/api/deprecated/getCustomers"} | ${"/api/getCustomers"} | ${308}
    `(
      "redirects path $path to $expectedRedirect, expectedRedirectStatusCode: $expectedRedirectStatusCode",
      async ({ path, expectedRedirect, expectedRedirectStatusCode }) => {
        await runRedirectTest(
          path,
          expectedRedirect,
          expectedRedirectStatusCode
        );
      }
    );
  });

  describe("Domain Redirects", () => {
    it.each`
      path        | querystring | expectedRedirect                     | expectedRedirectStatusCode
      ${"/"}      | ${""}       | ${"https://www.example.com/"}        | ${308}
      ${"/"}      | ${"a=1234"} | ${"https://www.example.com/?a=1234"} | ${308}
      ${"/terms"} | ${""}       | ${"https://www.example.com/terms"}   | ${308}
    `(
      "redirects path $path to $expectedRedirect, expectedRedirectStatusCode: $expectedRedirectStatusCode",
      async ({
        path,
        querystring,
        expectedRedirect,
        expectedRedirectStatusCode
      }) => {
        await runRedirectTest(
          path,
          expectedRedirect,
          expectedRedirectStatusCode,
          querystring,
          "example.com" // Override host to test a domain redirect from host example.com -> https://www.example.com
        );
      }
    );
  });

  describe("Custom Rewrites", () => {
    it.each`
      path                           | expectedJs                     | expectedBody                | expectedStatus
      ${"/api/rewrite-getCustomers"} | ${"pages/api/getCustomers.js"} | ${"pages/api/getCustomers"} | ${200}
      ${"/api/getCustomers"}         | ${"pages/api/getCustomers.js"} | ${"pages/api/getCustomers"} | ${200}
    `(
      "serves API $expectedJs for rewritten path $path",
      async ({ path, expectedJs, expectedBody, expectedStatus }) => {
        const event = createCloudFrontEvent({
          uri: path,
          host: "mydistribution.cloudfront.net",
          origin: {
            s3: {
              domainName: "my-bucket.s3.amazonaws.com"
            }
          }
        });

        mockPageRequire(expectedJs);

        const response = (await handler(event)) as CloudFrontResponseResult;

        const decodedBody = Buffer.from(response.body, "base64").toString(
          "utf8"
        );

        expect(decodedBody).toEqual(expectedBody);
        expect(response.status).toEqual(expectedStatus);
      }
    );

    it("serves API with query param for rewritten path /api/customers/123", async () => {
      const event = createCloudFrontEvent({
        uri: "/api/user/123",
        host: "mydistribution.cloudfront.net",
        origin: {
          s3: {
            domainName: "my-bucket.s3.amazonaws.com"
          }
        }
      });

      mockPageRequire("pages/api/getUser.js");
      const response: CloudFrontResultResponse = await handler(event);
      expect(response.status).toEqual(200);

      const page = require(`../../src/pages/api/getUser.js`);
      const call = page.default.mock.calls[0];
      const req = call[0];
      expect(req.url).toEqual("/api/user/123?id=123");
    });

    it("serves API with 404 for rewritten path /api/notfound", async () => {
      const event = createCloudFrontEvent({
        uri: "/api/notfound",
        host: "mydistribution.cloudfront.net",
        origin: {
          s3: {
            domainName: "my-bucket.s3.amazonaws.com"
          }
        }
      });

      const response: CloudFrontResultResponse = await handler(event);
      expect(response.status).toEqual("404");
    });

    it.each`
      uri                        | rewriteUri
      ${"/api/external-rewrite"} | ${"https://external.com"}
    `(
      "serves external rewrite $rewriteUri for rewritten path $uri",
      async ({ uri, rewriteUri }) => {
        const { default: fetchMock } = await import("node-fetch");
        fetchMock.get(rewriteUri, {
          body: "external",
          headers: { "Content-Type": "text/plain" },
          status: 200
        });

        let [path, querystring] = uri.split("?");

        const event = createCloudFrontEvent({
          uri: path,
          querystring: querystring,
          host: "mydistribution.cloudfront.net"
        });

        const response: CloudFrontResultResponse = await handler(event);

        expect(response).toEqual({
          body: "ZXh0ZXJuYWw=",
          bodyEncoding: "base64",
          headers: {
            "content-type": [
              {
                key: "content-type",
                value: "text/plain"
              }
            ]
          },
          status: 200,
          statusDescription: "OK"
        });

        fetchMock.reset();
      }
    );
  });

  describe("Custom Headers", () => {
    it.each`
      path                   | expectedHeaders                    | expectedJs
      ${"/api/getCustomers"} | ${{ "x-custom-header": "custom" }} | ${"pages/customers/[customer].js"}
    `(
      "has custom headers $expectedHeaders and expectedPage $expectedPage for path $path",
      async ({ path, expectedHeaders, expectedJs }) => {
        const event = createCloudFrontEvent({
          uri: path,
          host: "mydistribution.cloudfront.net"
        });

        mockPageRequire(expectedJs);

        const response = await handler(event);

        expect(response.headers).not.toBeUndefined();

        for (const header in expectedHeaders) {
          const headerEntry = response.headers![header][0];
          expect(headerEntry).toEqual({
            key: header,
            value: expectedHeaders[header]
          });
        }

        // Verify no blacklisted headers are present
        for (const header in response.headers) {
          expect(isBlacklistedHeader(header)).toBe(false);
        }
      }
    );
  });
});
