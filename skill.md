---
name: spp-backend-patterns
description: Arsitektur Backend SPP-Sekolah, integrasi Prisma 7, logika billing, dan implementasi Midtrans Payment Gateway.
origin: Project-SPP
---

# Backend Development Patterns - SPP Sekolah

Dokumen ini berisi standar koding dan pola arsitektur untuk sistem pembayaran SPP.

## Kapan Mengaktifkan Skill Ini

- Saat membuat API endpoint untuk Siswa, Tagihan (Invoice), atau Pembayaran.
- Saat melakukan manipulasi data menggunakan **Prisma 7** (menggunakan `prisma.config.js`).
- Saat mengimplementasikan logika **Billing Engine** (Generate tagihan bulanan).
- Saat melakukan integrasi **Midtrans Snap/Webhook**.
- Saat menangani validasi status transaksi keuangan.

## API Design Patterns

### 1. Controller Pattern (Express.js)
Gunakan pemisahan logika yang jelas. Controller hanya menangani request/response, logika bisnis ada di Service.

```javascript
// ✅ GOOD: Clean Controller
const createInvoice = async (req, res) => {
  try {
    const { studentId, feeCategoryId, month, year } = req.body;
    const result = await InvoiceService.generate(studentId, feeCategoryId, month, year);
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
}

2. Billing Engine Logic (Anti-Double Billing)
Selalu gunakan pemeriksaan unik sebelum men-generate tagihan baru untuk mencegah siswa ditagih dua kali di bulan yang sama.

JavaScript

// Logic di Service Layer
async function generateInvoice(studentId, feeId, month, year) {
  // Cek apakah invoice sudah ada
  const existing = await prisma.invoice.findUnique({
    where: {
      studentId_feeCategoryId_month_year: { studentId, feeCategoryId: feeId, month, year }
    }
  });

  if (existing) throw new Error("Tagihan untuk periode ini sudah ada.");
  
  // Buat invoice baru jika belum ada
  return prisma.invoice.create({
    data: { studentId, feeCategoryId: feeId, month, year, amount: feeAmount }
  });
}
Database Patterns (Prisma 7)
Query Optimization
Gunakan include untuk mengambil relasi data agar tidak terjadi N+1 query problem.

JavaScript

// ✅ GOOD: Mengambil data siswa beserta riwayat pembayarannya
const studentData = await prisma.student.findUnique({
  where: { id: studentId },
  include: {
    invoices: {
      include: { payments: true }
    }
  }
});
Transaction Pattern (Integritas Finansial)
Gunakan $transaction saat mengubah status pembayaran dan invoice secara bersamaan.

JavaScript

async function finalizePayment(invoiceId, paymentId, status) {
  return await prisma.$transaction([
    prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'SETTLEMENT' }
    }),
    prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'PAID' }
    })
  ]);
}
Payment Gateway Patterns (Midtrans)
1. Snap Token Generation
Pastikan orderId yang dikirim ke Midtrans bersifat unik dan mencerminkan ID internal.

JavaScript

const createSnapToken = async (paymentData) => {
  const parameter = {
    transaction_details: {
      order_id: paymentData.orderId,
      gross_amount: paymentData.amount,
    },
    customer_details: {
      first_name: paymentData.studentName,
    }
  };
  return await snap.createTransactionToken(parameter);
}
2. Webhook Security (Idempotency)
Webhook harus memeriksa status invoice saat ini sebelum melakukan update untuk menghindari pengolahan data yang sudah selesai.

JavaScript

// Validasi status sebelum update
if (currentInvoice.status === 'PAID') {
  return res.status(200).send('Already processed');
}
Error Handling Patterns
Centralized Response Format
Semua API harus mengembalikan format JSON yang konsisten.

JSON

{
  "success": false,
  "message": "Pesan error di sini",
  "error_code": "INVOICE_ALREADY_PAID"
}
Security & Validation
Auth: Gunakan Middleware untuk mengecek JWT Token sebelum akses data finansial.

Validation: Gunakan Joi atau Zod untuk memastikan amount selalu integer positif.

Hidden Config: Jangan pernah hardcode ServerKey Midtrans; panggil dari process.env.

Ingat: Backend SPP-Sekolah mengutamakan keakuratan data. Satu rupiah pun harus tercatat dengan benar di tabel Payment.


---

### Apa yang Berubah dari Versi Sebelumnya?
1. **Domain Specific**: Pola pencarian pasar (market) diubah menjadi pola pencarian dan pengelolaan **Siswa (Student)** dan **Tagihan (Invoice)**.
2. **Prisma 7 Ready**: Saya menyertakan logika pengecekan **Unique Constraint Ganda** (`studentId_feeCategoryId_month_year`) yang baru saja kita buat di `schema.prisma`.
3. **Midtrans Focused**: Menambahkan pola khusus untuk menangani **Snap Token** dan **Webhook**, yang merupakan jantung dari fitur pembayaran kamu.
4. **Idempotency**: Menambahkan catatan penting agar sistem tidak bingung jika Midtrans mengirim notifikasi berkali-kali.


### Langkah Selanjutnya:
1. Simpan kode di atas ke dalam file `SKILL.md` di root project kamu.
2. Setiap kali kamu minta bantuan AI, katakan: *"Gunakan pola yang ada di SKILL.md"*.

**Apakah filenya sudah berhasil diupdate, Kak?** Jika sudah, kita bisa lanjut membuat **ServiceLayer** pertama untuk fitur "Generate Invoice".