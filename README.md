# Tính dung lượng lưu trữ camera

Web tĩnh (HTML/CSS/JS thuần, không cần build) để ước tính dung lượng HDD cho NVR:
nhập số camera, độ phân giải, codec (H.264 / H.265 / H.265+), FPS, chế độ ghi và số ngày lưu,
web trả về số TB cần, băng thông ghi và gợi ý số ổ HDD Surveillance theo RAID và số khe NVR.

## Cấu trúc

| File | Vai trò |
|---|---|
| `index.html` | Bố cục trang, form nhập liệu |
| `style.css` | Giao diện, ưu tiên điện thoại (mobile-first), tự đổi theme tối |
| `calc.js` | Công thức và **bảng bitrate tham khảo**. Sửa số ở đây nếu có bitrate đo thực tế |
| `app.js` | Đọc form, gọi `calc.js`, hiển thị kết quả |
| `test/calc.test.js` | Kiểm tra công thức: `node test/calc.test.js` |

## Thông tin công ty và Xuất PDF

- Tên công ty và số điện thoại nằm ở **đầu file `app.js`** (hằng số `COMPANY`). Sửa ở đó là đổi cả header lẫn PDF.
- Ô **Tên công trình** và **Điện thoại liên hệ** của khách được lưu lại trên máy như các ô khác.
- Nút **Xuất PDF** mở hộp thoại In của trình duyệt với một trang báo cáo A4 riêng (công ty, SĐT, công trình, ngày,
  nhóm camera, kết quả, phương án HDD). Chọn "Lưu dưới dạng PDF" (máy tính/Android) hoặc Chia sẻ → "Lưu vào Tệp" (iPhone).
  Không dùng thư viện ngoài nên tiếng Việt có dấu luôn hiển thị đúng và chữ trong PDF chọn/copy được.

## Công thức

```
TB = Σ [số cam × bitrate (kbps) × 1000 ÷ 8 × 86 400 × số ngày × hệ số ghi] ÷ 10¹² × (1 + dự phòng)
```

- Bitrate mặc định (H.265, 25 fps): 2MP ≈ 2 Mbps, 4MP ≈ 3 Mbps, 5MP ≈ 4 Mbps, 8MP ≈ 6 Mbps.
  H.264 ×1,6; H.265+ ×0,5; FPS quy đổi tỉ lệ thuận. **Đây là giá trị ước tính.**
- Hệ số ghi = 1 (liên tục) hoặc % thời gian có chuyển động.
- "Dùng được" của mỗi ổ đã trừ ~3% định dạng. NVR hiển thị theo TiB (1 TB ≈ 0,909 TiB).

## Chạy thử trên máy

Mở thẳng file `index.html` bằng trình duyệt, không cần cài gì.
