import type { DBMigrations } from "@effectstream/runtime";
import databaseSql from "./migrations/000-init.sql" with { type: "text" };
import shadowBidSql from "./migrations/001-shadowbid.sql" with { type: "text" };

export const migrationTable: DBMigrations[] = [
  {
    name: "000-init.sql",
    sql: databaseSql,
  },
  {
    name: "001-shadowbid.sql",
    sql: shadowBidSql,
  },
];
