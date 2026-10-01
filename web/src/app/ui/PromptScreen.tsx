"use client";
// S2 · 분석·프롬프트 (API 연결 없음, Figma 646:2384)
import { useState } from "react";
import { directionTag, getReference, INPUT_LIMITS, PROMPT_MAX_CHARS, referenceMeta, type Draft, type Overrides } from "@/core";
import type { AppState } from "../state";
import { copyText, NoticeBanner, PageTitle, type AppEnv } from "./common";

interface Props {
  s: AppState;
  env: AppEnv;
  busyIndex: number | null;
  onBack: () => void;
  onRegenerate: (d: Draft, overrides: Overrides) => void;
}

export function PromptScreen({ s, env, busyIndex, onBack, onRegenerate }: Props) {
  return (
    <div className="body">
      <PageTitle
        title="시안 프롬프트"
        description="시안마다 프롬프트를 복사해 ChatGPT에서 이미지를 만들어요. 오브제·소품·색상은 시안별로 고쳐서 그 시안만 다시 만들 수 있어요."
      >
        <button className="btn btn-outline" onClick={onBack}>← 입력으로</button>
      </PageTitle>
      {s.notice ? (
        <NoticeBanner label="안내" tone="warn">{s.notice}</NoticeBanner>
      ) : (
        <NoticeBanner label="먼저 확인">
          이미지는 ChatGPT에서 만들어요. 각 카드의 ‘이미지 받기’로 레퍼런스를 받고, ‘프롬프트 복사’로 프롬프트를 복사한 뒤 아래 안내대로 진행하세요.
        </NoticeBanner>
      )}
      <div className="cards">
        {s.drafts.map((d) => (
          <PromptCard key={d.index} d={d} s={s} env={env} busy={busyIndex === d.index} onRegenerate={(o) => onRegenerate(d, o)} />
        ))}
      </div>
      <GuidePanel />
    </div>
  );
}

function referenceDownload(d: Draft, s: AppState, env: AppEnv): { href: string; name: string } | null {
  if (d.reference_uploaded) {
    const u = s.usps.filter((x) => x.text.trim())[d.usp?.index ?? -1]?.reference;
    return u?.kind === "upload" ? { href: u.data_url, name: u.name } : null;
  }
  const r = getReference(d.reference_id);
  return r ? { href: env.assetUrl("reference", r.id), name: r.file.split("/").pop() ?? `${r.id}.jpg` } : null;
}

