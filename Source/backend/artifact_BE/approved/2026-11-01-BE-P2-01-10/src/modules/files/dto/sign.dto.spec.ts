import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../../../app.setup.js';
import { SignUploadDto } from './sign.dto.js';

// CP-5 (BE-P2-07) · FILE-01, API-04, SignUploadDto wording (A2-5 area, auth.dto.ts style).
// A throwaway test controller (not FilesController/FilesModule — PLAN mục 1.4 keeps those
// out of drafted specs) mounted on a real Nest app, so the real ValidationPipe
// (transform:true, class-validator) actually rejects bad bodies end to end.

@Controller('t')
class SignDtoTestController {
  @Post('sign')
  sign(@Body() dto: SignUploadDto) {
    return dto;
  }
}

describe('CP-5 / BE-P2-07 / API-04: SignUploadDto validated by the real app pipeline', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [SignDtoTestController] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('scenario 8 (happy path): purpose=ROOM_IMAGE, roomId=42 (string from the wire) -> transform:true turns it into a number', async () => {
    const res = await http().post('/api/v1/t/sign').send({ purpose: 'ROOM_IMAGE', roomId: '42' });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ purpose: 'ROOM_IMAGE', roomId: 42 });
  });

  it('scenario 14: purpose=CCCD (not ROOM_IMAGE) -> 400 VALIDATION_FAILED, Vietnamese message', async () => {
    const res = await http().post('/api/v1/t/sign').send({ purpose: 'CCCD', roomId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.purpose).toBe('Mục đích tải ảnh không hợp lệ');
  });

  it('scenario 14: missing purpose -> 400 VALIDATION_FAILED + fields.purpose', async () => {
    const res = await http().post('/api/v1/t/sign').send({ roomId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.purpose).toBe('Mục đích tải ảnh không hợp lệ');
  });

  it('scenario 14: roomId=0 -> 400 VALIDATION_FAILED + fields.roomId (Min(1))', async () => {
    const res = await http().post('/api/v1/t/sign').send({ purpose: 'ROOM_IMAGE', roomId: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.roomId).toBe('Mã phòng không hợp lệ');
  });

  it('scenario 14: roomId="x" (not a number) -> 400 VALIDATION_FAILED + fields.roomId', async () => {
    const res = await http().post('/api/v1/t/sign').send({ purpose: 'ROOM_IMAGE', roomId: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.roomId).toBe('Mã phòng không hợp lệ');
  });

  it('scenario 24: every validation message on SignUploadDto is Vietnamese (same per-property style as auth.dto.ts: one message per decorator)', async () => {
    const res = await http().post('/api/v1/t/sign').send({});
    expect(res.status).toBe(400);
    const fields = res.body.error.fields as Record<string, string>;
    for (const message of Object.values(fields)) {
      expect(message).toMatch(/[À-ỹ]/); // contains a Vietnamese diacritic
    }
    expect(fields.purpose).toBe('Mục đích tải ảnh không hợp lệ');
    expect(fields.roomId).toBe('Mã phòng không hợp lệ');
  });
});
