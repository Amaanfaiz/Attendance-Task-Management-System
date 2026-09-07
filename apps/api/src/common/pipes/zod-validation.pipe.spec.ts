import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    email: z.string().email(),
    age: z.number().int().positive(),
  });
  const pipe = new ZodValidationPipe(schema);

  it('passes through and returns the parsed value when valid', () => {
    const result = pipe.transform({ email: 'a@b.com', age: 30 });
    expect(result).toEqual({ email: 'a@b.com', age: 30 });
  });

  it('rejects an invalid payload with a BadRequestException', () => {
    expect(() => pipe.transform({ email: 'not-an-email', age: -1 })).toThrow(
      BadRequestException,
    );
  });

  it('strips fields not defined in the schema rather than passing them through silently', () => {
    const result = pipe.transform({
      email: 'a@b.com',
      age: 30,
      role: 'ADMINISTRATOR',
    }) as Record<string, unknown>;
    expect(result.role).toBeUndefined();
  });
});
