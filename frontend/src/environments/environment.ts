import { getRuntimeApiUrl } from './runtime-config';

export const environment = {
  production: false,
  apiUrl: getRuntimeApiUrl() || 'http://localhost:3000/api/v1',
  sentryDsn: ''
};
