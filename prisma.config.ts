import { defineConfig, env } from "prisma/config";
import { loadLocalEnv } from "./backend/src/config/load-local-env";

loadLocalEnv();

export default defineConfig({
  schema: "backend/prisma/schema.prisma",
  migrations: {
    path: "backend/prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
