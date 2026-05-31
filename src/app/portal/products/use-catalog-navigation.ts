"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CatalogUrlState } from "@/lib/catalog-url";

type Patch = Partial<CatalogUrlState> & { reset?: boolean };

export function useCatalogNavigation() {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const push = useCallback(
    (patch: Patch) => {
      if (patch.reset) {
        startTransition(() => router.push("/portal/products"));
        return;
      }

      const next = new URLSearchParams(params.toString());

      const applyList = (key: string, values: string[] | undefined) => {
        next.delete(key);
        if (values?.length) for (const v of values) next.append(key, v);
      };

      if (patch.search !== undefined) {
        const q = patch.search.trim();
        if (q) next.set("q", q);
        else next.delete("q");
      }
      if (patch.brandIds !== undefined) applyList("brand", patch.brandIds);
      if (patch.categoryIds !== undefined) applyList("category", patch.categoryIds);
      if (patch.familyIds !== undefined) applyList("family", patch.familyIds);
      if (patch.distributorIds !== undefined) applyList("distributor", patch.distributorIds);

      if (patch.stock !== undefined) {
        if (patch.stock && patch.stock !== "any") next.set("stock", patch.stock);
        else next.delete("stock");
      }
      if (patch.kind !== undefined) {
        if (patch.kind && patch.kind !== "any") next.set("kind", patch.kind);
        else next.delete("kind");
      }
      if (patch.hasDiscount !== undefined) {
        if (patch.hasDiscount) next.set("discount", "1");
        else next.delete("discount");
      }
      if (patch.favoritesOnly !== undefined) {
        if (patch.favoritesOnly) next.set("fav", "1");
        else next.delete("fav");
      }
      if (patch.crestronOnly !== undefined) {
        if (patch.crestronOnly) next.set("crestron", "1");
        else next.delete("crestron");
      }
      if (patch.minPrice !== undefined) {
        if (typeof patch.minPrice === "number" && Number.isFinite(patch.minPrice))
          next.set("minPrice", String(patch.minPrice));
        else next.delete("minPrice");
      }
      if (patch.maxPrice !== undefined) {
        if (typeof patch.maxPrice === "number" && Number.isFinite(patch.maxPrice))
          next.set("maxPrice", String(patch.maxPrice));
        else next.delete("maxPrice");
      }
      if (patch.sort !== undefined) next.set("sort", patch.sort);
      if (patch.view !== undefined) next.set("view", patch.view);
      if (patch.pageSize !== undefined) {
        if (patch.pageSize && patch.pageSize !== 24) next.set("perPage", String(patch.pageSize));
        else next.delete("perPage");
      }
      if (patch.page !== undefined) {
        if (patch.page > 1) next.set("page", String(patch.page));
        else next.delete("page");
      } else {
        next.delete("page");
      }

      startTransition(() => {
        router.push(`/portal/products?${next.toString()}`);
      });
    },
    [params, router]
  );

  function toggleInList(
    current: string[] | undefined,
    id: string,
    key: "brandIds" | "categoryIds" | "familyIds" | "distributorIds"
  ) {
    const set = new Set(current || []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    push({ [key]: [...set] } as Patch);
  }

  return { push, toggleInList, isPending, params };
}
