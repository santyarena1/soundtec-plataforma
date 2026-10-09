import { test } from "node:test";
import assert from "node:assert/strict";
import { validateExtraction } from "./extract";
import { isOfficialUrl } from "./official-sources";
import { evidenceFound, normalizeForMatch } from "./types";

// Fragmento con el formato de la tabla de especificaciones de Crestron.
const SPEC = `TABLA DE ESPECIFICACIONES (portal):
Connectors - Rear Panel: HDMI IN 1-4: (4) HDMI Type A connectors, female
HDMI OUT: (1) HDMI Type A connector, female
COM 1 - 2: (2) 5-pin 3.5 mm detachable terminal blocks; Bidirectional RS-232 ports
LAN: (1) 8-pin RJ45 connector, female; 10BASE-T/100BASE-TX Ethernet port; PoE Powered Device port
Power Requirements: PoE: IEEE 802.3af Class 3 (12.95 W) PD
HDCP 2.3 compliant; supports 4K60 4:4:4`;

test("validación: entra lo citado textual, se descarta lo inventado", () => {
  const raw = {
    applies: true,
    ports: [
      { signal: "hdmi", direction: "in", count: 4, connector: "HDMI Type A", label: "HDMI IN 1-4", evidence: "HDMI IN 1-4: (4) HDMI Type A connectors, female" },
      { signal: "rs232", direction: "bidir", count: 2, label: "COM 1-2", evidence: "COM 1 - 2: (2) 5-pin 3.5 mm detachable terminal blocks" },
      { signal: "lan", direction: "bidir", count: 1, poe: "pd", label: "LAN", evidence: "LAN: (1) 8-pin RJ45 connector, female" },
      // Inventado: la ficha no menciona USB.
      { signal: "usb-c", direction: "in", count: 1, label: "USB-C", evidence: "USB-C input with DisplayPort Alt Mode" },
      // Señal fuera del vocabulario.
      { signal: "thunderbolt", direction: "in", count: 1, label: "TB", evidence: "HDMI OUT" },
    ],
    capabilities: {
      poeStandard: { value: "802.3af", evidence: "PoE: IEEE 802.3af Class 3 (12.95 W) PD" },
      poeWatts: { value: 12.95, evidence: "IEEE 802.3af Class 3 (12.95 W)" },
      hdcp: { value: "2.3", evidence: "HDCP 2.3 compliant" },
      danteTx: { value: 8, evidence: "8 x 8 Dante channels" },
    },
    notes: null,
  };
  const v = validateExtraction(raw, SPEC);
  assert.deepEqual(
    v.data.ports.map((p) => `${p.signal}:${p.direction}:${p.count}`),
    ["hdmi:in:4", "rs232:bidir:2", "lan:bidir:1"],
  );
  assert.equal(v.data.ports[2]!.poe, "pd");
  assert.equal(v.data.capabilities.poeWatts?.value, 12.95);
  assert.equal(v.data.capabilities.hdcp?.value, "2.3");
  assert.equal(v.data.capabilities.danteTx, undefined);
  assert.equal(v.rejected.length, 3);
  assert.ok(v.confidence > 0.6 && v.confidence < 0.8);
});

test("cita: tolera diferencias de mayúsculas y signos, no frases que no están", () => {
  const src = normalizeForMatch(SPEC);
  assert.ok(evidenceFound("hdmi out: (1) hdmi type a connector", src));
  assert.ok(!evidenceFound("HDMI OUT: (2) HDMI Type A connectors", src));
  assert.ok(!evidenceFound("HDMI", src));
});

test("producto sin conexiones (soporte): no aplica", () => {
  const v = validateExtraction({ applies: false, ports: [], capabilities: {} }, "Soporte de pared para pantallas de 55 a 75 pulgadas");
  assert.equal(v.applies, false);
  assert.equal(v.confidence, 1);
});

test("fuentes oficiales: el sitio del fabricante sí, tiendas y agregadores no", () => {
  assert.ok(isOfficialUrl("https://www.crestron.com/getmedia/abc/ss_dm-nvx-360.pdf", "Crestron"));
  assert.ok(isOfficialUrl("https://pubs.shure.com/guide/MXA920/en-US.pdf", "Shure"));
  assert.ok(isOfficialUrl("https://www.blaze-audio.com/wp-content/uploads/PowerZone.pdf", "Blaze Audio"));
  assert.ok(!isOfficialUrl("https://www.bhphotovideo.com/c/product/shure-mxa920.html", "Shure"));
  assert.ok(!isOfficialUrl("https://www.manualslib.com/manual/crestron.html", "Crestron"));
  assert.ok(!isOfficialUrl("https://www.shure.com/en-US/products/mxa920", "Biamp"));
  // Marca sin mapa: el dominio tiene que llevar su nombre.
  assert.ok(isOfficialUrl("https://www.vivitek.com/specs/DU8090Z.pdf", "Vivitek"));
});

test("normaliza formatos de capacidades y no deja usar la misma cita dos veces", () => {
  const src = "Power output: 125W x 4 @ 8 ohms. Control: RS232 and TCP/IP. IEEE 802.3at PoE+. INPUT – Channel 1&2. Low impedance or 70V/100V";
  const v = validateExtraction(
    {
      ports: [
        { signal: "analog-audio", direction: "in", count: 2, label: "IN 1-2", evidence: "INPUT – Channel 1&2" },
        { signal: "analog-audio", direction: "in", count: 2, label: "IN 3-4", evidence: "INPUT – Channel 1&2" },
      ],
      capabilities: {
        ampWattsPerChannel: { value: { "8 ohms": "125W" }, evidence: "Power output: 125W x 4 @ 8 ohms" },
        controlProtocols: { value: "RS232, TCP/IP", evidence: "Control: RS232 and TCP/IP" },
        poeStandard: { value: "IEEE 802.3at", evidence: "IEEE 802.3at PoE+" },
        lineVoltage: { value: "Low impedance or 70V/100V", evidence: "Low impedance or 70V/100V" },
      },
    },
    src,
  );
  assert.equal(v.data.ports.length, 1);
  assert.deepEqual(v.data.capabilities.ampWattsPerChannel?.value, { "8Ω": 125 });
  assert.deepEqual(v.data.capabilities.controlProtocols?.value, ["RS-232", "IP"]);
  assert.equal(v.data.capabilities.poeStandard?.value, "802.3at");
  assert.equal(v.data.capabilities.lineVoltage?.value, "both");
});
