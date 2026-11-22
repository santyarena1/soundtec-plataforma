import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRemoteImageUrl, isPrivateIp, isRawSerperImage, refererFor } from "./url-guard";

const reason = (raw: string) => {
  const r = checkRemoteImageUrl(raw);
  return r.ok ? "ok" : r.reason;
};

test("acepta http/https públicos, con query, sin extensión y de CDN con parámetros", () => {
  assert.equal(reason("https://cdn.shopify.com/s/files/1/foo.jpg?v=123&width=800"), "ok");
  assert.equal(reason("https://s7d9.scene7.com/is/image/Sonance/VP66R?$hero$&fmt=png-alpha"), "ok");
  assert.equal(reason("https://res.cloudinary.com/x/image/upload/w_1000,f_auto/abc"), "ok");
  assert.equal(reason("http://www.ejemplo.com/foto"), "ok");
  assert.equal(reason("https://www.crestron.com/getattachment/a8e9/a8e9.aspx"), "ok");
});

test("rechaza esquemas raros: data:, file:, ftp:, javascript:, x-raw-image:", () => {
  assert.equal(reason("data:image/png;base64,AAAA"), "unsupported-scheme");
  assert.equal(reason("file:///etc/passwd"), "unsupported-scheme");
  assert.equal(reason("ftp://ejemplo.com/a.jpg"), "unsupported-scheme");
  assert.equal(reason("javascript:alert(1)"), "unsupported-scheme");
  assert.equal(reason("x-raw-image:///56bbecdfec75ef54"), "unsupported-scheme");
  assert.equal(reason("no es una url"), "invalid-url");
  assert.equal(reason(""), "invalid-url");
});

test("SSRF: bloquea localhost, IPs privadas, metadatos, IPv6 locales y puertos raros", () => {
  for (const raw of [
    "http://localhost/a.png",
    "http://127.0.0.1/a.png",
    "http://127.1/a.png",
    "http://2130706433/a.png",
    "http://0x7f000001/a.png",
    "http://0177.0.0.1/a.png",
    "http://10.0.0.5/a.png",
    "http://172.20.1.1/a.png",
    "http://192.168.0.10/a.png",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/a.png",
    "http://0.0.0.0/a.png",
    "http://[::1]/a.png",
    "http://[fd00::1]/a.png",
    "http://[fe80::1]/a.png",
    "http://[::ffff:127.0.0.1]/a.png",
    "http://[::ffff:a9fe:a9fe]/a.png",
    "http://metadata/computeMetadata",
    "http://servidor.internal/a.png",
    "http://impresora.local/a.png",
    "https://ejemplo.com:8443/a.png",
    "http://ejemplo.com:22/a.png",
  ]) {
    assert.equal(reason(raw), "private-host", raw);
  }
  assert.equal(reason("https://usuario:clave@ejemplo.com/a.png"), "invalid-url");
});

test("isPrivateIp distingue IPs públicas de internas", () => {
  assert.equal(isPrivateIp("8.8.8.8"), false);
  assert.equal(isPrivateIp("151.101.1.1"), false);
  assert.equal(isPrivateIp("2606:4700::6810:84e5"), false);
  assert.equal(isPrivateIp("172.15.255.255"), false);
  assert.equal(isPrivateIp("172.16.0.1"), true);
  assert.equal(isPrivateIp("::ffff:10.1.2.3"), true);
  assert.equal(isPrivateIp("64:ff9b::7f00:1"), true);
  assert.equal(isPrivateIp("cualquier-cosa"), true);
});

test("x-raw-image de Serper y Referer del sitio de origen", () => {
  assert.equal(isRawSerperImage("x-raw-image:///abc"), true);
  assert.equal(isRawSerperImage("https://a.com/x.jpg"), false);
  const img = new URL("https://cdn.fabricante.com/fotos/a.jpg");
  assert.equal(refererFor(img, "https://www.tienda.com/producto/123"), "https://www.tienda.com/");
  assert.equal(refererFor(img, null), "https://cdn.fabricante.com/");
  assert.equal(refererFor(img, "http://localhost/x"), "https://cdn.fabricante.com/");
});
