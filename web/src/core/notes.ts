// 사용자 수정사항 검사 (X11). 제품 보존(P1)을 훼손하는 요청은 제외하고 경고한다.

const P1_VIOLATIONS: ReadonlyArray<{ re: RegExp; reason: string }> = [
  { re: /로고.*(빼|없애|제거|지워|바꿔|변경|숨겨)|(remove|delete|hide|change|replace)\b.*\blogo/i, reason: "로고 변경·제거" },
  { re: /비율.*(바꿔|변경|늘려|줄여)|(제품|패키지|포장).*(길게|납작하게|뚱뚱하게|늘려|늘이)|(change|alter|stretch|squash)\b.*\b(proportion|ratio|shape)/i, reason: "형태·비율 변경" },
  { re: /(패키지|제품|포장).*(색|컬러).*(바꿔|변경)|(recolor|change)\b.*\b(package|product|pack)\b.*\bcolou?r/i, reason: "제품 색 변경" },
  { re: /(문구|글자|텍스트|인쇄).*(바꿔|변경|빼|없애|지워|번역)|(translate|remove|change|rewrite)\b.*\b(text|print|label)/i, reason: "인쇄·문구 변경" },
  { re: /(그래픽|일러스트|캐릭터|사진|얼굴).*(바꿔|변경|빼|없애|다시 그려)|(redraw|change|remove)\b.*\b(graphic|illustration|character|face|photo)/i, reason: "패키지 그래픽 변경" },
  { re: /(뚜껑|마개|부품|실링).*(빼|없애|제거|열어)|(remove|open)\b.*\b(lid|cap|seal)|(단면|자른|잘라|절단)|\b(cut|cross[- ]section|slice (it|the product))\b/i, reason: "구조 변경" },
];

export interface NoteScreenResult {
  accepted: string[];
  rejected: Array<{ note: string; reason: string }>;
}

/** 빈 문자열은 버리고, P1 훼손 요청은 rejected로 분리한다 */
export function screenNotes(notes: readonly string[] | undefined): NoteScreenResult {
  const accepted: string[] = [];
  const rejected: Array<{ note: string; reason: string }> = [];
  for (const raw of notes ?? []) {
    const note = raw.trim();
    if (!note) continue;
    const hit = P1_VIOLATIONS.find((v) => v.re.test(note));
    if (hit) rejected.push({ note, reason: hit.reason });
    else accepted.push(note);
  }
  return { accepted, rejected };
}

/** 단상 제거 요청인지 (CONDITIONAL 단상) */
export function requestsPedestalRemoval(notes: readonly string[]): boolean {
  return notes.some((n) => /(단상|받침대|받침).*(빼|없애|제거|치워)|remove\b.*\b(pedestal|plinth|stand)|no (pedestal|plinth)/i.test(n));
}