function PromptCard({ d, s, env, busy, onRegenerate }: { d: Draft; s: AppState; env: AppEnv; busy: boolean; onRegenerate: (o: Overrides) => void }) {
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [props, setProps] = useState(d.resolution.overrides.props ?? "");
  const [colors, setColors] = useState(d.resolution.overrides.colors ?? "");
  const ref = getReference(d.reference_id);
  const dl = referenceDownload(d, s, env);
  const half = Math.ceil(d.prompt.checklist.length / 2);

  if (d.status === "failed" && !d.prompt.text) {
    return (
      <article className="prompt-card">
        <div className="card-head"><span className="title">시안 {d.index + 1}</span><span className="tag tag-info">{directionTag(d.direction, d.usp?.index)}</span></div>
        {d.usp && <p className="usp-line">USP {d.usp.index + 1}  {d.usp.text}</p>}
        <p className="warn-text">{d.error}</p>
      </article>
    );
  }

  return (
    <article className="prompt-card" aria-label={`시안 ${d.index + 1}`}>
      <div className="card-head">
        <span className="title">시안 {d.index + 1}</span>
        <span className="tag tag-info">{directionTag(d.direction, d.usp?.index)}</span>
        <span className="spacer" />
        <button
          className="btn btn-accent"
          onClick={async () => { setCopied(await copyText(d.prompt.text)); setTimeout(() => setCopied(false), 1500); }}
        >
          {copied ? "복사했어요" : "프롬프트 복사"}
        </button>
      </div>
      {d.usp && <p className="usp-line">USP {d.usp.index + 1}  {d.usp.text}</p>}
      <div className="ref-box">
        {d.reference_uploaded ? (dl ? <img src={dl.href} alt="" /> : <div className="thumb" />) : <img src={env.assetUrl("reference", d.reference_id)} alt="" />}
        <div className="meta">
          <strong>{d.reference_name}</strong>
          <span>{ref ? referenceMeta(ref) : referenceMeta({ uploaded: true } as never)}</span>
        </div>
        {dl && (env.canDownload === false
          ? <a className="btn btn-outline" href={dl.href} target="_blank" rel="noreferrer">이미지 받기</a>
          : <a className="btn btn-outline" href={dl.href} download={dl.name}>이미지 받기</a>)}
      </div>
      <div className="prompt-box">
        <div className={`prompt-text${full ? " full" : ""}`}>{d.prompt.text}</div>
        <div className="prompt-meta">
          <button className="link" onClick={() => setFull(!full)} aria-expanded={full}>{full ? "접기" : "전문 보기"}</button>
          <span>{d.prompt.length} / {PROMPT_MAX_CHARS}자</span>
        </div>
      </div>
      <div className="checklist">
        <p>프롬프트 조건 확인</p>
        <div className="grid">
          {[d.prompt.checklist.slice(0, half), d.prompt.checklist.slice(half)].map((col, k) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {col.map((c) => (
                <div key={c.label} className={`check${c.pass ? "" : " fail"}`}><b>{c.pass ? "✓" : "!"}</b><span>{c.label}</span></div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {d.remaining_issues.length > 0 && <p className="warn-text">남은 문제: {d.remaining_issues.join(" · ")}</p>}
      {d.warnings.map((w) => <p key={w} className="warn-text">{w}</p>)}
      <div className="edit-section">
        <button className="edit-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span>오브제·소품·색상 수정하기</span><b>{open ? "－" : "＋"}</b>
        </button>
        {open && (
          <>
            <span className="muted">오브제·소품</span>
            <div className="input">
              <input value={props} maxLength={INPUT_LIMITS.override_max} placeholder="자동: 패키지 그래픽 기반 범용 오브제" onChange={(e) => setProps(e.target.value)} />
            </div>
            <span className="muted">색상</span>
            <div className="input">
              <input value={colors} maxLength={INPUT_LIMITS.override_max} placeholder="자동: 대표 포인트 컬러 기준" onChange={(e) => setColors(e.target.value)} />
            </div>
            <p className="small">제품 자체의 색·형태·로고는 바뀌지 않아요. 바꾸는 요청은 반영하지 않아요.</p>
            <div className="row">
              <button className="btn btn-accent" disabled={busy || (!props.trim() && !colors.trim())} onClick={() => onRegenerate({ props: props.trim() || undefined, colors: colors.trim() || undefined })}>
                {busy ? "만드는 중…" : "프롬프트 다시 만들기"}
              </button>
              <button className="btn btn-outline" disabled={busy} onClick={() => { setProps(""); setColors(""); onRegenerate({}); }}>자동 값으로 되돌리기</button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function GuidePanel() {
  const steps = [
    "ChatGPT에서 새 대화를 열고 제품 원본 이미지를 올려요. 추가 첨부 이미지(로고 확대·제품 형태)도 함께 올려요.",
    "시안 카드의 ‘이미지 받기’로 받은 레퍼런스 이미지도 올려요. 레퍼런스는 배경·조명·배치·카메라 각도만 참고하고, 그 안의 제품은 복제하지 않아요.",
    "‘프롬프트 복사’로 복사해 붙여 넣으면, 카드에 표시된 종횡비(레퍼런스와 같은 비율)의 이미지 1장을 만들어 줘요.",
    "결과를 제품 원본과 형태 → 로고·인쇄 → 장면 순서로 확인해요. 달라진 부분이 있으면 짚어서 1회만 수정을 요청하세요.",
  ];
  return (
    <section className="guide" aria-labelledby="guide-title">
      <h2 id="guide-title">ChatGPT에서 이미지 만들기</h2>
      {steps.map((t, i) => (
        <div key={i} className="guide-step"><span className="dot">{i + 1}</span><p>{t}</p></div>
      ))}
      <p className="muted" style={{ lineHeight: 1.5 }}>
        ChatGPT에서 이 앱을 불러 쓰면 위 과정(생성 지시 → 검증 → 교정 1회 → 결과 기록)이 ChatGPT 안에서 이어져요. 사진만으로 실제 치수나 픽셀 단위 인쇄 일치를 확인할 수는 없어요.
      </p>
    </section>
  );
}
