/*
 * Пион — данные демо-версии: букеты, цветы поштучно, график приёма заказов, заказы.
 * Демо хранит всё в браузере (localStorage), поэтому сайт и админка видят одни данные
 * только в одном и том же браузере. В настоящей версии те же функции будут ходить на сервер.
 */
(function () {
  'use strict';

  var PREFIX = 'pion-demo:';
  var KEYS = {
    products: PREFIX + 'products',
    flowers: PREFIX + 'flowers',
    schedule: PREFIX + 'schedule',
    orders: PREFIX + 'orders',
    seq: PREFIX + 'seq',
    auth: PREFIX + 'auth',
    notified: PREFIX + 'notified',
  };

  var CATS = { bouquet: 'Букеты', box: 'Корзины и коробки', gift: 'Подарки' };

  var STATUSES = [
    { id: 'new', label: 'Новый' },
    { id: 'wrote', label: 'Написал' },
    { id: 'waiting', label: 'Ждёт ответа' },
    { id: 'accepted', label: 'Принят' },
    { id: 'done', label: 'Выполнен' },
    { id: 'declined', label: 'Отказ' },
  ];

  // Интервалы доставки/самовывоза. Поменяем, когда магазин скажет часы работы.
  var SLOTS = [
    { id: '08', from: 8, to: 10, label: '8:00–10:00' },
    { id: '10', from: 10, to: 12, label: '10:00–12:00' },
    { id: '12', from: 12, to: 14, label: '12:00–14:00' },
    { id: '14', from: 14, to: 16, label: '14:00–16:00' },
    { id: '16', from: 16, to: 18, label: '16:00–18:00' },
    { id: '18', from: 18, to: 20, label: '18:00–20:00' },
  ];
  var LEAD_HOURS = 1; // интервал, который начнётся меньше чем через час, уже не выбрать
  var DAYS_AHEAD = 14; // на сколько дней вперёд можно заказать

  var DEFAULT_PRODUCTS = [
    { id: 'basket', name: 'Корзина с цветами', desc: 'Хризантемы, гвоздики, кустовые розы и альстромерии', alt: 'Корзина: белые хризантемы, розовые гвоздики, кустовые розы и альстромерии', price: null, cat: 'box', tag: 'Корзина', img: 'img/p-basket.jpg', hidden: false },
    { id: 'box', name: 'Композиция в коробке', desc: 'Розы, хризантемы и сирень', alt: 'Композиция в коробке: розы, белые хризантемы и сирень', price: null, cat: 'box', tag: 'В коробке', img: 'img/p-box.jpg', hidden: false },
    { id: 'orchids', name: 'Хризантемы с орхидеями', desc: 'Белые хризантемы и три орхидеи', alt: 'Букет: белые хризантемы и три орхидеи', price: null, cat: 'bouquet', tag: '', img: 'img/p-orchids.jpg', hidden: false },
    { id: 'peach', name: 'Хризантемы с гвоздиками', desc: 'Белые хризантемы и персиковые гвоздики', alt: 'Букет: белые хризантемы и персиковые гвоздики', price: null, cat: 'bouquet', tag: '', img: 'img/p-peach.jpg', hidden: false },
    { id: 'roses', name: 'Букет с пудровыми розами', desc: 'Розы, гипсофила и зелень', alt: 'Букет: пудровые розы, гипсофила и зелень в персиковой упаковке', price: null, cat: 'bouquet', tag: '', img: 'img/p-roses.jpg', hidden: false },
    { id: 'mint', name: 'Букет из хризантем', desc: 'Белые хризантемы и нежные сезонные цветы', alt: 'Букет: белые хризантемы и нежно-розовые цветы в мятной упаковке', price: 3400, cat: 'bouquet', tag: '', img: 'img/p-mint.jpg', hidden: false },
    { id: 'yellow', name: 'Солнечный букет', desc: 'Жёлтые и белые кустовые хризантемы', alt: 'Букет: жёлтые и белые кустовые хризантемы', price: null, cat: 'bouquet', tag: '', img: 'img/p-yellow.jpg', hidden: false },
    { id: 'gift', name: 'Розы и мишка', desc: 'Красные розы и плюшевый мишка в подарочной сумке', alt: 'Подарок: красные розы и плюшевый мишка в подарочной сумке', price: null, cat: 'gift', tag: 'Подарок', img: 'img/p-gift.jpg', hidden: false },
  ];

  // Цветы поштучно — из чего флорист соберёт букет. Демо: названия по фото магазина, цены — у магазина.
  var DEFAULT_FLOWERS = [
    { id: 'f-rose-pink', name: 'Роза пудровая', desc: 'Нежно-розовая', price: null, img: 'img/f-rose-pink.jpg', hidden: false },
    { id: 'f-rose-red', name: 'Роза красная', desc: 'Классическая красная', price: null, img: 'img/f-rose-red.jpg', hidden: false },
    { id: 'f-chrysanthemum', name: 'Хризантема белая', desc: 'Крупный пышный цветок', price: null, img: 'img/f-chrysanthemum.jpg', hidden: false },
    { id: 'f-chrys-yellow', name: 'Хризантема кустовая', desc: 'Жёлтая, ветка с несколькими цветками', price: null, img: 'img/f-chrys-yellow.jpg', hidden: false },
    { id: 'f-orchid', name: 'Орхидея', desc: 'Розовая', price: null, img: 'img/f-orchid.jpg', hidden: false },
    { id: 'f-carnation', name: 'Гвоздика', desc: 'Персиковая', price: null, img: 'img/f-carnation.jpg', hidden: false },
    { id: 'f-lilac', name: 'Сирень', desc: 'Сиреневая ветка', price: null, img: 'img/f-lilac.jpg', hidden: false },
    { id: 'f-alstroemeria', name: 'Альстромерия', desc: 'Белая, ветка с несколькими цветками', price: null, img: 'img/f-alstroemeria.jpg', hidden: false },
  ];

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  // false — браузер не дал сохранить (нет места или хранилище запрещено)
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ничего */ }
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  // Картинка — только своя: путь img/… или фото, уменьшенное в админке (data:image/…).
  function safeImg(src) {
    return typeof src === 'string' && (/^img\/[\w.-]+$/.test(src) || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src));
  }
  function cleanItem(p, kind) {
    if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || !p.name.trim() || !safeImg(p.img)) return null;
    var price = Number(p.price);
    var item = {
      id: p.id.slice(0, 40),
      name: p.name.slice(0, 80),
      desc: typeof p.desc === 'string' ? p.desc.slice(0, 200) : '',
      price: Number.isFinite(price) && price > 0 ? Math.round(price) : null,
      img: p.img,
      hidden: !!p.hidden,
    };
    if (kind === 'bouquet') {
      item.alt = typeof p.alt === 'string' ? p.alt.slice(0, 240) : p.name;
      item.cat = CATS[p.cat] ? p.cat : 'bouquet';
      item.tag = typeof p.tag === 'string' ? p.tag.slice(0, 24) : '';
    }
    return item;
  }
  function listGetter(key, defaults, kind) {
    return function () {
      var list = read(key, null);
      if (!Array.isArray(list)) return clone(defaults);
      return list.map(function (p) { return cleanItem(p, kind); }).filter(Boolean);
    };
  }
  function listSaver(key, kind) {
    return function (list) { return write(key, list.map(function (p) { return cleanItem(p, kind); }).filter(Boolean)); };
  }

  var getProducts = listGetter(KEYS.products, DEFAULT_PRODUCTS, 'bouquet');
  var saveProducts = listSaver(KEYS.products, 'bouquet');
  var getFlowers = listGetter(KEYS.flowers, DEFAULT_FLOWERS, 'flower');
  var saveFlowers = listSaver(KEYS.flowers, 'flower');

  /* ---------- график: закрытые дни и интервалы ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(key) {
    var p = String(key).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function getSchedule() {
    var s = read(KEYS.schedule, null);
    var days = s && typeof s.days === 'object' && s.days ? s.days : {};
    // прошедшие дни не храним
    var today = dayKey(new Date());
    Object.keys(days).forEach(function (k) { if (k < today) delete days[k]; });
    return { days: days };
  }
  function saveSchedule(s) { return write(KEYS.schedule, s); }
  function dayRule(s, key) { return s.days[key] || { closed: false, blocked: [] }; }
  function setDayRule(key, rule) {
    var s = getSchedule();
    var blocked = (rule.blocked || []).filter(function (id) { return SLOTS.some(function (x) { return x.id === id; }); });
    if (!rule.closed && !blocked.length) delete s.days[key];
    else s.days[key] = { closed: !!rule.closed, blocked: blocked };
    return saveSchedule(s);
  }
  function toggleDay(key) {
    var rule = dayRule(getSchedule(), key);
    return setDayRule(key, { closed: !rule.closed, blocked: rule.blocked });
  }
  function toggleSlot(key, slotId) {
    var rule = dayRule(getSchedule(), key);
    var blocked = rule.blocked.indexOf(slotId) >= 0 ? rule.blocked.filter(function (x) { return x !== slotId; }) : rule.blocked.concat([slotId]);
    return setDayRule(key, { closed: rule.closed, blocked: blocked });
  }
  // Что видит покупатель: дни на две недели вперёд и интервалы с пометками «закрыто» и «уже прошло».
  function availability(now) {
    now = now || new Date();
    var s = getSchedule();
    var out = [];
    for (var i = 0; i < DAYS_AHEAD; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      var key = dayKey(d);
      var rule = dayRule(s, key);
      var slots = SLOTS.map(function (slot) {
        var past = i === 0 && slot.from <= now.getHours() + now.getMinutes() / 60 + LEAD_HOURS;
        return { id: slot.id, label: slot.label, from: slot.from, to: slot.to, blocked: rule.blocked.indexOf(slot.id) >= 0, past: past };
      });
      var open = !rule.closed && slots.some(function (x) { return !x.blocked && !x.past; });
      out.push({ key: key, date: d, index: i, closed: rule.closed, open: open, slots: slots });
    }
    return out;
  }

  /* ---------- заказы ---------- */
  function getOrders() {
    var list = read(KEYS.orders, []);
    return Array.isArray(list) ? list.filter(function (o) { return o && typeof o.id === 'number'; }) : [];
  }
  function saveOrders(list) { return write(KEYS.orders, list); }
  function peekNextOrderId() {
    var last = Number(read(KEYS.seq, 1000)) || 1000;
    var max = getOrders().reduce(function (m, o) { return Math.max(m, o.id); }, 0);
    return Math.max(last, max) + 1;
  }
  // Новый заказ: номер по порядку, статус «Новый». at — время (для примеров в админке).
  function createOrder(data, at) {
    var now = at || Date.now();
    var order = Object.assign({}, data, { id: peekNextOrderId(), createdAt: now, status: 'new', statusAt: now, note: data.note || '', history: [{ at: now, status: 'new' }] });
    var list = getOrders();
    list.unshift(order);
    if (!saveOrders(list)) return null;
    write(KEYS.seq, order.id);
    return order;
  }
  function updateOrder(id, patch, at) {
    var list = getOrders();
    var order = list.find(function (o) { return o.id === id; });
    if (!order) return null;
    var now = at || Date.now();
    if (patch.status && patch.status !== order.status) {
      order.history = (order.history || []).concat([{ at: now, status: patch.status }]);
      order.statusAt = now;
    }
    Object.assign(order, patch);
    saveOrders(list);
    return order;
  }
  function deleteOrder(id) { saveOrders(getOrders().filter(function (o) { return o.id !== id; })); }

  /* ---------- вход в демо-админку: помним 7 дней в этом браузере ---------- */
  var DEMO_PASSWORD = 'pion';
  function login(password) {
    if (String(password).trim().toLowerCase() !== DEMO_PASSWORD) return false;
    write(KEYS.auth, Date.now() + 7 * 24 * 3600 * 1000);
    return true;
  }
  function isLoggedIn() { return Number(read(KEYS.auth, 0)) > Date.now(); }
  function logout() { remove(KEYS.auth); }
  function storageWorks() {
    try {
      localStorage.setItem(PREFIX + 'test', '1');
      localStorage.removeItem(PREFIX + 'test');
      return true;
    } catch (e) {
      return false;
    }
  }

  // о каких напоминаниях уже сообщили (номер заказа → время статуса)
  function getNotified() { var n = read(KEYS.notified, {}); return n && typeof n === 'object' ? n : {}; }
  function setNotified(n) { write(KEYS.notified, n); }

  window.PionStore = {
    KEYS: KEYS,
    CATS: CATS,
    STATUSES: STATUSES,
    SLOTS: SLOTS,
    DAYS_AHEAD: DAYS_AHEAD,
    DEFAULT_PRODUCTS: DEFAULT_PRODUCTS,
    DEFAULT_FLOWERS: DEFAULT_FLOWERS,
    getProducts: getProducts,
    saveProducts: saveProducts,
    resetProducts: function () { remove(KEYS.products); },
    getFlowers: getFlowers,
    saveFlowers: saveFlowers,
    resetFlowers: function () { remove(KEYS.flowers); },
    dayKey: dayKey,
    parseDay: parseDay,
    getSchedule: getSchedule,
    toggleDay: toggleDay,
    toggleSlot: toggleSlot,
    setDayRule: setDayRule,
    availability: availability,
    getOrders: getOrders,
    peekNextOrderId: peekNextOrderId,
    createOrder: createOrder,
    updateOrder: updateOrder,
    deleteOrder: deleteOrder,
    login: login,
    isLoggedIn: isLoggedIn,
    logout: logout,
    storageWorks: storageWorks,
    getNotified: getNotified,
    setNotified: setNotified,
  };
})();
