import * as _better_auth_core5 from "@better-auth/core";
import * as better_call172 from "better-call";

//#region src/plugins/bearer/index.d.ts
interface BearerOptions {
  /**
   * If true, only signed tokens
   * will be converted to session
   * cookies
   *
   * @default false
   */
  requireSignature?: boolean | undefined;
}
/**
 * Converts bearer token to session cookie
 */
declare const bearer: (options?: BearerOptions | undefined) => {
  id: "bearer";
  hooks: {
    before: {
      matcher(context: _better_auth_core5.HookEndpointContext): boolean;
      handler: (inputContext: better_call172.MiddlewareInputContext<better_call172.MiddlewareOptions>) => Promise<{
        context: {
          headers: Headers;
        };
      } | undefined>;
    }[];
    after: {
      matcher(context: _better_auth_core5.HookEndpointContext): true;
      handler: (inputContext: better_call172.MiddlewareInputContext<better_call172.MiddlewareOptions>) => Promise<void>;
    }[];
  };
  options: BearerOptions | undefined;
};
//#endregion
export { BearerOptions, bearer };
//# sourceMappingURL=index.d.mts.map