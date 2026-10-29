import { Test } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';
import { PrismaModule } from './prisma.module.js';
import { AppModule } from '../../app.module.js';

// The real PrismaService is built from the generated client (it does not connect
// until the first query). Only the DB edge ($disconnect) is replaced with a spy.
describe('BE-LOGIN-05: PrismaService', () => {
  it('BE-LOGIN-05: onModuleDestroy calls $disconnect exactly once and awaits it', async () => {
    const service = new PrismaService();
    let finished = false;
    const spy = vi.spyOn(service, '$disconnect').mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      finished = true;
    });

    await service.onModuleDestroy();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(finished).toBe(true);
  });

  it('BE-LOGIN-05: onModuleDestroy rejects when $disconnect fails (error is not swallowed)', async () => {
    const service = new PrismaService();
    vi.spyOn(service, '$disconnect').mockRejectedValue(new Error('boom'));

    await expect(service.onModuleDestroy()).rejects.toThrow('boom');
  });

  it('BE-LOGIN-05: lazy connection, there is no onModuleInit / $connect on boot', () => {
    expect(
      (PrismaService.prototype as unknown as Record<string, unknown>)
        .onModuleInit,
    ).toBeUndefined();
  });

  it('BE-LOGIN-05: is a real PrismaClient (has model delegates and $disconnect)', () => {
    const service = new PrismaService();
    expect(typeof service.$disconnect).toBe('function');
    expect(typeof service.user.findFirst).toBe('function');
  });

  it('BE-LOGIN-05: PrismaModule is global and exports PrismaService', () => {
    expect(Reflect.getMetadata('__module:global__', PrismaModule)).toBe(true);
    expect(Reflect.getMetadata('exports', PrismaModule)).toEqual([
      PrismaService,
    ]);
    expect(Reflect.getMetadata('providers', PrismaModule)).toEqual([
      PrismaService,
    ]);
  });

  it('BE-LOGIN-05: AppModule imports only PrismaModule (no controllers, no providers)', () => {
    expect(Reflect.getMetadata('imports', AppModule)).toEqual([PrismaModule]);
    expect(Reflect.getMetadata('controllers', AppModule)).toBeUndefined();
    expect(Reflect.getMetadata('providers', AppModule)).toBeUndefined();
  });

  it('BE-LOGIN-05: AppModule compiles and closes without a DB; shutdown disconnects once', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const prisma = moduleRef.get(PrismaService);
    const spy = vi.spyOn(prisma, '$disconnect').mockResolvedValue();

    await moduleRef.init();
    expect(spy).not.toHaveBeenCalled();
    await moduleRef.close();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
