import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prismaClient: PrismaClient | undefined;
}

export const prisma = global.prismaClient ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prismaClient = prisma;
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}
