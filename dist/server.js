"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const logic_1 = require("./logic");
const invoiceParser_1 = require("./invoiceParser");
const tesseract_js_1 = require("tesseract.js");
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)());
const uploadDir = path_1.default.join(__dirname, '../uploads');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir);
}
const storage = multer_1.default.diskStorage({
    destination: (_, __, cb) => {
        cb(null, uploadDir);
    },
    filename: (_, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const upload = (0, multer_1.default)({ storage });
// ==========================
// TESSERACT WORKER DÙNG CHUNG
// ==========================
const workerPromise = (0, tesseract_js_1.createWorker)([
    'vie',
    'eng'
]);
app.get('/', (_, res) => {
    res.send('Server is running just fine!');
});
app.post('/api/scan-and-split', upload.single('file'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const members = JSON.parse(req.body.members || '[]');
        const splitFor = JSON.parse(req.body.splitFor || '[]');
        const paidBy = req.body.paidBy;
        const participants = splitFor.length >= 2 ? splitFor : members;
        if (!paidBy ||
            members.length < 2 ||
            participants.length < 2) {
            res.status(400).json({
                success: false,
                error: 'Dữ liệu nhóm không hợp lệ'
            });
            return;
        }
        const worker = yield workerPromise;
        const { data: { text } } = yield worker.recognize(imagePath);
        console.log("===== OCR RAW TEXT =====");
        console.log(text);
        console.log("========================");
        const invoiceTotal = (0, invoiceParser_1.extractInvoiceTotal)(text);
        if (invoiceTotal <= 0) {
            res.status(400).json({
                success: false,
                error: 'Không thể nhận diện tổng tiền'
            });
            return;
        }
        const splitResult = (0, logic_1.calculateEqualSplit)(invoiceTotal, paidBy, participants);
        res.json({
            success: true,
            invoiceTotal,
            sharePerPerson: splitResult.sharePerPerson,
            shares: splitResult.shares,
            memberCount: participants.length,
            debts: splitResult.debts,
            ocrText: text
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            error: error.message ||
                'Lỗi hệ thống'
        });
    }
    finally {
        if (imagePath &&
            fs_1.default.existsSync(imagePath)) {
            try {
                fs_1.default.unlinkSync(imagePath);
            }
            catch (_a) { }
        }
    }
}));
exports.default = app;
