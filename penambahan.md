Rencana Penambahan Fitur Login (Admin & Student)
Sesuai dengan standar architect.md dan skill.md, kita akan menambahkan sistem keamanan berbasis JWT (JSON Web Token). Berikut adalah gambaran penambahannya:

1. Perubahan pada Database (Prisma)
   Kita perlu menambahkan kolom password dan role pada model User atau Student di schema.prisma agar bisa menyimpan kredensial login.

2. Penambahan Auth Layer
   Kita akan membuat folder dan file baru untuk menangani keamanan:

src/services/AuthService.js: Menangani logika pengecekan password (menggunakan bcrypt) dan pembuatan token JWT.

src/middlewares/authMiddleware.js: Berfungsi sebagai "satpam" yang mengecek apakah token yang dikirim valid sebelum mengizinkan akses ke API tagihan atau pembayaran.

3. Pemisahan Hak Akses (RBAC)
   Berdasarkan prinsip Role-Based Access Control di skill.md:

Admin: Bisa mengakses semua API (Input siswa, bulk generate tagihan, cek semua laporan).

Student: Hanya bisa melihat tagihan miliknya sendiri dan melakukan pembayaran.

Checklist Keamanan Selanjutnya
Jika Kakak ingin melanjutkan ke fitur Login, ini yang perlu kita siapkan:

[ ] Menginstal library bcrypt untuk enkripsi password.

[ ] Menginstal library jsonwebtoken untuk membuat token login.

[ ] Membuat endpoint POST /api/auth/login.

[ ] Melindungi route sensitif (seperti /api/invoices/bulk) agar hanya bisa diakses Admin.
