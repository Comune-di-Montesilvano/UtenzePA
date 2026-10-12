import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { CreateBackupDto } from './create-backup.dto';

// @Type(() => Boolean) trasformava la stringa "false" in true.
describe('CreateBackupDto', () => {
  it.each([
    [true, true],
    [false, false],
    ['true', true],
    ['false', false],
    [undefined, undefined],
  ])('%p → %p', (input, expected) => {
    const dto = plainToInstance(CreateBackupDto, {
      includePhotos: input,
      includeAttachments: input,
    });
    expect(dto.includePhotos).toBe(expected);
    expect(dto.includeAttachments).toBe(expected);
  });
});
