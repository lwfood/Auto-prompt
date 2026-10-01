"use client";
// 화면 흐름: S1 입력 → S2 분석·프롬프트 (이미지 API 없음) 또는 S3 시안 결과 (이미지 API 연결, 현재 mock). 라이브러리(W4)는 어디서든.
import { useState } from "react";
import type { Draft, Overrides } from "@/core";
import { applyRework, initialState, requestBody, toggleExcluded, type AppState } from "../state";
import { AppHeader, LibraryHeader, NoticeBanner, type AppEnv, type StepState } from "./common";
import { InputScreen } from "./InputScreen";
import { LibraryScreen } from "./LibraryScreen";
import { PromptScreen } from "./PromptScreen";
import { ResultScreen } from "./ResultScreen";

export function App({ env, initial }: { env: AppEnv; initial?: Partial<AppState> }) {
  const [s, setS] = useState<AppState>({ ...initialState, ...initial });
  const [busy, setBusy] = useState(false);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<AppState>) => setS((cur) => ({ ...cur, ...patch }));

  function steps(): Array<{ label: string; state: StepState }> {
    if (s.imageApi) {
      const at = s.screen === "S3" ? 2 : 0;
      return ["입력", "분석·프롬프트", "결과"].map((label, i) => ({ label, state: i < at ? "done" : i === at ? "current" : "todo" }));
    }
    const at = s.screen === "S2" ? 1 : 0;
    return ["입력", "분석·프롬프트"].map((label, i) => ({ label, state: i < at ? "done" : i === at ? "current" : "todo" }));
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await env.run({ action: "create", ...requestBody(s) });
      if (!r.ok) return setError(r.data?.error ?? "프롬프트를 만들지 못했어요.");
      const drafts = r.data.drafts as Draft[];
      set({
        drafts,
        productLabel: r.data.product.name_on_pack,
        screen: s.imageApi ? "S3" : "S2",
        correctionsLeft: Object.fromEntries(drafts.map((d) => [d.index, d.corrected ? 0 : 1])),
        notice: null,
      });
      window.scrollTo?.(0, 0);
    } catch (e) {
      setError(`요청을 보내지 못했어요: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function rework(d: Draft, extra: { overrides?: Overrides; notes?: string[] }) {
    const snapshot = [...s.excluded];
    setBusyIndex(d.index);
    try {
      const r = await env.run({
        action: "regenerate",
        ...requestBody(s),
        draft: { index: d.index, direction: d.direction, usp_index: d.usp?.index ?? null, reference_id: d.reference_id },
        ...extra,
      });
      setS((cur) => applyRework(cur, snapshot, r.ok ? { ok: true, draft: r.data.draft } : { ok: false, error: r.data?.draft?.error ?? r.data?.error ?? `HTTP ${r.status}` }));
    } catch (e) {
      setS((cur) => applyRework(cur, snapshot, { ok: false, error: (e as Error).message }));
    } finally {
      setBusyIndex(null);
    }
  }

  const openLibrary = (forUsp: number | null) => set({ screen: "LIB", libraryFor: forUsp, libraryReturn: s.screen === "LIB" ? s.libraryReturn : s.screen });

  return (
    <>
      {s.screen === "LIB" ? (
        <LibraryHeader onBack={() => set({ screen: s.libraryReturn, libraryFor: null })} />
      ) : (
        <AppHeader steps={steps()} onLibrary={s.screen === "S2" ? undefined : () => openLibrary(null)} />
      )}
      <main>
        {error && (
          <div className="body" style={{ paddingBottom: 0 }}>
            <NoticeBanner label="오류" tone="warn">{error}</NoticeBanner>
          </div>
        )}
        {s.screen === "S1" && (
          <InputScreen s={s} set={set} env={env} busy={busy} onCreate={create} onPickLibrary={(i) => openLibrary(i)} onError={setError} />
        )}
        {s.screen === "S2" && (
          <PromptScreen s={s} env={env} busyIndex={busyIndex} onBack={() => set({ screen: "S1", notice: null })} onRegenerate={(d, overrides) => rework(d, { overrides })} />
        )}
        {s.screen === "S3" && (
          <ResultScreen
            s={s}
            busyIndex={busyIndex}
            onBack={() => set({ screen: "S1", notice: null })}
            onLibrary={() => openLibrary(null)}
            onCorrect={async (d, note) => {
              set({ correctionsLeft: { ...s.correctionsLeft, [d.index]: 0 } });
              await rework(d, { notes: [note] });
            }}
          />
        )}
        {s.screen === "LIB" && (
          <LibraryScreen
            s={s}
            env={env}
            onToggleExcluded={(id) => set({ excluded: toggleExcluded(s.excluded, id) })}
            onSelect={(id) => {
              const i = s.libraryFor!;
              set({
                usps: s.usps.map((u, k) => (k === i ? { ...u, reference: { kind: "library", id } } : u)),
                screen: s.libraryReturn,
                libraryFor: null,
              });
            }}
          />
        )}
      </main>
    </>
  );
}
