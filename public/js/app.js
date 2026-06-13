const App = (() => {
  const state = { user: null, data: null, timer: null };
  const app = () => document.querySelector("#app");
  const money = (v) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(Number(v || 0));
  const kwh = (v) => `${Number(v || 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} kW`;
  const date = (v) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v));

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "İşlem tamamlanamadı.");
    return data;
  }

  function toast(message) {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2800);
  }

  function nav(path) {
    history.pushState({}, "", path);
    render().catch((error) => toast(error.message));
  }

  async function refresh() {
    const [session, data] = await Promise.all([api("/api/session"), api("/api/state")]);
    state.user = session.user;
    state.data = data;
    renderSession();
  }

  function renderSession() {
    const box = document.querySelector("[data-session]");
    if (!state.user) {
      box.innerHTML = `<a href="/giris-kayit">Giriş Yap</a>`;
      return;
    }
    box.innerHTML = `
      <div><strong>${state.user.adSoyad}</strong><span>${state.user.rol} · ${money(state.user.bakiye)}</span></div>
      <button data-logout>Çıkış</button>
    `;
    box.querySelector("[data-logout]").onclick = async () => {
      try {
        await api("/api/logout", { method: "POST" });
        state.user = null;
        toast("Oturum kapatıldı.");
        nav("/");
      } catch (error) {
        toast(error.message);
      }
    };
  }

  function setActive() {
    document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === location.pathname));
  }

  function page(title, subtitle, content, action = "") {
    const header = title ? `<section class="heading"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</section>` : "";
    app().innerHTML = `
      ${header}
      ${content}
    `;
  }

  function pill(status) {
    const cls = status === "Beklemede" ? "amber" : status === "Satıldı" ? "blue" : status === "Reddedildi" ? "red" : "";
    return `<span class="pill ${cls}">${status}</span>`;
  }

  function statCards() {
    const s = state.data.stats;
    return `
      <article class="card stat"><span>Aktif ilan</span><strong>${s.activeListingCount}</strong><small>Borsada</small></article>
      <article class="card stat"><span>Satıştaki enerji</span><strong>${kwh(s.totalEnergy)}</strong><small>Kalan miktar</small></article>
      <article class="card stat"><span>Ortalama fiyat</span><strong>${money(s.avgPrice)}</strong><small>Birim fiyat</small></article>
      <article class="card stat"><span>İşlem</span><strong>${s.tradeCount}</strong><small>Toplam kayıt</small></article>
    `;
  }

  function home() {
    page(
      "",
      "",
      `
      <section class="grid two">
        <div class="hero panel">
          <h1>Mahallenin canlı temiz enerji pazarı</h1>
          <p>SolarChain, güneş enerjisi üreticileri ile alıcıları borsa, simülasyon ve admin paneli üzerinden buluşturur.</p>
          <div class="actions"><a class="button primary" href="/borsa">Borsayı Aç</a><a class="button" href="/simulasyon">Simülasyon</a></div>
        </div>
        <aside class="panel"><h2>Piyasa Özeti</h2><div class="grid two">${statCards()}</div></aside>
      </section>
      <section class="grid three" style="margin-top:16px">
        <article class="card stat"><span>CO₂ tasarrufu</span><strong>${Number(state.data.stats.totalImpact.co2Kg || 0).toLocaleString("tr-TR")} kg</strong><small>Temiz enerji etkisi</small></article>
        <article class="card stat"><span>Yerel ekonomi</span><strong>${money(state.data.stats.totalImpact.yerelEkonomiTl)}</strong><small>Mahalle içinde kalan değer</small></article>
        <article class="card stat"><span>Demo veri</span><strong>${state.data.users.length} kullanıcı</strong><small>Sunum için hazır</small></article>
      </section>
      `
    );
  }

  function rows(listings, withBuy = false) {
    return listings.map((l) => `
      <tr>
        <td>${l.ureticiAdi}</td><td>${l.mahalle}</td><td>${kwh(l.kalanEnerji)}</td>
        <td><strong>${money(l.currentPrice)}</strong></td><td>${l.panelGucu} kWp</td><td>${pill(l.onayDurumu || l.ilanDurumu)}</td>
        ${withBuy ? `<td><input type="number" min="0.5" max="${l.kalanEnerji}" value="1" step="0.5"><button class="primary" data-buy="${l.id}">Satın Al</button></td>` : ""}
      </tr>`).join("");
  }

  function borsa() {
    const active = state.data.listings.filter((l) => l.ilanDurumu === "Aktif" && l.onayDurumu === "Onaylandı");
    page("Canlı Enerji Borsası", "Aktif ilanlar, fiyatlar ve satın alma işlemleri bu sayfada gösterilir.", `
      <section class="market-strip panel">${statCards()}</section>
      <section class="panel" style="margin-top:16px">
        <h2>Piyasa Emirleri</h2>
        <div class="table-wrap"><table><thead><tr><th>Üretici</th><th>Mahalle</th><th>Enerji</th><th>Fiyat</th><th>Panel</th><th>Durum</th><th>Alım</th></tr></thead><tbody>${rows(active, true)}</tbody></table></div>
      </section>
      <section class="panel" style="margin-top:16px">
        <h2>Son İşlemler</h2>
        <div class="table-wrap"><table><thead><tr><th>Alıcı</th><th>Üretici</th><th>Enerji</th><th>Tutar</th><th>Sertifika</th><th>Tarih</th></tr></thead><tbody>${state.data.trades.slice(0, 8).map((t) => `<tr><td>${t.aliciAdi}</td><td>${t.ureticiAdi}</td><td>${kwh(t.enerjiMiktari)}</td><td>${money(t.toplamTutar)}</td><td>${t.certificateId}</td><td>${date(t.islemTarihi)}</td></tr>`).join("")}</tbody></table></div>
      </section>
    `);
    app().querySelectorAll("[data-buy]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          const amount = btn.closest("td").querySelector("input").value;
          await api("/api/trades", { method: "POST", body: { listingId: btn.dataset.buy, amountKwh: Number(amount) } });
          toast("Enerji satın alındı.");
          await refresh();
          borsa();
        } catch (error) {
          toast(error.message);
        }
      };
    });
  }

  function simulationValues() {
    const q = (name) => Number(app().querySelector(`[data-sim="${name}"]`)?.value || 0);
    const hour = q("hour") || 13;
    const homes = q("homes") || 10;
    const panel = q("panel") || 6;
    const sun = q("sun") || 80;
    const demand = q("demand") || 95;
    const daylight = Math.max(0, Math.sin(((hour - 6) / 16) * Math.PI));
    const production = homes * panel * daylight * (sun / 100) * 0.72;
    const consumption = homes * 0.84 * (demand / 100);
    const surplus = Math.max(0, production - consumption);
    const sell = Math.max(0, surplus * 0.7);
    return { hour, homes, panel, sun, demand, production, consumption, sell, co2: Math.min(production, consumption) * 0.42 };
  }

  function sim() {
    page("Mahalle Enerji Simülasyonu", "Güneş üretimi, tüketim ve fazla enerjinin borsaya dönüşmesi görsel olarak anlatılır.", `
      <section class="sim-layout">
        <article class="panel">
          <h2>Mahalle Haritası</h2>
          <div class="neighborhood">
            <span class="sun"></span><span class="park"></span><span class="road r1"></span><span class="road r2"></span>
            <svg class="flow" viewBox="0 0 100 100"><path d="M18 30 C35 20, 44 55, 58 61"></path><path d="M30 20 C40 32, 36 70, 46 74"></path><path d="M70 26 C62 40, 72 58, 80 70"></path></svg>
            ${[
              [15,32,"Ü1","producer"], [29,22,"Ü2","producer"], [42,36,"Ü3","producer"], [69,28,"Ü4","producer"],
              [20,66,"A1","consumer"], [48,66,"A2","consumer"], [76,64,"A3","consumer"], [85,38,"A4","consumer"]
            ].map(([x,y,n,c]) => `<span class="house ${c}" style="left:${x}%;top:${y}%"><span class="roof"><i></i></span><span class="body"></span><strong>${n}</strong><small>${c === "producer" ? "Üretici" : "Alıcı"}</small></span>`).join("")}
          </div>
        </article>
        <aside class="panel form">
          <h2>Senaryo</h2>
          <label>Saat <input data-sim="hour" type="range" min="6" max="22" value="13"></label>
          <label>Hane sayısı <input data-sim="homes" type="range" min="4" max="18" value="10"></label>
          <label>Panel kapasitesi <input data-sim="panel" type="range" min="2" max="12" value="6"></label>
          <label>Güneş yoğunluğu <input data-sim="sun" type="range" min="20" max="100" value="80"></label>
          <label>Tüketim seviyesi <input data-sim="demand" type="range" min="50" max="150" value="95"></label>
          <section class="sim-list" data-sim-result></section>
          <button class="primary" data-create-from-sim>Fazla Enerjiyi İlan Yap</button>
        </aside>
      </section>
    `);
    const update = () => {
      const s = simulationValues();
      app().querySelector("[data-sim-result]").innerHTML = `
        <strong>${kwh(s.sell)} satış potansiyeli</strong>
        <span>Üretim: ${kwh(s.production)} · Tüketim: ${kwh(s.consumption)}</span>
        <span>CO₂ etkisi: ${s.co2.toFixed(1)} kg</span>
      `;
      app().querySelector("[data-create-from-sim]").disabled = s.sell < 0.5;
    };
    app().querySelectorAll("[data-sim]").forEach((input) => input.oninput = update);
    app().querySelector("[data-create-from-sim]").onclick = async () => {
      try {
        const s = simulationValues();
        await api("/api/listings", { method: "POST", body: { enerjiMiktari: Number(s.sell.toFixed(1)), baslangicFiyati: state.data.stats.avgPrice || 3.4, mahalle: state.user?.mahalle || "Simülasyon Mahallesi", panelGucu: s.panel, aciklama: "Simülasyondan oluşturulan ilan" } });
        toast("Simülasyon ilanı oluşturuldu.");
        await refresh();
        nav("/ilanlar");
      } catch (error) {
        toast(error.message);
      }
    };
    update();
  }

  function ilanlar() {
    page("İlan Yönetimi", "Üretici enerji ilanı oluşturur; yönetici onayından sonra borsada görünür.", `
      <section class="grid two">
        <article class="panel">
          <h2>Yeni İlan</h2>
          <form class="form" data-listing-form>
            <div class="form two"><label>Enerji <input name="enerjiMiktari" type="number" value="12" step="0.5"></label><label>Fiyat <input name="baslangicFiyati" type="number" value="3.40" step="0.01"></label></div>
            <div class="form two"><label>Mahalle <input name="mahalle" value="${state.user?.mahalle || "Güneşli Mahallesi"}"></label><label>Panel <input name="panelGucu" type="number" value="${state.user?.panelGucu || 6}"></label></div>
            <label>Açıklama <textarea name="aciklama">Sunum demo enerji ilanı</textarea></label>
            <button class="primary">Onaya Gönder</button>
          </form>
        </article>
        <article class="panel"><h2>İlanlar</h2><div class="cards">${state.data.listings.map((l) => `<article class="mini-card"><h3>${kwh(l.kalanEnerji)} ${pill(l.onayDurumu)}</h3><ul class="meta"><li><span>Üretici</span><strong>${l.ureticiAdi}</strong></li><li><span>Mahalle</span><strong>${l.mahalle}</strong></li><li><span>Fiyat</span><strong>${money(l.currentPrice)}</strong></li></ul></article>`).join("")}</div></article>
      </section>
    `);
    app().querySelector("[data-listing-form]").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api("/api/listings", { method: "POST", body: Object.fromEntries(new FormData(e.target).entries()) });
        toast("İlan oluşturuldu.");
        await refresh();
        ilanlar();
      } catch (error) {
        toast(error.message);
      }
    };
  }

  function wallet() {
    if (!state.user) return login("Cüzdanı görmek için giriş yapmalısınız.");
    const trades = state.data.trades.filter((t) => t.aliciId === state.user.id || t.ureticiId === state.user.id);
    page("Cüzdanım", "Bakiye, kişisel işlemler ve temiz enerji sertifikaları burada görünür.", `
      <section class="grid four"><article class="card stat"><span>Bakiye</span><strong>${money(state.user.bakiye)}</strong><small>${state.user.rol}</small></article><article class="card stat"><span>İşlem</span><strong>${trades.length}</strong><small>Kişisel kayıt</small></article><article class="card stat"><span>CO₂</span><strong>${trades.reduce((s,t)=>s+Number(t.etki?.co2Kg||0),0).toFixed(1)} kg</strong><small>Tasarruf</small></article></section>
      <section class="panel" style="margin-top:16px"><h2>İşlem Geçmişi</h2><div class="table-wrap"><table><thead><tr><th>Alıcı</th><th>Üretici</th><th>Enerji</th><th>Tutar</th><th>Sertifika</th></tr></thead><tbody>${trades.map((t) => `<tr><td>${t.aliciAdi}</td><td>${t.ureticiAdi}</td><td>${kwh(t.enerjiMiktari)}</td><td>${money(t.toplamTutar)}</td><td>${t.certificateId}</td></tr>`).join("")}</tbody></table></div></section>
    `);
  }

  function admin() {
    if (!state.user || state.user.rol !== "yonetici") return login("Admin paneli için yönetici hesabıyla giriş yapmalısınız.");
    page("Yönetici Paneli", "Yönetici bekleyen ilanları onaylar, işlemleri ve mesajları izler.", `
      <section class="grid four">${statCards()}<article class="card stat"><span>Mesaj</span><strong>${state.data.messages.length}</strong><small>İletişim</small></article></section>
      <section class="grid two" style="margin-top:16px">
        <article class="panel"><h2>Onay Bekleyen İlanlar</h2><div class="cards">${state.data.listings.filter((l)=>l.onayDurumu==="Beklemede").map((l)=>`<article class="mini-card"><h3>${kwh(l.kalanEnerji)} ${pill(l.onayDurumu)}</h3><p class="muted">${l.ureticiAdi} · ${l.mahalle}</p><div class="actions"><button class="primary" data-approve="${l.id}">Onayla</button><button class="danger" data-reject="${l.id}">Reddet</button></div></article>`).join("") || `<div class="notice">Bekleyen ilan yok.</div>`}</div></article>
        <article class="panel"><h2>Mesajlar</h2><ul class="meta">${state.data.messages.slice(0,5).map((m)=>`<li><span>${m.konu}</span><strong>${m.adSoyad}</strong></li>`).join("")}</ul></article>
      </section>
    `);
    app().querySelectorAll("[data-approve]").forEach((b) => b.onclick = () => adminAction(b.dataset.approve, "approve"));
    app().querySelectorAll("[data-reject]").forEach((b) => b.onclick = () => adminAction(b.dataset.reject, "reject"));
  }

  async function adminAction(id, action) {
    try {
      await api(`/api/admin/listings/${id}/${action}`, { method: "POST" });
      toast(action === "approve" ? "İlan onaylandı." : "İlan reddedildi.");
      await refresh();
      admin();
    } catch (error) {
      toast(error.message);
    }
  }

  function login(message = "Demo hesaplardan biriyle giriş yapabilirsiniz.") {
    page("Giriş Yap", message, `
      <section class="grid two">
        <article class="panel">
          <h2>Oturum</h2>
          <form class="form" data-login>
            <label>E-posta <input name="email" type="email" value="alici@solarchain.local"></label>
            <label>Şifre <input name="password" type="password" value="alici123"></label>
            <button class="primary">Giriş Yap</button>
          </form>
        </article>
        <aside class="panel"><h2>Demo Hesaplar</h2><ul class="meta"><li><span>Admin</span><strong>admin@solarchain.local / admin123</strong></li><li><span>Üretici</span><strong>uretici@solarchain.local / uretici123</strong></li><li><span>Alıcı</span><strong>alici@solarchain.local / alici123</strong></li></ul></aside>
      </section>
    `);
    app().querySelector("[data-login]").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const data = await api("/api/login", { method: "POST", body: Object.fromEntries(new FormData(e.target).entries()) });
        state.user = data.user;
        toast("Giriş başarılı.");
        await refresh();
        nav(data.user.rol === "yonetici" ? "/admin" : "/borsa");
      } catch (error) {
        toast(error.message);
      }
    };
  }

  async function render() {
    clearInterval(state.timer);
    state.timer = null;
    setActive();
    await refresh();
    const path = location.pathname;
    if (path === "/borsa") {
      borsa();
      state.timer = setInterval(async () => {
        await refresh();
        if (location.pathname === "/borsa") borsa();
      }, 3500);
    } else if (path === "/simulasyon") sim();
    else if (path === "/ilanlar") ilanlar();
    else if (path === "/cuzdan") wallet();
    else if (path === "/admin") admin();
    else if (path === "/giris-kayit") login();
    else home();
  }

  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[href]");
    if (!link || link.origin !== location.origin) return;
    e.preventDefault();
    nav(link.pathname);
  });
  window.addEventListener("popstate", render);
  document.addEventListener("DOMContentLoaded", () => render().catch((e) => toast(e.message)));
})();
