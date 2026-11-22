import { test } from "node:test";
import assert from "node:assert/strict";
import type dns from "node:dns";
import { downloadRemoteImage, guardedLookup } from "./download";
import { ImageRejectError } from "@/lib/remote-image/reasons";

/** Resolver falso: el dominio «parece» público pero apunta a la red interna (DNS rebinding). */
function fakeResolver(address: string, family = 4): typeof dns.lookup {
  return ((_host: string, _opts: unknown, cb: (e: null, a: dns.LookupAddress[]) => void) => cb(null, [{ address, family }])) as unknown as typeof dns.lookup;
}

const rejectsWith = (p: Promise<unknown>, reason: string) =>
  assert.rejects(p, (e: unknown) => e instanceof ImageRejectError && e.reason === reason);

test("SSRF: no descarga de direcciones internas escritas en la URL", async () => {
  await rejectsWith(downloadRemoteImage("http://127.0.0.1/a.png"), "private-host");
  await rejectsWith(downloadRemoteImage("http://169.254.169.254/latest/meta-data/"), "private-host");
  await rejectsWith(downloadRemoteImage("http://[::1]/a.png"), "private-host");
  await rejectsWith(downloadRemoteImage("file:///etc/passwd"), "unsupported-scheme");
  await rejectsWith(downloadRemoteImage("x-raw-image:///abc"), "unsupported-scheme");
});

test("SSRF: un dominio público que resuelve a una IP interna se corta antes de conectar", async () => {
  await rejectsWith(downloadRemoteImage("http://fotos.ejemplo-publico.com/a.png", { lookup: fakeResolver("10.0.0.7") }), "private-host");
  await rejectsWith(downloadRemoteImage("http://fotos.ejemplo-publico.com/a.png", { lookup: fakeResolver("::1", 6) }), "private-host");
});

test("guardedLookup deja pasar IPs públicas y frena si alguna de las resueltas es interna", async () => {
  const ok = await new Promise<string>((resolve, reject) =>
    guardedLookup(fakeResolver("93.184.216.34"))("ejemplo.com", {}, (e, address) => (e ? reject(e) : resolve(String(address)))),
  );
  assert.equal(ok, "93.184.216.34");
  const mixed = ((_h: string, _o: unknown, cb: (e: null, a: dns.LookupAddress[]) => void) =>
    cb(null, [{ address: "93.184.216.34", family: 4 }, { address: "192.168.1.1", family: 4 }])) as unknown as typeof dns.lookup;
  const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => guardedLookup(mixed)("ejemplo.com", {}, (e) => resolve(e)));
  assert.equal(err?.code, "EPRIVATEHOST");
});
