import type { Request, Response } from 'express';
import { maintenance, maintenanceMiddleware } from './maintenance';

describe('maintenanceMiddleware', () => {
  const run = (method: string, path: string) => {
    const next = jest.fn();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    maintenanceMiddleware(
      { method, path } as Request,
      { status } as unknown as Response,
      next,
    );
    return { next, status, json };
  };

  afterEach(() => maintenance.end());

  it('fuori manutenzione lascia passare tutto', () => {
    expect(run('GET', '/api/v1/assets').next).toHaveBeenCalled();
  });

  it('in manutenzione blocca le API con 400 MAINTENANCE', () => {
    maintenance.start();
    const { next, status, json } = run('POST', '/api/v1/authModule/login');
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MAINTENANCE' }));
  });

  it('in manutenzione lascia passare /health e le preflight CORS', () => {
    maintenance.start();
    expect(run('GET', '/api/v1/health').next).toHaveBeenCalled();
    expect(run('GET', '/api/v1/health/version').next).toHaveBeenCalled();
    expect(run('OPTIONS', '/api/v1/assets').next).toHaveBeenCalled();
    expect(run('GET', '/api/v1/healthy').next).not.toHaveBeenCalled();
  });
});
