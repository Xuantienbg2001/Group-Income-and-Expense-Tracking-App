import express from 'express';
import type { Request, Response } from 'express';
import { calculateEqualSplit } from './logic';
import { extractInvoiceTotal } from './invoiceParser';
import { createWorker } from 'tesseract.js';
import path from 'path';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
const app = express();

app.use(express.json());
app.use(cors({
  origin: '*', // Cho phép tất cả các nguồn gọi tới (Hoặc bạn điền link vercel của bạn vào đây)
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const uploadDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    cb(null, uploadDir);
  },
  filename: (_, file, cb) => {
    const uniqueSuffix =
      Date.now() + '-' + Math.round(Math.random() * 1e9);

    cb(
      null,
      uniqueSuffix + path.extname(file.originalname)
    );
  }
});

const upload = multer({ storage });

// ==========================
// TESSERACT WORKER DÙNG CHUNG
// ==========================

const workerPromise = createWorker([
  'vie',
  'eng'
]);

app.get('/', (_, res) => {  res.send('Server is running just fine!');
});

app.post(
  '/api/scan-and-split',
  upload.single('file'),
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    let imagePath = '';

    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'Vui lòng upload ảnh hóa đơn'
        });
        return;
      }

      imagePath = req.file.path;

      const members: string[] = JSON.parse(
        req.body.members || '[]'
      );

      const splitFor: string[] = JSON.parse(
        req.body.splitFor || '[]'
      );

      const paidBy: string = req.body.paidBy;
      const participants =
        splitFor.length >= 2 ? splitFor : members;

      if (
        !paidBy ||
        members.length < 2 ||
        participants.length < 2
      ) {        res.status(400).json({
          success: false,
          error: 'Dữ liệu nhóm không hợp lệ'
        });
        return;
      }

      const worker =
        await workerPromise;

      const {
        data: { text }
      } = await worker.recognize(
        imagePath
      );

     console.log("===== OCR RAW TEXT =====");
     console.log(text);
     console.log("========================"); 

      const invoiceTotal =
        extractInvoiceTotal(text);

      if (invoiceTotal <= 0) {
        res.status(400).json({
          success: false,
          error:
            'Không thể nhận diện tổng tiền'
        });
        return;
      }

      const splitResult = calculateEqualSplit(
        invoiceTotal,
        paidBy,
        participants
      );

      res.json({
        success: true,
        invoiceTotal,
        sharePerPerson: splitResult.sharePerPerson,
        shares: splitResult.shares,
        memberCount: participants.length,
        debts: splitResult.debts,
        ocrText: text
      });    } catch (error: any) {
      console.error(error);

      res.status(500).json({
        success: false,
        error:
          error.message ||
          'Lỗi hệ thống'
      });
    } finally {
      if (
        imagePath &&
        fs.existsSync(imagePath)
      ) {
        try {
          fs.unlinkSync(imagePath);
        } catch {}
      }
    }
  }
);

export default app;