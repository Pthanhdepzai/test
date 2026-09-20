# INKRUN online

Game bắn súng cartoon, giờ chơi PvP online với bạn bè (không còn bot).

## Chạy thử trên máy
```
npm install
npm start
```
Mở http://localhost:3000 — mở 2 tab cùng tên phòng để thử.

## Đưa lên Render
1. Đẩy nguyên thư mục này lên một repo GitHub (nhớ có `public/index.html`, `server.js`, `package.json`).
2. Vào render.com → **New +** → **Web Service** → chọn repo.
3. Runtime: **Node** · Build Command: `npm install` · Start Command: `npm start` · Instance: **Free**.
4. Deploy xong sẽ có link dạng `https://ten-app.onrender.com`.
5. Cả hai vào link đó, gõ **cùng tên phòng** (hoặc gửi link `https://ten-app.onrender.com/?room=abc` cho bạn) là chơi chung.

Lưu ý bản Free: không ai vào ~15 phút thì server ngủ, lần vào kế tiếp mất khoảng 30–60 giây để dậy.

## Điều khiển
WASD chạy · Space nhảy · Shift dash · C/Ctrl trượt · Chuột trái bắn · Chuột phải ngắm · 1–4 đổi súng · R nạp đạn · **Tab bảng điểm**

## Ghi chú
- Mỗi phòng tối đa 8 người. Phòng trống tự xoá.
- Sát thương do máy người bị bắn tự tính → đủ chơi với bạn bè, không chống hack.
- Chỉnh độ "trâu" của người chơi: đổi `PVP_DMG` trong `public/index.html` (1 = như cũ, 0.7 = chết chậm hơn).
