"""사용자 수정사항 검사 (X11). web/src/core/notes.ts와 같은 규칙."""
import re

I = re.IGNORECASE
P1_VIOLATIONS = [
    (re.compile(r"로고.*(빼|없애|제거|지워|바꿔|변경|숨겨)|(remove|delete|hide|change|replace)\b.*\blogo", I), "로고 변경·제거"),
    (re.compile(r"비율.*(바꿔|변경|늘려|줄여)|(제품|패키지|포장).*(길게|납작하게|뚱뚱하게|늘려|늘이)|(change|alter|stretch|squash)\b.*\b(proportion|ratio|shape)", I), "형태·비율 변경"),
    (re.compile(r"(패키지|제품|포장).*(색|컬러).*(바꿔|변경)|(recolor|change)\b.*\b(package|product|pack)\b.*\bcolou?r", I), "제품 색 변경"),
    (re.compile(r"(문구|글자|텍스트|인쇄).*(바꿔|변경|빼|없애|지워|번역)|(translate|remove|change|rewrite)\b.*\b(text|print|label)", I), "인쇄·문구 변경"),
    (re.compile(r"(그래픽|일러스트|캐릭터|사진|얼굴).*(바꿔|변경|빼|없애|다시 그려)|(redraw|change|remove)\b.*\b(graphic|illustration|character|face|photo)", I), "패키지 그래픽 변경"),
    (re.compile(r"(뚜껑|마개|부품|실링).*(빼|없애|제거|열어)|(remove|open)\b.*\b(lid|cap|seal)|(단면|자른|잘라|절단)|\b(cut|cross[- ]section|slice (it|the product))\b", I), "구조 변경"),
]

PEDESTAL_REMOVAL = re.compile(r"(단상|받침대|받침).*(빼|없애|제거|치워)|remove\b.*\b(pedestal|plinth|stand)|no (pedestal|plinth)", I)


def screen_notes(notes):
    accepted, rejected = [], []
    for raw in notes or []:
        note = raw.strip()
        if not note:
            continue
        hit = next((reason for rx, reason in P1_VIOLATIONS if rx.search(note)), None)
        if hit:
            rejected.append({"note": note, "reason": hit})
        else:
            accepted.append(note)
    return accepted, rejected


def requests_pedestal_removal(notes):
    return any(PEDESTAL_REMOVAL.search(n) for n in notes)
