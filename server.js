const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data/store.json");
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);

const routes = new Set(["/", "/borsa", "/simulasyon", "/ilanlar", "/cuzdan", "/giris-kayit", "/admin"]);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function readStore() {
  const store = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  store.users ||= [];
  store.listings ||= [];
  store.trades ||= [];
  store.messages ||= [];
  store.notifications ||= [];
  store.sessions ||= {};
  store.counters ||= {};
  return store;
}

function saveStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function nextId(store, prefix) {
  const next = store.counters[prefix] || 2000;
  store.counters[prefix] = next + 1;
  return `${prefix}_${next}`;
}

function send(res, status, payload, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(payload));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Geçersiz JSON."));
      }
    });
  });
}

function cookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        return [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
      })
  );
}

function hashPassword(password, salt) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function safeUser(user) {
  if (!user) return null;
  const { passwordHash, salt, ...rest } = user;
  return rest;
}

function sessionUser(req, store) {
  const token = cookies(req).sc_session;
  const session = token && store.sessions[token];
  return session ? store.users.find((user) => user.id === session.userId) : null;
}

function requireUser(req, res, store) {
  const user = sessionUser(req, store);
  if (!user) send(res, 401, { error: "Bu işlem için giriş yapmalısınız." });
  return user;
}

function requireAdmin(req, res, store) {
  const user = requireUser(req, res, store);
  if (!user) return null;
  if (user.rol !== "yonetici") {
    send(res, 403, { error: "Bu alan yalnızca yöneticiler içindir." });
    return null;
  }
  return user;
}

function producerName(store, id) {
  return store.users.find((user) => user.id === id)?.adSoyad || "Üretici";
}

function listingView(store, listing) {
  return { ...listing, ureticiAdi: producerName(store, listing.ureticiId) };
}

function tradeView(store, trade) {
  return {
    ...trade,
    aliciAdi: store.users.find((user) => user.id === trade.aliciId)?.adSoyad || "Alıcı",
    ureticiAdi: producerName(store, trade.ureticiId)
  };
}

function impact(energy, total) {
  return {
    co2Kg: Math.round(Number(energy) * 0.42 * 100) / 100,
    yerelEkonomiTl: Math.round(Number(total) * 0.72 * 100) / 100
  };
}

function stats(store) {
  const active = store.listings.filter((item) => item.ilanDurumu === "Aktif" && item.onayDurumu === "Onaylandı");
  const totalEnergy = active.reduce((sum, item) => sum + Number(item.kalanEnerji || 0), 0);
  const avgPrice = active.length ? active.reduce((sum, item) => sum + Number(item.currentPrice || 0), 0) / active.length : 0;
  const totalImpact = store.trades.reduce(
    (sum, trade) => {
      sum.co2Kg += Number(trade.etki?.co2Kg || 0);
      sum.yerelEkonomiTl += Number(trade.etki?.yerelEkonomiTl || 0);
      return sum;
    },
    { co2Kg: 0, yerelEkonomiTl: 0 }
  );
  return {
    activeListingCount: active.length,
    pendingListingCount: store.listings.filter((item) => item.onayDurumu === "Beklemede").length,
    totalEnergy: Math.round(totalEnergy * 10) / 10,
    avgPrice: Math.round(avgPrice * 100) / 100,
    tradeCount: store.trades.length,
    totalImpact
  };
}

function tickPrices(store) {
  for (const listing of store.listings) {
    if (listing.ilanDurumu !== "Aktif") continue;
    const seed = Number(listing.seed || 1);
    const movement = Math.sin((Date.now() / 5000 + seed) % 12) * 0.04;
    listing.currentPrice = Math.max(1, Math.round((Number(listing.baslangicFiyati) + movement) * 100) / 100);
    listing.priceHistory ||= [];
    listing.priceHistory.push({ time: new Date().toISOString(), price: listing.currentPrice });
    listing.priceHistory = listing.priceHistory.slice(-30);
  }
}

