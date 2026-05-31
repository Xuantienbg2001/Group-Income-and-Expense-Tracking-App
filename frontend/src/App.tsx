import { useState, useRef } from 'react';
import { Users, UserPlus, Image as ImageIcon, DollarSign, ArrowRight, Loader2, RefreshCw, Upload, FileText } from 'lucide-react';

interface Debt {
  from: string;
  to: string;
  amount: number;
}

interface ScanResponse {
  success: boolean;
  invoiceTotal?: number;
  sharePerPerson?: number;
  shares?: Record<string, number>;
  memberCount?: number;
  debts?: Debt[];
  error?: string;
}

function App() {
  // State quản lý danh sách nhóm
  const [members, setMembers] = useState<string[]>(['Dat', 'Binh', 'An']);
  const [newMember, setNewMember] = useState('');
  
  // State quản lý luồng dữ liệu hóa đơn (PaidBy và File thực tế)
  const [paidBy, setPaidBy] = useState('Dat');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // State quản lý kết quả từ API
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hàm thêm thành viên mới vào nhóm
  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMember.trim() && !members.includes(newMember.trim())) {
      setMembers([...members, newMember.trim()]);
      setNewMember('');
    }
  };

  // Hàm xử lý khi người dùng chọn file ảnh hóa đơn
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      // Tạo đường dẫn tạm thời để hiển thị ảnh xem trước trên giao diện
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  // Hàm gọi Siêu API "Quét và Chia tiền" gửi kèm File thực tế
  const handleScanAndSplit = async () => {
    if (!selectedFile) {
      alert('Vui lòng chọn hoặc kéo thả file ảnh hóa đơn vào hệ thống!');
      return;
    }
    if (members.length < 2) {
      alert('Nhóm cần có ít nhất 2 thành viên để chia tiền!');
      return;
    }

    setLoading(true);
    setResult(null);

    // Vì có truyền file thực tế, ta bắt buộc phải dùng đối tượng FormData thay vì JSON thuần
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('members', JSON.stringify(members));
    formData.append('paidBy', paidBy);
    formData.append('splitFor', JSON.stringify(members)); // Mặc định chia đều cả nhóm

    try {
      const response = await fetch('https://group-income-and-expense-tracking-app.onrender.com/api/scan-and-split', {
        method: 'POST',
        body: formData, // Đẩy thẳng formData chứa file lên backend
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Lỗi kết nối API:', error);
      setResult({ success: false, error: 'Không thể kết nối tới Server Backend!' });
    } finally {
      setLoading(false);
    }
  };

  // Hàm định dạng tiền tệ VND
  const formatVND = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6 flex flex-col items-center">
      <header className="mb-8 text-center max-w-xl">
        <h1 className="text-3xl font-extrabold text-emerald-400 flex items-center justify-center gap-2 mb-2">
          <DollarSign className="w-8 h-8" /> Splitwise OCR App v2
        </h1>
        <p className="text-slate-400 text-sm">
          Tải ảnh hóa đơn thực tế lên, hệ thống AI tự động bóc tách và tối ưu hóa số nợ trong nhóm.
        </p>
      </header>

      <main className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* KHỐI BÊN TRÁI: CẤU HÌNH NHÓM & FILE ẢNH UPLOAD */}
        <div className="space-y-6">
          {/* 1. Lập nhóm */}
          <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-xl">
            <h2 className="text-lg font-semibold mb-4 text-emerald-400 flex items-center gap-2">
              <Users className="w-5 h-5" /> 1. Thành viên trong nhóm
            </h2>
            <form onSubmit={handleAddMember} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Nhập tên..."
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                aria-label="Tên thành viên mới"
                title="Nhập tên thành viên mới"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1 transition"
              >
                <UserPlus className="w-4 h-4" /> Thêm
              </button>
            </form>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
              {members.map((name) => (
                <span
                  key={name}
                  className="bg-slate-700 border border-slate-600 text-slate-200 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2"
                >
                  {name}
                  <button
                    onClick={() => setMembers(members.filter((m) => m !== name))}
                    className="text-slate-400 hover:text-rose-400 font-bold"
                    aria-label={`Xóa thành viên ${name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* 2. Thiết lập hóa đơn thực tế */}
          <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
              <ImageIcon className="w-5 h-5" /> 2. Thông tin hóa đơn
            </h2>
            
            {/* Vùng Upload Kéo Thả / Bấm Chọn file */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Tải ảnh hóa đơn lên (PNG, JPG)
              </label>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
                title="Chọn ảnh hóa đơn"
              />

              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-600 hover:border-emerald-500 bg-slate-900/50 rounded-xl p-5 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[140px]"
              >
                {previewUrl ? (
                  <div className="space-y-2 w-full flex flex-col items-center">
                    <img 
                      src={previewUrl} 
                      alt="Xem trước hóa đơn" 
                      className="max-h-32 object-contain rounded border border-slate-700 shadow"
                    />
                    <p className="text-xs text-slate-400 truncate max-w-[250px] flex items-center gap-1">
                      <FileText className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      {selectedFile?.name}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 text-slate-400">
                    <Upload className="w-8 h-8 mx-auto text-slate-500 animate-pulse" />
                    <p className="text-sm font-medium text-slate-300">Nhấp vào đây để chọn file ảnh</p>
                    <p className="text-xs text-slate-500">Hỗ trợ mọi ảnh chụp hóa đơn từ thiết bị của bạn</p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label id="paidby-label" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Ai đã trả tiền túi trước?
              </label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                aria-labelledby="paidby-label"
                title="Chọn người thanh toán hóa đơn"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-slate-300"
              >
                {members.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleScanAndSplit}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 font-semibold text-white py-3 rounded-lg flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-900/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Hệ thống đang xử lý ảnh thực tế...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" /> Quét &amp; Tự Động Chia Tiền
                </>
              )}
            </button>
          </div>
        </div>

        {/* KHỐI BÊN PHẢI: KẾT QUẢ HIỂN THỊ */}
        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-xl flex flex-col justify-between min-h-[350px]">
          <div>
            <h2 className="text-lg font-semibold mb-4 text-emerald-400">3. Kết quả xử lý</h2>
            
            {!loading && !result && (
              <div className="h-48 flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-xl text-slate-500">
                <p className="text-sm">Vui lòng tải ảnh hóa đơn lên và ấn nút chạy.</p>
              </div>
            )}

            {loading && (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400 space-y-2">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <p className="text-sm">AI đang bóc tách số tiền từ ảnh thực tế, vui lòng đợi...</p>
              </div>
            )}

            {!loading && result && (
              <div className="space-y-5">
                {result.success ? (
                  <>
                    <div className="bg-emerald-950/40 border border-emerald-800 p-4 rounded-lg flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-300">Tổng tiền quét được:</span>
                      <span className="text-xl font-bold text-emerald-400">
                        {formatVND(result.invoiceTotal || 0)}
                      </span>
                    </div>

                    {result.shares && result.memberCount && result.memberCount > 0 && (
                      <div className="bg-slate-900/60 border border-slate-700 p-4 rounded-lg">
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                          Chia đều {result.memberCount} người:
                        </h3>
                        <div className="space-y-1">
                          {Object.entries(result.shares).map(([name, amount]) => (
                            <div
                              key={name}
                              className="flex items-center justify-between text-sm text-slate-300"
                            >
                              <span>{name}</span>
                              <span className="font-semibold text-emerald-300">
                                {formatVND(amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Luồng tiền cần thanh toán lại:
                      </h3>
                      {result.debts && result.debts.length > 0 ? (
                        <div className="space-y-2">
                          {result.debts.map((debt, idx) => (
                            <div
                              key={idx}
                              className="bg-slate-900 border border-slate-750 p-3 rounded-lg flex items-center justify-between text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-rose-400">{debt.from}</span>
                                <ArrowRight className="w-4 h-4 text-slate-500" />
                                <span className="font-semibold text-emerald-400">{debt.to}</span>
                              </div>
                              <span className="font-bold text-slate-200">
                                {formatVND(debt.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 italic">Mọi người hòa nhau, không ai nợ ai!</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="bg-rose-950/40 border border-rose-800 p-4 rounded-lg text-sm text-rose-400">
                    <strong>Lỗi:</strong> {result.error || 'Đã xảy ra lỗi không xác định.'}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-center pt-4 border-t border-slate-700/50 text-[11px] text-slate-500">
            Powered by Multer, Tesseract.js &amp; Greedy Graph Algorithm
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;