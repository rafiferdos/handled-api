import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, Length, Matches } from 'class-validator';
import { WorkspaceRole } from '../../common/contracts/access-context.js';
import { MembershipStatus } from '../../generated/prisma/enums.js';
import { Optional, Trim } from '../../common/dto/input.js';
export class UpdateMemberDto {
  @ApiPropertyOptional({ enum: WorkspaceRole })
  @Optional()
  @IsEnum(WorkspaceRole)
  role?: WorkspaceRole;
  @ApiPropertyOptional({ enum: MembershipStatus })
  @Optional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
}
export class CreateInviteDto {
  @ApiProperty({ format: 'email', maxLength: 320 })
  @Trim()
  @IsEmail()
  @Length(3, 320)
  email: string;
  @ApiProperty({ enum: WorkspaceRole })
  @IsEnum(WorkspaceRole)
  role: WorkspaceRole;
}
export class AcceptInviteDto {
  @ApiProperty({ minLength: 43, maxLength: 43 })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token: string;
}
export class MemberResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty({ enum: WorkspaceRole }) role: WorkspaceRole;
  @ApiProperty({ enum: MembershipStatus }) status: MembershipStatus;
  @ApiProperty() email: string;
  @ApiProperty({ nullable: true }) displayName: string | null;
}
export class InviteResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: WorkspaceRole }) role: WorkspaceRole;
  @ApiProperty({ format: 'date-time' }) expiresAt: Date;
  @ApiProperty({ nullable: true, format: 'date-time' }) acceptedAt: Date | null;
  @ApiProperty({ nullable: true, format: 'date-time' }) revokedAt: Date | null;
}
export class IssuedInviteResponseDto extends InviteResponseDto {
  @ApiProperty({
    description: 'One-time delivery material; lists never return it.',
  })
  token: string;
}
