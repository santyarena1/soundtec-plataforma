/**
 * Tests del camino por facetas: traducción de la pregunta a filtro, armado
 * de la consulta, listado sin modelo y extracción del perfil.
 *
 * Todo lo que se prueba acá es determinístico y no toca la base ni el modelo.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeFilter,
  detectFacets,
  deserializeFilter,
  emptyFilter,
  filterWeight,
  isEmptyFilter,
  isMoreRequest,
  mergeFilters,
  serializeFilter,
} from "./facets";
import { buildWhere } from "./facet-search";
import {
  buildListingAnswer,
  describeEvidence,
  listingPageSize,
  shouldUseListing,
} from "./listing";
import { analyzeQuestion } from "./intent";
import { deriveHardFacts, rawMetadataText, type ProfileSourceRow } from "./profile/source";
import { isUsableEvidence, normalizeExtraction } from "./profile/extract";
import { resolveEnvironment } from "./profile/build";
import { cosineSimilarity } from "./profile/embedding";
import { keepKnown, MOUNT_TYPES } from "./profile/vocab";
import type { CandidateProduct } from "./types";

function candidate(overrides: Partial<CandidateProduct> = {}): CandidateProduct {
  return {
    id: "p1",
    label: "P1",
    name: "Sonance PS-S43T",
    brandName: "Sonance",
    categoryName: "Parlantes",
    familyName: null,
    internalSku: "PSS43T",
    supplierSku: null,
    modelNumber: "PS-S43T",
    manufacturerItem: null,
    shortDescription: null,
    longDescription: null,
    htmlText: null,
    keyFeatures: [],
    specifications: [],
    documents: [],
    relations: [],
    isCrestronHomeCompatible: false,
    isDiscontinued: false,
    isCustomizable: false,
    weightKg: null,
    dimensionsCm: { width: null, height: null, depth: null },
    imageUrl: null,
    profile: {
      productType: "speaker",
      environment: "OUTDOOR",
      environmentBasis: "DECLARED",
      environmentEvidence: "Designed for outdoor installations",
      ipRating: "IP66",
      mountTypes: ["surface"],
      audioLine: "70V",
      powerWatts: 60,
      impedanceOhms: 8,
      hdmiInputs: null,
      ecosystems: [],
      applications: ["restaurante"],
      summaryEs: "Parlante de superficie para exterior.",
    },
    updatedAtMs: 1,
    ...overrides,
  };
}

describe("detectFacets", () => {
  it("reconoce tipo de producto y ambiente", () => {
    const filter = detectFacets({ question: "¿Qué parlantes tienen para exterior?" });
    assert.equal(filter.productType, "speaker");
    assert.equal(filter.environment, "OUTDOOR");
  });

  it("un grado IP implica que se pide algo de intemperie", () => {
    const filter = detectFacets({ question: "¿Qué parlantes tienen protección IP66?" });
    assert.equal(filter.ipRating, "IP66");
    assert.equal(filter.environment, "OUTDOOR");
  });

  it("detecta el ecosistema aunque no nombre un tipo de producto", () => {
    const filter = detectFacets({ question: "¿Qué productos son compatibles con Crestron Home?" });
    assert.deepEqual(filter.ecosystems, ["crestron-home"]);
    assert.equal(filter.productType, undefined);
  });

  it("distingue embutir en techo de embutir en pared", () => {
    assert.deepEqual(
      detectFacets({ question: "parlantes de embutir en techo" }).mountTypes,
      ["in-ceiling"]
    );
    assert.deepEqual(
      detectFacets({ question: "parlantes para embutir en la pared" }).mountTypes,
      ["in-wall"]
    );
  });

  it("lee la línea de audio", () => {
    assert.equal(detectFacets({ question: "parlantes de 70V" }).audioLine, "70V");
    assert.equal(detectFacets({ question: "algo de 100 V para la zona" }).audioLine, "100V");
  });

  it("reconoce la aplicación", () => {
    const filter = detectFacets({ question: "necesito sonido para un restaurante" });
    assert.deepEqual(filter.applications, ["restaurante"]);
  });

  it("reconoce la marca", () => {
    const filter = detectFacets({
      question: "parlantes Sonance para exterior",
      brandNames: ["Sonance", "Crestron"],
    });
    assert.deepEqual(filter.brandNames, ["Sonance"]);
  });

  it("descarta las muletillas como términos libres", () => {
    const analysis = analyzeQuestion("dame opciones de productos que tengan algo");
    const filter = detectFacets({ question: analysis.raw, tokens: analysis.tokens });
    assert.equal(filter.freeTerms.includes("opciones"), false);
    assert.equal(filter.freeTerms.includes("productos"), false);
  });
});

describe("filtro de la conversación", () => {
  it("un seguimiento refina el filtro anterior", () => {
    const previous = detectFacets({ question: "parlantes para exterior" });
    const next = detectFacets({ question: "¿y con 70V?" });
    const merged = mergeFilters(previous, next);
    assert.equal(merged.productType, "speaker");
    assert.equal(merged.environment, "OUTDOOR");
    assert.equal(merged.audioLine, "70V");
  });

  it("el filtro vacío se reconoce", () => {
    assert.equal(isEmptyFilter(emptyFilter()), true);
    assert.equal(isEmptyFilter(detectFacets({ question: "parlantes" })), false);
  });

  it("el peso cuenta las condiciones reales", () => {
    const filter = detectFacets({ question: "parlantes de exterior con 70V" });
    assert.ok(filterWeight(filter) >= 3);
  });

  it("sobrevive al viaje por la sesión", () => {
    const filter = detectFacets({ question: "parlantes de embutir en techo para exterior" });
    const restored = deserializeFilter(JSON.parse(JSON.stringify(serializeFilter(filter))));
    assert.deepEqual(restored, filter);
  });

  it("reconoce el pedido de seguir viendo", () => {
    assert.equal(isMoreRequest("mostrame más"), true);
    assert.equal(isMoreRequest("ver más opciones"), true);
    assert.equal(isMoreRequest("¿cuánto pesa?"), false);
  });
});

describe("describeFilter", () => {
  it("arma una frase en español con las condiciones", () => {
    const filter = detectFacets({ question: "parlantes de embutir en techo para exterior con 70V" });
    const text = describeFilter(filter);
    assert.match(text, /parlantes/);
    assert.match(text, /techo/);
    assert.match(text, /exterior/);
    assert.match(text, /70 V/);
  });
});

describe("buildWhere", () => {
  it("exterior acepta también los que sirven para ambos", () => {
    const where = buildWhere(detectFacets({ question: "parlantes para exterior" }));
    const profile = (where.aiProfile as { is: Record<string, unknown> }).is;
    assert.deepEqual(profile.environment, { in: ["OUTDOOR", "BOTH"] });
    assert.equal(profile.productType, "speaker");
  });

  it("70V acepta los de doble línea", () => {
    const where = buildWhere(detectFacets({ question: "parlantes de 70V" }));
    const profile = (where.aiProfile as { is: Record<string, unknown> }).is;
    assert.deepEqual(profile.audioLine, { in: ["70V", "BOTH"] });
  });

  it("Crestron Home también vale por la columna del producto", () => {
    const where = buildWhere(detectFacets({ question: "compatibles con Crestron Home" }));
    assert.ok(Array.isArray(where.OR));
    assert.equal(where.OR?.length, 2);
    assert.equal(where.OR?.[1].isCrestronHomeCompatible, true);
  });

  it("solo considera productos principales y activos", () => {
    const where = buildWhere(detectFacets({ question: "parlantes" }));
    assert.equal(where.isActive, true);
    assert.equal(where.kind, "PRINCIPAL");
  });
});

describe("modo listado", () => {
  it("una consulta de catálogo se lista sin modelo", () => {
    const analysis = analyzeQuestion("¿Qué productos son compatibles con Crestron Home?");
    const filter = detectFacets({ question: analysis.raw });
    assert.equal(shouldUseListing(analysis, filter), true);
  });

  it("una comparación nunca se lista", () => {
    const analysis = analyzeQuestion("comparar CP4 y CP4N");
    assert.equal(shouldUseListing(analysis, detectFacets({ question: analysis.raw })), false);
  });

  it("una recomendación va al modelo, no a una lista", () => {
    const analysis = analyzeQuestion("necesito parlantes para un restaurante");
    assert.equal(shouldUseListing(analysis, detectFacets({ question: analysis.raw })), false);
  });

  it("sin filtro no hay listado", () => {
    const analysis = analyzeQuestion("¿qué opciones tienen?");
    assert.equal(shouldUseListing(analysis, emptyFilter()), false);
  });

  it("la cantidad pedida manda sobre el tamaño de página", () => {
    assert.equal(listingPageSize(analyzeQuestion("dame 5 opciones de parlantes")), 5);
    assert.equal(listingPageSize(analyzeQuestion("¿qué parlantes tienen?")), 8);
  });
});

describe("buildListingAnswer", () => {
  const filter = detectFacets({ question: "parlantes para exterior" });

  it("informa el total y cuántos quedan", () => {
    const answer = buildListingAnswer({
      candidates: [candidate(), candidate({ id: "p2", label: "P2", name: "Sonance PS-S63T" })],
      total: 83,
      offset: 0,
      filter,
      relaxed: [],
      scope: "PUBLIC",
      isContinuation: false,
    });
    assert.match(answer.answer, /83/);
    assert.match(answer.answer, /Quedan 81 más/);
    assert.equal(answer.products.length, 2);
    assert.equal(answer.listing?.total, 83);
    assert.equal(answer.listing?.shown, 2);
    assert.equal(answer.meta.usedLlm, false);
  });

  it("no ofrece seguir cuando ya mostró todo", () => {
    const answer = buildListingAnswer({
      candidates: [candidate()],
      total: 1,
      offset: 0,
      filter,
      relaxed: [],
      scope: "PUBLIC",
      isContinuation: false,
    });
    assert.equal(/Quedan/.test(answer.answer), false);
    assert.equal(answer.suggestions.includes("Mostrame más"), false);
  });

  it("avisa cuando tuvo que soltar una condición", () => {
    const answer = buildListingAnswer({
      candidates: [candidate()],
      total: 4,
      offset: 0,
      filter,
      relaxed: ["el tipo de montaje"],
      scope: "PUBLIC",
      isContinuation: false,
    });
    assert.match(answer.answer, /solté el tipo de montaje/);
  });

  it("cita la ficha de cada producto listado", () => {
    const answer = buildListingAnswer({
      candidates: [candidate()],
      total: 1,
      offset: 0,
      filter,
      relaxed: [],
      scope: "PUBLIC",
      isContinuation: false,
    });
    assert.equal(answer.sources.length, 1);
    assert.equal(answer.sources[0].productId, "p1");
  });

  it("el estado permite continuar la paginación", () => {
    const answer = buildListingAnswer({
      candidates: [candidate(), candidate({ id: "p2", label: "P2" })],
      total: 10,
      offset: 4,
      filter,
      relaxed: [],
      scope: "PUBLIC",
      isContinuation: true,
    });
    assert.equal(answer.listing?.shown, 6);
    assert.match(answer.answer, /Van 6 de 10/);
  });
});

describe("describeEvidence", () => {
  it("usa el grado de protección cuando lo hay", () => {
    const filter = detectFacets({ question: "parlantes para exterior" });
    assert.match(describeEvidence(candidate(), filter), /IP66/);
  });

  it("cae en la frase de la ficha cuando no hay grado IP", () => {
    const filter = detectFacets({ question: "parlantes para exterior" });
    const product = candidate({
      profile: {
        ...candidate().profile!,
        ipRating: null,
        environmentEvidence: "Weather-resistant enclosure",
      },
    });
    assert.match(describeEvidence(product, filter), /Weather-resistant/);
  });

  it("un ambiente deducido se presenta como deducción, no como dato", () => {
    const filter = detectFacets({ question: "procesadores para interior" });
    const product = candidate({
      profile: {
        ...candidate().profile!,
        ipRating: null,
        environment: "INDOOR",
        environmentBasis: "INFERRED",
        // Una deducción del modelo con sus palabras: acá el prefijo hace falta
        // para que el visitante sepa que no es una cita de la ficha.
        environmentEvidence: "Equipo pensado para montarse en un bastidor cerrado",
      },
    });
    assert.match(describeEvidence(product, filter), /se deduce:/);
  });

  it("marca los discontinuados", () => {
    const filter = detectFacets({ question: "parlantes para exterior" });
    assert.match(describeEvidence(candidate({ isDiscontinued: true }), filter), /discontinuado/);
  });
});

describe("hechos duros del perfil", () => {
  const row: ProfileSourceRow = {
    id: "p1",
    normalizedName: "Parlante exterior",
    originalName: "Outdoor speaker",
    shortDescription: null,
    longDescription: null,
    htmlContent: null,
    keyFeatures: null,
    specifications: [
      { label: "IP Rating", value: "IP66" },
      { label: "Power", value: "60 W" },
      { label: "Impedance", value: "8 ohm" },
    ],
    sourceMetadata: null,
    sourceCategoryPath: null,
    productLine: null,
    modelNumber: null,
    isCrestronHomeCompatible: false,
    isDiscontinued: false,
    brand: null,
    category: null,
    family: null,
  };

  it("lee el grado IP, la potencia y la impedancia de las specs", () => {
    const facts = deriveHardFacts(row, "IP Rating: IP66 · Power: 60 W · Impedance: 8 ohm");
    assert.equal(facts.ipRating, "IP66");
    assert.equal(facts.powerWatts, 60);
    assert.equal(facts.impedanceOhms, 8);
  });

  it("detecta la línea de audio en el texto", () => {
    assert.equal(deriveHardFacts(row, "70V/100V transformer included").audioLine, "BOTH");
    assert.equal(deriveHardFacts(row, "8 ohm low impedance").audioLine, "LOW_Z");
  });

  it("detecta el montaje y el ecosistema", () => {
    const facts = deriveHardFacts(row, "In-ceiling speaker compatible with Crestron Home and Dante");
    assert.ok(facts.mountTypes.includes("in-ceiling"));
    assert.ok(facts.ecosystems.includes("crestron-home"));
    assert.ok(facts.ecosystems.includes("dante"));
  });

  it("la columna del producto vale como evidencia de Crestron Home", () => {
    const facts = deriveHardFacts({ ...row, isCrestronHomeCompatible: true }, "sin menciones");
    assert.ok(facts.ecosystems.includes("crestron-home"));
  });

  it("saca texto útil del dato crudo del portal", () => {
    const text = rawMetadataText({
      crestronCom: { bullets: ["Ideal for outdoor installations"], url: "https://x.com" },
    });
    assert.match(text, /outdoor installations/);
    assert.equal(/https:/.test(text), false);
  });
});

describe("resolveEnvironment", () => {
  const base = {
    productType: "processor" as const,
    environment: "UNKNOWN" as const,
    environmentBasis: null,
    environmentEvidence: null,
    mountTypes: [],
    ecosystems: [],
    applications: [],
    summaryEs: "Un procesador del catálogo.",
    keywords: [],
  };

  it("un grado IP declarado manda sobre lo que diga el modelo", () => {
    const result = resolveEnvironment({
      profile: { ...base, productType: "speaker", environment: "INDOOR", environmentBasis: "INFERRED" },
      ipRating: "IP66",
      mountTypes: [],
    });
    assert.equal(result.environment, "OUTDOOR");
    assert.equal(result.environmentBasis, "DECLARED");
    assert.match(result.environmentEvidence ?? "", /IP66/);
  });

  it("un equipo de interior por naturaleza no queda sin determinar", () => {
    const result = resolveEnvironment({ profile: base, ipRating: null, mountTypes: [] });
    assert.equal(result.environment, "INDOOR");
    assert.equal(result.environmentBasis, "INFERRED");
    assert.match(result.environmentEvidence ?? "", /processor/);
  });

  it("un equipo de rack se deduce de interior", () => {
    const result = resolveEnvironment({
      profile: { ...base, productType: "amplifier" },
      ipRating: null,
      mountTypes: ["rack"],
    });
    assert.equal(result.environment, "INDOOR");
    assert.equal(result.environmentBasis, "INFERRED");
  });

  it("lo que realmente puede ir en cualquier lado queda sin determinar", () => {
    const result = resolveEnvironment({
      profile: { ...base, productType: "cable" },
      ipRating: null,
      mountTypes: [],
    });
    assert.equal(result.environment, "UNKNOWN");
    assert.equal(result.environmentBasis, null);
  });

  it("respeta lo que el modelo decidió cuando se jugó", () => {
    const result = resolveEnvironment({
      profile: {
        ...base,
        productType: "speaker",
        environment: "BOTH",
        environmentBasis: "DECLARED",
        environmentEvidence: "Indoor and outdoor use",
      },
      ipRating: null,
      mountTypes: [],
    });
    assert.equal(result.environment, "BOTH");
    assert.equal(result.environmentEvidence, "Indoor and outdoor use");
  });
});

describe("normalizeExtraction", () => {
  it("acepta una salida válida y recorta al vocabulario", () => {
    const profile = normalizeExtraction({
      productType: "speaker",
      environment: "OUTDOOR",
      environmentBasis: "DECLARED",
      environmentEvidence: "Designed for outdoor use",
      mountTypes: ["in-ceiling", "inventado"],
      ecosystems: ["dante", "no-existe"],
      applications: ["restaurante"],
      summaryEs: "Parlante de embutir para exterior con protección IP66.",
      keywords: ["parlante", "speaker", "exterior"],
    });
    assert.ok(profile);
    assert.deepEqual(profile?.mountTypes, ["in-ceiling"]);
    assert.deepEqual(profile?.ecosystems, ["dante"]);
    assert.equal(profile?.environmentBasis, "DECLARED");
  });

  it("sin respaldo explícito, el ambiente se marca como deducción", () => {
    const profile = normalizeExtraction({
      productType: "speaker",
      environment: "INDOOR",
      summaryEs: "Parlante de embutir para instalaciones de interior.",
    });
    assert.equal(profile?.environmentBasis, "INFERRED");
  });

  it("rechaza una salida sin resumen", () => {
    assert.equal(normalizeExtraction({ productType: "speaker", summaryEs: "corto" }), null);
    assert.equal(normalizeExtraction(null), null);
  });

  it("un tipo desconocido cae en 'other' en vez de romper", () => {
    const profile = normalizeExtraction({
      productType: "teletransportador",
      environment: "MARCIANO",
      summaryEs: "Un producto cualquiera del catálogo de Soundtec.",
    });
    assert.equal(profile?.productType, "other");
    assert.equal(profile?.environment, "UNKNOWN");
  });

  it("sin ambiente no se guarda una evidencia que no justifica nada", () => {
    const profile = normalizeExtraction({
      productType: "speaker",
      environment: "UNKNOWN",
      environmentEvidence: "algo",
      summaryEs: "Un parlante del catálogo de Soundtec para instalación fija.",
    });
    assert.equal(profile?.environmentEvidence, null);
    assert.equal(profile?.environmentBasis, null);
  });
});

describe("utilidades", () => {
  it("keepKnown filtra contra el vocabulario", () => {
    assert.deepEqual(keepKnown(["rack", "nope", "rack"], MOUNT_TYPES, 5), ["rack"]);
    assert.deepEqual(keepKnown("no es lista", MOUNT_TYPES, 5), []);
  });

  it("el coseno da 1 para el mismo vector y 0 para ortogonales", () => {
    assert.equal(Math.round(cosineSimilarity([1, 0, 0], [1, 0, 0])), 1);
    assert.equal(cosineSimilarity([1, 0, 0], [0, 1, 0]), 0);
    assert.equal(cosineSimilarity([], [1]), 0);
  });
});

describe("consultas de catálogo que antes se clasificaban mal", () => {
  it("«¿qué parlantes tienen para exterior?» es un listado, no una spec", () => {
    const analysis = analyzeQuestion("¿Qué parlantes tienen para exterior?");
    assert.notEqual(analysis.intent, "SPEC_LOOKUP");
    assert.equal(shouldUseListing(analysis, detectFacets({ question: analysis.raw })), true);
  });

  it("«¿qué productos son compatibles con Crestron Home?» se lista", () => {
    const analysis = analyzeQuestion("¿Qué productos son compatibles con Crestron Home?");
    assert.equal(shouldUseListing(analysis, detectFacets({ question: analysis.raw })), true);
  });

  it("preguntar por un modelo puntual sigue sin listarse", () => {
    const analysis = analyzeQuestion("¿El CP4N es compatible con Crestron Home?");
    assert.equal(shouldUseListing(analysis, detectFacets({ question: analysis.raw })), false);
  });

  it("un dato puntual de un producto sigue siendo una spec", () => {
    const analysis = analyzeQuestion("¿cuánto pesa el CP4N?");
    assert.equal(analysis.intent, "SPEC_LOOKUP");
    assert.equal(shouldUseListing(analysis, detectFacets({ question: analysis.raw })), false);
  });
});

describe("el filtro no se pisa a sí mismo", () => {
  it("un término que ya es faceta no se exige además como texto", () => {
    const analysis = analyzeQuestion("¿Qué parlantes tienen para exterior?");
    const filter = detectFacets({ question: analysis.raw, tokens: analysis.tokens });
    assert.equal(filter.productType, "speaker");
    assert.equal(filter.environment, "OUTDOOR");
    assert.deepEqual(filter.freeTerms, []);
  });

  it("un término que no es faceta sí queda como texto libre", () => {
    const analysis = analyzeQuestion("parlantes bluetooth marca genelec");
    const filter = detectFacets({ question: analysis.raw, tokens: analysis.tokens });
    assert.ok(filter.freeTerms.includes("genelec"));
  });

  it("nombrar un ecosistema no restringe la marca del producto", () => {
    const filter = detectFacets({
      question: "¿Qué productos son compatibles con Crestron Home?",
      brandNames: ["Crestron", "Sonance"],
    });
    assert.deepEqual(filter.ecosystems, ["crestron-home"]);
    assert.deepEqual(filter.brandNames, []);
  });

  it("pedir una marca explícita sí la conserva", () => {
    const filter = detectFacets({
      question: "parlantes Sonance para exterior",
      brandNames: ["Crestron", "Sonance"],
    });
    assert.deepEqual(filter.brandNames, ["Sonance"]);
  });
});

describe("evidencia del ambiente", () => {
  it("una evidencia que repite el enunciado no se acepta", () => {
    assert.equal(isUsableEvidence("frase textual de la ficha"), false);
    assert.equal(isUsableEvidence("la razón de la deducción"), false);
    assert.equal(isUsableEvidence("string"), false);
    assert.equal(isUsableEvidence(null), false);
    assert.equal(isUsableEvidence("corto"), false);
  });

  it("una frase real de la ficha sí se acepta", () => {
    assert.equal(isUsableEvidence("Designed for outdoor installations"), true);
    assert.equal(isUsableEvidence("Tipo de equipo (processor): instalación en interior."), true);
  });

  it("el perfil descarta la evidencia inservible y no la presenta como declarada", () => {
    const profile = normalizeExtraction({
      productType: "speaker",
      environment: "OUTDOOR",
      environmentBasis: "DECLARED",
      environmentEvidence: "frase textual de la ficha",
      summaryEs: "Parlante para instalaciones exteriores del catálogo.",
    });
    assert.equal(profile?.environmentEvidence, null);
    const resolved = resolveEnvironment({ profile: profile!, ipRating: null, mountTypes: [] });
    assert.equal(resolved.environmentBasis, "INFERRED");
    assert.match(resolved.environmentEvidence ?? "", /Tipo de equipo/);
  });
});

describe("los verbos de la pregunta no ensucian la búsqueda", () => {
  it("«¿y cuáles admiten 70V?» no arrastra el verbo como término", () => {
    const analysis = analyzeQuestion("¿y cuáles admiten 70V?");
    const filter = detectFacets({ question: analysis.raw, tokens: analysis.tokens });
    assert.equal(filter.audioLine, "70V");
    assert.deepEqual(filter.freeTerms, []);
  });

  it("una razón que arma el sistema no se prefija con «se deduce»", () => {
    const filter = detectFacets({ question: "parlantes para exterior" });
    const product = candidate({
      profile: {
        ...candidate().profile!,
        ipRating: null,
        environmentBasis: "INFERRED",
        environmentEvidence: "Tipo de equipo (speaker): apto para intemperie.",
      },
    });
    const reason = describeEvidence(product, filter);
    assert.match(reason, /Tipo de equipo/);
    assert.equal(/se deduce/.test(reason), false);
  });
});
