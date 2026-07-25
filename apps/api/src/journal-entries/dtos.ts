import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';

export class CreateJournalEntryDto {
  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  reference?: string;
}

export class AddJournalLineDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @IsNumber()
  @Min(0)
  debit!: number;

  @IsNumber()
  @Min(0)
  credit!: number;

  @IsString()
  @IsOptional()
  description?: string;
}
