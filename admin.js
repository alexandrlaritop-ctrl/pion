/*
 * Пион — демо-админка: вход, заказы и их статусы, напоминания, букеты, цветы поштучно, график приёма.
 * Данные лежат в этом браузере (PionStore). В настоящей версии те же действия пойдут на сервер,
 * а напоминания будут приходить в Telegram или MAX.
 */
(() => {
  'use strict';

  const S = window.PionStore;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`;

  if (!S || !S.storageWorks()) {
    $('[data-nostore]').hidden = false;
    return;
  }

  const STATUS = Object.fromEntries(S.STATUSES.map((s) => [s.id, s]));
  const ACTIVE = new Set(['new', 'wrote', 'waiting']); // эти статусы ждут действий
  const STALE_MS = 2 * 60 * 60 * 1000; // «без движения» — дольше 2 часов
  const CHANNELS = { max: 'MAX', telegram: 'Telegram', whatsapp: 'WhatsApp', sms: 'SMS', copy: 'скопировал текст' };

  const loginView = $('[data-view="login"]');
  const appView = $('[data-view="app"]');
  const toastBox = $('[data-toast]');

  /* ---------- время ---------- */
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const hhmm = (d) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  function fmtTime(ts) {
    const d = new Date(ts);
    const days = Math.round((dayStart(new Date()) - dayStart(d)) / 86400000);
    if (days === 0) return `сегодня, ${hhmm(d)}`;
    if (days === 1) return `вчера, ${hhmm(d)}`;
    return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}, ${hhmm(d)}`;
  }
  function fmtShort(ts) {
    const d = new Date(ts);
    if (dayStart(d) === dayStart(new Date())) return hhmm(d);
    return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${hhmm(d)}`;
  }
  function ago(ms) {
    const m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return `${m} мин`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ч`;
    return `${Math.floor(h / 24)} дн`;
  }
  function dayLabel(d, index) {
    const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    if (index === 0) return `Сегодня, ${date}`;
    if (index === 1) return `Завтра, ${date}`;
    const wd = d.toLocaleDateString('ru-RU', { weekday: 'long' });
    return `${wd[0].toUpperCase()}${wd.slice(1)}, ${date}`;
  }

  let toastTimer = 0;
  function toast(message) {
    toastBox.textContent = message;
    toastBox.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastBox.classList.remove('is-on'), 3600);
  }

  /* ---------- подтверждение ---------- */
  const confirmEl = $('[data-confirm]');
  function confirmBox(text, yesLabel = 'Удалить') {
    return new Promise((resolve) => {
      const prev = document.activeElement;
      $('[data-confirm-text]', confirmEl).textContent = text;
      const yes = $('[data-confirm-yes]', confirmEl);
      yes.textContent = yesLabel;
      confirmEl.hidden = false;
      yes.focus();
      const done = (value) => {
        confirmEl.hidden = true;
        confirmEl.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey, true);
        prev?.focus?.();
        resolve(value);
      };
      const onClick = (e) => {
        if (e.target.closest('[data-confirm-yes]')) done(true);
        else if (e.target.closest('[data-confirm-no]')) done(false);
      };
      const onKey = (e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        done(false);
      };
      confirmEl.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey, true);
    });
  }

  /* ---------- вход ---------- */
  const loginForm = $('[data-login]');
  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
    const tab = location.hash.slice(1);
    showTab(['orders', 'bouquets', 'flowers', 'schedule'].includes(tab) ? tab : 'orders');
    renderOrders();
    renderList('bouquet');
    renderList('flower');
    renderSchedule();
    setTimeout(checkReminders, 800);
  }
  function showLogin() {
    appView.hidden = true;
    loginView.hidden = false;
    loginForm.elements.password.value = '';
    loginForm.elements.password.focus();
  }
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = S.login(loginForm.elements.password.value);
    $('[data-login-error]').hidden = ok;
    if (ok) showApp();
    else loginForm.elements.password.select();
  });
  $('[data-logout]').addEventListener('click', () => {
    S.logout();
    closeBell();
    showLogin();
  });

  /* ---------- вкладки ---------- */
  const tabs = $$('[data-tab]');
  const panels = $$('[data-panel]');
  function showTab(name) {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
    try {
      history.replaceState(null, '', `#${name}`);
    } catch {
      // страница открыта с диска — адрес не меняем
    }
  }
  tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  /* ---------- заказы ---------- */
  const ordersBox = $('[data-orders]');
  const filtersBox = $('[data-order-filters]');
  const attention = $('[data-attention]');
  const newCount = $('[data-new-count]');
  let orderFilter = 'all';
  let knownIds = new Set(S.getOrders().map((o) => o.id));

  const isStale = (o, now) => ACTIVE.has(o.status) && now - (o.statusAt || o.createdAt) > STALE_MS;
  // Текст напоминания: что случилось и что сделать
  function remindText(o, now) {
    const t = ago(now - (o.statusAt || o.createdAt));
    if (o.status === 'new') return `Новый заказ ждёт ${t} — свяжитесь с клиентом`;
    if (o.status === 'wrote') return `Клиент написал ${t} назад — не забудьте ответить`;
    return `Ожидает ответа ${t} — не забудьте ответить`;
  }
  function sumText(items) {
    if (!items.length) return '—';
    const priced = items.filter((i) => i.price);
    const total = priced.reduce((s, i) => s + i.price * i.qty, 0);
    if (priced.length === items.length) return money(total);
    return priced.length ? `${money(total)} + по запросу` : 'по запросу';
  }
  function itemLine(i) {
    const qty = i.kind === 'flower' ? ` × ${i.qty} шт` : i.qty > 1 ? ` × ${i.qty}` : '';
    return `<li><span>${esc(i.name)}${qty}</span><b>${i.price ? money(i.price * i.qty) : 'по запросу'}</b></li>`;
  }
  function orderHtml(o, now) {
    const st = STATUS[o.status] || STATUS.new;
    const stale = isStale(o, now);
    const items = Array.isArray(o.items) ? o.items : [];
    const itemsHtml = items.length ? items.map(itemLine).join('') : '<li><span>Без выбора — опишет в чате</span></li>';
    const options = S.STATUSES.map((s) => `<option value="${s.id}"${s.id === st.id ? ' selected' : ''}>${s.label}</option>`).join('');
    const history = (o.history || []).map((h) => `${(STATUS[h.status] || st).label} ${fmtShort(h.at)}`).join(' → ');
    return `<article class="ocard ocard--${st.id}${stale ? ' is-stale' : ''}" data-order="${o.id}">
      <header class="ocard__head">
        <div><b class="ocard__num">№ ${o.id}</b>${o.sample ? '<span class="ocard__sample">пример</span>' : ''}<span class="ocard__time">${fmtTime(o.createdAt)}</span></div>
        <label class="status status--${st.id}"><span class="sr-only">Статус заказа № ${o.id}</span><select data-status="${o.id}">${options}</select></label>
      </header>
      ${stale ? `<p class="ocard__alert"><svg class="ico" aria-hidden="true"><use href="#i-clock"/></svg>${remindText(o, now)}</p>` : ''}
      <ul class="ocard__items">${itemsHtml}</ul>
      <dl class="ocard__meta">
        <div><dt>Сумма</dt><dd>${sumText(items)}</dd></div>
        <div><dt>Когда нужен</dt><dd>${esc(o.when || 'не указали')}</dd></div>
        <div><dt>Получение</dt><dd>${esc(o.way || '—')}</dd></div>
        <div><dt>Куда написал</dt><dd>${esc(CHANNELS[o.channel] || '—')}</dd></div>
      </dl>
      <label class="ocard__note"><span>Заметка</span><textarea class="input input--area" rows="2" maxlength="500" data-note="${o.id}" placeholder="Например: договорились на субботу, ждём адрес">${esc(o.note || '')}</textarea></label>
      <footer class="ocard__foot"><span>${esc(history)}</span><button class="link-btn link-btn--danger" type="button" data-del-order="${o.id}">Удалить</button></footer>
    </article>`;
  }
  function emptyOrders(total) {
    if (total) return '<p class="aempty">Здесь заказов нет.</p>';
    return '<div class="aempty"><p>Заказов пока нет. Откройте сайт, добавьте букет в&nbsp;заказ и&nbsp;нажмите MAX, Telegram или «Скопировать»&nbsp;— заказ появится здесь с&nbsp;номером.</p>'
      + '<a class="btn btn--action btn--sm" href="index.html#catalog">Открыть каталог</a> <button class="btn btn--line btn--sm" type="button" data-samples>Добавить примеры заказов</button></div>';
  }
  function renderOrders() {
    const orders = S.getOrders().sort((a, b) => b.createdAt - a.createdAt);
    const now = Date.now();
    const stale = orders.filter((o) => isStale(o, now)).sort((a, b) => (a.statusAt || a.createdAt) - (b.statusAt || b.createdAt));
    const counts = { all: orders.length, attention: stale.length };
    S.STATUSES.forEach((s) => { counts[s.id] = orders.filter((o) => o.status === s.id).length; });
    const filters = [['all', 'Все'], ['attention', 'Требуют внимания'], ...S.STATUSES.map((s) => [s.id, s.label])];
    filtersBox.innerHTML = filters
      .filter(([id]) => id === 'all' || counts[id] || orderFilter === id)
      .map(([id, label]) => `<button class="chip" type="button" data-ofilter="${id}" aria-pressed="${orderFilter === id}">${label}<span class="chip__n">${counts[id]}</span></button>`)
      .join('');
    attention.hidden = !stale.length;
    attention.innerHTML = stale.length
      ? `<p class="attention__title"><svg class="ico" aria-hidden="true"><use href="#i-clock"/></svg>Не забудьте ответить: ${stale.length} ${stale.length === 1 ? 'заказ ждёт' : 'заказа ждут'} больше 2 часов</p>`
        + `<ul class="attention__list">${stale.map((o) => `<li><button class="link-btn" type="button" data-goto-order="${o.id}">№ ${o.id}</button> — ${remindText(o, now).toLowerCase()}</li>`).join('')}</ul>`
      : '';
    const shown = orders.filter((o) => orderFilter === 'all' || (orderFilter === 'attention' ? isStale(o, now) : o.status === orderFilter));
    ordersBox.innerHTML = shown.length ? shown.map((o) => orderHtml(o, now)).join('') : emptyOrders(orders.length);
    newCount.hidden = !counts.new;
    newCount.textContent = String(counts.new);
    document.title = `${counts.new ? `(${counts.new}) ` : ''}Админка — «Пион» (демо)`;
    renderBell(orders, stale, now);
  }

  filtersBox.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ofilter]');
    if (!b) return;
    orderFilter = b.dataset.ofilter;
    renderOrders();
  });
  ordersBox.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-status]');
    if (!sel) return;
    const id = Number(sel.dataset.status);
    S.updateOrder(id, { status: sel.value });
    renderOrders();
    $(`[data-status="${id}"]`, ordersBox)?.focus();
    toast(`Заказ № ${id}: ${STATUS[sel.value].label}`);
  });
  let noteTimer = 0;
  const saveNote = (t) => S.updateOrder(Number(t.dataset.note), { note: t.value.slice(0, 500) });
  ordersBox.addEventListener('input', (e) => {
    const t = e.target.closest('[data-note]');
    if (!t) return;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => saveNote(t), 400);
  });
  ordersBox.addEventListener('focusout', (e) => {
    const t = e.target.closest('[data-note]');
    if (!t) return;
    clearTimeout(noteTimer);
    saveNote(t);
  });
  ordersBox.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del-order]');
    if (!del) return;
    const id = Number(del.dataset.delOrder);
    if (!(await confirmBox(`Удалить заказ № ${id}? Вернуть его будет нельзя.`))) return;
    S.deleteOrder(id);
    renderOrders();
    toast(`Заказ № ${id} удалён`);
  });
  // Перейти к заказу из напоминания: открываем вкладку, прокручиваем и подсвечиваем карточку.
  function gotoOrder(id) {
    closeBell();
    showTab('orders');
    if (!$(`[data-order="${id}"]`, ordersBox)) {
      orderFilter = 'all';
      renderOrders();
    }
    const card = $(`[data-order="${id}"]`, ordersBox);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('is-flash');
    void card.offsetWidth;
    card.classList.add('is-flash');
    $(`[data-status="${id}"]`, card)?.focus({ preventScroll: true });
  }

  // Примеры заказов — чтобы показать статусы и напоминания без ожидания.
  function addSamples() {
    const H = 3600000;
    const now = Date.now();
    const byId = Object.fromEntries(S.getProducts().concat(S.DEFAULT_PRODUCTS, S.getFlowers(), S.DEFAULT_FLOWERS).reverse().map((p) => [p.id, p]));
    const item = (id, qty = 1, kind = 'bouquet') => ({ id, kind, name: byId[id].name, qty, price: byId[id].price || null });
    const day = (n) => new Date(now + n * 86400000).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
    const samples = [
      { items: [item('orchids')], when: '', way: 'доставка', channel: 'telegram', status: 'declined', created: 50 * H, moved: 48 * H, note: 'Передумали' },
      { items: [item('box')], when: `${day(2)}, 12:00–14:00`, way: 'самовывоз', channel: 'max', status: 'accepted', created: 26 * H, moved: 20 * H, note: 'Заберут в 12:00' },
      { items: [item('gift')], when: `${day(1)}, 10:00–12:00`, way: 'доставка', channel: 'whatsapp', status: 'waiting', created: 6 * H, moved: 5 * H, note: 'Ждём адрес доставки' },
      { items: [item('mint', 2)], when: `${day(1)}, 14:00–16:00`, way: 'самовывоз', channel: 'telegram', status: 'wrote', created: 4 * H, moved: 3 * H, note: 'Спросили про открытку — ответить' },
      { items: [item('f-rose-pink', 15, 'flower'), item('f-chrysanthemum', 5, 'flower')], when: `${day(1)}, 16:00–18:00`, way: 'доставка', channel: 'max', status: 'new', created: 12 * 60000, moved: 12 * 60000, note: '' },
    ];
    for (const s of samples) {
      const o = S.createOrder({ items: s.items, when: s.when, way: s.way, channel: s.channel, note: s.note, sample: true }, now - s.created);
      if (o && s.status !== 'new') S.updateOrder(o.id, { status: s.status }, now - s.moved);
    }
    knownIds = new Set(S.getOrders().map((o) => o.id)); // примеры — не «новые заказы» для уведомлений
    orderFilter = 'all';
    showTab('orders');
    renderOrders();
    toast('Добавили 5 примеров заказов');
  }

  /* ---------- колокольчик: напоминания и уведомления ---------- */
  const bellBtn = $('[data-bell]');
  const bellPanel = $('[data-bell-panel]');
  const bellCount = $('[data-bell-count]');
  const bellList = $('[data-bell-list]');
  const notifyBtn = $('[data-notify-on]');
  const notifyState = $('[data-notify-state]');
  function renderBell(orders, stale, now) {
    const fresh = orders.filter((o) => o.status === 'new' && !isStale(o, now));
    const n = stale.length + fresh.length;
    bellCount.hidden = !n;
    bellCount.textContent = String(n);
    bellBtn.classList.toggle('is-alert', stale.length > 0);
    const row = (o, text) => `<li><button type="button" data-goto-order="${o.id}"><b>№ ${o.id}</b><span>${text}</span></button></li>`;
    bellList.innerHTML = n
      ? (stale.length ? `<p class="bell__group">Не забудьте ответить</p><ul>${stale.map((o) => row(o, remindText(o, now))).join('')}</ul>` : '')
        + (fresh.length ? `<p class="bell__group">Новые заказы</p><ul>${fresh.map((o) => row(o, `пришёл ${fmtTime(o.createdAt)}, ${(o.items || []).map((i) => i.name).join(', ') || 'без выбора'}`)).join('')}</ul>` : '')
      : '<p class="bell__empty">Всё в порядке — никто не ждёт ответа.</p>';
    renderNotifyState();
  }
  function openBell() {
    bellPanel.hidden = false;
    bellBtn.setAttribute('aria-expanded', 'true');
  }
  function closeBell() {
    bellPanel.hidden = true;
    bellBtn.setAttribute('aria-expanded', 'false');
  }
  bellBtn.addEventListener('click', () => (bellPanel.hidden ? openBell() : closeBell()));
  $('[data-bell-close]').addEventListener('click', closeBell);
  document.addEventListener('click', (e) => {
    if (!bellPanel.hidden && !e.target.closest('.bell')) closeBell();
  });

  const canNotify = 'Notification' in window;
  function renderNotifyState() {
    if (!canNotify) {
      notifyBtn.hidden = true;
      notifyState.textContent = 'Этот браузер не умеет показывать уведомления. Напоминания видны здесь и в списке заказов.';
      return;
    }
    if (Notification.permission === 'granted') {
      notifyBtn.hidden = true;
      notifyState.textContent = 'Уведомления включены: сообщим о новом заказе и о том, что клиент давно ждёт ответа (пока админка открыта).';
    } else if (Notification.permission === 'denied') {
      notifyBtn.hidden = true;
      notifyState.textContent = 'Уведомления запрещены в настройках браузера для этого сайта.';
    } else {
      notifyBtn.hidden = false;
    }
  }
  notifyBtn.addEventListener('click', async () => {
    if (!canNotify) return;
    try {
      await Notification.requestPermission();
    } catch {
      // старые браузеры
    }
    renderNotifyState();
    if (Notification.permission === 'granted') systemNotify('Уведомления включены', 'Напомним о новых заказах и о тех, кто ждёт ответа.');
  });
  function systemNotify(title, body, orderId) {
    if (!canNotify || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title, { body, icon: 'favicon.svg', tag: orderId ? `pion-${orderId}` : undefined });
      n.onclick = () => {
        window.focus();
        if (orderId) gotoOrder(orderId);
        n.close();
      };
    } catch {
      // на телефоне уведомления из страницы могут быть недоступны
    }
  }
  // Раз в минуту и при новых данных: кому пора напомнить. Каждое напоминание — один раз на статус.
  function checkReminders() {
    const now = Date.now();
    const orders = S.getOrders();
    const notified = S.getNotified();
    let changed = false;
    for (const o of orders) {
      if (!isStale(o, now)) continue;
      const mark = String(o.statusAt || o.createdAt);
      if (notified[o.id] === mark) continue;
      notified[o.id] = mark;
      changed = true;
      if (o.sample) continue; // примеры не будим уведомлениями
      const text = remindText(o, now);
      toast(`№ ${o.id}: ${text}`);
      systemNotify(`Пион: заказ № ${o.id}`, text, o.id);
    }
    if (changed) S.setNotified(notified);
  }

  /* ---------- букеты и цветы ---------- */
  const KINDS = {
    bouquet: { get: S.getProducts, save: S.saveProducts, reset: S.resetProducts, box: $('[data-list="bouquet"]'), prefix: 'p', one: 'букет', W: 640, H: 800 },
    flower: { get: S.getFlowers, save: S.saveFlowers, reset: S.resetFlowers, box: $('[data-list="flower"]'), prefix: 'f', one: 'цветок', W: 480, H: 480 },
  };
  function itemRow(kind, p, i, n) {
    const isF = kind === 'flower';
    const price = p.price ? `${money(p.price)}${isF ? ' за шт' : ''}` : 'цена по запросу';
    const meta = isF ? price : `${esc(S.CATS[p.cat] || '')} · ${price}`;
    const hidden = p.hidden ? ` · <em>${isF ? 'закончился — не виден на сайте' : 'скрыт с сайта'}</em>` : '';
    const toggle = isF ? (p.hidden ? 'Появился' : 'Закончился') : (p.hidden ? 'Показать' : 'Скрыть');
    return `<article class="prow${p.hidden ? ' is-hidden' : ''}${isF ? ' prow--flower' : ''}" data-item="${esc(p.id)}">
      <span class="prow__img"><img src="${esc(p.img)}" alt="" loading="lazy"></span>
      <div class="prow__info">
        <b class="prow__name">${esc(p.name)}</b>
        <span class="prow__meta">${meta}${hidden}</span>
        ${p.desc ? `<span class="prow__desc">${esc(p.desc)}</span>` : ''}
      </div>
      <div class="prow__actions">
        <span class="prow__move">
          <button class="icon-btn" type="button" data-move="-1" aria-label="Поднять выше"${i === 0 ? ' disabled' : ''}><svg class="ico" aria-hidden="true"><use href="#i-up"/></svg></button>
          <button class="icon-btn" type="button" data-move="1" aria-label="Опустить ниже"${i === n - 1 ? ' disabled' : ''}><svg class="ico" aria-hidden="true"><use href="#i-down"/></svg></button>
        </span>
        <button class="btn btn--line btn--sm" type="button" data-toggle>${toggle}</button>
        <button class="btn btn--action btn--sm" type="button" data-edit>Изменить</button>
        <button class="icon-btn icon-btn--danger" type="button" data-delete aria-label="Удалить «${esc(p.name)}»"><svg class="ico" aria-hidden="true"><use href="#i-trash"/></svg></button>
      </div>
    </article>`;
  }
  function renderList(kind) {
    const K = KINDS[kind];
    const list = K.get();
    K.box.innerHTML = list.length ? list.map((p, i) => itemRow(kind, p, i, list.length)).join('') : `<p class="aempty">Пока пусто. Нажмите «Добавить ${K.one}».</p>`;
  }
  function saveList(kind, list) {
    if (KINDS[kind].save(list)) return true;
    toast('Не получилось сохранить: в браузере не хватает места');
    return false;
  }
  $$('[data-list]').forEach((box) => box.addEventListener('click', async (e) => {
    const kind = box.dataset.list;
    const btn = e.target.closest('button');
    const row = e.target.closest('[data-item]');
    if (!btn || !row) return;
    const id = row.dataset.item;
    const list = KINDS[kind].get();
    const i = list.findIndex((p) => p.id === id);
    if (i < 0) return;
    const sel = `[data-item="${CSS.escape(id)}"]`;
    if (btn.dataset.move) {
      const j = i + Number(btn.dataset.move);
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      if (!saveList(kind, list)) return;
      renderList(kind);
      const again = $(`${sel} [data-move="${btn.dataset.move}"]`, box);
      (again && !again.disabled ? again : $(`${sel} [data-edit]`, box))?.focus();
    } else if ('toggle' in btn.dataset) {
      list[i].hidden = !list[i].hidden;
      if (!saveList(kind, list)) return;
      renderList(kind);
      $(`${sel} [data-toggle]`, box)?.focus();
      const name = `«${list[i].name}»`;
      toast(kind === 'flower' ? (list[i].hidden ? `${name} закончился — убрали с сайта` : `${name} снова в наличии`) : (list[i].hidden ? `${name} скрыт с сайта` : `${name} снова на сайте`));
    } else if ('edit' in btn.dataset) {
      openEditor(kind, id);
    } else if ('delete' in btn.dataset) {
      if (!(await confirmBox(`Удалить «${list[i].name}»? Он пропадёт с сайта.`))) return;
      list.splice(i, 1);
      if (!saveList(kind, list)) return;
      renderList(kind);
      toast('Удалено');
    }
  }));
  $$('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
    const kind = b.dataset.reset;
    const what = kind === 'flower' ? 'цветы' : 'букеты';
    if (!(await confirmBox(`Вернуть ${what} как было в начале? Ваши изменения пропадут.`, 'Вернуть'))) return;
    KINDS[kind].reset();
    renderList(kind);
    toast(`${what[0].toUpperCase()}${what.slice(1)} вернули как было`);
  }));

  /* ---------- карточка букета или цветка ---------- */
  const editor = $('[data-editor]');
  const form = $('[data-editor-form]');
  const F = form.elements;
  const preview = $('[data-photo-preview]');
  const photoEmpty = $('[data-photo-empty]');
  const photoFrame = $('[data-photo-frame]');
  const formError = $('[data-form-error]');
  let editKind = 'bouquet';
  let editingId = null;
  let photo = null;
  let editorOpener = null;

  function setPhoto(src) {
    photo = src;
    preview.hidden = !src;
    photoEmpty.hidden = !!src;
    if (src) preview.src = src;
    else preview.removeAttribute('src');
  }
  function fail(message) {
    formError.textContent = message;
    formError.hidden = false;
  }
  function openEditor(kind, id) {
    editKind = kind;
    const isF = kind === 'flower';
    const p = id ? KINDS[kind].get().find((x) => x.id === id) : null;
    editingId = p ? p.id : null;
    editorOpener = document.activeElement;
    form.reset();
    formError.hidden = true;
    $('#editor-title').textContent = `${p ? 'Изменить' : 'Новый'} ${KINDS[kind].one}`;
    $$('[data-only="bouquet"]', form).forEach((el) => { el.hidden = isF; });
    $('[data-desc-label]').textContent = isF ? 'Описание' : 'Состав';
    F.pdesc.placeholder = isF ? 'Например: Эквадор, 60 см' : 'Например: розы, хризантемы и зелень';
    $('[data-price-label]').textContent = isF ? 'Цена за 1 шт, ₽' : 'Цена, ₽';
    $('[data-visible-label]').textContent = isF ? 'Есть в наличии (показывать на сайте)' : 'Показывать на сайте';
    photoFrame.classList.toggle('is-round', isF);
    F.pname.value = p ? p.name : '';
    F.pdesc.value = p ? p.desc : '';
    F.pprice.value = p && p.price ? String(p.price) : '';
    F.pcat.value = p && p.cat ? p.cat : 'bouquet';
    F.ptag.value = p && p.tag ? p.tag : '';
    F.pvisible.checked = p ? !p.hidden : true;
    setPhoto(p ? p.img : null);
    editor.hidden = false;
    document.documentElement.classList.add('is-locked');
    F.pname.focus();
  }
  function closeEditor() {
    if (editor.hidden) return;
    editor.hidden = true;
    document.documentElement.classList.remove('is-locked');
    editorOpener?.focus?.();
  }
  $$('[data-close-modal]', editor).forEach((b) => b.addEventListener('click', closeEditor));
  $$('[data-add-item]').forEach((b) => b.addEventListener('click', () => openEditor(b.dataset.addItem, null)));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!editor.hidden && confirmEl.hidden) closeEditor();
    else if (!bellPanel.hidden) closeBell();
  });

  // Фото с телефона или компьютера: обрезаем под карточку и уменьшаем.
  async function toCardImage(file, W, H) {
    let src = null;
    if ('createImageBitmap' in window) {
      try {
        src = await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        src = null;
      }
    }
    if (!src) {
      src = await new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('не картинка')); };
        img.src = url;
      });
    }
    const scale = Math.max(W / src.width, H / src.height);
    const cw = W / scale;
    const ch = H / scale;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, (src.width - cw) / 2, (src.height - ch) / 2, cw, ch, 0, 0, W, H);
    if (src.close) src.close();
    return canvas.toDataURL('image/jpeg', 0.8);
  }
  $('[data-photo-input]').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      fail('Это не картинка — выберите фото');
      return;
    }
    try {
      setPhoto(await toCardImage(file, KINDS[editKind].W, KINDS[editKind].H));
      formError.hidden = true;
    } catch {
      fail('Не получилось открыть фото — попробуйте другое');
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const isF = editKind === 'flower';
    const name = F.pname.value.trim().replace(/\s+/g, ' ');
    const desc = F.pdesc.value.trim().replace(/\s+/g, ' ');
    const priceRaw = F.pprice.value.replace(/руб\.?|₽|\s| /gi, '');
    if (!name) {
      fail('Напишите название');
      F.pname.focus();
      return;
    }
    let price = null;
    if (priceRaw) {
      price = /^\d+$/.test(priceRaw) ? Number(priceRaw) : NaN;
      if (!Number.isInteger(price) || price <= 0 || price > 1000000) {
        fail('Цена — целое число рублей, например 3400. Или оставьте пустым — на сайте будет «цена по запросу».');
        F.pprice.focus();
        return;
      }
    }
    if (!photo) {
      fail('Добавьте фото');
      return;
    }
    const data = { name, desc, price, img: photo, hidden: !F.pvisible.checked };
    if (!isF) Object.assign(data, { cat: F.pcat.value, tag: F.ptag.value.trim(), alt: desc ? `${name}: ${desc}` : name });
    const K = KINDS[editKind];
    const list = K.get();
    const wasNew = !editingId;
    if (editingId) {
      const p = list.find((x) => x.id === editingId);
      if (p) Object.assign(p, data);
    } else {
      list.unshift({ id: `${K.prefix}${Date.now().toString(36)}`, ...data });
    }
    if (!K.save(list)) {
      fail('Не хватило места в браузере для фото. Удалите лишнее или выберите фото поменьше.');
      return;
    }
    closeEditor();
    renderList(editKind);
    toast(wasNew ? `Добавили — ${isF ? 'цветок' : 'букет'} уже на сайте` : 'Изменения сохранены — на сайте уже новые');
  });

  /* ---------- график приёма заказов ---------- */
  const scheduleBox = $('[data-schedule]');
  const todayBox = $('[data-today]');
  function slotBtn(d, s) {
    const off = d.closed || s.past;
    const state = s.past ? 'прошло' : d.closed ? 'день закрыт' : s.blocked ? 'закрыто' : 'свободно';
    return `<button class="tslot${s.blocked ? ' is-blocked' : ''}${s.past ? ' is-past' : ''}" type="button" data-tslot="${d.key}:${s.id}" aria-pressed="${!s.blocked}"${off ? ' disabled' : ''}>${s.label}<small>${state}</small></button>`;
  }
  function renderSchedule() {
    const days = S.availability();
    scheduleBox.innerHTML = days.map((d) => `<article class="sday${d.closed ? ' is-closed' : ''}">
      <div class="sday__head">
        <b>${dayLabel(d.date, d.index)}</b>
        <label class="switch"><input type="checkbox" data-day-open="${d.key}"${d.closed ? '' : ' checked'}><span class="switch__track" aria-hidden="true"></span><span class="switch__text">${d.closed ? 'Не принимаем' : 'Принимаем'}</span></label>
      </div>
      <div class="sday__slots">${d.slots.map((s) => slotBtn(d, s)).join('')}</div>
    </article>`).join('');
    // Ближайший день, где ещё можно что-то закрыть, — сверху на вкладке «Заказы»
    const near = days.find((d) => d.slots.some((s) => !s.past)) || days[1];
    todayBox.innerHTML = `<div class="today__head"><svg class="ico" aria-hidden="true"><use href="#i-calendar"/></svg><b>${dayLabel(near.date, near.index)}</b><span>${near.closed ? 'заказы не принимаем' : 'нажмите на время, чтобы закрыть или открыть его'}</span></div>
      <div class="today__slots">${near.slots.map((s) => slotBtn(near, s)).join('')}</div>
      <div class="today__actions"><button class="btn btn--line btn--sm" type="button" data-day-toggle="${near.key}">${near.closed ? 'Открыть день' : 'Закрыть весь день'}</button><button class="link-btn" type="button" data-tab-go="schedule">Весь график →</button></div>`;
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tslot],[data-day-toggle],[data-tab-go],[data-goto-order],[data-samples]');
    if (!t) return;
    if (t.dataset.tslot) {
      const [key, slot] = t.dataset.tslot.split(':');
      const scope = t.closest('[data-schedule],[data-today]'); // контейнер остаётся, кнопки перерисуются
      S.toggleSlot(key, slot);
      renderSchedule();
      const again = scope ? $(`[data-tslot="${t.dataset.tslot}"]`, scope) : null;
      again?.focus();
      toast(again && again.classList.contains('is-blocked') ? 'Время закрыто — на сайте его не выбрать' : 'Время снова свободно на сайте');
    } else if (t.dataset.dayToggle) {
      S.toggleDay(t.dataset.dayToggle);
      renderSchedule();
      toast('График обновлён — на сайте уже видно');
    } else if (t.dataset.tabGo) {
      showTab(t.dataset.tabGo);
    } else if (t.dataset.gotoOrder) {
      gotoOrder(Number(t.dataset.gotoOrder));
    } else if ('samples' in t.dataset) {
      addSamples();
    }
  });
  scheduleBox.addEventListener('change', (e) => {
    const box = e.target.closest('[data-day-open]');
    if (!box) return;
    S.toggleDay(box.dataset.dayOpen);
    renderSchedule();
    $(`[data-day-open="${box.dataset.dayOpen}"]`, scheduleBox)?.focus();
    toast(box.checked ? 'День открыт для заказов' : 'День закрыт — на сайте «нет приёма»');
  });

  /* ---------- сайт открыт в соседней вкладке ---------- */
  addEventListener('storage', (e) => {
    if (appView.hidden) return;
    const k = e.key;
    if (k === null || k === S.KEYS.orders) {
      const fresh = S.getOrders().filter((o) => !knownIds.has(o.id));
      knownIds = new Set(S.getOrders().map((o) => o.id));
      if (!document.activeElement?.closest?.('[data-note]')) renderOrders();
      if (fresh.length) {
        const o = fresh[0];
        toast(`Новый заказ № ${o.id} с сайта`);
        systemNotify(`Пион: новый заказ № ${o.id}`, (o.items || []).map((i) => i.name).join(', ') || 'Покупатель напишет, что хочет', o.id);
      }
    }
    if (k === null || k === S.KEYS.products) renderList('bouquet');
    if (k === null || k === S.KEYS.flowers) renderList('flower');
    if (k === null || k === S.KEYS.schedule) renderSchedule();
  });
  // раз в минуту: напоминания и «без движения»; список не трогаем, пока человек пишет заметку
  setInterval(() => {
    if (appView.hidden) return;
    checkReminders();
    if (!document.activeElement?.closest?.('[data-note], select')) renderOrders();
    renderSchedule();
  }, 60000);

  if (S.isLoggedIn()) showApp();
  else showLogin();
})();
