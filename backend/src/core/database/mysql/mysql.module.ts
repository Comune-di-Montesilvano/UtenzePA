import { Module, Global } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { InfisicalConfigService } from '../../infisical/infisical-config.service';

@Global() // Rende il modulo disponibile in tutta l'applicazione
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      // Il modulo Infisical deve essere importato qui se non è già @Global()
      // imports: [InfisicalModule],

      useFactory: (_infisicalConfig: InfisicalConfigService): TypeOrmModuleOptions => {
        // Stesse variabili in ogni ambiente: chi orchestra il container (compose)
        // passa sempre MYSQL_HOST/MYSQL_PORT/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DB.
        return {
          type: 'mysql',
          host: process.env.MYSQL_HOST || 'mysql',
          port: parseInt(process.env.MYSQL_PORT || '3306'),
          username: process.env.MYSQL_USER || 'root',
          password: process.env.MYSQL_PASSWORD || 'password',
          database: process.env.MYSQL_DB || 'mydatabase',
          logging: ['error', 'warn'],
          autoLoadEntities: true,
          migrations: [`${__dirname}/../../../database/migrations/*.{ts,js}`],
          migrationsRun: true,
          // Escape hatch per iterazione rapida in dev (mai in produzione: bypassa le migration).
          synchronize: process.env.SYNCHRONIZE === 'true' || process.env.IMPORT_DATA === 'true',
          dropSchema: process.env.DROPSCHEMA === 'true' || process.env.IMPORT_DATA === 'true',
        };
      },

      // Specifica che InfisicalConfigService deve essere iniettato in useFactory
      inject: [InfisicalConfigService],
    }),
  ],
  // Non sono necessari exports, TypeOrmModule gestisce l'esposizione dei Repository
})
export class MySqlModule {}
