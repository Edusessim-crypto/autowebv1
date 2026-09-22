import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
const directory = await mkdtemp(path.join(tmpdir(), "autoweb-http-"));
const origin = "http://127.0.0.1:3108";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3108",
  ],
  {
    env: {
      ...process.env,
      NODE_ENV: "production",
      ALLOW_LOCAL_DB: "true",
      DATABASE_URL: "",
      APP_ORIGIN: origin,
      LOCAL_DATA_DIR: directory,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let log = "";
child.stdout.on("data", (d) => (log += d));
child.stderr.on("data", (d) => (log += d));
async function call(
  route,
  { cookie, method = "GET", body, origin: requestOrigin = origin } = {},
) {
  return fetch(origin + route, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(method === "GET" ? {} : { Origin: requestOrigin }),
      ...(body instanceof FormData
        ? {}
        : body
          ? { "Content-Type": "application/json" }
          : {}),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
}
const vehicle = {
  brand: "Marca de teste",
  model: "Veículo de teste",
  version: "",
  yearManufacture: 2022,
  yearModel: 2023,
  mileage: 25000,
  transmission: "Automático",
  fuel: "Flex",
  color: "Preto",
  price: 79900,
  plate: "ABC1D23",
  description: "Registro de teste isolado.",
  options: ["Ar-condicionado"],
  status: "AVAILABLE",
};
function cnpj(base) {
  let digits = base + "0001";
  for (let n = 12; n < 14; n++) {
    let w = n - 7,
      sum = 0;
    for (let i = 0; i < n; i++) {
      sum += Number(digits[i]) * w--;
      if (w < 2) w = 9;
    }
    const r = sum % 11;
    digits += r < 2 ? "0" : String(11 - r);
  }
  return digits;
}
async function account(name, base) {
  const res = await call("/api/auth/register", {
    method: "POST",
    body: { name, email: name + "@example.test", password: "Teste-local-123!" },
  });
  assert.equal(res.status, 200, await res.clone().text());
  const cookie = res.headers.get("set-cookie").split(";")[0];
  assert.match(res.headers.get("set-cookie"), /httponly/i);
  assert.match(res.headers.get("set-cookie"), /samesite=lax/i);
  const onboard = await call("/api/onboarding", {
    cookie,
    method: "POST",
    body: {
      tradeName: "Revenda " + name,
      cnpj: cnpj(base),
      phone: "11000000000",
      city: "São Paulo",
      state: "SP",
    },
  });
  assert.equal(onboard.status, 200, await onboard.clone().text());
  return cookie;
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/entrar")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(ready, "Servidor de teste não iniciou: " + log);
  assert.equal((await call("/api/vehicles")).status, 401);
  assert.equal(
    (
      await call("/api/auth/register", {
        method: "POST",
        origin: "https://invalid.example",
        body: {},
      })
    ).status,
    403,
  );
  const a = await account("revenda-a", "11222333");
  const b = await account("revenda-b", "22333444");
  const create = await call("/api/vehicles", {
    cookie: a,
    method: "POST",
    body: { ...vehicle, dealershipId: "injected" },
  });
  assert.equal(create.status, 201, await create.clone().text());
  const { id } = await create.json();
  assert.equal((await call(`/api/vehicles/${id}`, { cookie: b })).status, 404);
  assert.equal(
    (
      await call(`/api/vehicles/${id}`, {
        cookie: b,
        method: "PATCH",
        body: vehicle,
      })
    ).status,
    404,
  );
  const bad = new FormData();
  bad.set(
    "file",
    new Blob(["not a picture"], { type: "image/png" }),
    "fake.png",
  );
  assert.equal(
    (
      await call(`/api/vehicles/${id}/media`, {
        cookie: a,
        method: "POST",
        body: bad,
      })
    ).status,
    400,
  );
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#1a2233" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set("file", new Blob([png], { type: "image/png" }), "fixture.png");
  const upload = await call(`/api/vehicles/${id}/media`, {
    cookie: a,
    method: "POST",
    body: form,
  });
  assert.equal(upload.status, 201, await upload.clone().text());
  const { id: mediaId } = await upload.json();
  assert.equal(
    (await call(`/api/media/${mediaId}`, { cookie: b })).status,
    404,
  );
  const photo = await call(`/api/media/${mediaId}`, { cookie: a });
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get("content-type"), "image/webp");
  const logo = await call("/api/branding", {
    cookie: a,
    method: "POST",
    body: form,
  });
  assert.equal(logo.status, 200);
  assert.equal((await call("/api/branding", { cookie: a })).status, 200);
  assert.equal((await call("/api/branding", { cookie: b })).status, 404);
  assert.equal(
    (
      await call(`/api/media/${mediaId}`, {
        cookie: a,
        method: "PATCH",
        body: { action: "cover" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(`/api/vehicles/${id}`, {
        cookie: a,
        method: "PATCH",
        body: { ...vehicle, price: 81000, status: "SOLD" },
      })
    ).status,
    200,
  );
  const updated = await (
    await call(`/api/vehicles/${id}`, { cookie: a })
  ).json();
  assert.equal(updated.price, 8100000);
  assert.equal(updated.status, "SOLD");
  assert.ok(updated.soldAt);
  assert.ok(updated.history.some((h) => h.event === "vehicle.created"));
  assert.ok(updated.history.some((h) => h.event === "vehicle.sold"));
  const attempts = await Promise.all(
    Array.from({ length: 6 }, () =>
      call("/api/vehicles", { cookie: a, method: "POST", body: vehicle }),
    ),
  );
  assert.equal(attempts.filter((r) => r.status === 201).length, 4);
  assert.equal(attempts.filter((r) => r.status === 402).length, 2);
  const list = await (await call("/api/vehicles", { cookie: a })).json();
  assert.equal(list.total, 5);
  assert.equal(
    (await (await call("/api/vehicles", { cookie: b })).json()).total,
    0,
  );
  for (const route of [
    "/painel",
    "/estoque",
    "/estoque?view=list",
    "/estoque/" + id,
    "/estoque/" + id + "/editar",
    "/studio?vehicleId=" + id,
    "/crm",
    "/publicacoes",
    "/site",
    "/clientes",
    "/equipe",
    "/relatorios",
    "/configuracoes?tab=plano",
  ]) {
    const res = await call(route, { cookie: a });
    assert.equal(res.status, 200, route);
  }
  assert.equal(
    (await call(`/api/media/${mediaId}`, { cookie: a, method: "DELETE" }))
      .status,
    200,
  );
  assert.equal(
    (await call(`/api/media/${mediaId}`, { cookie: a })).status,
    404,
  );
  assert.equal(
    (await call("/api/auth/logout", { cookie: a, method: "POST" })).status,
    200,
  );
  assert.equal((await call("/api/vehicles", { cookie: a })).status, 401);
  const login = await call("/api/auth/login", {
    method: "POST",
    body: { email: "revenda-a@example.test", password: "Teste-local-123!" },
  });
  assert.equal(login.status, 200);
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await call("/api/auth/login", {
          method: "POST",
          body: {
            email: "revenda-a@example.test",
            password: "senha-incorreta",
          },
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await call("/api/auth/login", {
        method: "POST",
        body: { email: "revenda-a@example.test", password: "senha-incorreta" },
      })
    ).status,
    429,
  );
  console.log(
    "PASS: cadastro, onboarding, sessão, CSRF, isolamento entre revendas, limite concorrente, CRUD, upload real, MIME inválido, fotos privadas, branding, auditoria, rotas, logout e limitação de login.",
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((r) => {
    child.once("exit", r);
    setTimeout(r, 2000).unref();
  });
  await rm(directory, { recursive: true, force: true });
}
