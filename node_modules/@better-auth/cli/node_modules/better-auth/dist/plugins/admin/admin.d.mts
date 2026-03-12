import { AccessControl, Statements } from "../access/types.mjs";
import { AdminOptions, InferAdminRolesFromOption, SessionWithImpersonatedBy, UserWithRole } from "./types.mjs";
import "../index.mjs";
import * as _better_auth_core26 from "@better-auth/core";
import * as _better_auth_core_db10 from "@better-auth/core/db";
import * as better_call670 from "better-call";
import * as zod1856 from "zod";
import * as zod_v4_core264 from "zod/v4/core";

//#region src/plugins/admin/admin.d.ts
declare const admin: <O extends AdminOptions>(options?: O | undefined) => {
  id: "admin";
  init(): {
    options: {
      databaseHooks: {
        user: {
          create: {
            before(user: {
              id: string;
              createdAt: Date;
              updatedAt: Date;
              email: string;
              emailVerified: boolean;
              name: string;
              image?: string | null | undefined;
            } & Record<string, unknown>): Promise<{
              data: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                email: string;
                emailVerified: boolean;
                name: string;
                image?: string | null | undefined;
                role: string;
              };
            }>;
          };
        };
        session: {
          create: {
            before(session: {
              id: string;
              createdAt: Date;
              updatedAt: Date;
              userId: string;
              expiresAt: Date;
              token: string;
              ipAddress?: string | null | undefined;
              userAgent?: string | null | undefined;
            } & Record<string, unknown>, ctx: _better_auth_core26.GenericEndpointContext | null): Promise<void>;
          };
        };
      };
    };
  };
  hooks: {
    after: {
      matcher(context: _better_auth_core26.HookEndpointContext): boolean;
      handler: (inputContext: better_call670.MiddlewareInputContext<better_call670.MiddlewareOptions>) => Promise<SessionWithImpersonatedBy[] | undefined>;
    }[];
  };
  endpoints: {
    setRole: better_call670.StrictEndpoint<"/admin/set-role", {
      method: "POST";
      body: zod1856.ZodObject<{
        userId: zod1856.ZodCoercedString<unknown>;
        role: zod1856.ZodUnion<readonly [zod1856.ZodString, zod1856.ZodArray<zod1856.ZodString>]>;
      }, zod_v4_core264.$strip>;
      requireHeaders: true;
      use: ((inputContext: better_call670.MiddlewareInputContext<better_call670.MiddlewareOptions>) => Promise<{
        session: {
          user: UserWithRole;
          session: _better_auth_core_db10.Session;
        };
      }>)[];
      metadata: {
        openapi: {
          operationId: string;
          summary: string;
          description: string;
          responses: {
            200: {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      user: {
                        $ref: string;
                      };
                    };
                  };
                };
              };
            };
          };
        };
        $Infer: {
          body: {
            userId: string;
            role: InferAdminRolesFromOption<O & Required<Pick<AdminOptions, "defaultRole" | "adminRoles" | "bannedUserMessage">>> | InferAdminRolesFromOption<O & Required<Pick<AdminOptions, "defaultRole" | "adminRoles" | "bannedUserMessage">>>[];
          };
        };
      };
    }, {
      user: UserWithRole;
    }>;
    getUser: better_call670.StrictEndpoint<"/admin/get-user", {
      method: "GET";
      query: zod1856.ZodObject<{
        id: zod1856.ZodString;
      }, zod_v4_core264.$strip>;
      use: ((inputContext: better_call670.MiddlewareInputContext<better_call670.MiddlewareOptions>) => Promise<{
        session: {
          user: UserWithRole;
          session: _better_auth_core_db10.Session;
        };
      }>)[];
      metadata: {
        openapi: {
          operationId: string;
          summary: string;
          description: string;
          responses: {
            200: {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      user: {
                        $ref: string;
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };
    }, UserWithRole>;
    createUser: better_call670.StrictEndpoint<"/admin/create-user", {
      method: "POST";
      body: zod1856.ZodObject<{
        email: zod1856.ZodString;
        password: zod1856.ZodOptional<zod1856.ZodString>;
        name: zod1856.ZodString;
        role: zod1856.ZodOptional<zod1856.ZodUnion<readonly [zod1856.ZodString, zod1856.ZodArray<zod1856.ZodString>]>>;
        data: zod1856.ZodOptional<zod1856.ZodRecord<zod1856.ZodString, zod1856.ZodAny>>;
      }, zod_v4_core264.$strip>;
      metadata: {
        openapi: {
          operationId: string;
          summary: string;
          description: string;
          responses: {
            200: {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      user: {
                        $ref: string;
                      };
                    };
                  };
                };
              };
            };
          };
        };
        $Infer: {
          body: {
            email: string;
            password?: string | undefined;
            name: string;
            role?: InferAdminRolesFromOption<O & Required<Pick<AdminOptions, "defaultRole" | "adminRoles" | "bannedUserMessage">>> | InferAdminRolesFromOption<O & Required<Pick<AdminOptions, "defaultRole" | "adminRoles" | "bannedUserMessage">>>[] | undefined;
            data?: Record<string, any> | undefined;
          };
        };
      };
    }, {
      user: UserWithRole;
    }>;
    adminUpdateUser: better_call670.StrictEndpoint<"/admin/update-user", {
      method: "POST";
      body: zod1856.ZodObject<{
        userId: zod1856.ZodCoercedString<unknown>;
        data: zod1856.ZodRecord<zod1856.ZodAny, zod1856.ZodAny>;
      }, zod_v4_core264.$strip>;
      use: ((inputContext: better_call670.MiddlewareInputContext<better_call670.MiddlewareOptions>) => Promise<{
        session: {
          user: UserWithRole;
          session: _better_auth_core_db10.Session;
        };
      }>)[];
      metadata: {
        openapi: {
          operationId: string;
          summary: string;
          description: string;
          responses: {
            200: {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      user: {
                        $ref: string;
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };
    }, UserWithRole>;
    listUsers: better_call670.StrictEndpoint<"/admin/list-users", {
      method: "GET";
      use: ((inputContext: better_call670.MiddlewareInputContext<better_call670.MiddlewareOptions>) => Promise<{
        session: {
          user: UserWithRole;
          session: _better_auth_core_db10.Session;
        };
      }>)[];
      query: zod1856.ZodObject<{
        searchValue: zod1856.ZodOptional<zod1856.ZodString>;
        searchField: zod1856.ZodOptional<zod1856.ZodEnum<{
          name: "name";
          email: "email";
        }>>;
        searchOperator: zod1856.ZodOptional<zod1856.ZodEnum<{
          contains: "contains";
          starts_with: "starts_with";
          ends_with: "ends_with";
        }>>;
        limit: zod1856.ZodOptional<zod1856.ZodUnion<[zod1856.ZodString, zod1856.ZodNumber]>>;
        offset: zod1856.ZodOptional<zod1856.ZodUnion<[zod1856.ZodString, zod1856.ZodNumber]>>;
        sortBy: zod1856.ZodOptional<zod1856.ZodString>;
        sortDirection: zod1856.ZodOptional<zod1856.ZodEnum<{
          asc: "asc";
          desc: "desc";
        }>>;
        filterField: zod1856.ZodOptional<zod1856.ZodString>;
        filterValue: zod1856.ZodOptional<zod1856.ZodUnion<[zod1856.ZodUnion<[zod1856.ZodString, zod1856.ZodNumber]>, zod1856.ZodBoolean]>>;
        filterOperator: zod1856.ZodOptional<zod1856.ZodEnum<{
          eq: "eq";
          ne: "ne";
          lt: "lt";
          lte: "lte";
          gt: "gt";
          gte: "gte";
          contains: "contains";
        }>>;
      }, zod_v4_core264.$strip>;
      metadata: {
        openapi: {
          operationId: string;
          summary: string;
          description: string;
          responses: {
            200: {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      users: {
                        type: string;
                        items: {
                          $ref: string;
                        };
                      };
                      total: {
                        type: string;
                      };
                      limit: {
                        type: string;
                      };
                      offset: {
                        type: string;
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
      users: UserWithRole[];
      total: number;
    }>;
    listUserSessions: better_call670.StrictEndpoint<"/admin/list-user-sessions", {
      method: "POST";
      use: ((inputContext: better_call670.MiddlewareInputContext<better_call670.MiddlewareOptions>) => Promise<{
        session: {
          user: UserWithRole;
          session: _better_auth_core_db10.Session;
        };
      }>)[];
      body: zod1856.ZodObject<{
        userId: zod1856.ZodCoercedString<unknown>;
      }, zod_v4_core264.$strip>;
      metadata: {
        openapi: {
          operationId: string;
          summary: string;
          description: string;
          responses: {
            200: {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      sessions: {
                        type: string;
                        items: {
                          $ref: string;
                        };
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
      sessions: SessionWithImpersonatedBy[];
    }>;
    unbanUser: better_call670.StrictEndpoint<"/admin/unban-user", {
      method: "POST";
      body: zod1856.ZodObject<{
        userId: zod1856.ZodCoercedString<unknown>;
      }, zod_v4_core264.$strip>;
      use: ((inputContext: better_call670.MiddlewareInputContext<better_call670.MiddlewareOptions>) => Promise<{
        session: {
          user: UserWithRole;
          session: _better_auth_core_db10.Session;
        };
      }>)[];
      metadata: {
        openapi: {
          operationId: string;
          summary: string;
          description: string;
          responses: {
            200: {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      user: {
                        $ref: string;
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
      user: UserWithRole;
    }>;
    banUser: better_call670.StrictEndpoint<"/admin/ban-user", {
      method: "POST";
      body: zod1856.ZodObject<{
        userId: zod1856.ZodCoercedString<unknown>;
        banReason: zod1856.ZodOptional<zod1856.ZodString>;
        banExpiresIn: zod1856.ZodOptional<zod1856.ZodNumber>;
      }, zod_v4_core264.$strip>;
      use: ((inputContext: better_call670.MiddlewareInputContext<better_call670.MiddlewareOptions>) => Promise<{
        session: {
          user: UserWithRole;
          session: _better_auth_core_db10.Session;
        };
      }>)[];
      metadata: {
        openapi: {
          operationId: string;
          summary: string;
          description: string;
          responses: {
            200: {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      user: {
                        $ref: string;
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
      user: UserWithRole;
    }>;
    impersonateUser: better_call670.StrictEndpoint<"/admin/impersonate-user", {
      method: "POST";
      body: zod1856.ZodObject<{
        userId: zod1856.ZodCoercedString<unknown>;
      }, zod_v4_core264.$strip>;
      use: ((inputContext: better_call670.MiddlewareInputContext<better_call670.MiddlewareOptions>) => Promise<{
        session: {
          user: UserWithRole;
          session: _better_auth_core_db10.Session;
        };
      }>)[];
      metadata: {
        openapi: {
          operationId: string;
          summary: string;
          description: string;
          responses: {
            200: {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      session: {
                        $ref: string;
                      };
                      user: {
                        $ref: string;
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
      session: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        expiresAt: Date;
        token: string;
        ipAddress?: string | null | undefined;
        userAgent?: string | null | undefined;
      };
      user: UserWithRole;
    }>;
    stopImpersonating: better_call670.StrictEndpoint<"/admin/stop-impersonating", {
      method: "POST";
      requireHeaders: true;
    }, {
      session: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        expiresAt: Date;
        token: string;
        ipAddress?: string | null | undefined;
        userAgent?: string | null | undefined;
      } & Record<string, any>;
      user: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        emailVerified: boolean;
        name: string;
        image?: string | null | undefined;
      } & Record<string, any>;
    }>;
    revokeUserSession: better_call670.StrictEndpoint<"/admin/revoke-user-session", {
      method: "POST";
      body: zod1856.ZodObject<{
        sessionToken: zod1856.ZodString;
      }, zod_v4_core264.$strip>;
      use: ((inputContext: better_call670.MiddlewareInputContext<better_call670.MiddlewareOptions>) => Promise<{
        session: {
          user: UserWithRole;
          session: _better_auth_core_db10.Session;
        };
      }>)[];
      metadata: {
        openapi: {
          operationId: string;
          summary: string;
          description: string;
          responses: {
            200: {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      success: {
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
      success: boolean;
    }>;
    revokeUserSessions: better_call670.StrictEndpoint<"/admin/revoke-user-sessions", {
      method: "POST";
      body: zod1856.ZodObject<{
        userId: zod1856.ZodCoercedString<unknown>;
      }, zod_v4_core264.$strip>;
      use: ((inputContext: better_call670.MiddlewareInputContext<better_call670.MiddlewareOptions>) => Promise<{
        session: {
          user: UserWithRole;
          session: _better_auth_core_db10.Session;
        };
      }>)[];
      metadata: {
        openapi: {
          operationId: string;
          summary: string;
          description: string;
          responses: {
            200: {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      success: {
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
      success: boolean;
    }>;
    removeUser: better_call670.StrictEndpoint<"/admin/remove-user", {
      method: "POST";
      body: zod1856.ZodObject<{
        userId: zod1856.ZodCoercedString<unknown>;
      }, zod_v4_core264.$strip>;
      use: ((inputContext: better_call670.MiddlewareInputContext<better_call670.MiddlewareOptions>) => Promise<{
        session: {
          user: UserWithRole;
          session: _better_auth_core_db10.Session;
        };
      }>)[];
      metadata: {
        openapi: {
          operationId: string;
          summary: string;
          description: string;
          responses: {
            200: {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      success: {
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
      success: boolean;
    }>;
    setUserPassword: better_call670.StrictEndpoint<"/admin/set-user-password", {
      method: "POST";
      body: zod1856.ZodObject<{
        newPassword: zod1856.ZodString;
        userId: zod1856.ZodCoercedString<unknown>;
      }, zod_v4_core264.$strip>;
      use: ((inputContext: better_call670.MiddlewareInputContext<better_call670.MiddlewareOptions>) => Promise<{
        session: {
          user: UserWithRole;
          session: _better_auth_core_db10.Session;
        };
      }>)[];
      metadata: {
        openapi: {
          operationId: string;
          summary: string;
          description: string;
          responses: {
            200: {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      status: {
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
      status: boolean;
    }>;
    userHasPermission: better_call670.StrictEndpoint<"/admin/has-permission", {
      method: "POST";
      body: zod1856.ZodIntersection<zod1856.ZodObject<{
        userId: zod1856.ZodOptional<zod1856.ZodCoercedString<unknown>>;
        role: zod1856.ZodOptional<zod1856.ZodString>;
      }, zod_v4_core264.$strip>, zod1856.ZodUnion<readonly [zod1856.ZodObject<{
        permission: zod1856.ZodRecord<zod1856.ZodString, zod1856.ZodArray<zod1856.ZodString>>;
        permissions: zod1856.ZodUndefined;
      }, zod_v4_core264.$strip>, zod1856.ZodObject<{
        permission: zod1856.ZodUndefined;
        permissions: zod1856.ZodRecord<zod1856.ZodString, zod1856.ZodArray<zod1856.ZodString>>;
      }, zod_v4_core264.$strip>]>>;
      metadata: {
        openapi: {
          description: string;
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object";
                  properties: {
                    permission: {
                      type: string;
                      description: string;
                      deprecated: boolean;
                    };
                    permissions: {
                      type: string;
                      description: string;
                    };
                  };
                  required: string[];
                };
              };
            };
          };
          responses: {
            "200": {
              description: string;
              content: {
                "application/json": {
                  schema: {
                    type: "object";
                    properties: {
                      error: {
                        type: string;
                      };
                      success: {
                        type: string;
                      };
                    };
                    required: string[];
                  };
                };
              };
            };
          };
        };
        $Infer: {
          body: ({
            permission: { [key in keyof (O["ac"] extends AccessControl<infer S extends Statements> ? S : {
              readonly user: readonly ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "get", "update"];
              readonly session: readonly ["list", "revoke", "delete"];
            })]?: ((O["ac"] extends AccessControl<infer S extends Statements> ? S : {
              readonly user: readonly ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "get", "update"];
              readonly session: readonly ["list", "revoke", "delete"];
            })[key] extends readonly unknown[] ? (O["ac"] extends AccessControl<infer S extends Statements> ? S : {
              readonly user: readonly ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "get", "update"];
              readonly session: readonly ["list", "revoke", "delete"];
            })[key][number] : never)[] | undefined };
            permissions?: never | undefined;
          } | {
            permissions: { [key in keyof (O["ac"] extends AccessControl<infer S extends Statements> ? S : {
              readonly user: readonly ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "get", "update"];
              readonly session: readonly ["list", "revoke", "delete"];
            })]?: ((O["ac"] extends AccessControl<infer S extends Statements> ? S : {
              readonly user: readonly ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "get", "update"];
              readonly session: readonly ["list", "revoke", "delete"];
            })[key] extends readonly unknown[] ? (O["ac"] extends AccessControl<infer S extends Statements> ? S : {
              readonly user: readonly ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "get", "update"];
              readonly session: readonly ["list", "revoke", "delete"];
            })[key][number] : never)[] | undefined };
            permission?: never | undefined;
          }) & {
            userId?: string | undefined;
            role?: InferAdminRolesFromOption<O> | undefined;
          };
        };
      };
    }, {
      error: null;
      success: boolean;
    }>;
  };
  $ERROR_CODES: {
    readonly FAILED_TO_CREATE_USER: "Failed to create user";
    readonly USER_ALREADY_EXISTS: "User already exists.";
    readonly USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "User already exists. Use another email.";
    readonly YOU_CANNOT_BAN_YOURSELF: "You cannot ban yourself";
    readonly YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: "You are not allowed to change users role";
    readonly YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "You are not allowed to create users";
    readonly YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "You are not allowed to list users";
    readonly YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS: "You are not allowed to list users sessions";
    readonly YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "You are not allowed to ban users";
    readonly YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: "You are not allowed to impersonate users";
    readonly YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS: "You are not allowed to revoke users sessions";
    readonly YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "You are not allowed to delete users";
    readonly YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: "You are not allowed to set users password";
    readonly BANNED_USER: "You have been banned from this application";
    readonly YOU_ARE_NOT_ALLOWED_TO_GET_USER: "You are not allowed to get user";
    readonly NO_DATA_TO_UPDATE: "No data to update";
    readonly YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "You are not allowed to update users";
    readonly YOU_CANNOT_REMOVE_YOURSELF: "You cannot remove yourself";
    readonly YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: "You are not allowed to set a non-existent role value";
    readonly YOU_CANNOT_IMPERSONATE_ADMINS: "You cannot impersonate admins";
    readonly INVALID_ROLE_TYPE: "Invalid role type";
  };
  schema: {
    user: {
      fields: {
        role: {
          type: "string";
          required: false;
          input: false;
        };
        banned: {
          type: "boolean";
          defaultValue: false;
          required: false;
          input: false;
        };
        banReason: {
          type: "string";
          required: false;
          input: false;
        };
        banExpires: {
          type: "date";
          required: false;
          input: false;
        };
      };
    };
    session: {
      fields: {
        impersonatedBy: {
          type: "string";
          required: false;
        };
      };
    };
  };
  options: NoInfer<O>;
};
//#endregion
export { admin };
//# sourceMappingURL=admin.d.mts.map