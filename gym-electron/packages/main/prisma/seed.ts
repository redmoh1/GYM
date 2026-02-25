import { PrismaClient } from '@prisma/client';
import { addMonths, subDays } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  await prisma.setting.upsert({ where: { key: 'expiringSoonDays' }, update: {}, create: { key: 'expiringSoonDays', value: '7' } });
  await prisma.setting.upsert({ where: { key: 'currency' }, update: {}, create: { key: 'currency', value: 'EGP' } });
  await prisma.setting.upsert({ where: { key: 'gymName' }, update: {}, create: { key: 'gymName', value: 'Pro Gym' } });
  await prisma.setting.upsert({ where: { key: 'deviceIp' }, update: {}, create: { key: 'deviceIp', value: '' } });
  await prisma.setting.upsert({ where: { key: 'devicePort' }, update: {}, create: { key: 'devicePort', value: '4370' } });
  await prisma.setting.upsert({ where: { key: 'deviceName' }, update: {}, create: { key: 'deviceName', value: 'ZKTeco K40' } });
  await prisma.setting.upsert({
    where: { key: 'enableDeviceListener' },
    update: {},
    create: { key: 'enableDeviceListener', value: 'true' },
  });

  const monthly = await prisma.plan.upsert({
    where: { name: 'Monthly' },
    update: { months: 1, price: 450 },
    create: { name: 'Monthly', months: 1, price: 450 },
  });

  const quarterly = await prisma.plan.upsert({
    where: { name: 'Quarterly' },
    update: { months: 3, price: 1200 },
    create: { name: 'Quarterly', months: 3, price: 1200 },
  });

  const yearly = await prisma.plan.upsert({
    where: { name: 'Yearly' },
    update: { months: 12, price: 4200 },
    create: { name: 'Yearly', months: 12, price: 4200 },
  });

  const count = await prisma.member.count();
  if (count > 0) return;

  const now = new Date();
  const samples = [
    { fullName: 'أحمد علي', phone: '01000000001', startDate: subDays(now, 50), months: 2, planId: quarterly.id },
    { fullName: 'محمد حسن', phone: '01000000002', startDate: subDays(now, 20), months: 1, planId: monthly.id },
    { fullName: 'سارة خالد', phone: '01000000003', startDate: subDays(now, 5), months: 1, planId: monthly.id },
    { fullName: 'نور أشرف', phone: '01000000004', startDate: subDays(now, 370), months: 12, planId: yearly.id },
    { fullName: 'مصطفى عمر', phone: '01000000005', startDate: subDays(now, 10), months: 3, planId: quarterly.id },
  ];

  for (const item of samples) {
    const endDate = addMonths(item.startDate, item.months);
    await prisma.member.create({
      data: {
        fullName: item.fullName,
        phone: item.phone,
        startDate: item.startDate,
        durationMonths: item.months,
        endDate,
        notes: '',
        planId: item.planId,
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
