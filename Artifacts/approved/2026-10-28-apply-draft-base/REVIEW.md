# Vá 2 chỗ hở của cách làm bản nháp

Trạng thái: ĐÃ DUYỆT 28/10/2026
Task / spec: yêu cầu của chủ dự án 28/10/2026: `apply-draft` từ chối khi file chính đã đổi kể từ lúc soạn nháp; eslint website bỏ qua `artifact_FE/approved`
Gốc: cad211e

## Làm gì, vì sao

1. **Chép đè không báo.** `apply-draft.mjs` chép nguyên file nháp lên file chính. Hai bản nháp cùng sửa một file, hoặc một bạn trong nhóm vừa sửa file đó: bản áp dụng sau xóa mất thay đổi kia mà không ai biết.
   Sửa: `REVIEW.md` có dòng mới `Gốc: <commit>` (commit lúc tạo bản nháp). Khi bản nháp **sửa file đang có**, lệnh so từng file đích với bản của nó ở commit `Gốc` (bằng `git rev-parse <Gốc>:<file>` và `git hash-object <file>`, nên không bị lệch vì xuống dòng CRLF trên Windows). Có file nào khác thì **không chép file nào**, in danh sách file và lệnh `git diff` để xem. Thiếu dòng `Gốc`, hoặc repo không có commit đó (chưa kéo nhánh), cũng từ chối. Bản nháp chỉ **thêm** file mới thì không cần `Gốc`; nhưng nếu ở đích đã có file trùng tên xuất hiện sau `Gốc` thì vẫn bị từ chối.
2. **Lint website quét bản nháp cũ.** `eslint .` chỉ bỏ qua `dist`, nên lint cả code cũ trong `artifact_FE/approved/`. Sửa: thêm `'artifact_FE/approved'` vào `globalIgnores`. Bản nháp đang làm vẫn được lint như cũ.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `.claude/scripts/apply-draft.mjs` | cùng đường dẫn | Sửa: kiểm `Gốc` trước khi chép |
| `.claude/scripts/apply-draft.test.mjs` | cùng đường dẫn | Sửa: thêm test chép đè; test cũ dùng repo git có commit |
| `Source/frontend/eslint.config.js` | cùng đường dẫn | Sửa: bỏ qua `artifact_FE/approved` |
| `Artifacts/README.md` | cùng đường dẫn | Sửa: dòng `Gốc` trong mẫu `REVIEW.md`, bước 1 và 3 của quy trình, ghi chú lint |

Không sửa `CLAUDE.md`.

## Cách xem và kiểm tra

- `node --test Artifacts/2026-10-28-apply-draft-base/.claude/scripts/apply-draft.test.mjs`
- So `Artifacts/README.md` nháp với bản chính: chỉ khác dòng `Gốc` trong mẫu, câu cuối bước 1, gạch đầu dòng thứ 3 của bước 3, và "(trừ `approved/`)".

## Đã kiểm tra

28/10/2026:

- Test `apply-draft` nháp: 4/4 QUA. Test mới kiểm các trường hợp:
  - sửa file đang có mà thiếu `Gốc` → từ chối;
  - `Gốc` không có trong repo → từ chối;
  - file đích bị bạn khác sửa sau `Gốc`, và một file đích mới xuất hiện sau `Gốc` → từ chối, cả hai file chính giữ nguyên, bản nháp còn nguyên;
  - làm đúng lời nhắc (commit, ghi `Gốc` mới) → chép được.
- Trên repo thật (Windows, CRLF): `git hash-object` của `CLAUDE.md`, `Source/backend/CLAUDE.md`, `Artifacts/README.md` trùng đúng bản ở `HEAD`, nên file không đổi sẽ không bị từ chối nhầm.
- eslint, với file tạm có 4 lỗi trong `artifact_FE/approved/zz-tmp-old/` (đã xóa sau khi thử):
  - cấu hình chính hiện tại: báo 4 lỗi, exit 1;
  - cấu hình nháp: bỏ qua file đó, exit 0;
  - cấu hình nháp trên cả website: exit 0.
- `npx eslint .` với cấu hình chính hôm nay: exit 0. Bản nháp cũ trong `approved/` hiện chưa làm lint đỏ; bản vá này chặn trước.
- Đã thêm `Gốc: cad211e` vào `REVIEW.md` của 2 bản nháp đang chờ (`Artifacts/2026-10-28-phase-1-tasks/`, `Source/backend/artifact_BE/2026-10-28-vitest-skip-approved/`). Các file đích của chúng chưa đổi so với `cad211e` (`git status` sạch).

## Giả định hoặc câu hỏi cho chủ dự án

- Bản nháp này được chép bằng `apply-draft` **cũ** (chưa kiểm `Gốc`). Các bản nháp áp dụng sau đó mới được kiểm.
- Bản nháp cũ đang chờ mà sửa file đang có (vd các bản 3D trong `artifact_FE/`) cần thêm dòng `Gốc` trước khi áp dụng. Nếu không biết commit lúc tạo, so tay file đích với bản nháp rồi ghi commit hiện tại.
- Giới hạn: file chính đang có thay đổi chưa commit lúc tạo bản nháp sẽ bị từ chối nhầm (an toàn, không mất gì); vì vậy mẫu yêu cầu commit file đích trước.

Đã chép vào file chính 28/10/2026 bằng apply-draft.mjs: 4 file.