async function api(req, res, url) {
  const store = readStore();
  if (req.method === "GET" && url.pathname === "/api/state") {
    tickPrices(store);
    saveStore(store);
    return send(res, 200, {
      stats: stats(store),
      users: store.users.map(safeUser),
      listings: store.listings.map((item) => listingView(store, item)),
      trades: store.trades.slice().reverse().map((item) => tradeView(store, item)),
      messages: store.messages.slice().reverse()
    });
  }

  if (req.method === "GET" && url.pathname === "/api/session") {
    return send(res, 200, { user: safeUser(sessionUser(req, store)) });
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const data = await body(req);
    const user = store.users.find((item) => item.email === String(data.email || "").toLowerCase());
    if (!user || user.passwordHash !== hashPassword(data.password || "", user.salt)) {
      return send(res, 401, { error: "E-posta veya şifre hatalı." });
    }
    const token = crypto.randomBytes(20).toString("hex");
    store.sessions[token] = { userId: user.id, createdAt: new Date().toISOString() };
    saveStore(store);
    return send(res, 200, { user: safeUser(user) }, { "Set-Cookie": `sc_session=${token}; HttpOnly; SameSite=Lax; Path=/` });
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    delete store.sessions[cookies(req).sc_session];
    saveStore(store);
    return send(res, 200, { ok: true }, { "Set-Cookie": "sc_session=; Path=/; Max-Age=0" });
  }

  if (req.method === "POST" && url.pathname === "/api/listings") {
    const user = requireUser(req, res, store);
    if (!user) return;
    if (!["uretici", "yonetici"].includes(user.rol)) return send(res, 403, { error: "İlan için üretici hesabı gerekir." });
    const data = await body(req);
    const amount = Number(data.enerjiMiktari);
    const price = Number(data.baslangicFiyati);
    if (!(amount > 0) || !(price > 0)) return send(res, 400, { error: "Enerji ve fiyat pozitif olmalıdır." });
    const listing = {
      id: nextId(store, "lst"),
      ureticiId: user.id,
      enerjiMiktari: amount,
      kalanEnerji: amount,
      baslangicFiyati: price,
      currentPrice: price,
      gecerlilikSuresi: Number(data.gecerlilikSuresi || 120),
      aciklama: data.aciklama || "Demo enerji ilanı",
      mahalle: data.mahalle || user.mahalle,
      panelGucu: Number(data.panelGucu || user.panelGucu || 5),
      onayDurumu: user.rol === "yonetici" ? "Onaylandı" : "Beklemede",
      ilanDurumu: user.rol === "yonetici" ? "Aktif" : "Beklemede",
      priceHistory: [{ time: new Date().toISOString(), price }],
      seed: Math.floor(Math.random() * 90) + 10,
      createdAt: new Date().toISOString()
    };
    store.listings.push(listing);
    saveStore(store);
    return send(res, 201, { listing: listingView(store, listing) });
  }

  if (req.method === "POST" && url.pathname === "/api/trades") {
    const user = requireUser(req, res, store);
    if (!user) return;
    if (!["alici", "yonetici"].includes(user.rol)) return send(res, 403, { error: "Satın alma için alıcı hesabı gerekir." });
    const data = await body(req);
    const listing = store.listings.find((item) => item.id === data.listingId);
    const amount = Number(data.amountKwh || 1);
    if (!listing || listing.ilanDurumu !== "Aktif") return send(res, 404, { error: "Aktif ilan bulunamadı." });
    if (amount <= 0 || amount > Number(listing.kalanEnerji)) return send(res, 400, { error: "Geçersiz enerji miktarı." });
    const total = Math.round(amount * Number(listing.currentPrice) * 100) / 100;
    if (user.bakiye < total) return send(res, 400, { error: "Bakiye yetersiz." });
    const producer = store.users.find((item) => item.id === listing.ureticiId);
    user.bakiye = Math.round((user.bakiye - total) * 100) / 100;
    if (producer) producer.bakiye = Math.round((producer.bakiye + total) * 100) / 100;
    listing.kalanEnerji = Math.round((listing.kalanEnerji - amount) * 100) / 100;
    if (listing.kalanEnerji <= 0) listing.ilanDurumu = "Satıldı";
    const trade = {
      id: nextId(store, "trd"),
      aliciId: user.id,
      ureticiId: listing.ureticiId,
      listingId: listing.id,
      enerjiMiktari: amount,
      islemFiyati: listing.currentPrice,
      toplamTutar: total,
      islemTarihi: new Date().toISOString(),
      etki: impact(amount, total),
      certificateId: `CERT-${Date.now()}`
    };
    store.trades.push(trade);
    saveStore(store);
    return send(res, 201, { trade: tradeView(store, trade), user: safeUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/messages") {
    const data = await body(req);
    const message = {
      id: nextId(store, "msg"),
      adSoyad: data.adSoyad,
      email: data.email,
      konu: data.konu,
      mesaj: data.mesaj,
      durum: "Yeni",
      createdAt: new Date().toISOString()
    };
    store.messages.push(message);
    saveStore(store);
    return send(res, 201, { message });
  }

  if (req.method === "GET" && url.pathname === "/api/admin") {
    if (!requireAdmin(req, res, store)) return;
    return send(res, 200, {
      stats: stats(store),
      users: store.users.map(safeUser),
      listings: store.listings.map((item) => listingView(store, item)),
      trades: store.trades.slice().reverse().map((item) => tradeView(store, item)),
      messages: store.messages.slice().reverse()
    });
  }

  const approve = url.pathname.match(/^\/api\/admin\/listings\/(.+)\/approve$/);
  if (req.method === "POST" && approve) {
    if (!requireAdmin(req, res, store)) return;
    const listing = store.listings.find((item) => item.id === approve[1]);
    if (!listing) return send(res, 404, { error: "İlan bulunamadı." });
    listing.onayDurumu = "Onaylandı";
    listing.ilanDurumu = "Aktif";
    saveStore(store);
    return send(res, 200, { listing: listingView(store, listing) });
  }

  const reject = url.pathname.match(/^\/api\/admin\/listings\/(.+)\/reject$/);
  if (req.method === "POST" && reject) {
    if (!requireAdmin(req, res, store)) return;
    const listing = store.listings.find((item) => item.id === reject[1]);
    if (!listing) return send(res, 404, { error: "İlan bulunamadı." });
    listing.onayDurumu = "Reddedildi";
    listing.ilanDurumu = "Reddedildi";
    saveStore(store);
    return send(res, 200, { listing: listingView(store, listing) });
  }

  send(res, 404, { error: "API yolu bulunamadı." });
}

function file(res, relative) {
  const target = path.normalize(path.join(ROOT, relative));
  if (!target.startsWith(ROOT) || !fs.existsSync(target)) {
    res.writeHead(404);
    res.end("Bulunamadı.");
    return;
  }
  res.writeHead(200, { "Content-Type": types[path.extname(target)] || "application/octet-stream" });
  fs.createReadStream(target).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  if (url.pathname.startsWith("/api/")) return api(req, res, url).catch((error) => send(res, 500, { error: error.message }));
  if (url.pathname.startsWith("/public/")) return file(res, url.pathname.slice(1));
  if (routes.has(url.pathname)) return file(res, "views/index.html");
  res.writeHead(302, { Location: "/" });
  res.end();
});

server.listen(PORT, HOST, () => {
  console.log(`SolarChain sunum sürümü: http://${HOST}:${PORT}`);
});
