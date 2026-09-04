import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';

export const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(40).trim(),
});

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async profile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        emailVerified: true,
        isAdmin: true,
        createdAt: true,
        identities: { select: { provider: true, email: true, createdAt: true } },
      },
    });
    return user;
  }

  updateProfile(userId: string, dto: z.infer<typeof updateProfileSchema>) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { displayName: dto.displayName },
      select: { id: true, displayName: true },
    });
  }

  async unlinkProvider(userId: string, provider: string): Promise<void> {
    const [identities, user] = await this.prisma.$transaction([
      this.prisma.identity.findMany({ where: { userId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } }),
    ]);
    const remainingLogins =
      identities.filter((i) => i.provider !== provider).length + (user.passwordHash ? 1 : 0);
    if (remainingLogins < 1) {
      throw new BadRequestException(
        'Não é possível desvincular o único método de login. Defina uma senha antes.',
      );
    }
    await this.prisma.identity.deleteMany({ where: { userId, provider } });
  }

  /** Exportação de dados (LGPD/GDPR). Retorna um objeto JSON serializável. */
  async exportData(userId: string) {
    const [user, wishlist, notifications, devices, audit] = await this.prisma.$transaction([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          emailVerified: true,
          createdAt: true,
          identities: { select: { provider: true, providerUid: true, email: true } },
          notificationPref: true,
        },
      }),
      this.prisma.wishlistItem.findMany({ where: { userId } }),
      this.prisma.notification.findMany({ where: { userId }, take: 1000, orderBy: { createdAt: 'desc' } }),
      this.prisma.device.findMany({ where: { userId }, select: { platform: true, createdAt: true } }),
      this.prisma.auditLog.findMany({
        where: { actorId: userId },
        take: 500,
        orderBy: { createdAt: 'desc' },
        select: { action: true, createdAt: true, ip: true },
      }),
    ]);
    return { exportedAt: new Date().toISOString(), user, wishlist, notifications, devices, audit };
  }

  /** Exclusão de conta: apaga tudo por cascade e revoga sessões. */
  async deleteAccount(userId: string): Promise<void> {
    await this.tokens.revokeAllForUser(userId);
    await this.prisma.user.delete({ where: { id: userId } });
  }
}
