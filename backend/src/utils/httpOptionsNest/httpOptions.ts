import { readFileSync } from 'fs';

export const generateHttpOptions = () => {
  return process.env.NODE_ENV &&
    process.env.NODE_ENV !== 'development' &&
    process.env.ENABLE_HTTPS_PROPRIETARY
    ? {
        key: readFileSync('dist/cert/key.pem', 'utf8'),
        cert: readFileSync('dist/cert/cert.pem', 'utf8'),
      }
    : { key: null, cert: null };
};
