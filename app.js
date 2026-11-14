/*
 * app.js: phần giao diện: đọc form, gọi CamCalc.calculate(), hiển thị kết quả.
 * Mọi thay đổi trong form đều tính lại ngay, không cần bấm nút.
 */
(function () {
  'use strict';

  // ===== THÔNG TIN CÔNG TY: sửa ở đây, hiện trên đầu trang và trên PDF =====
  var COMPANY = {
    name: 'Sao Mai Smartek',
    phone: '0902 209 698'
  };
  // =========================================================================

  var C = window.CamCalc;
  var STORAGE_KEY = 'camcalc-v1';
  var groupsEl = document.getElementById('groups');
  var tpl = document.getElementById('group-tpl');
  var $ = function (id) { return document.getElementById(id); };

  var nf1 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
  var nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

  function defaultGroup(i) {
    return { name: 'Nhóm ' + i, count: 8, res: '2MP', codec: 'H.265', fps: 25, mode: 'continuous', activity: 30, customKbps: '' };
  }

  // ---------- Tạo / đọc 1 nhóm camera ----------
  function fillSelect(sel, values, labels) {
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v;
      o.textContent = labels ? labels[v] : v;
      sel.appendChild(o);
    });
  }

  function addGroup(data) {
    var node = tpl.content.firstElementChild.cloneNode(true);
    fillSelect(node.querySelector('.g-res'), Object.keys(C.BASE_KBPS_H265_25FPS), C.RESOLUTION_LABELS);
    fillSelect(node.querySelector('.g-codec'), Object.keys(C.CODEC_FACTOR));

    node.querySelector('.g-name').value = data.name;
    node.querySelector('.g-count').value = data.count;
    node.querySelector('.g-res').value = data.res;
    node.querySelector('.g-codec').value = data.codec;
    node.querySelector('.g-fps').value = String(data.fps);
    node.querySelector('.g-mode').value = data.mode;
    node.querySelector('.g-activity').value = data.activity;
    node.querySelector('.g-custom').value = data.customKbps || '';

    node.querySelector('.g-remove').addEventListener('click', function () {
      node.remove();
      update();
    });
    groupsEl.appendChild(node);
    syncGroupUI(node);
  }

  function readGroup(node) {
    return {
      name: node.querySelector('.g-name').value.trim() || 'Nhóm',
      count: node.querySelector('.g-count').value,
      res: node.querySelector('.g-res').value,
      codec: node.querySelector('.g-codec').value,
      fps: Number(node.querySelector('.g-fps').value),
      mode: node.querySelector('.g-mode').value,
      activity: node.querySelector('.g-activity').value,
      customKbps: node.querySelector('.g-custom').value
    };
  }

  // Ẩn ô % chuyển động khi ghi liên tục; gợi ý bitrate tự tính ở placeholder.
  function syncGroupUI(node) {
    var g = readGroup(node);
    node.querySelector('.g-activity-wrap').hidden = g.mode !== 'motion';
    node.querySelector('.g-custom').placeholder =
      'Tự tính: ' + C.estimateBitrate(g.res, g.codec, g.fps) + ' kbps';
  }

  function readState() {
    return {
      project: $('project').value,
      days: $('days').value,
      reservePct: $('reserve').value,
      raid: $('raid').value,
      slots: $('slots').value,
      groups: Array.prototype.map.call(groupsEl.querySelectorAll('.group'), readGroup)
    };
  }

  // ---------- Hiển thị ----------
  function fmtTB(tb) { return tb >= 10 ? nf1.format(tb) : nf2.format(tb); }

  function cell(tr, text) {
    var td = document.createElement('td');
    td.textContent = text;
    tr.appendChild(td);
  }

  var lastResult = null;

  function render(r) {
    lastResult = r;
    $('r-total').textContent = r.needTB > 0 ? fmtTB(r.needTB) + ' TB' : '–';
    $('r-total-note').textContent = r.needTB > 0
      ? '≈ ' + fmtTB(r.needTiB) + ' TiB trên NVR · ' + nf0.format(r.days) + ' ngày'
      : '';
    $('r-bw').textContent = nf1.format(r.mbps) + ' Mbps';
    $('r-cams').textContent = nf0.format(r.cams);
    $('r-perday').textContent = nf1.format(r.gbPerDay) + ' GB/ngày';

    var raidLabel = { none: 'không RAID', raid1: 'RAID 1', raid5: 'RAID 5', raid6: 'RAID 6' }[$('raid').value];
    $('r-reco').textContent = r.best
      ? 'Gợi ý: ' + r.best.disks + ' × HDD ' + r.best.sizeTB + 'TB Surveillance, ' + raidLabel +
        ', dùng được ≈ ' + fmtTB(r.best.usableTB) + ' TB, đủ khoảng ' +
        nf0.format(r.needTB > 0 ? Math.floor(r.days * r.best.usableTB / r.dataTB) : 0) + ' ngày ghi.'
      : '';

    var warn = $('r-warn');
    warn.innerHTML = '';
    r.warnings.forEach(function (w) {
      var li = document.createElement('li');
      li.textContent = w;
      warn.appendChild(li);
    });

    var hb = document.querySelector('#hdd-table tbody');
    hb.innerHTML = '';
    r.options.forEach(function (o) {
      var tr = document.createElement('tr');
      if (o === r.best) tr.className = 'best';
      else if (!o.fits) tr.className = 'over';
      cell(tr, o.sizeTB + 'TB');
      cell(tr, o.disks);
      cell(tr, o.rawTB + ' TB');
      cell(tr, fmtTB(o.usableTB) + ' TB');
      var notes = [];
      if (o === r.best) notes.push('✔ Gợi ý');
      if (!o.fits) notes.push('Vượt số khe');
      if (o.note) notes.push(o.note);
      cell(tr, notes.join(' · '));
      hb.appendChild(tr);
    });

    var gb = document.querySelector('#group-table tbody');
    gb.innerHTML = '';
    r.groups.forEach(function (g) {
      var tr = document.createElement('tr');
      cell(tr, g.name + ' (' + g.count + ' cam' + (g.duty < 1 ? ', ' + nf0.format(g.duty * 100) + '%' : '') + ')');
      cell(tr, nf0.format(g.kbps) + ' kbps' + (g.isCustom ? ' *' : ''));
      cell(tr, nf1.format(g.mbps));
      cell(tr, nf1.format(g.gbPerDay));
      cell(tr, fmtTB(g.tb));
      gb.appendChild(tr);
    });
  }

  // ---------- Báo cáo PDF ----------
  var RAID_LABELS = { none: 'Không RAID', raid1: 'RAID 1 (mirror)', raid5: 'RAID 5', raid6: 'RAID 6' };
  var MODE_LABELS = { continuous: 'Liên tục 24/7', motion: 'Theo chuyển động' };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function table(head, rows) {
    var t = el('table');
    var thead = el('thead'), tr = el('tr');
    head.forEach(function (h) { tr.appendChild(el('th', null, h)); });
    thead.appendChild(tr);
    t.appendChild(thead);
    var tb = el('tbody');
    rows.forEach(function (row) {
      var r = el('tr');
      row.forEach(function (c) { r.appendChild(el('td', null, c)); });
      tb.appendChild(r);
    });
    t.appendChild(tb);
    return t;
  }

  function buildReport() {
    var state = readState();
    var r = lastResult || C.calculate(state);
    var rep = $('report');
    rep.innerHTML = '';

    var head = el('div', 'rp-head');
    var left = el('div');
    left.appendChild(el('div', 'rp-company', COMPANY.name));
    left.appendChild(el('div', 'rp-phone', 'Điện thoại: ' + COMPANY.phone));
    head.appendChild(left);
    head.appendChild(el('div', 'rp-date', 'Ngày: ' + new Date().toLocaleDateString('vi-VN')));
    rep.appendChild(head);

    rep.appendChild(el('h1', 'rp-title', 'BÁO CÁO ƯỚC TÍNH DUNG LƯỢNG LƯU TRỮ CAMERA'));
    rep.appendChild(el('p', 'rp-project', 'Công trình: ' + (state.project.trim() || '……………………………………')));

    rep.appendChild(el('h2', null, 'Thiết lập chung'));
    rep.appendChild(table(['Số ngày lưu', 'Dự phòng', 'Cấu hình ổ', 'Số khe HDD'], [[
      state.days + ' ngày', state.reservePct + '%', RAID_LABELS[state.raid], state.slots + ' khe'
    ]]));

    rep.appendChild(el('h2', null, 'Các nhóm camera'));
    rep.appendChild(table(
      ['Nhóm', 'Số cam', 'Độ phân giải', 'Codec', 'FPS', 'Chế độ ghi', 'Bitrate/cam', 'TB'],
      state.groups.map(function (g, i) {
        var s = r.groups[i] || {};
        return [
          g.name, String(s.count || 0), C.RESOLUTION_LABELS[g.res], g.codec, String(g.fps),
          MODE_LABELS[g.mode] + (g.mode === 'motion' ? ' (' + g.activity + '%)' : ''),
          nf0.format(s.kbps || 0) + ' kbps' + (s.isCustom ? ' *' : ''),
          fmtTB(s.tb || 0)
        ];
      })
    ));
    if (r.groups.some(function (g) { return g.isCustom; })) {
      rep.appendChild(el('p', 'rp-note', '* Bitrate nhập tay.'));
    }

    rep.appendChild(el('h2', null, 'Kết quả'));
    rep.appendChild(table(['Dung lượng cần', 'Trên NVR', 'Băng thông ghi', 'Tổng camera', 'Dữ liệu/ngày'], [[
      fmtTB(r.needTB) + ' TB', '≈ ' + fmtTB(r.needTiB) + ' TiB', nf1.format(r.mbps) + ' Mbps',
      nf0.format(r.cams), nf1.format(r.gbPerDay) + ' GB'
    ]]));

    var reco = $('r-reco').textContent;
    if (reco) rep.appendChild(el('p', 'rp-reco', reco));
    r.warnings.forEach(function (w) { rep.appendChild(el('p', 'rp-warn', '⚠ ' + w)); });

    var fits = r.options.filter(function (o) { return o.fits; });
    if (fits.length) {
      rep.appendChild(el('h2', null, 'Phương án ổ cứng Surveillance'));
      rep.appendChild(table(['Ổ', 'Số ổ', 'Tổng thô', 'Dùng được', 'Ghi chú'], fits.map(function (o) {
        return [o.sizeTB + 'TB', String(o.disks), o.rawTB + ' TB', fmtTB(o.usableTB) + ' TB',
          [o === r.best ? 'Gợi ý' : '', o.note].filter(Boolean).join(' · ')];
      })));
    }

    rep.appendChild(el('p', 'rp-foot',
      'Số liệu là ước tính theo bitrate tham khảo (VBR, cảnh trung bình); thực tế phụ thuộc cảnh quay và cấu hình camera. ' +
      COMPANY.name + ' · ' + COMPANY.phone));
  }

  // Tên file PDF gợi ý = tiêu đề trang lúc in
  function pdfFileName() {
    var proj = $('project').value.trim();
    var d = new Date();
    var ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return 'Bao cao dung luong camera' + (proj ? ' - ' + proj : '') + ' - ' + ymd;
  }

  function exportPdf() {
    buildReport();
    var oldTitle = document.title;
    document.title = pdfFileName();
    var restore = function () { document.title = oldTitle; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
    setTimeout(restore, 3000); // dự phòng cho trình duyệt không có sự kiện afterprint
  }

  function renderRefTable() {
    var tb = document.querySelector('#ref-table tbody');
    Object.keys(C.BASE_KBPS_H265_25FPS).forEach(function (res) {
      var tr = document.createElement('tr');
      cell(tr, C.RESOLUTION_LABELS[res]);
      ['H.264', 'H.265', 'H.265+'].forEach(function (codec) {
        cell(tr, nf1.format(C.estimateBitrate(res, codec, 25) / 1000) + ' Mbps');
      });
      tb.appendChild(tr);
    });
  }

  // ---------- Lưu lại lần nhập gần nhất trên máy (không bắt buộc) ----------
  function save(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* bỏ qua */ }
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }

  function update() {
    // Chỉ cho xoá khi còn từ 2 nhóm trở lên
    var nodes = groupsEl.querySelectorAll('.group');
    nodes.forEach(function (n) { n.querySelector('.g-remove').hidden = nodes.length < 2; });
    var state = readState();
    render(C.calculate(state));
    save(state);
  }

  // ---------- Khởi động ----------
  function init() {
    $('brand-name').textContent = COMPANY.name;
    $('brand-phone').textContent = '☎ ' + COMPANY.phone;
    $('brand-phone').href = 'tel:' + COMPANY.phone.replace(/[^0-9+]/g, '');
    renderRefTable();
    var saved = load();
    if (saved && saved.project) $('project').value = saved.project;
    if (saved && Array.isArray(saved.groups) && saved.groups.length) {
      ['days', 'raid', 'slots'].forEach(function (k) { if (saved[k] != null) $(k).value = saved[k]; });
      if (saved.reservePct != null) $('reserve').value = saved.reservePct;
      saved.groups.forEach(function (g, i) { addGroup(Object.assign(defaultGroup(i + 1), g)); });
    } else {
      addGroup(defaultGroup(1));
    }

    // Một listener chung cho toàn trang: gõ/chọn gì cũng tính lại.
    document.querySelector('.inputs').addEventListener('input', function (e) {
      var g = e.target.closest('.group');
      if (g) syncGroupUI(g);
      update();
    });

    $('add-group').addEventListener('click', function () {
      addGroup(defaultGroup(groupsEl.querySelectorAll('.group').length + 1));
      update();
    });

    $('export-pdf').addEventListener('click', exportPdf);
    // Người dùng bấm Ctrl+P / menu In của trình duyệt cũng ra đúng báo cáo
    window.addEventListener('beforeprint', buildReport);

    update();
  }

  init();
})();
