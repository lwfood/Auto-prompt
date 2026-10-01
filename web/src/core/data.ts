// 저장소의 규칙·라이브러리 JSON을 그대로 읽는다. engine(Python)과 같은 파일을 쓴다.
import libraryJson from "../../../references/library.json";
import productsJson from "../../../tests/fixtures/products/products.json";
import packageClassesJson from "../../../engine/rules/package_classes.json";
import matchingWeightsJson from "../../../engine/rules/matching_weights.json";
import type { PackageClass, Product, Reference } from "./types";

export interface MatchingWeights {
  hard_filters: string[];
  score_max: number;
  weights: { product_fit: number; prop_match: number; color_match: number };
  penalties: { structure_trick_incidental: number };
  fit_labels: { best: number; ok: number };
}

export const REFERENCES: readonly Reference[] = libraryJson.references as unknown as Reference[];
export const TEST_PRODUCTS: readonly Product[] = productsJson.products as unknown as Product[];
export const PACKAGE_CLASSES: readonly PackageClass[] =
  packageClassesJson.classes as unknown as PackageClass[];
export const MATCHING_WEIGHTS: MatchingWeights = matchingWeightsJson as MatchingWeights;

export const REFERENCE_ID_RE = /^TREF\d{2}$/;
export const PRODUCT_ID_RE = /^TPROD\d{2}$/;

export function getReference(id: string): Reference | undefined {
  return REFERENCES.find((r) => r.id === id);
}

export function getTestProduct(id: string): Product | undefined {
  return TEST_PRODUCTS.find((p) => p.id === id);
}

export function getPackageClass(id: string | null): PackageClass | undefined {
  return id ? PACKAGE_CLASSES.find((c) => c.id === id) : undefined;
}
