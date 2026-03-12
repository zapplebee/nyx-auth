import { GenericOAuthConfig, GenericOAuthOptions } from "./types.mjs";
import { Auth0Options, auth0 } from "./providers/auth0.mjs";
import { GumroadOptions, gumroad } from "./providers/gumroad.mjs";
import { HubSpotOptions, hubspot } from "./providers/hubspot.mjs";
import { KeycloakOptions, keycloak } from "./providers/keycloak.mjs";
import { LineOptions, line } from "./providers/line.mjs";
import { MicrosoftEntraIdOptions, microsoftEntraId } from "./providers/microsoft-entra-id.mjs";
import { OktaOptions, okta } from "./providers/okta.mjs";
import { PatreonOptions, patreon } from "./providers/patreon.mjs";
import { SlackOptions, slack } from "./providers/slack.mjs";
import "./providers/index.mjs";
import { AuthContext } from "@better-auth/core";
import * as _better_auth_core_oauth21 from "@better-auth/core/oauth2";
import { OAuthProvider } from "@better-auth/core/oauth2";
import * as better_call167 from "better-call";
import * as zod468 from "zod";
import * as zod_v4_core70 from "zod/v4/core";

//#region src/plugins/generic-oauth/index.d.ts
/**
 * Base type for OAuth provider options.
 * Extracts common fields from GenericOAuthConfig and makes clientSecret required.
 */
type BaseOAuthProviderOptions = Omit<Pick<GenericOAuthConfig, "clientId" | "clientSecret" | "scopes" | "redirectURI" | "pkce" | "disableImplicitSignUp" | "disableSignUp" | "overrideUserInfo">, "clientSecret"> & {
  /** OAuth client secret (required for provider options) */
  clientSecret: string;
};
/**
 * A generic OAuth plugin that can be used to add OAuth support to any provider
 */
declare const genericOAuth: (options: GenericOAuthOptions) => {
  id: "generic-oauth";
  init: (ctx: AuthContext) => {
    context: {
      socialProviders: OAuthProvider<Record<string, any>, Partial<_better_auth_core_oauth21.ProviderOptions<any>>>[];
    };
  };
  endpoints: {
    signInWithOAuth2: better_call167.StrictEndpoint<"/sign-in/oauth2", {
      method: "POST";
      body: zod468.ZodObject<{
        providerId: zod468.ZodString;
        callbackURL: zod468.ZodOptional<zod468.ZodString>;
        errorCallbackURL: zod468.ZodOptional<zod468.ZodString>;
        newUserCallbackURL: zod468.ZodOptional<zod468.ZodString>;
        disableRedirect: zod468.ZodOptional<zod468.ZodBoolean>;
        scopes: zod468.ZodOptional<zod468.ZodArray<zod468.ZodString>>;
        requestSignUp: zod468.ZodOptional<zod468.ZodBoolean>;
        additionalData: zod468.ZodOptional<zod468.ZodRecord<zod468.ZodString, zod468.ZodAny>>;
      }, zod_v4_core70.$strip>;
      metadata: {
        openapi: {
          description: string;
          responses: {
            200: {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      url: {
                        type: string;
                      };
                      redirect: {
                        type: string;
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };
    }, {
      url: string;
      redirect: boolean;
    }>;
    oAuth2Callback: better_call167.StrictEndpoint<"/oauth2/callback/:providerId", {
      method: "GET";
      query: zod468.ZodObject<{
        code: zod468.ZodOptional<zod468.ZodString>;
        error: zod468.ZodOptional<zod468.ZodString>;
        error_description: zod468.ZodOptional<zod468.ZodString>;
        state: zod468.ZodOptional<zod468.ZodString>;
        iss: zod468.ZodOptional<zod468.ZodString>;
      }, zod_v4_core70.$strip>;
      metadata: {
        allowedMediaTypes: string[];
        openapi: {
          description: string;
          responses: {
            200: {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      url: {
                        type: string;
                      };
                    };
                  };
                };
              };
            };
          };
        };
        scope: "server";
      };
    }, void>;
    oAuth2LinkAccount: better_call167.StrictEndpoint<"/oauth2/link", {
      method: "POST";
      body: zod468.ZodObject<{
        providerId: zod468.ZodString;
        callbackURL: zod468.ZodString;
        scopes: zod468.ZodOptional<zod468.ZodArray<zod468.ZodString>>;
        errorCallbackURL: zod468.ZodOptional<zod468.ZodString>;
      }, zod_v4_core70.$strip>;
      use: ((inputContext: better_call167.MiddlewareInputContext<better_call167.MiddlewareOptions>) => Promise<{
        session: {
          session: Record<string, any> & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            expiresAt: Date;
            token: string;
            ipAddress?: string | null | undefined;
            userAgent?: string | null | undefined;
          };
          user: Record<string, any> & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            emailVerified: boolean;
            name: string;
            image?: string | null | undefined;
          };
        };
      }>)[];
      metadata: {
        openapi: {
          description: string;
          responses: {
            "200": {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      url: {
                        type: string;
                        format: string;
                        description: string;
                      };
                      redirect: {
                        type: string;
                        description: string;
                        enum: boolean[];
                      };
                    };
                    required: string[];
                  };
                };
              };
            };
          };
        };
      };
    }, {
      url: string;
      redirect: boolean;
    }>;
  };
  options: GenericOAuthOptions;
  $ERROR_CODES: {
    readonly INVALID_OAUTH_CONFIGURATION: "Invalid OAuth configuration";
    readonly TOKEN_URL_NOT_FOUND: "Invalid OAuth configuration. Token URL not found.";
    readonly PROVIDER_CONFIG_NOT_FOUND: "No config found for provider";
    readonly PROVIDER_ID_REQUIRED: "Provider ID is required";
    readonly INVALID_OAUTH_CONFIG: "Invalid OAuth configuration.";
    readonly SESSION_REQUIRED: "Session is required";
    readonly ISSUER_MISMATCH: "OAuth issuer mismatch. The authorization server issuer does not match the expected value (RFC 9207).";
    readonly ISSUER_MISSING: "OAuth issuer parameter missing. The authorization server did not include the required iss parameter (RFC 9207).";
  };
};
//#endregion
export { Auth0Options, BaseOAuthProviderOptions, type GenericOAuthConfig, type GenericOAuthOptions, GumroadOptions, HubSpotOptions, KeycloakOptions, LineOptions, MicrosoftEntraIdOptions, OktaOptions, PatreonOptions, SlackOptions, auth0, genericOAuth, gumroad, hubspot, keycloak, line, microsoftEntraId, okta, patreon, slack };
//# sourceMappingURL=index.d.mts.map