import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface VerifiedAuthUser {
  id: string;
  email: string;
  email_confirmed_at: string;
  user_metadata?: { full_name?: string; displayName?: string };
}

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  syncVerifiedUser(user: VerifiedAuthUser) {
    const email = user.email.trim().toLowerCase();
    return this.prisma.profile.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email,
        displayName:
          user.user_metadata?.displayName ?? user.user_metadata?.full_name,
        lastSeenAt: new Date(),
      },
      update: { email, lastSeenAt: new Date(), updatedAt: new Date() },
    });
  }
}
