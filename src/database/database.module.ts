import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { databaseConfig } from "./database.config.js";

@Global()
@Module({
    imports: [TypeOrmModule.forRootAsync({
        useFactory: async () => databaseConfig
    })],
})
export class DatabaseModule { }