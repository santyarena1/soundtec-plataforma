import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { guessMapping, readSheetMatrix, rowsFromMatrix } from "./import";

function xlsx(rows: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Hoja1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

test("Excel con título arriba: encuentra encabezados, adivina columnas y arma contactos", () => {
  const data = xlsx([
    ["Asistentes Expo 2026"],
    ["Nombre", "Apellido", "Empresa", "Correo electrónico", "Ciudad"],
    ["Ana", "Gómez", "Estudio AV", "ANA@estudio.com", "Rosario"],
    ["Beto", "Pérez", "Integra", "beto@integra.com.ar; otro@x.com", "Córdoba"],
    ["Repetida", "", "", "ana@estudio.com", ""],
    ["Sin mail", "", "Nada", "no tiene", ""],
  ]);
  const sheet = readSheetMatrix(data, "lista.xlsx");
  assert.deepEqual(sheet.headers, ["Nombre", "Apellido", "Empresa", "Correo electrónico", "Ciudad"]);
  assert.equal(sheet.rows.length, 4);
  const mapping = guessMapping(sheet);
  assert.deepEqual({ ...mapping, extras: [] }, { email: 3, name: 0, lastName: 1, company: 2, extras: [] });
  const result = rowsFromMatrix(sheet, { ...mapping, extras: [4] });
  assert.equal(result.contacts.length, 2);
  assert.equal(result.duplicates, 1);
  assert.equal(result.invalid, 1);
  assert.deepEqual(result.invalidSamples, ["no tiene"]);
  assert.deepEqual(result.contacts[0], { email: "ana@estudio.com", name: "Ana Gómez", company: "Estudio AV", fields: { Ciudad: "Rosario" } });
  assert.equal(result.contacts[1]!.email, "beto@integra.com.ar", "de una celda con varios mails toma el primero");
});

test("CSV en Latin-1 (Excel de Windows) con punto y coma conserva los acentos", () => {
  const text = "Email;Nombre completo;Razón social\r\nmaria@acustica.com;María Núñez;Acústica Sur\r\n";
  const latin1 = Uint8Array.from([...text].map((c) => c.charCodeAt(0)));
  const sheet = readSheetMatrix(latin1, "base.csv");
  const mapping = guessMapping(sheet);
  const { contacts } = rowsFromMatrix(sheet, mapping);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0]!.name, "María Núñez");
  assert.equal(contacts[0]!.company, "Acústica Sur");
});

test("CSV UTF-8 sin encabezados: numera columnas y detecta el mail por contenido", () => {
  const bytes = new TextEncoder().encode("Pedro,pedro@sonido.com\nLucía,lucia@sonido.com\n");
  const sheet = readSheetMatrix(bytes, "sin-encabezado.csv");
  assert.deepEqual(sheet.headers, ["Columna 1", "Columna 2"]);
  const mapping = guessMapping(sheet);
  assert.equal(mapping.email, 1);
  const { contacts } = rowsFromMatrix(sheet, { ...mapping, name: 0 });
  assert.deepEqual(
    contacts.map((c) => [c.email, c.name]),
    [
      ["pedro@sonido.com", "Pedro"],
      ["lucia@sonido.com", "Lucía"],
    ]
  );
});

test("sin columna de mail elegida no importa nada", () => {
  const sheet = readSheetMatrix(xlsx([["Nombre"], ["Ana"]]), "x.xlsx");
  const result = rowsFromMatrix(sheet, { email: -1, name: 0, lastName: -1, company: -1, extras: [] });
  assert.equal(result.contacts.length, 0);
});
