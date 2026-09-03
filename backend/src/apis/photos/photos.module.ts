import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Photo } from './entity/photo.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { PhotosService } from './photos.service';
import { PhotosController } from './photos.controller';
import { ChunkedUploadModule } from '@common/chunked-upload/chunked-upload.module';

@Module({
  imports: [TypeOrmModule.forFeature([Photo, Asset, Utility]), ChunkedUploadModule],
  providers: [PhotosService],
  controllers: [PhotosController],
})
export class PhotosModule {}
