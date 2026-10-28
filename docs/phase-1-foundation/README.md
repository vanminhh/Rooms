# Phase 1 · Foundation – các phần

Mục tiêu (roadmap, `docs/spec/01-architecture.md#roadmap`): 3 vai đăng nhập và vào đúng layout; kiểm DB vẫn 50/50; có unit test cho scope guard.

Mỗi phần là một file `feature_p1-*.md` giống `feature_login.md` trước đây: danh sách task, "Done when", câu hỏi cho chủ dự án, nhật ký lỗi. Trạng thái task chỉ ghi trong các file này (hai file `auth/feature_login.md` giờ chỉ trỏ sang đây).

| File | Việc | Cần xong trước | Cách làm |
|---|---|---|---|
| [feature_p1-0-setup.md](feature_p1-0-setup.md) | Supabase `.env`, cài thư viện, proxy `/api` | – | Bằng tay |
| [feature_p1-1-backend-foundation.md](feature_p1-1-backend-foundation.md) | BE-LOGIN-01..08: Prisma, migration, seed, khung API, định dạng lỗi | P1-SETUP-01, 02 | Pipeline |
| [feature_p1-2-backend-auth.md](feature_p1-2-backend-auth.md) | BE-LOGIN-09..25: mật khẩu, token, endpoint `/auth/*`, guard, scope, test e2e | Phần 1 | Pipeline |
| [feature_p1-3-frontend-form-kit.md](feature_p1-3-frontend-form-kit.md) | FE-LOGIN-06: ô nhập, ô mật khẩu, checkbox, báo lỗi, spinner trong bộ kit | – | Pipeline |
| [feature_p1-4-frontend-auth.md](feature_p1-4-frontend-auth.md) | FE-LOGIN-04..16: api client, AuthProvider, router + 3 layout, các trang đăng nhập và mật khẩu | FE-LOGIN-02, 03, phần 2, phần 3 | Pipeline |
| [feature_p1-5-qa.md](feature_p1-5-qa.md) | Danh sách kiểm tay, kiểm DB 50/50, thử API, FE-LOGIN-17, chốt Phase 1 | Theo từng task | Bằng tay |

Thứ tự:

```
P1-0 (SETUP-01, 02) ──► P1-1 ──► P1-2 ──┐
P1-0 (FE-LOGIN-02, 03) ─────────────────┼──► P1-4 ──► FE-LOGIN-17, P1-QA-04
P1-3 ───────────────────────────────────┘
P1-5: QA-01 làm ngay · QA-02 sau P1-1 · QA-03 sau P1-2
```

P1-3 làm song song với P1-1 và P1-2 được, vì sửa file khác nhau và không cần API.
