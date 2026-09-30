import { getReference, getTestProduct, type Product, type Reference } from "../src/core";

export const product = (id: string): Product => getTestProduct(id)!;
export const ref = (id: string): Reference => getReference(id)!;

/** 규칙 테스트용 가상 레퍼런스 (라이브러리에는 없다) */
export function syntheticRef(patch: Partial<Reference>): Reference {
  return { ...ref("TREF03"), id: "TREF90", art_direction: "Synthetic", ...patch };
}
