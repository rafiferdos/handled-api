import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import { assertIdentity } from '../../common/database/workspace-actor.js';
import type { VerifiedIdentity } from '../../common/database/workspace-actor.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { BootstrapProfileDto } from './profile.dto.js';

export const profileSelect = {
  id: true,
  email: true,
  displayName: true,
} as const;

@Injectable()
export class ProfileService {
  constructor(@Inject(UnitOfWork) private readonly uow: UnitOfWork) {}
  bootstrap(identity: VerifiedIdentity, input: BootstrapProfileDto) {
    return this.uow.runAs(identity, async (tx) => {
      const trusted = await assertIdentity(tx, identity);
      return tx.profile.upsert({
        where: { id: trusted.id },
        create: {
          id: trusted.id,
          email: trusted.email,
          displayName: input.displayName,
        },
        update: {
          email: trusted.email,
          ...(input.displayName !== undefined
            ? { displayName: input.displayName }
            : {}),
        },
        select: profileSelect,
      });
    });
  }
  read(identity: VerifiedIdentity) {
    return this.uow.runAs(identity, async (tx) => {
      const trusted = await assertIdentity(tx, identity);
      const profile = await tx.profile.findUnique({
        where: { id: trusted.id },
        select: profileSelect,
      });
      if (!profile) throw new AppException('RESOURCE_NOT_FOUND');
      return { ...profile, email: trusted.email };
    });
  }
}
