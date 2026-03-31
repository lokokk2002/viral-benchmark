@AGENTS.md

## Zeabur 環境變數（完整清單）

> **每次修改環境變數時，請將以下完整內容貼到 Zeabur → viral-benchmark → Variable → Edit Raw Variables**
> **注意：實際值存在 .env.local 和 Zeabur 環境變數中，此處僅為結構參考**

```
NEXT_PUBLIC_SUPABASE_URL=<supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
N8N_WEBHOOK_SCAN=<n8n-webhook-url>/viral-benchmark-scan
N8N_WEBHOOK_SHOOT_PLAN=<n8n-webhook-url>/viral-benchmark-shoot-plan
N8N_WEBHOOK_SLACK_PLAN=<n8n-webhook-url>/viral-benchmark-slack-plan
N8N_WEBHOOK_KEYWORD_SUGGEST=<n8n-webhook-url>/viral-benchmark-keyword-suggest
N8N_WEBHOOK_GENERATE_SCRIPT=<n8n-webhook-url>/viral-benchmark-generate-script
N8N_WEBHOOK_SCRIPT_DONE=<n8n-webhook-url>/viral-benchmark-script-done
TIKHUB_API_KEY=<tikhub-api-key>
TIKHUB_API_BASE_URL=https://api.tikhub.io
SLACK_BOT_TOKEN=<slack-bot-token>
SLACK_CHANNEL_ID=<slack-channel-id>
GEMINI_API_KEY=<gemini-api-key>
APP_PASSWORD=<app-login-password>
SESSION_SECRET=<session-hmac-secret>
```