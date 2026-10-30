import "reflect-metadata";
import { DataSource } from "typeorm";
import { AppConfig } from "../config/index.js";
import { ENTITIES } from "./database.config.js";

// Used by the TypeORM CLI (yarn typeorm / migration:*), run from the project root through tsx.
export const AppDataSource = new DataSource({
  type: "postgres",
  url: AppConfig.db.url,
  entities: ENTITIES,
  migrations: ["src/database/migrations/*.ts"],
  synchronize: false,
});
