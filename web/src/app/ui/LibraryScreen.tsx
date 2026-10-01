"use client";
// W4 · Reference Library (선택 모드: USP N에 쓸 레퍼런스 / 탐색 모드: 추천 제외 관리). Figma 647:525
import { useMemo, useState } from "react";
import {
  fitLabel, getTestProduct, referenceMeta, REFERENCES, scoreReference, uploadedProduct, type Product,
} from "@/core";
import { usedByOthers, type AppState } from "../state";
import { PageTitle, type AppEnv } from "./common";

const PAGE_SIZE = 10;

interface Props {
  s: AppState;
  env: AppEnv;
  onSelect: (id: string) => void;
  onToggleExcluded: (id: string) => void;
}

function currentProduct(s: AppState): Product {
  const id = s.productImages.find((p) => p.test_id)?.test_id;
  return (id && getTestProduct(id)) || uploadedProduct(s.productName || undefined);
}

type Seg<T extends string> = { value: T; label: string };

function Segments<T extends string>({ label, options, value, onChange }: { label: string; options: Seg<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="filter" role="group" aria-label={label}>
      <span>{label}</span>
      {options.map((o) => (
        <button key={o.value} className="segment" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function LibraryScreen({ s, env, onSelect, onToggleExcluded }: Props) {
  const selecting = s.libraryFor !== null;
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("");
  const [aspect, setAspect] = useState<"all" | "1:1" | "4:5" | "2:3">("all");
  const [pedestal, setPedestal] = useState<"all" | "yes" | "no">("all");
  const [count, setCount] = useState<"all" | "one" | "many">("all");
  const [page, setPage] = useState(0);

  const product = currentProduct(s);
  const used = usedByOthers(s.usps, s.libraryFor);
  const scored = useMemo(
    () => REFERENCES.map((r) => ({ r, score: scoreReference(product, r).total })).sort((a, b) => b.score - a.score || a.r.id.localeCompare(b.r.id)),
    [product],
  );
  const directions = [...new Set(REFERENCES.map((r) => r.art_direction))];
  const q = query.trim().toLowerCase();
  const filtered = scored.filter(({ r }) => {
    if (direction && r.art_direction !== direction) return false;
    if (aspect !== "all" && r.aspect !== aspect) return false;
    if (pedestal !== "all" && r.pedestal.present !== (pedestal === "yes")) return false;
    if (count !== "all" && (r.composition.product_count > 1) !== (count === "many")) return false;
    if (!q) return true;
    const hay = [r.id, r.art_direction, r.ko?.name, r.ko?.wall_color, r.ko?.floor_color, r.ko?.lighting_type, ...(r.ko?.props.map((p) => p.short) ?? []), r.background.wall_color, r.background.floor_color]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const reset = () => setPage(0);

  return (
    <div className="body">
      {selecting ? (
        <PageTitle
          title={`USP ${s.libraryFor! + 1}에 쓸 레퍼런스`}
          description={`고른 레퍼런스는 USP ${s.libraryFor! + 1}(시안 ${s.libraryFor! + 1})에 매칭돼요. 다른 번호가 이미 쓰고 있는 레퍼런스는 고를 수 없어요.`}
        />
      ) : (
        <PageTitle title="Reference Library" description="이 제품과 잘 맞는 순서로 보여요. 추천에서 빼고 싶은 레퍼런스는 ‘추천 제외’를 누르세요." />
      )}
      <div className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
        <div className="input" style={{ flex: 1 }}>
          <input value={query} placeholder="제품 · 무드 · 오브제로 검색" aria-label="레퍼런스 검색" onChange={(e) => { setQuery(e.target.value); reset(); }} />
        </div>
        <select className="select" aria-label="Art Direction" value={direction} onChange={(e) => { setDirection(e.target.value); reset(); }}>
          <option value="">Art Direction 전체</option>
          {directions.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div className="filters">
        <Segments label="종횡비" value={aspect} onChange={(v) => { setAspect(v); reset(); }} options={[{ value: "all", label: "전체" }, { value: "1:1", label: "1:1" }, { value: "4:5", label: "4:5" }, { value: "2:3", label: "2:3" }]} />
        <Segments label="단상" value={pedestal} onChange={(v) => { setPedestal(v); reset(); }} options={[{ value: "all", label: "전체" }, { value: "yes", label: "있음" }, { value: "no", label: "없음" }]} />
        <Segments label="제품 수" value={count} onChange={(v) => { setCount(v); reset(); }} options={[{ value: "all", label: "전체" }, { value: "one", label: "1개" }, { value: "many", label: "여러 개" }]} />
      </div>
      <p className="muted">전체 {REFERENCES.length}개 중 {filtered.length}개 · 이 제품과 잘 맞는 순서예요</p>
      {shown.length === 0 && <p className="muted">조건에 맞는 레퍼런스가 없어요.</p>}
      <div className="lib-grid">
        {shown.map(({ r, score }) => {
          const fit = fitLabel(score);
          const excluded = s.excluded.includes(r.id);
          const usedBy = used.get(r.id);
          return (
            <article key={r.id} className="lib-card">
              <img src={env.assetUrl("reference", r.id)} alt={r.ko?.name ?? r.id} />
              <div className="row" style={{ gap: 6 }}>
                <span className={`tag ${fit.tone === "best" ? "tag-positive" : fit.tone === "ok" ? "tag-neutral" : "tag-warning"}`} title={`매칭 점수 ${score}`}>{fit.label}</span>
                {usedBy !== undefined && <span className="tag tag-info">USP {usedBy + 1}에 사용 중</span>}
                {excluded && <span className="tag tag-neutral">추천 제외됨</span>}
              </div>
              <p className="name">{r.id} · {r.ko?.name ?? r.art_direction}</p>
              <p className="meta">{referenceMeta(r, { productCount: true })}</p>
              {selecting ? (
                excluded ? (
                  <button className="btn btn-outline" onClick={() => onToggleExcluded(r.id)}>추천에 다시 사용</button>
                ) : (
                  <button className="btn btn-accent" disabled={usedBy !== undefined} onClick={() => onSelect(r.id)}>{usedBy !== undefined ? "선택 불가" : "선택"}</button>
                )
              ) : (
                <button className={`btn ${excluded ? "btn-accent" : "btn-outline"}`} onClick={() => onToggleExcluded(r.id)}>{excluded ? "추천에 다시 사용" : "추천 제외"}</button>
              )}
            </article>
          );
        })}
      </div>
      {pages > 1 && (
        <div className="pagination">
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} className="segment" aria-pressed={page === i} onClick={() => setPage(i)}>{i + 1}</button>
          ))}
        </div>
      )}
      <p className="small">테스트용 레퍼런스예요. 출처·사용 권한을 확인하지 못해 내부 테스트에만 써요(C-03).</p>
    </div>
  );
}
