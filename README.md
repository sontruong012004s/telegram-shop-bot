# 🤖 Telegram Shop Bot - Bán hàng tự động

Bot Telegram bán hàng tự động với thanh toán QR VietQR, quản lý kho, và đồng bộ Google Sheet.

## ✨ Tính năng

- 🛒 Danh sách sản phẩm theo danh mục
- 💳 Thanh toán QR VietQR (hỗ trợ 2 ngân hàng)
- 📦 Quản lý kho tự động (giao hàng khi xác nhận)
- 📊 Đồng bộ sản phẩm từ Google Sheet
- 🔧 Admin Panel đầy đủ
- 📢 Broadcast thông báo tới tất cả users
- 📈 Thống kê doanh thu

## ⚡ Cài đặt nhanh

### 1. Clone & cài đặt

```bash
git clone https://github.com/your-username/telegram-shop-bot.git
cd telegram-shop-bot
npm install
```

### 2. Tạo Bot Telegram

1. Mở Telegram, tìm **@BotFather**
2. Gửi `/newbot` → đặt tên bot → nhận **Bot Token**
3. Gửi `/myid` cho **@userinfobot** để lấy **Telegram ID** của bạn

### 3. Cấu hình

```bash
cp .env.example .env
```

Mở file `.env` và điền thông tin:

```env
BOT_TOKEN=1234567890:ABCdefGhIjKlMnOpQrS    # Token từ @BotFather
ADMIN_ID=123456789                            # Telegram ID admin

# Thông tin ngân hàng (tra mã BIN: https://www.vietqr.io/danh-sach-ngan-hang)
BANK_BIN=970422                  # Mã BIN (MB=970422, VCB=970436, TCB=970407...)
BANK_ACCOUNT=1234567890          # Số tài khoản
BANK_ACCOUNT_NAME=NGUYEN VAN A   # Tên chủ tài khoản (viết hoa, không dấu)
BANK_NAME=MB                     # Tên ngắn ngân hàng

# Thông tin shop
SHOP_NAME=My Shop
SUPPORT_CONTACT=@your_username
```

### 4. Chạy bot

```bash
npm start

# Hoặc dev mode (auto-restart khi sửa code):
npm run dev
```

## 📋 Lệnh người dùng

| Lệnh | Mô tả |
|-------|--------|
| `/start` | Bắt đầu / Khởi động lại |
| `/menu` | Thông tin tài khoản |
| `/product` | Danh sách sản phẩm |
| `/nap [số tiền]` | Nạp số dư |
| `/checkpay` | Kiểm tra thanh toán |
| `/support` | Hỗ trợ |
| `/myid` | ID của bạn |

## 🔧 Lệnh Admin

| Lệnh | Mô tả |
|-------|--------|
| `/admin` | Admin panel tổng quan |
| `/listproduct` | Xem tất cả sản phẩm |
| `/addproduct catID \| tên \| giá` | Thêm sản phẩm |
| `/editprice ID giá` | Sửa giá sản phẩm |
| `/editname ID tên` | Sửa tên sản phẩm |
| `/toggleproduct ID` | Bật/tắt sản phẩm |
| `/deleteproduct ID` | Xóa sản phẩm |
| `/addstock ID` | Thêm tài khoản vào kho |
| `/viewstock ID` | Xem kho sản phẩm |
| `/clearstock ID` | Xóa kho chưa bán |
| `/confirm orderID` | Xác nhận & giao hàng |
| `/pending` | Xem đơn hàng chờ |
| `/cancelorder orderID` | Hủy đơn hàng |
| `/orders` | Xem đơn hàng gần đây |
| `/stats` | Thống kê chi tiết |
| `/users` | Danh sách users |
| `/broadcast` | Gửi thông báo tới all users |
| `/sync` | Đồng bộ từ Google Sheet |

## 📦 Thêm hàng vào kho

1. Gửi `/addstock 1` (1 = product ID)
2. Gửi danh sách tài khoản (mỗi dòng 1 cái):
```
email1@example.com|password1|extra_info1
email2@example.com|password2|extra_info2
```

## 🔄 Flow mua hàng

1. Khách gõ `/product` → chọn sản phẩm
2. Chọn số lượng (1-10)
3. Chọn ngân hàng (nếu có 2 bank)
4. Bot gửi QR VietQR → khách quét mã thanh toán
5. Admin nhấn ✅ Xác nhận hoặc gõ `/confirm orderID`
6. Bot tự động gửi tài khoản cho khách

## 📊 Google Sheet Sync (tùy chọn)

Đồng bộ sản phẩm tự động từ Google Sheet:

1. Tạo Google Sheet với cột: `ID | Sản phẩm | Giá bán | Đơn vị | Số lượng kho | Còn hàng | Link liên hệ | Ghi chú`
2. **File → Chia sẻ → Xuất bản lên web → Xuất bản**
3. Copy Sheet ID từ URL: `docs.google.com/spreadsheets/d/[SHEET_ID]/edit`
4. Thêm vào `.env`:
```env
GOOGLE_SHEET_ID=your_sheet_id_here
SHEET_SYNC_INTERVAL=5
```
5. Restart bot — tự động sync mỗi 5 phút

## 🏦 Hỗ trợ 2 ngân hàng

Thêm ngân hàng thứ 2 vào `.env`:

```env
BANK2_BIN=970436
BANK2_ACCOUNT=9876543210
BANK2_ACCOUNT_NAME=NGUYEN VAN A
BANK2_NAME=VCB
```

Khách hàng sẽ được chọn ngân hàng khi thanh toán.

## 🛠 Tech Stack

- **Runtime**: Node.js
- **Bot Framework**: [Telegraf](https://github.com/telegraf/telegraf) v4
- **Database**: SQLite ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3))
- **QR Payment**: [VietQR API](https://vietqr.io/)

## 📁 Cấu trúc dự án

```
├── .env.example          # Mẫu cấu hình
├── package.json
├── data/                 # Database (tự tạo khi chạy)
└── src/
    ├── bot.js            # Entry point
    ├── config.js         # Load config từ .env
    ├── database.js       # SQLite schema & seed data
    ├── commands/          # Lệnh user (/start, /product, /nap...)
    ├── handlers/          # Xử lý callback & admin
    ├── services/          # Business logic
    └── utils/             # Keyboard & message templates
```

## 📜 License

MIT
