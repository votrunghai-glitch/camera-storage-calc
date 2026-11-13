/*
 * app.js: phần giao diện: đọc form, gọi CamCalc.calculate(), hiển thị kết quả.
 * Mọi thay đổi trong form đều tính lại ngay, không cần bấm nút.
 */
(function () {
  'use strict';

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

  function render(r) {
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
    renderRefTable();
    var saved = load();
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

    update();
  }

  init();
})();
