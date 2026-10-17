import { IsString } from 'class-validator';

export class RegisterDto {
  @IsString()
  full_name: string;
  @IsString()
  password: string;
  @IsString()
  email: string;
}
