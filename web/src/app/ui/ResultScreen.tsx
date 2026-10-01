"use client";
// S3 · 시안 결과 (API 연결 있음, Figma 646:2621). 현재 어댑터는 mock이라 실제 이미지는 없다.
import { useState } from "react";
import { directionTag, getReference, INPUT_LIMITS, type Draft } from "@/core";
import type { AppState } from "../state";
import { NoticeBanner, PageTitle } from "./common";

interface Props {
  s: AppState;
  busyIndex: number | null;
  onBack: () => void;
  onLibrary: () => void;
  onCorrect: (d: Draft, note: string) => void;
}

export function ResultScreen({ s, busyIndex, onBack, onLibrary, onCorrect }: Props) {
  const anyImage = s.drafts.some((d) => d.image && !d.image.mock);
  return (
    <div className="body">
      <PageTitle title="시안 결과" description="시안마다 생성과 검증이 따로 진행돼요. 마음에 들지 않는 시안만 골라서 수정을 요청할 수 있어요(시안당 1회)." />
      {s.notice && <NoticeBanner label="안내" tone="warn">{s.notice}</NoticeBanner>}
      <div className="cards">
        {s.drafts.map((d) => (
          <ResultCard key={d.index} d={d} generating={busyIndex === d.index} left={s.correctionsLeft[d.index] ?? 1} onCorrect={(n) => onCorrect(d, n)} />
        ))}
      </div>
      <div className="footer">
        <button className="btn btn-outline btn-lg" onClick={onBack}>← 입력으로</button>
        <span className="spacer" />
        <button className="btn btn-outline btn-lg" onClick={onLibrary}>Reference Library 탐색</button>
        <button className="btn btn-accent btn-lg" disabled={!anyImage} title={anyImage ? undefined : "mock 어댑터라 받을 이미지가 없어요"}>완료된 시안 모두 다운로드</button>
      </div>
    </div>
  );
}

function ResultCard({ d, generating, left, onCorrect }: { d: Draft; generating: boolean; left: number; onCorrect: (note: string) => void }) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const ref = getReference(d.reference_id);
  const refLine = ref ? `${d.reference_name} · ${ref.aspect}` : d.reference_name;
  const v = d.verification;
  const done = !generating && d.status === "done";
  return (
    <article className="result-card" aria-label={`시안 ${d.index + 1}`} aria-busy={generating}>
      <div>
        <div className="card-head"><span className="title">시안 {d.index + 1}</span><span className="tag tag-info">{directionTag(d.direction, d.usp?.index)}</span></div>
        <p className="muted" style={{ marginTop: 4 }}>{refLine}</p>
      </div>
      <div className="image-area">
        {generating ? "생성 중이에요…" : d.status === "failed" ? `생성 실패: ${d.error}` : d.image?.mock ? "mock 어댑터 · 실제 이미지는 만들지 않았어요" : "생성된 시안 이미지"}
      </div>
      {done && v && (
        <>
          <div className="row" style={{ gap: 6 }}>
            <span className={`tag ${v.shape_pass ? "tag-positive" : "tag-warning"}`}>형태 {v.shape_pass ? "✓" : "✕"}</span>
            <span className={`tag ${v.logo_pass ? "tag-positive" : "tag-warning"}`}>{v.logo_pass ? "로고 100% ✓" : "로고 ✕"}</span>
            <span className={`tag ${v.scene_pass ? "tag-positive" : "tag-warning"}`}>구도 {Math.round(v.scene_ratio * 100)}% {v.scene_pass ? "✓" : "✕"}</span>
            {d.image?.mock && <span className="tag tag-neutral">mock 검증</span>}
          </div>
          <p className="muted">{d.remaining_issues.length ? `남은 문제: ${d.remaining_issues.join(" · ")}` : "남은 문제 없음"}</p>
        </>
      )}
      {asking && done && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="input">
            <input value={note} maxLength={INPUT_LIMITS.text_max} placeholder="달라진 부분을 짚어 주세요 (예: 오브제를 왼쪽으로)" onChange={(e) => setNote(e.target.value)} />
          </div>
          <p className="small">제품 자체의 색·형태·로고를 바꾸는 요청은 반영하지 않아요.</p>
        </div>
      )}
      <div className="actions">
        {asking && done ? (
          <>
            <button className="btn btn-outline" onClick={() => { setAsking(false); setNote(""); }}>취소</button>
            <button className="btn btn-dark" disabled={!note.trim()} onClick={() => { onCorrect(note.trim()); setAsking(false); setNote(""); }}>수정 요청 보내기</button>
          </>
        ) : (
          <>
            <button className="btn btn-outline" disabled={!done || left < 1} onClick={() => setAsking(true)}>
              {done ? (left > 0 ? `수정 요청 (${left}회 남음)` : "수정 요청 (사용함)") : "수정 요청"}
            </button>
            <button className="btn btn-dark" disabled={!done || !d.image || d.image.mock} title={d.image?.mock ? "mock 어댑터라 받을 이미지가 없어요" : undefined}>다운로드</button>
          </>
        )}
      </div>
    </article>
  );
}
