import { IsIn } from 'class-validator';

export class SdiDocumentQueryDto {
  @IsIn(['xml', 'pdf'], { message: 'Il tipo deve essere xml o pdf' })
  type: 'xml' | 'pdf';
}
