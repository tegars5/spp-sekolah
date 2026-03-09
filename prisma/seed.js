// prisma/seed.js
// Script untuk mengisi database awal (seeder), terutama membuat akun Admin
// yang diperlukan untuk login pertama kali.

const prisma = require('../src/lib/prisma');
const bcrypt = require('bcrypt');

async function main() {
  const adminEmail = 'admin@sekolah.com';
  const adminPassword = await bcrypt.hash('admin123', 10);

  // Gunakan upsert agar tidak error jika script dijalankan berkali-kali
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {}, // Jika sudah ada, jangan ubah apa-apa
    create: {
      email: adminEmail,
      password: adminPassword,
      role: 'ADMIN',
    },
  });
}

main()
  .catch(() => {
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });