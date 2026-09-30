"use client";

import { useState } from "react";
import {
  DIRECTION_LABEL_KO, INPUT_LIMITS, MOCK_NOTICE, REFERENCES, STAGE_LABEL_KO, TEST_PRODUCTS,
  type Draft, type InputImage, type MatchScore,
} from "@/core";
import { addImage, applyRework, canStart, initialState, toggleExcluded, type AppState } from "./state";

async function run(body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const imgSrc = (i: InputImage) => i.data_url ?? `/api/assets/product/${i.test_id}`;

export default function Home() {
  const [s, setS] = useState<AppState>(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swap, setSwap] = useState<{ index: number; alts: MatchScore[]; widened: boolean; snapshot: string[] } | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);

  const payload = () => ({ images: s.images, usp: s.usp.trim() || undefined, excluded: s.excluded });

  async function create() {
    setBusy(true); setError(null);
    const r = await run({ action: "create", ...payload() });
    setBusy(false);
    if (!r.ok) return setError(r.data.error ?? "만들기에 실패했습니다");
    setS({ ...s, drafts: r.data.drafts, productName: r.data.product.name_on_pack, screen: "S2", notice: null });
  }

  async function rework(draft: Draft, patch: { reference_id?: string; notes?: string[] }, snapshot: string[]) {
    setBusy(true);
    const r = await run({
      action: "regenerate",
      ...payload(),
      draft: { index: draft.index, direction: draft.direction, reference_id: draft.reference_id },
      ...patch,
    });
    setBusy(false);
    setS((cur) => applyRework(cur, snapshot, r.ok ? { ok: true, draft: r.data.draft } : { ok: false, error: r.data.draft?.error ?? r.data.error ?? `HTTP ${r.status}` }));
  }

  async function openSwap(draft: Draft) {
    setBusy(true);
    const r = await run({ action: "alternatives", ...payload(), current_reference_id: draft.reference_id });
    setBusy(false);
    if (!r.ok) return setError(r.data.error ?? "대안을 불러오지 못했습니다");
    setSwap({ index: draft.index, alts: r.data.alternatives, widened: r.data.widened, snapshot: [...s.excluded] });
  }

  return (
    <main>
      <header className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Reference Image Director</h1>
          <div className="muted">{MOCK_NOTICE}</div>
        </div>
        <button onClick={() => setShowLibrary(true)}>라이브러리</button>
      </header>

      {error && <div className="notice" role="alert">{error}</div>}
      {s.notice && <div className="notice" role="status">{s.notice}</div>}

      {s.screen === "S1" && (
        <InputScreen s={s} setS={setS} busy={busy} onCreate={create} />
      )}
      {s.screen === "S2" && (
        <DraftsScreen
          s={s}
          busy={busy}
          onBack={() => setS({ ...s, screen: "S1" })}
          onDetail={(i) => setS({ ...s, screen: "S4", detailIndex: i })}
          onSwap={openSwap}
        />
      )}
      {s.screen === "S4" && s.detailIndex !== null && (
        <DetailScreen
          draft={s.drafts.find((d) => d.index === s.detailIndex)!}
          busy={busy}
          onBack={() => setS({ ...s, screen: "S2" })}
          onSwap={openSwap}
          onNotes={(notes) => rework(s.drafts.find((d) => d.index === s.detailIndex)!, { notes }, [...s.excluded])}
        />
      )}

      {swap && (
        <SwapModal
          swap={swap}
          excluded={s.excluded}
          busy={busy}
          onToggleExcluded={(id) => setS({ ...s, excluded: toggleExcluded(s.excluded, id) })}
          onClose={() => setSwap(null)}
          onPick={async (refId) => {
            const draft = s.drafts.find((d) => d.index === swap.index)!;
            const snapshot = swap.snapshot;
            setSwap(null);
            await rework(draft, { reference_id: refId }, snapshot);
          }}
        />
      )}

      {showLibrary && (
        <Library
          excluded={s.excluded}
          onToggle={(id) => setS({ ...s, excluded: toggleExcluded(s.excluded, id) })}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </main>
  );
}

function InputScreen({ s, setS, busy, onCreate }: { s: AppState; setS: (s: AppState) => void; busy: boolean; onCreate: () => void }) {
  const full = s.images.length >= INPUT_LIMITS.images_max;
  return (
    <section>
      <h2>S1 입력</h2>
      <div className="panel">
        <h3>제품 이미지 ({s.images.length}/{INPUT_LIMITS.images_max})</h3>
        <div className="grid">
          {s.images.map((img, k) => (
            <div key={k}>
              <img className="thumb" src={imgSrc(img)} alt={img.name ?? img.test_id ?? "업로드 이미지"} />
              <div className="row" style={{ marginTop: 6 }}>
                <select
                  aria-label="이미지 역할"
                  value={img.role}
                  onChange={(e) => setS({ ...s, images: s.images.map((x, j) => (j === k ? { ...x, role: e.target.value as InputImage["role"] } : x)) })}
                >
                  <option value="product">제품</option>
                  <option value="reference">레퍼런스</option>
                </select>
                <button onClick={() => setS({ ...s, images: s.images.filter((_, j) => j !== k) })}>삭제</button>
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <label className="row">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={full}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const data_url = await readAsDataUrl(f);
                setS({ ...s, images: addImage(s.images, { role: s.images.some((i) => i.role === "product") ? "reference" : "product", data_url, name: f.name }) });
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <h3 style={{ marginTop: 16 }}>샘플 제품으로 체험하기</h3>
        <div className="row">
          {TEST_PRODUCTS.map((p) => (
            <button key={p.id} disabled={full} onClick={() => setS({ ...s, images: addImage(s.images.filter((i) => i.role !== "product"), { role: "product", test_id: p.id }) })}>
              {p.name_on_pack}
            </button>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <h3>USP (선택)</h3>
        <textarea
          rows={2}
          maxLength={INPUT_LIMITS.text_max}
          placeholder="제품의 핵심 장점. 입력하면 USP 기준 시안이 추가됩니다."
          value={s.usp}
          onChange={(e) => setS({ ...s, usp: e.target.value })}
        />
        <div className="muted">{s.usp.length}/{INPUT_LIMITS.text_max}</div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="primary" disabled={!canStart(s.images) || busy} onClick={onCreate}>
          {busy ? "만드는 중…" : "만들기"}
        </button>
        {!canStart(s.images) && <span className="muted">제품 이미지가 있어야 시작할 수 있습니다.</span>}
      </div>
    </section>
  );
}

function Verification({ d }: { d: Draft }) {
  if (!d.verification) return <span className="muted">검증 안 함</span>;
  const v = d.verification;
  return (
    <span>
      {STAGE_LABEL_KO.shape} {v.shape_pass ? "통과" : "미달"} → {STAGE_LABEL_KO.logo_print} {v.logo_pass ? "통과" : "미달"} → {STAGE_LABEL_KO.scene} {Math.round(v.scene_ratio * 100)}%
      {d.corrected && " (교정 1회)"}
      {d.image?.mock && " · mock 검증(실제 이미지 확인 아님)"}
    </span>
  );
}

function DraftsScreen({ s, busy, onBack, onDetail, onSwap }: { s: AppState; busy: boolean; onBack: () => void; onDetail: (i: number) => void; onSwap: (d: Draft) => void }) {
  const [full, setFull] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  return (
    <section>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>S2 프롬프트 · {s.productName} · 시안 {s.drafts.length}개</h2>
        <button onClick={onBack}>입력으로</button>
      </div>
      <div className="grid">
        {s.drafts.map((d) => (
          <article key={d.index} className="panel">
            <h3>시안 {d.index + 1} · {DIRECTION_LABEL_KO[d.direction]}</h3>
            <img className="thumb" src={`/api/assets/reference/${d.reference_id}`} alt={`레퍼런스 ${d.reference_id}`} />
            <div className="muted">레퍼런스 {d.reference_id} · 점수 {d.match_score} · {d.prompt.length}자</div>
            {d.status === "failed" ? (
              <p className="bad">실패: {d.error}</p>
            ) : (
              <>
                <div className={`prompt${full === d.index ? " full" : ""}`}>{d.prompt.text}</div>
                <div className="row" style={{ marginTop: 6 }}>
                  <button onClick={() => setFull(full === d.index ? null : d.index)}>{full === d.index ? "접기" : "전문 보기"}</button>
                  <button onClick={async () => { await navigator.clipboard.writeText(d.prompt.text); setCopied(d.index); }}>
                    {copied === d.index ? "복사됨" : "프롬프트 복사"}
                  </button>
                </div>
                <h3 style={{ marginTop: 10 }}>한국어 요약</h3>
                <ul className="clean muted">{d.prompt.summary_ko.slice(0, 4).map((l, k) => <li key={k}>{l}</li>)}</ul>
                <div style={{ marginTop: 6 }}><Verification d={d} /></div>
                {d.remaining_issues.length > 0 && <p className="bad">남은 문제 {d.remaining_issues.length}건</p>}
              </>
            )}
            <div className="row" style={{ marginTop: 8 }}>
              <button disabled={busy} onClick={() => onSwap(d)}>레퍼런스 교체</button>
              <button onClick={() => onDetail(d.index)}>상세</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DetailScreen({ draft: d, busy, onBack, onSwap, onNotes }: { draft: Draft; busy: boolean; onBack: () => void; onSwap: (d: Draft) => void; onNotes: (notes: string[]) => void }) {
  const [note, setNote] = useState("");
  return (
    <section>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>S4 상세 · 시안 {d.index + 1} · {DIRECTION_LABEL_KO[d.direction]}</h2>
        <button onClick={onBack}>시안 목록</button>
      </div>
      <div className="panel">
        <div className="prompt full">{d.prompt.text || "(프롬프트 없음)"}</div>
        <h3 style={{ marginTop: 12 }}>반영 사항</h3>
        <ul className="clean">{d.prompt.summary_ko.map((l, k) => <li key={k}>{l}</li>)}</ul>
        <h3 style={{ marginTop: 12 }}>배경색</h3>
        <p>{d.background_color}</p>
        <h3>검증</h3>
        <p><Verification d={d} /></p>
        {d.verification && (
          <ul className="clean muted">
            {d.verification.checks.map((c, k) => <li key={k}>[{STAGE_LABEL_KO[c.stage]}] {c.item}: {c.pass ? "통과" : "미달"}</li>)}
          </ul>
        )}
        <h3 style={{ marginTop: 12 }}>남은 문제</h3>
        {d.remaining_issues.length ? <ul className="clean bad">{d.remaining_issues.map((l, k) => <li key={k}>{l}</li>)}</ul> : <p>없음</p>}
        {d.warnings.map((w, k) => <div key={k} className="notice">{w}</div>)}
        <p className="muted">검증은 항목별 체크이며 실제 치수·픽셀 단위 인쇄 일치를 확인한 것이 아닙니다.</p>
        <h3 style={{ marginTop: 12 }}>도구</h3>
        <div className="row"><button disabled={busy} onClick={() => onSwap(d)}>레퍼런스 교체</button></div>
        <div style={{ marginTop: 12 }}>
          <textarea rows={2} maxLength={INPUT_LIMITS.text_max} placeholder="수정사항 (예: 소품을 더 적게)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="primary" style={{ marginTop: 6 }} disabled={busy || !note.trim()} onClick={() => { onNotes([note.trim()]); setNote(""); }}>
            수정사항 추가해서 다시 만들기
          </button>
        </div>
      </div>
    </section>
  );
}

function SwapModal({ swap, excluded, busy, onToggleExcluded, onClose, onPick }: {
  swap: { index: number; alts: MatchScore[]; widened: boolean };
  excluded: string[];
  busy: boolean;
  onToggleExcluded: (id: string) => void;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="레퍼런스 교체">
      <div className="panel modal">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>시안 {swap.index + 1} 레퍼런스 교체</h2>
          <button onClick={onClose}>닫기</button>
        </div>
        {swap.widened && <p className="muted">같은 Art Direction의 대안이 부족해 다른 방향까지 넓혔습니다.</p>}
        {swap.alts.length === 0 && <p>교체할 수 있는 대안이 없습니다.</p>}
        <div className="grid" style={{ marginTop: 12 }}>
          {swap.alts.map((a) => (
            <div key={a.reference_id}>
              <img className="thumb" src={`/api/assets/reference/${a.reference_id}`} alt={a.reference_id} />
              <div className="muted">{a.reference_id} · 점수 {a.total}</div>
              {a.reasons.length > 0 && <div className="muted">{a.reasons.join(", ")}</div>}
              <div className="row" style={{ marginTop: 6 }}>
                <button className="primary" disabled={busy || excluded.includes(a.reference_id)} onClick={() => onPick(a.reference_id)}>이 레퍼런스로 교체</button>
                <button onClick={() => onToggleExcluded(a.reference_id)}>{excluded.includes(a.reference_id) ? "제외 취소" : "추천 제외"}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Library({ excluded, onToggle, onClose }: { excluded: string[]; onToggle: (id: string) => void; onClose: () => void }) {
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="레퍼런스 라이브러리">
      <div className="panel modal">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>라이브러리 ({REFERENCES.length})</h2>
          <button onClick={onClose}>닫기</button>
        </div>
        <p className="muted">테스트용 레퍼런스입니다. 출처·사용 권한 미확인(C-03), 내부 테스트 전용.</p>
        <div className="grid">
          {REFERENCES.map((r) => (
            <div key={r.id}>
              <img className="thumb" src={`/api/assets/reference/${r.id}`} alt={r.id} />
              <div><strong>{r.id}</strong> <span className="tag">{r.aspect}</span></div>
              <div className="muted">{r.art_direction} · 카메라 {r.camera.elevation_deg}°</div>
              <label className="row" style={{ marginTop: 4 }}>
                <input type="checkbox" checked={!excluded.includes(r.id)} onChange={() => onToggle(r.id)} /> 추천에 사용
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
