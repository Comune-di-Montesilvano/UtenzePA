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
          // TypeORM 1.0 di default lancia un errore ('throw') se null/undefined
          // finiscono in una condizione where object-criteria (find*/update/
          // delete/query builder .where(objectLiteral) — non tocca le condizioni
          // stringa con parametri bind, es. qb.where('x = :y', {...})). In
          // precedenza qui c'era `invalidWhereValuesBehavior: {null: 'ignore',
          // undefined: 'ignore'}` come escape hatch introdotto al bump — un
          // audit completo di ogni where/delete/update/findOne su repository in
          // backend/src/apis/**, src/data-importer/** e src/core/** (nessun uso
          // lì) ha verificato che ogni valore usato in una where object-criteria
          // è o una costante, o un id/parametro già validato da un DTO
          // class-validator (`@IsNotEmpty`) o da un lookup interno con guardia
          // esplicita `if (!value)`/`if (value)` prima della query — quindi il
          // comportamento permissivo non serve più. È l'opzione DataSource-level
          // di TypeORM 1.1.0 (nessun override granulare per singola query
          // disponibile, verificato in OrmUtils/SelectQueryBuilder), quindi si
          // applica identica a ogni query dell'app: nessun altro punto emerso
          // dall'audit dipendeva dal comportamento 'ignore'. Un solo gap reale
          // trovato e corretto nello stesso giro: CreateAssetAggregatorDto.code
          // era @IsOptional() nonostante la colonna DB fosse
          // `nullable: false, unique: true`, ora è obbligatorio nel DTO.
          // Default TypeORM ('throw' su entrambi) non va quindi più aggirato.
        };
      },

      // Specifica che InfisicalConfigService deve essere iniettato in useFactory
      inject: [InfisicalConfigService],
    }),
  ],
  // Non sono necessari exports, TypeOrmModule gestisce l'esposizione dei Repository
})
export class MySqlModule {}
