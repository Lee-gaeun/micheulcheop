# 무료 배포: Render + Supabase

이 설정은 Render의 Free 웹 서비스와 Supabase의 Free 프로젝트를 사용합니다. 유료 디스크·유료 데이터베이스를 만들지 않습니다. 무료 사용량을 넘기면 제한이 생길 수 있으므로 대시보드에서 사용량을 확인하세요.

## 1. Supabase 프로젝트

1. Supabase에 GitHub 계정으로 로그인하고 Free 조직/프로젝트를 만듭니다. 가까운 지역을 선택합니다.
2. SQL Editor에서 저장소의 `supabase/schema.sql`을 실행합니다.
3. Connect 또는 Settings → API Keys에서 프로젝트 URL과 **backend secret key (`sb_secret_...`)**를 확인합니다. 공개 publishable 키가 아닙니다.
4. 비밀 키는 Render의 환경변수에만 입력합니다. GitHub, `config.js`, 채팅 또는 프런트엔드 코드에 넣지 않습니다.

SQL은 RLS가 켜진 서버 전용 상태 테이블과 비공개 사진 버킷을 만듭니다. 앱 서버가 로그인·수첩 멤버 권한을 확인한 뒤 데이터와 사진 주소를 반환합니다. 공개 사용자에게 테이블 읽기·쓰기 권한을 주지 않습니다.

## 2. Render 서비스

Render에서 GitHub 저장소 `Lee-gaeun/micheulcheop`을 연결합니다. Blueprint로 `render.yaml`을 사용하거나 아래 값으로 Web Service를 만듭니다.

| 항목 | 값 |
| --- | --- |
| Runtime | Node |
| Plan | Free |
| Region | Singapore |
| Branch | main |
| Build Command | `npm run check` |
| Start Command | `npm start` |
| Health Check Path | `/healthz` |

환경변수:

| 이름 | 입력할 내용 |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24.18.0` |
| `KAKAO_REST_API_KEY` | 현재 카카오 앱의 REST API 키 |
| `KAKAO_CLIENT_SECRET` | 그 REST API 키의 Client Secret |
| `SUPABASE_URL` | Supabase 프로젝트 HTTPS URL |
| `SUPABASE_SECRET_KEY` | Supabase backend secret key |
| `SUPABASE_MEDIA_BUCKET` | `micheulcheop-media` |

Render는 서버의 `PORT`와 `RENDER_EXTERNAL_URL`을 자동 제공합니다. 로컬 `.env.local`의 `PORT=5174`, `PUBLIC_ORIGIN=http://localhost:5174`를 운영 환경에 복사하지 마세요. 커스텀 도메인인 경우에만 `PUBLIC_ORIGIN`을 실제 HTTPS origin으로 지정합니다.

운영 환경에서 Supabase 설정이 없거나 사진 버킷이 공개되어 있으면 서버는 시작하지 않습니다. 무료 서버의 임시 디스크로 조용히 대체하지 않습니다.

## 3. 카카오의 운영 주소 등록

Render가 발급한 실제 주소가 `https://<서비스주소>.onrender.com`이라면:

- JavaScript 키의 SDK 도메인에 그 HTTPS 주소를 추가합니다.
- 로그인에 사용하는 REST API 키의 Redirect URI에 `https://<서비스주소>.onrender.com/auth/kakao/callback`을 추가합니다.
- 카카오맵 사용 설정과 카카오 로그인은 ON으로 유지합니다.
- 개발 모드 앱이라면 친구 계정이 로그인 가능한지 앱의 팀/테스트 계정 범위를 확인합니다.

실제 발급받은 주소를 사용해야 합니다. 문서의 `<서비스주소>`를 그대로 입력하지 마세요.

## 4. 배포 확인

1. 실제 서비스의 `/healthz` 응답에서 `ok: true`, `storage: supabase` 확인.
2. 카카오 로그인 후 앱으로 돌아오는지 확인.
3. 공유 수첩 생성 → 초대 링크 → 다른 계정 참여 → 글·사진·댓글 확인.
4. 서버를 재배포한 뒤 같은 수첩과 사진이 유지되는지 확인. 로그인 세션은 재시작 후 다시 인증할 수 있습니다.
5. 권한 없는 계정이 다른 수첩에 접근할 수 없는지 확인.

## 기존 데이터 옮기기

브라우저의 개인 수첩은 자동으로 업로드하지 않습니다. 앱에서 공유 수첩으로 전환하면 필요한 기록을 업로드합니다.

이미 로컬 서버 `.data/collaboration.json`에 저장한 공유 수첩이 있으면, 먼저 파일을 별도 백업하고 로컬 서버를 중지한 상태에서 `.env.local`에 대상 Supabase의 두 설정을 넣습니다. 이후:

```text
node scripts/import-to-supabase.mjs --confirm
```

대상이 비어 있을 때만 가져옵니다. 기존 클라우드 데이터가 있으면 덮어쓰지 않고 중단합니다. 로컬 원본 파일은 삭제하지 않습니다. 이 작업은 실제 공유 기록과 사진을 지정한 Supabase 프로젝트에 업로드합니다.

## 무료 서비스의 제한과 데이터 보관

- Render Free는 사용하지 않으면 잠들어 첫 접속이 느릴 수 있습니다.
- Supabase Free는 장기간 사용하지 않으면 프로젝트가 일시 중지될 수 있고 용량·전송량 제한이 있습니다.
- 기록은 Supabase DB에, 업로드 사진은 비공개 Storage에 저장합니다. 이미지 접근 주소는 5분 후 만료됩니다. 이미 발급된 주소는 그 만료 시점까지 유효할 수 있습니다.
- 현재 작은 그룹용 JSON 상태 테이블과 버전 비교 저장을 사용합니다. 여러 서버 간 충돌 시 최신 상태에서 다시 시도합니다. 사용자가 크게 늘면 테이블을 정규화하고 세션 저장소를 별도로 운영해야 합니다.
- 삭제·교체된 사진의 오래된 Storage 파일은 자동 제거하지 않습니다. 용량 정리 전 현재 DB에서 참조 중인 파일인지 확인해야 합니다.
- 공유 기록을 JSON으로 백업할 때 사진은 일시적인 접근 링크로 포함됩니다. 영구적인 사진 백업은 Supabase Storage 파일과 DB를 함께 보관해야 합니다.
- 개발용 서비스에 필요한 비밀 값은 Render 환경변수로만 전달합니다. 계정 가입·접근 연결·실제 배포 완료 전에는 공용 서비스가 생성된 것이 아닙니다.

공식 문서: [Render Free](https://render.com/docs/free), [Render Blueprints](https://render.com/docs/blueprint-spec), [Supabase Free](https://supabase.com/pricing), [Supabase API keys](https://supabase.com/docs/guides/api/api-keys).
