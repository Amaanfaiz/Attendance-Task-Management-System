import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  await prisma.appSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });

  const engineering = await prisma.department.upsert({
    where: { name: 'Engineering' },
    create: { name: 'Engineering' },
    update: {},
  });

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@atms.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!Change';
  const adminPasswordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      firstName: 'System',
      surname: 'Administrator',
      email: adminEmail,
      phoneNumber: '0000000000',
      passwordHash: adminPasswordHash,
      role: 'ADMINISTRATOR',
      status: 'ACTIVE',
      departmentId: engineering.id,
    },
    update: {},
  });

  const employeeEmail = process.env.SEED_EMPLOYEE_EMAIL ?? 'employee@atms.local';
  const employeePassword = process.env.SEED_EMPLOYEE_PASSWORD ?? 'Employee123!Change';
  const employeePasswordHash = await argon2.hash(employeePassword, { type: argon2.argon2id });

  const employee = await prisma.user.upsert({
    where: { email: employeeEmail },
    create: {
      firstName: 'Demo',
      surname: 'Employee',
      email: employeeEmail,
      phoneNumber: '1111111111',
      passwordHash: employeePasswordHash,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      departmentId: engineering.id,
      approvedById: admin.id,
      approvedAt: new Date(),
    },
    update: {},
  });

  const existingSeedTasks = await prisma.task.count({ where: { createdById: admin.id } });
  if (existingSeedTasks === 0) {
    await prisma.task.create({
      data: {
        title: 'Prepare sprint demo',
        description: 'Pull together the sprint demo walkthrough.',
        priority: 'HIGH',
        status: 'TO_DO',
        assigneeId: employee.id,
        createdById: admin.id,
        estimatedMinutes: 120,
      },
    });

    await prisma.task.create({
      data: {
        title: 'Review pull requests',
        priority: 'MEDIUM',
        status: 'TO_DO',
        assigneeId: employee.id,
        createdById: admin.id,
        estimatedMinutes: 60,
      },
    });
  }

  console.log('Seed complete:');
  console.log(`  Admin:    ${adminEmail} / ${adminPassword}`);
  console.log(`  Employee: ${employeeEmail} / ${employeePassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
