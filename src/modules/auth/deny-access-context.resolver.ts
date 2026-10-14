import { Injectable } from '@nestjs/common';
import { AccessContextResolver } from '../../common/contracts/access-context.js';

@Injectable()
export class DenyAccessContextResolver extends AccessContextResolver {
  // Starter safety boundary. Replace via AuthModule's provider after SCRUM-32/40.
  authenticate(): Promise<null> {
    return Promise.resolve(null);
  }

  resolveMembership(): Promise<null> {
    return Promise.resolve(null);
  }
}
