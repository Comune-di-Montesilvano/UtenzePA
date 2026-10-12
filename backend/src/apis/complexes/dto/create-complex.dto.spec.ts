import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateComplexDto } from './create-complex.dto';

describe('CreateComplexDto', () => {
  it('rifiuta un nome fatto di soli spazi', async () => {
    const errors = await validate(plainToInstance(CreateComplexDto, { name: '   ' }));
    expect(errors.map((e) => e.property)).toContain('name');
  });
});
