/*
 * calc.js: phần "bộ não" tính toán, không đụng tới giao diện.
 * Tách riêng để dễ đọc, dễ sửa bảng bitrate và có thể test bằng Node.
 */
(function (root) {
  'use strict';

  // Bitrate tham khảo (kbps) cho H.265, 25 fps, VBR chất lượng cao, cảnh trung bình.
  // ĐÂY LÀ GIÁ TRỊ ƯỚC TÍNH. Sửa ở đây nếu anh có số đo thực tế.
  var BASE_KBPS_H265_25FPS = {
    '2MP': 2048,  // 1920x1080
    '4MP': 3072,  // 2560x1440
    '5MP': 4096,  // 2880x1620 / 2592x1944
    '8MP': 6144   // 3840x2160 (4K)
  };

  var RESOLUTION_LABELS = {
    '2MP': '2MP (1080p)',
    '4MP': '4MP (2K)',
    '5MP': '5MP',
    '8MP': '8MP (4K)'
  };

  // Hệ số so với H.265
  var CODEC_FACTOR = {
    'H.264': 1.6,
    'H.265': 1.0,
    'H.265+': 0.5   // H.265+ (Hikvision) / Smart H.265+ (Dahua), cảnh ít chuyển động
  };

  var REF_FPS = 25;
  var HDD_SIZES_TB = [2, 4, 6, 8, 10, 12, 16];
  var FORMAT_OVERHEAD = 0.03;          // ~3% mất khi format / hệ thống file của NVR
  var TB_TO_TIB = 1e12 / Math.pow(2, 40); // 1 TB ≈ 0.9095 TiB
  var SECONDS_PER_DAY = 86400;

  function round(n, step) { return Math.round(n / step) * step; }

  /** Bitrate ước tính (kbps) cho 1 camera. */
  function estimateBitrate(res, codec, fps) {
    var base = BASE_KBPS_H265_25FPS[res];
    var factor = CODEC_FACTOR[codec];
    if (!base || !factor || !(fps > 0)) return 0;
    return round(base * factor * (fps / REF_FPS), 64);
  }

  /** Tính cho 1 nhóm camera. */
  function groupStats(g, days) {
    var count = Math.max(0, Math.floor(Number(g.count) || 0));
    var custom = Number(g.customKbps);
    var kbps = custom > 0 ? custom : estimateBitrate(g.res, g.codec, Number(g.fps));
    var duty = g.mode === 'motion'
      ? Math.min(100, Math.max(0, Number(g.activity) || 0)) / 100
      : 1;
    var mbps = count * kbps / 1000;                               // băng thông đỉnh (lúc đang ghi)
    var bytesPerDay = count * kbps * 1000 / 8 * SECONDS_PER_DAY * duty;
    return {
      count: count,
      kbps: kbps,
      isCustom: custom > 0,
      duty: duty,
      mbps: mbps,
      gbPerDay: bytesPerDay / 1e9,
      tb: bytesPerDay * days / 1e12
    };
  }

  /**
   * Số ổ cần cho 1 size ổ, theo kiểu RAID.
   * Trả về { disks, usableTB, note }.
   */
  function disksFor(needTB, sizeTB, raid) {
    var per = sizeTB * (1 - FORMAT_OVERHEAD);
    var n = Math.max(1, Math.ceil(needTB / per - 1e-9)); // số ổ "chứa dữ liệu"
    var disks, usable, note = '';
    switch (raid) {
      case 'raid1':
        disks = 2 * n;
        usable = n * per;
        note = n > 1 ? 'RAID 10' : 'Mirror 2 ổ';
        break;
      case 'raid5':
        disks = Math.max(n + 1, 3);
        usable = (disks - 1) * per;
        note = 'Mất 1 ổ cho parity';
        break;
      case 'raid6':
        disks = Math.max(n + 2, 4);
        usable = (disks - 2) * per;
        note = 'Mất 2 ổ cho parity';
        break;
      default:
        disks = n;
        usable = n * per;
    }
    return { sizeTB: sizeTB, disks: disks, rawTB: disks * sizeTB, usableTB: usable, note: note };
  }

  /**
   * Tính toàn bộ.
   * state = { days, reservePct, raid, slots, groups: [...] }
   */
  function calculate(state) {
    var days = Math.max(0, Number(state.days) || 0);
    var reserve = Math.max(0, Number(state.reservePct) || 0) / 100;
    var slots = Math.max(1, Number(state.slots) || 1);

    var groups = (state.groups || []).map(function (g) {
      var s = groupStats(g, days);
      s.name = g.name;
      return s;
    });

    var dataTB = 0, mbps = 0, cams = 0, gbPerDay = 0;
    groups.forEach(function (s) {
      dataTB += s.tb; mbps += s.mbps; cams += s.count; gbPerDay += s.gbPerDay;
    });
    var needTB = dataTB * (1 + reserve);

    var options = needTB > 0
      ? HDD_SIZES_TB.map(function (size) {
          var o = disksFor(needTB, size, state.raid);
          o.fits = o.disks <= slots;
          return o;
        })
      : [];

    // Gợi ý: trong các phương án vừa số khe, ưu tiên size phổ biến 4–12TB
    // (giá/TB thường tốt nhất), rồi tổng dung lượng thô nhỏ nhất (ít lãng phí),
    // rồi ít ổ hơn (chừa khe mở rộng). 2TB/16TB chỉ chọn khi không còn cách khác.
    function tier(o) { return o.sizeTB >= 4 && o.sizeTB <= 12 ? 0 : 1; }
    var best = null;
    options.forEach(function (o) {
      if (!o.fits) return;
      if (!best ||
          tier(o) < tier(best) ||
          (tier(o) === tier(best) && (o.rawTB < best.rawTB ||
            (o.rawTB === best.rawTB && o.disks < best.disks)))) {
        best = o;
      }
    });

    var warnings = [];
    if (needTB > 0 && !best) {
      warnings.push('Không phương án nào vừa ' + slots + ' khe HDD. Cần NVR nhiều khe hơn, giảm số ngày lưu, dùng H.265+/ghi theo chuyển động, hoặc thêm NVR/storage.');
    }
    if (state.raid === 'raid5' && best && best.sizeTB >= 8) {
      warnings.push('RAID 5 với ổ ≥ 8TB: thời gian rebuild rất lâu, rủi ro hỏng ổ thứ 2 khi rebuild. Cân nhắc RAID 6.');
    }
    if (mbps > 160) {
      warnings.push('Băng thông ghi ' + mbps.toFixed(0) + ' Mbps: kiểm tra incoming bandwidth của NVR (dòng phổ thông thường 80–160 Mbps, dòng 16 khe lên 256–320 Mbps).');
    }
    groups.forEach(function (s) {
      if (s.count > 0 && s.duty < 1 && s.duty < 0.1) {
        warnings.push('Nhóm "' + s.name + '": % chuyển động rất thấp. Ghi theo sự kiện dễ bị đánh giá thiếu; nên tính dư cho pre/post-record và ban đêm (IR, côn trùng, mưa).');
      }
    });

    return {
      days: days,
      cams: cams,
      mbps: mbps,
      gbPerDay: gbPerDay,
      dataTB: dataTB,
      needTB: needTB,
      needTiB: needTB * TB_TO_TIB,
      groups: groups,
      options: options,
      best: best,
      warnings: warnings
    };
  }

  var api = {
    BASE_KBPS_H265_25FPS: BASE_KBPS_H265_25FPS,
    RESOLUTION_LABELS: RESOLUTION_LABELS,
    CODEC_FACTOR: CODEC_FACTOR,
    HDD_SIZES_TB: HDD_SIZES_TB,
    TB_TO_TIB: TB_TO_TIB,
    estimateBitrate: estimateBitrate,
    groupStats: groupStats,
    disksFor: disksFor,
    calculate: calculate
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CamCalc = api;
})(this);
