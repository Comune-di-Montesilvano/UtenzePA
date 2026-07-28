import { generateHttpOptions } from './httpOptions';
import * as fs from 'fs';

jest.mock('fs');

describe('generateHttpOptions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return null key and cert when NODE_ENV is development', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_HTTPS_PROPRIETARY = 'true';

    const result = generateHttpOptions();

    expect(result).toEqual({ key: null, cert: null });
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('should return null key and cert when NODE_ENV is not set', () => {
    delete process.env.NODE_ENV;
    process.env.ENABLE_HTTPS_PROPRIETARY = 'true';

    const result = generateHttpOptions();

    expect(result).toEqual({ key: null, cert: null });
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('should return null key and cert when ENABLE_HTTPS_PROPRIETARY is not set', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_HTTPS_PROPRIETARY;

    const result = generateHttpOptions();

    expect(result).toEqual({ key: null, cert: null });
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('should read cert files when NODE_ENV is production and HTTPS is enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_HTTPS_PROPRIETARY = 'true';

    const mockKey = '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----';
    const mockCert = '-----BEGIN CERTIFICATE-----\nMOCK_CERT\n-----END CERTIFICATE-----';

    (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
      if (path === 'dist/cert/key.pem') return mockKey;
      if (path === 'dist/cert/cert.pem') return mockCert;
      return '';
    });

    const result = generateHttpOptions();

    expect(result).toEqual({ key: mockKey, cert: mockCert });
    expect(fs.readFileSync).toHaveBeenCalledWith('dist/cert/key.pem', 'utf8');
    expect(fs.readFileSync).toHaveBeenCalledWith('dist/cert/cert.pem', 'utf8');
  });

  it('should read cert files when NODE_ENV is staging and HTTPS is enabled', () => {
    process.env.NODE_ENV = 'staging';
    process.env.ENABLE_HTTPS_PROPRIETARY = 'true';

    const mockKey = 'staging-key';
    const mockCert = 'staging-cert';

    (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
      if (path === 'dist/cert/key.pem') return mockKey;
      if (path === 'dist/cert/cert.pem') return mockCert;
      return '';
    });

    const result = generateHttpOptions();

    expect(result).toEqual({ key: mockKey, cert: mockCert });
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });

  it('should return null when ENABLE_HTTPS_PROPRIETARY is falsy', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_HTTPS_PROPRIETARY = '';

    const result = generateHttpOptions();

    expect(result).toEqual({ key: null, cert: null });
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });
});
