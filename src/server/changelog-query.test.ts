import { test } from "node:test";
import assert from "node:assert/strict";
import { changelogEntriesByIds, listAllChangelogs, listChangelogIndex } from "./changelog-query";
import { latestChangelogVersion } from "../lib/changelog";
import { unreadChangelogEntries } from "../lib/changelog-seen";

test("el índice liviano trae las mismas novedades que el changelog completo, sin el texto", async () => {
  const full = await listAllChangelogs();
  const index = listChangelogIndex();
  assert.equal(index.length, full.length);
  assert.deepEqual(index.map((e) => e.id), full.map((e) => e.id));
  assert.equal(latestChangelogVersion(index), latestChangelogVersion(full));
  for (const entry of index) assert.deepEqual(Object.keys(entry).sort(), ["id", "releasedAt", "version"]);
  // El índice pesa una fracción del completo (eso es lo que viaja en cada pantalla del admin).
  assert.ok(JSON.stringify(index).length * 4 < JSON.stringify(full).length);
});

test("las entradas pedidas vuelven completas y de la más nueva a la más vieja", async () => {
  const full = await listAllChangelogs();
  const wanted = [full[3]!.id, full[0]!.id, "no-existe"];
  const got = changelogEntriesByIds(wanted);
  assert.deepEqual(got.map((e) => e.id), [full[0]!.id, full[3]!.id]);
  assert.ok(got[0]!.items.length > 0);
});

test("sin navegador (servidor) todas las novedades cuentan como no vistas", () => {
  const index = listChangelogIndex();
  assert.equal(unreadChangelogEntries(index).length, index.length);
});
