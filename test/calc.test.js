// Chạy: node test/calc.test.js
const assert = require('assert');
const C = require('../calc.js');

// 1 cam 2MP H.265 25fps = 2048 kbps
assert.strictEqual(C.estimateBitrate('2MP', 'H.265', 25), 2048);
// H.264 ×1.6, 15 fps ×0.6
assert.strictEqual(C.estimateBitrate('2MP', 'H.264', 25), 3264);
assert.strictEqual(C.estimateBitrate('4MP', 'H.265+', 15), 896);

// 1 cam 2048 kbps, 30 ngày: 2048*1000/8*86400*30 = 663.552 GB
const g = C.groupStats({ count: 1, res: '2MP', codec: 'H.265', fps: 25, mode: 'continuous' }, 30);
assert.ok(Math.abs(g.tb - 0.663552) < 1e-9, g.tb);

// Ghi theo chuyển động 30% = 30% dung lượng
const m = C.groupStats({ count: 1, res: '2MP', codec: 'H.265', fps: 25, mode: 'motion', activity: 30 }, 30);
assert.ok(Math.abs(m.tb - 0.663552 * 0.3) < 1e-9);
// bitrate tùy chỉnh được ưu tiên
assert.strictEqual(C.groupStats({ count: 1, res: '8MP', codec: 'H.264', fps: 25, customKbps: 1000 }, 1).kbps, 1000);

// RAID
assert.deepStrictEqual(C.disksFor(10, 4, 'none').disks, 3);   // 3×3.88=11.64
assert.deepStrictEqual(C.disksFor(10, 4, 'raid5').disks, 4);
assert.deepStrictEqual(C.disksFor(10, 4, 'raid6').disks, 5);
assert.deepStrictEqual(C.disksFor(10, 4, 'raid1').disks, 6);
assert.deepStrictEqual(C.disksFor(1, 4, 'raid5').disks, 3);   // tối thiểu 3 ổ

// Ví dụ thực tế: 16 cam 2MP H.265 25fps, 30 ngày, dự phòng 10%, 4 khe
const r = C.calculate({
  days: 30, reservePct: 10, raid: 'none', slots: 4,
  groups: [{ name: 'A', count: 16, res: '2MP', codec: 'H.265', fps: 25, mode: 'continuous' }]
});
assert.ok(Math.abs(r.needTB - 0.663552 * 16 * 1.1) < 1e-9);   // ≈ 11.68 TB
// 8TB×2 = 15.52 dùng được ≥ 11.68 → gợi ý 2 ổ 8TB
assert.strictEqual(r.best.sizeTB, 8);
assert.strictEqual(r.best.disks, 2);
console.log('needTB', r.needTB.toFixed(2), 'best', r.best.sizeTB + 'TB ×' + r.best.disks);
console.log('OK, tất cả test đều qua');
