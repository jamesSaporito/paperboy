import {
  Body,
  Controller,
  FileTypeValidator,
  HttpCode,
  HttpStatus,
  ParseFilePipe,
  Post,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { createSubmissionSchema, type CreateSubmissionInput } from "@paperboy/contracts";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES } from "./images";
import { SubmissionsService } from "./submissions.service";

@Controller("submissions")
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  /** Accepts multipart/form-data: a `text` field and up to MAX_IMAGES optional `images` files. */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  // Multer rejects files over MAX_IMAGE_BYTES (413) and more than MAX_IMAGES files (400) while
  // streaming, before anything is buffered in full.
  @UseInterceptors(
    FilesInterceptor("images", MAX_IMAGES, { limits: { fileSize: MAX_IMAGE_BYTES } }),
  )
  async create(
    @Body({ schema: createSubmissionSchema }) input: CreateSubmissionInput,
    @UploadedFiles(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          // Checks the file's magic number (via the file-type package), not just its mimetype.
          new FileTypeValidator({ fileType: IMAGE_TYPES }),
        ],
      }),
    )
    images: Express.Multer.File[] = [],
  ): Promise<void> {
    await this.submissions.create(
      input,
      images.map((image) => ({
        filename: image.originalname,
        contentType: image.mimetype,
        data: image.buffer,
      })),
    );
  }
}
