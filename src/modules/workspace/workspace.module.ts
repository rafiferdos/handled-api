import { MembershipService } from './membership.service.js';
import { InvitationService } from './invitation.service.js';
import {
  MembershipController,
  InviteAcceptController,
} from './membership.controller.js';
import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service.js';
import { WorkspaceController } from './workspace.controller.js';
@Module({
  controllers: [
    WorkspaceController,
    MembershipController,
    InviteAcceptController,
  ],
  providers: [WorkspaceService, MembershipService, InvitationService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
