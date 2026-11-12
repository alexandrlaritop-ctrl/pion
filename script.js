/*
 * Пион — черновик сайта.
 * Заказ собирается в текст и уходит в мессенджер, который выберет покупатель.
 * Сайт ничего не хранит и никуда не отправляет: ни форм, ни cookie, ни счётчиков.
 */
(() => {
  'use strict';

  // Контакты магазина. Пустые поля заполним, когда магазин пришлёт данные.
  const SHOP = {
    phone: '+79609685122',
    telegram: '', // ник в Telegram без @ — тогда текст заказа подставится в чат сам
    whatsapp: '79609685122', // номер, если на нём есть WhatsApp
    max: '', // ссылка на чат магазина в MAX
  };

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const touch = matchMedia('(pointer: coarse)');
  const money = (n, space = ' ') => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, space) + space + '₽';
  const plural = (n, [one, few, many]) => {
    const a = n % 10;
    const b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  };

  /* ---------- расцветка черновика: бордо, беж, шалфей ---------- */
  const THEMES = { bordo: '#1a0710', beige: '#f2e8db', sage: '#15211b' };
  function setTheme(name, remember) {
    if (!THEMES[name]) name = 'bordo';
    document.documentElement.setAttribute('data-theme', name);
    $('meta[name="theme-color"]')?.setAttribute('content', THEMES[name]);
    $$('[data-set-theme]').forEach((a) => a.setAttribute('aria-pressed', String(a.dataset.setTheme === name)));
    if (!remember) return;
    try {
      const url = new URL(location.href);
      url.searchParams.set('theme', name);
      history.replaceState(null, '', url);
    } catch {
      // страница открыта с диска — адрес не меняем, расцветка всё равно переключится
    }
  }
  setTheme(document.documentElement.getAttribute('data-theme'), false);
  $$('[data-set-theme]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    setTheme(a.dataset.setTheme, true);
  }));

  /* ---------- шапка и меню ---------- */
  const header = $('.header');
  const burger = $('.burger');
  const setMenu = (open) => {
    header.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
  };
  burger.addEventListener('click', () => setMenu(!header.classList.contains('is-open')));
  $$('.nav a').forEach((a) => a.addEventListener('click', () => setMenu(false)));

  const navLinks = new Map($$('.nav a').map((a) => [a.hash.slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      navLinks.forEach((a) => a.classList.remove('is-active'));
      navLinks.get(e.target.id)?.classList.add('is-active');
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  navLinks.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) spy.observe(section);
  });

  /* ---------- появление блоков ---------- */
  const reveal = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      reveal.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -6% 0px' });
  $$('.reveal').forEach((el) => reveal.observe(el));

  /* ---------- параллакс ---------- */
  // data-depth: слой сдвигается медленнее (>0) или быстрее (<0) страницы.
  // data-scene="top": первый экран, считаем от начала страницы; остальные — от центра окна.
  // data-window: фото в карточке плывёт внутри рамки.
  let raf = 0;
  let mx = 0;
  let my = 0;
  let tx = 0;
  let ty = 0;
  const request = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const scenes = $$('[data-scene]').map((box) => ({
    box,
    top: box.dataset.scene === 'top',
    on: true,
    layers: $$('[data-depth]', box).map((el) => ({
      el,
      depth: Number(el.dataset.depth),
      rot: Number(el.dataset.rot || 0),
      tilt: Number(el.dataset.tilt || 0),
      fade: el.hasAttribute('data-fade'),
    })),
  }));
  const windows = $$('[data-window]').map((box) => ({ box, img: $('img', box), k: Number(box.dataset.window) || 0.07, on: true }));
  const watch = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.parallax.on = e.isIntersecting;
    request();
  }, { rootMargin: '30% 0px' });
  for (const item of [...scenes, ...windows]) {
    item.box.parallax = item;
    watch.observe(item.box);
  }

  function frame() {
    raf = 0;
    const vh = innerHeight;
    const motion = !reduceMotion.matches;
    const k = innerWidth < 768 ? 0.55 : 1;
    header.classList.toggle('is-scrolled', scrollY > 8);
    if (scrollY < 200) navLinks.forEach((a) => a.classList.remove('is-active'));
    mx += (tx - mx) * 0.08;
    my += (ty - my) * 0.08;

    for (const s of scenes) {
      if (!s.on) continue;
      let d;
      if (s.top) {
        d = -scrollY;
      } else {
        const r = s.box.getBoundingClientRect();
        const lim = vh / 2 + r.height / 2;
        d = clamp(r.top + r.height / 2 - vh / 2, -lim, lim);
      }
      for (const l of s.layers) {
        if (!motion) {
          l.el.style.transform = l.tilt ? `rotate(${l.tilt}deg)` : '';
          l.el.style.opacity = '';
          continue;
        }
        const x = s.top ? mx * l.depth * 70 : 0;
        const y = -d * l.depth * k + (s.top ? my * l.depth * 70 : 0);
        const rot = l.tilt - d * l.rot;
        l.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)` + (rot ? ` rotate(${rot.toFixed(2)}deg)` : '');
        if (l.fade) l.el.style.opacity = String(clamp(1 + d / (vh * 1.1), 0, 1).toFixed(3));
      }
    }

    for (const w of windows) {
      if (!w.on) continue;
      if (!motion) {
        w.img.style.transform = '';
        continue;
      }
      const r = w.box.getBoundingClientRect();
      const p = clamp((r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2), -1, 1);
      w.img.style.transform = `translate3d(0,${(-p * r.height * w.k).toFixed(1)}px,0)`;
    }

    if (motion && (Math.abs(tx - mx) > 0.001 || Math.abs(ty - my) > 0.001)) request();
  }

  const hero = $('.hero');
  if (matchMedia('(pointer: fine)').matches) {
    hero.addEventListener('pointermove', (e) => {
      tx = e.clientX / innerWidth - 0.5;
      ty = e.clientY / innerHeight - 0.5;
      request();
    });
    hero.addEventListener('pointerleave', () => {
      tx = 0;
      ty = 0;
      request();
    });
  }
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  reduceMotion.addEventListener?.('change', request);

  /* ---------- слайдер первого экрана ---------- */
  const slides = $$('.slide');
  const dots = $$('.dot');
  let current = 0;
  let slideTimer = 0;
  let heroOnScreen = true;
  function showSlide(i) {
    current = (i + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle('is-active', k === current));
    dots.forEach((d, k) => {
      d.classList.toggle('is-active', k === current);
      d.setAttribute('aria-pressed', String(k === current));
    });
  }
  function scheduleSlide() {
    clearTimeout(slideTimer);
    if (slides.length < 2 || reduceMotion.matches || !heroOnScreen || document.hidden) return;
    slideTimer = setTimeout(() => {
      showSlide(current + 1);
      scheduleSlide();
    }, 6500);
  }
  dots.forEach((d, k) => d.addEventListener('click', () => {
    showSlide(k);
    scheduleSlide();
  }));
  new IntersectionObserver(([e]) => {
    heroOnScreen = e.isIntersecting;
    scheduleSlide();
  }).observe(hero);
  document.addEventListener('visibilitychange', scheduleSlide);
  reduceMotion.addEventListener?.('change', scheduleSlide);

  // лепестки падают на всю высоту области с фото
  const fall = $('[data-fall]');
  if (fall) {
    const setFall = () => fall.style.setProperty('--fall-h', `${fall.clientHeight + 80}px`);
    setFall();
    if ('ResizeObserver' in window) new ResizeObserver(setFall).observe(fall);
    else addEventListener('resize', setFall);
  }

  /* ---------- фильтр каталога ---------- */
  const cards = $$('.card');
  const chips = $$('.chip');
  chips.forEach((chip) => chip.addEventListener('click', () => {
    const filter = chip.dataset.filter;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    cards.forEach((card) => {
      card.hidden = filter !== 'all' && card.dataset.cat !== filter;
    });
    request();
  }));

  /* ---------- заказ ---------- */
  const products = new Map(cards.map((card) => [card.dataset.id, {
    name: card.dataset.name,
    price: Number(card.dataset.price) || 0,
    img: $('img', card).getAttribute('src'),
    card,
  }]));
  products.set('custom', { name: 'Индивидуальный букет', price: 0, custom: true });
  const cart = new Map();

  const drawer = $('#order');
  const panel = $('.order__panel', drawer);
  const list = $('[data-list]', drawer);
  const empty = $('[data-empty]', drawer);
  const dateInput = $('[data-date]', drawer);
  const timeInput = $('[data-time]', drawer);
  const textBox = $('[data-text]', drawer);
  const toastBox = $('[data-toast]');
  const obarText = $('[data-obar-text]');

  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  dateInput.min = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const total = () => {
    let n = 0;
    cart.forEach((q) => { n += q; });
    return n;
  };
  const way = () => $('input[name="way"]:checked', drawer)?.value || 'доставка';
  function when() {
    const parts = [];
    if (dateInput.value) {
      const [y, m, d] = dateInput.value.split('-').map(Number);
      parts.push(new Date(y, m - 1, d).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }));
    }
    if (timeInput.value) parts.push(`к ${timeInput.value}`);
    return parts.join(', ');
  }

  const QUICK_TEXT = 'Здравствуйте! Хочу заказать букет. (Пишу с сайта)';
  function orderText() {
    const lines = [];
    if (cart.size) {
      lines.push('Здравствуйте! Хочу заказать:');
      let sum = 0;
      let allPriced = true;
      cart.forEach((q, id) => {
        const p = products.get(id);
        if (p.custom) {
          lines.push('— индивидуальный букет, пожелания опишу в чате');
          allPriced = false;
          return;
        }
        let line = `— ${p.name}`;
        if (q > 1) line += ` × ${q}`;
        if (p.price) {
          line += `, ${money(p.price * q)}`;
          sum += p.price * q;
        } else {
          allPriced = false;
        }
        lines.push(line);
      });
      if (allPriced && cart.size > 1) lines.push(`Сумма по ценам сайта: ${money(sum)}`);
    } else {
      lines.push('Здравствуйте! Хочу заказать букет.');
    }
    const w = when();
    if (w) lines.push(`Когда: ${w}`);
    lines.push(way() === 'доставка' ? 'Получение: доставка, адрес напишу в чате' : 'Получение: самовывоз');
    lines.push('(Заказ с сайта)');
    return lines.join('\n');
  }

  function channelHref(kind, text) {
    const t = encodeURIComponent(text);
    switch (kind) {
      case 'telegram': return SHOP.telegram ? `https://t.me/${SHOP.telegram}?text=${t}` : `https://t.me/${SHOP.phone}`;
      case 'whatsapp': return `https://wa.me/${SHOP.whatsapp}?text=${t}`;
      case 'max': return SHOP.max || `https://max.ru/:share?text=${t}`;
      case 'sms': return `sms:${SHOP.phone}?&body=${t}`;
      default: return '#';
    }
  }
  function channelHint(kind) {
    if (kind === 'max' && !SHOP.max) return 'В MAX выберите чат магазина — текст уже подставлен и скопирован.';
    if (kind === 'telegram' && !SHOP.telegram) return 'Текст скопирован — вставьте его в чат с магазином.';
    if (kind === 'max') return 'Текст скопирован — вставьте его в чат с магазином.';
    return 'Открываем чат с готовым сообщением. Текст также скопирован.';
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // открыто с диска или старый браузер — копируем по-старому
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  // Подсказка: в окне заказа — строкой под кнопками (ничего не закрывает), на странице — всплывашкой снизу.
  const statusBox = $('[data-status]', drawer);
  let toastTimer = 0;
  let statusTimer = 0;
  function toast(message) {
    if (!drawer.hidden) {
      statusBox.textContent = message;
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => { statusBox.textContent = ''; }, 6000);
      return;
    }
    toastBox.textContent = message;
    toastBox.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastBox.classList.remove('is-on'), 3400);
  }

  const stepperHtml = (id, q, small) =>
    `<div class="stepper${small ? ' stepper--sm' : ''}" role="group" aria-label="Количество"><button type="button" data-dec="${id}" aria-label="Убрать один">−</button><output>${q}</output><button type="button" data-inc="${id}" aria-label="Добавить ещё один">+</button></div>`;

  function renderCard(card, id) {
    const q = cart.get(id) || 0;
    const box = $('.card__action', card);
    if (box.dataset.q === String(q)) return;
    const focused = box.contains(document.activeElement) ? document.activeElement : null;
    const kind = focused ? (focused.dataset.add ? 'add' : focused.dataset.inc ? 'inc' : 'dec') : null;
    box.dataset.q = String(q);
    box.innerHTML = q
      ? stepperHtml(id, q, false)
      : `<button class="btn btn--action btn--block" type="button" data-add="${id}"><svg class="ico" aria-hidden="true"><use href="#i-bag"/></svg>В заказ</button>`;
    if (!kind) return;
    const target = q ? $(kind === 'add' ? '[data-inc]' : `[data-${kind}]`, box) : $('[data-add]', box);
    target?.focus();
  }

  function itemRow(id, q) {
    const p = products.get(id);
    const li = document.createElement('li');
    li.className = 'oitem';
    if (p.custom) {
      li.innerHTML = '<span class="oitem__ph"><svg aria-hidden="true"><use href="#logo-o"/></svg></span>';
    } else {
      const img = document.createElement('img');
      img.src = p.img;
      img.alt = '';
      img.width = 56;
      img.height = 56;
      li.append(img);
    }
    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'oitem__name';
    name.textContent = p.name;
    const sub = document.createElement('div');
    sub.className = 'oitem__sub';
    if (p.custom) sub.textContent = 'Пожелания опишете в чате';
    else if (p.price) sub.textContent = q > 1 ? `${money(p.price, ' ')} × ${q} = ${money(p.price * q, ' ')}` : money(p.price, ' ');
    else sub.textContent = 'Цену подтвердит флорист';
    info.append(name, sub);
    li.append(info);
    const controls = document.createElement('div');
    controls.innerHTML = p.custom
      ? '<button class="icon-btn" type="button" data-remove="custom" aria-label="Убрать индивидуальный букет"><svg class="ico" aria-hidden="true"><use href="#i-close"/></svg></button>'
      : stepperHtml(id, q, true);
    li.append(controls);
    return li;
  }

  function render() {
    const n = total();
    const active = document.activeElement;
    const keep = active && list.contains(active)
      ? (['inc', 'dec', 'remove'].map((k) => [k, active.dataset[k]]).find(([, v]) => v !== undefined) || null)
      : null;

    products.forEach((p, id) => { if (p.card) renderCard(p.card, id); });
    list.replaceChildren(...[...cart].map(([id, q]) => itemRow(id, q)));
    empty.hidden = cart.size > 0;

    const text = orderText();
    textBox.textContent = text;
    $$('[data-channel]', drawer).forEach((a) => { a.href = channelHref(a.dataset.channel, text); });
    $$('[data-count]').forEach((el) => {
      el.textContent = String(n);
      el.hidden = n === 0;
    });
    obarText.textContent = `В заказе ${n} ${plural(n, ['букет', 'букета', 'букетов'])}`;
    document.body.classList.toggle('has-order', n > 0);

    if (keep) {
      const [k, id] = keep;
      ($(`[data-${k}="${id}"]`, list) || $(`[data-inc="${id}"]`, list) || panel).focus();
    }
  }

  let opener = null;
  function openOrder(from) {
    opener = from || document.activeElement;
    setMenu(false);
    toastBox.classList.remove('is-on');
    drawer.hidden = false;
    document.documentElement.classList.add('is-locked');
    void drawer.offsetWidth; // чтобы сработала анимация выезда
    drawer.classList.add('is-open');
    $('.order__head [data-close-order]', drawer).focus({ preventScroll: true });
  }
  function closeOrder() {
    if (drawer.hidden) return;
    drawer.classList.remove('is-open');
    document.documentElement.classList.remove('is-locked');
    if (reduceMotion.matches) drawer.hidden = true;
    else setTimeout(() => { if (!drawer.classList.contains('is-open')) drawer.hidden = true; }, 380);
    opener?.focus?.({ preventScroll: true });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.classList.contains('is-open')) setMenu(false);
    if (drawer.hidden) return;
    if (e.key === 'Escape') {
      closeOrder();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = $$('a[href], button, input', panel).filter((el) => el.offsetParent !== null && !el.disabled);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-add],[data-inc],[data-dec],[data-remove],[data-custom],[data-open-order],[data-close-order],[data-copy],[data-channel]');
    if (!el) return;
    const d = el.dataset;
    if (d.add) {
      cart.set(d.add, 1);
      render();
      toast(`«${products.get(d.add).name}» — в заказе`);
    } else if (d.inc) {
      cart.set(d.inc, (cart.get(d.inc) || 0) + 1);
      render();
    } else if (d.dec) {
      const q = (cart.get(d.dec) || 0) - 1;
      if (q > 0) cart.set(d.dec, q);
      else cart.delete(d.dec);
      render();
    } else if (d.remove) {
      cart.delete(d.remove);
      render();
    } else if ('custom' in d) {
      if (!cart.has('custom')) cart.set('custom', 1);
      render();
      if (drawer.hidden) openOrder(el);
    } else if ('openOrder' in d) {
      openOrder(el);
    } else if ('closeOrder' in d) {
      closeOrder();
    } else if ('copy' in d) {
      copy(orderText()).then((ok) => toast(ok ? 'Текст заказа скопирован' : 'Не получилось скопировать — выделите текст вручную'));
    } else if (d.channel) {
      const text = 'quick' in d ? QUICK_TEXT : orderText();
      el.href = channelHref(d.channel, text);
      copy(text);
      toast(channelHint(d.channel));
    }
  });

  [dateInput, timeInput].forEach((input) => input.addEventListener('input', render));
  $$('input[name="way"]', drawer).forEach((input) => input.addEventListener('change', render));
  $$('[data-channel][data-quick]').forEach((a) => { a.href = channelHref(a.dataset.channel, QUICK_TEXT); });
  if (!touch.matches) $$('[data-touch-only]').forEach((el) => { el.hidden = true; });

  render();
  request();
})();
