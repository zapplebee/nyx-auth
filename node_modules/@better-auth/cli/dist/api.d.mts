import { DBAdapter, DBAdapter as DBAdapter$1 } from "@better-auth/core/db/adapter";
import { BetterAuthOptions } from "@better-auth/core";

//#region src/generators/types.d.ts
interface SchemaGeneratorResult {
  code?: string;
  fileName: string;
  overwrite?: boolean;
  append?: boolean;
}
interface SchemaGenerator {
  <Options extends BetterAuthOptions>(opts: {
    file?: string;
    adapter: DBAdapter$1;
    options: Options;
  }): Promise<SchemaGeneratorResult>;
}
//#endregion
//#region src/generators/index.d.ts
declare const adapters: {
  prisma: SchemaGenerator;
  drizzle: SchemaGenerator;
  kysely: SchemaGenerator;
};
declare const generateSchema: (opts: {
  adapter: DBAdapter$1;
  file?: string;
  options: BetterAuthOptions;
}) => Promise<SchemaGeneratorResult> | Promise<{
  code: string;
  fileName: string;
  overwrite: boolean | undefined;
}>;
//#endregion
//#region src/generators/drizzle.d.ts
declare const generateDrizzleSchema: SchemaGenerator;
//#endregion
//#region src/generators/kysely.d.ts
declare const generateKyselySchema: SchemaGenerator;
//#endregion
//#region src/generators/prisma.d.ts
declare const generatePrismaSchema: SchemaGenerator;
//#endregion
export { type DBAdapter, type SchemaGenerator, type SchemaGeneratorResult, adapters, generateDrizzleSchema, generateKyselySchema, generatePrismaSchema, generateSchema };
//# sourceMappingURL=api.d.mts.map