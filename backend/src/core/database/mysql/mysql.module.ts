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
        // Controlla se l'ambiente è 'development'. Deve essere impostato tramite process.env
        const isDevelopment = process.env.NODE_ENV === 'development';

        const baseConfig: TypeOrmModuleOptions = {
          type: 'mysql',
          database: 'mydatabase',
          logging: ['error', 'warn'],
          autoLoadEntities: true,
          synchronize: process.env.SYNCHRONIZE === 'true',
          dropSchema: process.env.DROPSCHEMA === 'true',
        };

        if (isDevelopment) {
          console.log('--- Using Local Development MySQL Config ---');

          return {
            ...baseConfig,
            host: 'mysql',
            port: 3306,
            username: 'root',
            password: 'password',
          };
        }

        // Configurazione per ambiente di PRODUZIONE
        console.log('--- Using Production MySQL Config ---');
        return {
          ...baseConfig,
          host: process.env.DB_HOST || 'mysql',
          port: parseInt(process.env.DB_PORT || '3306'),
          username: process.env.DB_USERNAME || 'root',
          password: process.env.DB_PASSWORD || 'password',
          synchronize: process.env.IMPORT_DATA === 'true',
          dropSchema: process.env.IMPORT_DATA === 'true',
        };
      },

      // Specifica che InfisicalConfigService deve essere iniettato in useFactory
      inject: [InfisicalConfigService],
    }),
  ],
  // Non sono necessari exports, TypeOrmModule gestisce l'esposizione dei Repository
})
export class MySqlModule {}
