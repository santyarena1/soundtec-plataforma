import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { toPublicFormSettings } from "./types";

test("el formulario público no manda mails internos ni textos de invitación", () => {
  const out = toPublicFormSettings({
    welcomeTitle: "Hola",
    theme: "dark",
    notifyEmails: ["equipo@soundtec.com.ar"],
    inviteSubject: "Interno",
    inviteMessage: "Texto interno",
    inviteButton: "Confirmar",
  });
  assert.deepEqual(out, { welcomeTitle: "Hola", theme: "dark" });
  assert.doesNotMatch(JSON.stringify(out), /soundtec\.com\.ar|invite/i);
});

test("la página /f/[token] filtra los settings antes del componente cliente", () => {
  const page = readFileSync(path.join(process.cwd(), "src/app/f/[token]/page.tsx"), "utf8");
  assert.match(page, /settings=\{toPublicFormSettings\(form\.settings\)\}/);
});
