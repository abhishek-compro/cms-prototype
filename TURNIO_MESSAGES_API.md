# Turn.io WhatsApp API: Local Reference Specification

A local copy of the Turn.io API docs, rewritten as a specification you can build from without going back to the website.

| | |
|---|---|
| **Compiled** | 2026-11-08, from the full page HTML (not summaries) |
| **Base URL** | `https://whatsapp.turn.io` |
| **Pages covered** | `rate_limiting`, `messages`, `extensions`, `errors`, `settings`, `media`, `health`, plus the nested pages they depend on: `authentication`, `webhooks`, `contacts`, and Meta's Cloud API error-code reference |
| **Source URL pattern** | `https://whatsapp.turn.io/docs/api/<page>` (the site's own nav links point at `docs.turn.io`, which does not resolve) |

**Reading guide.** Each section gives, in order: what it does, the request, parameters, response, then **Nuances** (behaviour that is easy to get wrong). Items the docs contradict or omit are tagged **[DOC GAP]** and collected in [Appendix C](#appendix-c-doc-gaps-and-contradictions). Nothing in this file is guessed. Where something comes from outside the Turn docs it is labelled.

## Contents

1. [Conventions](#1-conventions)
2. [Authentication](#2-authentication)
3. [Rate limiting](#3-rate-limiting)
4. [Sending messages](#4-sending-messages)
5. [Media](#5-media)
6. [Webhooks](#6-webhooks)
7. [Contacts](#7-contacts)
8. [API extensions](#8-api-extensions)
9. [Settings](#9-settings)
10. [Errors](#10-errors)
11. [Health](#11-health)
12. [Cookbook](#12-cookbook)
- [Appendix A: Endpoint index](#appendix-a-endpoint-index)
- [Appendix B: Template language codes](#appendix-b-template-language-codes)
- [Appendix C: Doc gaps and contradictions](#appendix-c-doc-gaps-and-contradictions)

---

## 1. Conventions

| Item | Value |
|---|---|
| Base URL | `https://whatsapp.turn.io` |
| Auth header | `Authorization: Bearer <token>` |
| JSON bodies | `Content-Type: application/json` |
| Non-JSON bodies | Raw binary (media upload, profile photo), `text/csv` (contact import), `multipart/form-data` (resumable upload), form fields (some template calls) |
| Vendor header | `Accept: application/vnd.v1+json`. Required to unlock the extension endpoints (messages history, labels, chats, claims, contacts, export/import). |
| Contact identifier | Phone number, **digits only, no `+`** (e.g. `27123456789`), or a BSUID (e.g. `US.13491208655302741918`) |
| Phone number in Graph paths | `<phone number without leading +>` |

**Endpoint families**

| Family | Prefix | Examples |
|---|---|---|
| Core (WhatsApp Business API compatible) | `/v1/...` | messages, media, settings, health |
| Turn extensions | `/v1/...` | contacts, chats, labels, claims, export/import. Several need the `Accept: application/vnd.v1+json` header. |
| Graph-compatible | `/graph/v14.0/...` | message templates, resumable upload |
| Apps | `/apps/:app_install_uuid` | counted in the `general` rate-limit bucket |

**Design principle (from the docs).** Turn's API is "completely aligned" with the official WhatsApp Business API. Turn's additions are exposed through **HTTP headers** (`Accept: application/vnd.v1+json`, `X-Turn-*`) so that the base API stays compatible.

**Delivery model.** Sending is **synchronous** with the upstream gateway. A success response means the gateway accepted the message for delivery. Turn.io does **not** queue outbound messages, so a failed call is not retried by Turn. Retrying is your job.

---

## 2. Authentication

### 2.1 Personal access token (use this by default)

1. Open the Turn UI, then **Settings > API & Webhooks**.
2. Click **Create a Token**. You choose a **name** and an **expiration date**.
3. Send it on every request:

```
Authorization: Bearer <token>
```

### 2.2 Login-issued token (Graph endpoints)

Use this only if you need direct access to `https://whatsapp.turn.io/graph/<API_VERSION>/<WHATSAPP_BUSINESS_PHONE_NUMBER_ID>/`. The username and password are on the same Settings page.

```bash
curl -X POST --user 'username:password' https://whatsapp.turn.io/v1/users/login
```
```json
{"users":[{"token":"eyJhbGciOHlXVCJ9.eyJ1c2VyIjoNTIzMDE2Nn0.mEoF0COaO00Z1cANo","expires_after":"2018-03-01 15:29:26+00:00"}]}
```

**Nuances**
- **Generating a login token invalidates the previous token for that number.** Any integration using the old token starts failing immediately. To get a token without breaking existing integrations, create one in the UI.
- Login uses HTTP Basic Auth over HTTPS. The response is a `users` array whose entries carry `token` and `expires_after`.
- The template endpoints also accept the token as an `access_token` field or query parameter (see [8.7](#87-message-templates-graph-compatible)).
- **[DOC GAP]** No token scopes or permissions, no default expiry, and no renewal flow are documented.

---

## 3. Rate limiting

| Rule | Value |
|---|---|
| Default | **60 calls per 60 seconds** |
| Scope | Per number, and within the number per bucket. Not per account. |
| Coverage | All API endpoints |
| Over the limit | `HTTP 429` |
| Changing limits | Contact Turn.io |

**Buckets**

| Bucket | What lands in it |
|---|---|
| `general` | The default, including App endpoints (`/apps/:app_install_uuid`) |
| `text` | API calls that send text messages |
| `media` | API calls that send a message with **any** media attachment |

**Nuances**
- App requests and other API requests **share one `general` allowance** per number.
- The allowance is applied per category, so text sends and media sends do not draw from the same pool.
- The docs do not assign other endpoints (contacts, labels, export) to a bucket. Assume `general`.

**Response headers** (sent on responses, not only on 429)

| Header | Meaning |
|---|---|
| `Retry-After` | Seconds to wait before the next request (standard HTTP header) |
| `X-Ratelimit-Bucket` | Bucket the call was counted under |
| `X-Ratelimit-Limit` | Calls allowed in the window (currently `60`) |
| `X-Ratelimit-Remaining` | Calls left in the current window. Windows reset every 60 s. |
| `X-Ratelimit-Reset` | Unix timestamp in epoch seconds when the limit resets |

```
Retry-After: 1
X-Ratelimit-Bucket: general
X-Ratelimit-Limit: 60
X-Ratelimit-Remaining: 21
X-Ratelimit-Reset: 1533715145
```

**Throttling.** Turn.io can force clients that ignore their allowance to slow down. A response with `X-throttling: 1` means you are being throttled. Instead of returning 429, Turn.io **holds the HTTP connection open** until your number is back within its allowance. Set client timeouts with this in mind, and do not treat a slow response as a failure.

**Client guidance (derived from the above).** Read `X-Ratelimit-Remaining` and slow down before hitting zero. On 429, wait `Retry-After` seconds. Budget text and media sends separately.

---

## 4. Sending messages

`POST /v1/messages`

Rate limited per number (`text` or `media` bucket depending on payload).

**Success response** (same shape for every message type)
```json
{"messages":[{"id":"gBEGkYiEB1VXAglK1ZEqA1YKPrU"}]}
```
Template sends can return a Cloud-API style ID, e.g. `wamid.HBgNNTUyMTk5NjE2NTQxORUCABEYEjU0MUVERTBENDNCMzZCQjZDQwA=`. Treat IDs as opaque strings.

**Error response.** A body with an error message. See [Errors](#10-errors).

### 4.1 Fields common to all types

| Field | Required | Description |
|---|---|---|
| `to` | Conditional | Recipient's WhatsApp ID (phone number). Required if `recipient` is absent. |
| `recipient` | Conditional | Recipient's BSUID, e.g. `US.13491208655302741918`. Required if `to` is absent. |
| `type` | Depends | Optional for text (defaults to `text`). Required for everything else. |
| `recipient_type` | No | `"individual"` appears in the text and media examples. |

**Optional request headers on this endpoint**

| Header | Purpose |
|---|---|
| `X-Turn-In-Reply-To: <external-id>` | Link this outbound message to an earlier inbound one. See [8.5](#85-linking-an-outbound-message-to-an-inbound). |
| `X-Turn-Claim-Extend: <claim-uuid>` | Extend a conversation claim by 5 minutes. See [8.8](#88-conversation-claiming). |
| `X-Turn-Claim-Release: <claim-uuid>` | Release a conversation claim. See [8.8](#88-conversation-claiming). |

### 4.2 Text

| Parameter | Required | Default | Description |
|---|---|---|---|
| `text.body` | Yes | | The text to send |
| `preview_url` | No | `false` | Set `true` to show a link preview. The URL in the body **must begin with `http://` or `https://`**. |
| `type` | No | `text` | May be omitted |
| `to` / `recipient` | Conditional | | See 4.1 |

```bash
curl -X POST "https://whatsapp.turn.io/v1/messages" \
  -H "Authorization: Bearer token" -H "Content-Type: application/json" \
  -d '{"preview_url": false, "recipient_type": "individual", "to": "whatsapp-id",
       "type": "text", "text": {"body": "your-text-message-content"}}'
```

**Formatting inside `text.body`**

| Style | Syntax | Example |
|---|---|---|
| Bold | `*text*` | `Your total is *$10.50*.` |
| Italic | `_text_` | `Welcome to _WhatsApp_!` |
| Strikethrough | `~text~` | `~This~ is better` |
| Code | triple backticks | ```` ```print 'Hello World';``` ```` |

### 4.3 Reaction

Reacts with an emoji to a message the customer sent. Same format as the WhatsApp Cloud API reaction message.

| Parameter | Required | Description |
|---|---|---|
| `type` | Yes | Must be `reaction` |
| `reaction.message_id` | Yes | ID of the message you are reacting to |
| `reaction.emoji` | Yes | Emoji to apply. **Empty string `""` removes a reaction you previously sent.** |

```json
{"to":"whatsapp-id","type":"reaction","reaction":{"message_id":"the-message-id-you-are-reacting-to","emoji":"👍"}}
```

**Nuance.** To remove a reaction, repeat the same request with `"emoji": ""`.

### 4.4 Media

Sends audio, image, video, document or sticker.

**Flow:** upload first (`POST /v1/media`, see [5](#5-media)), then send with the returned ID. On receipt, Turn.io uploads the media to WhatsApp and sends it to `to`.

| Parameter | Required | Description |
|---|---|---|
| `type` | Yes | `audio`, `image`, `video`, `document` or `sticker` |
| `<type>.id` | Yes | Media ID returned by the media upload |
| `<type>.caption` | No | Caption for image or document (the doc's example also uses it for video). **Do not use with `audio` or `sticker`.** |

Full shape (one object per type; send only the object matching `type`):
```json
{
  "recipient_type": "individual",
  "to": "whatsapp-id",
  "type": "audio | document | image | sticker | video",
  "audio":    {"id": "your-media-id"},
  "document": {"id": "your-media-id", "caption": "your-document-caption"},
  "image":    {"id": "your-media-id", "caption": "your-image-caption"},
  "sticker":  {"id": "your-media-id"},
  "video":    {"id": "your-media-id", "caption": "your-video-caption"}
}
```

**Nuances**
- The `type` row in the docs' parameter table is garbled (it lists `text, image, audio, document, sticker` and omits `video`). The prose and example both include `video`. Treat `video` as valid. **[DOC GAP]**
- Media IDs are durable (see 5), so you can reuse one ID across many sends.

### 4.5 Templates

Required to start a conversation outside the 24-hour window (WhatsApp rule; Meta error `131047` when you break it).

`type: "template"` plus a `template` object.

| Field | Description |
|---|---|
| `template.namespace` | Template namespace |
| `template.name` | Template name |
| `template.language.code` | e.g. `en`, `pt_BR` (see [Appendix B](#appendix-b-template-language-codes)) |
| `template.language.policy` | `"deterministic"` in every documented example |
| `template.components[]` | Parameters for header, body and buttons |

**Where to find the namespace:** Turn UI > Settings > API & Webhooks > **Generate Credentials** > Message Template API details (shows the namespace and an access token).

> **Daily limit.** Every new number can send templates to **at most 1,000 users per day**. As the audience grows WhatsApp raises the tier per its Quality Rating and Messaging Limits rules. WhatsApp will not start a number on a higher tier, and **Turn.io cannot change or request a tier change**. Tiers depend on organic growth and quality rating.

**Component rules of thumb (from the examples)**

| Component | `type` | Parameter types used |
|---|---|---|
| Header | `header` | `text`; or media: `video`/`image`/`document` object with `link` |
| Body | `body` | `text` (one per `{{n}}` placeholder, in order) |
| Quick reply | `button` + `sub_type: "quick_reply"` + `index` | `payload` |
| URL button | `button` + `sub_type: "url"` + `index` | `text` |

`index` is a **string** (`"0"`, `"1"`) and matches the button position in the approved template.

**A. Text header and body**
```json
{"to":"whatsapp_id","type":"template","template":{
  "namespace":"template-namespace","name":"template-name",
  "language":{"code":"en","policy":"deterministic"},
  "components":[
    {"type":"header","parameters":[{"type":"text","text":"header placeholder value"}]},
    {"type":"body","parameters":[{"type":"text","text":"body placeholder 1 value"},{"type":"text","text":"body placeholder 2 value"}]}
  ]}}
```

**B. Quick-reply buttons** ("interactive templated message")
```json
{"to":"whatsapp_id","type":"template","template":{
  "namespace":"template-namespace","name":"template-name",
  "language":{"code":"en","policy":"deterministic"},
  "components":[
    {"type":"body","parameters":[{"type":"text","text":"body placeholder 1 value"}]},
    {"type":"button","sub_type":"quick_reply","index":"0","parameters":[{"type":"payload","payload":"button-0-payload"}]},
    {"type":"button","sub_type":"quick_reply","index":"1","parameters":[{"type":"payload","payload":"button-1-payload"}]}
  ]}}
```
Each button's `payload` is echoed back in the inbound notification WhatsApp sends when the user taps it.

**C. Media header** (template must have been created with a media header, see 8.7)
```json
{"to":"whatsapp_id","type":"template","template":{
  "namespace":"template-namespace","name":"template-name",
  "language":{"code":"en","policy":"deterministic"},
  "components":[
    {"type":"header","parameters":[{"type":"video","video":{"link":"https://url.com/video-file.mp4"}}]}
  ]}}
```
Unlike plain media messages, a media-header template takes a **URL (`link`)**, not a media ID.

**D. Authentication template (OTP / "Copy code")**

The example template is named `verification_code`. Body: `*{{1}}* is your verification code...`. It has a single URL-type "Copy code" button with `{{1}}` in the URL.

| Component | Requirement |
|---|---|
| `body` | A `text` parameter with the OTP, replacing `{{1}}` in the body |
| `button` | A `text` parameter with the OTP. **`sub_type` must be `"url"` and `index` must be `"0"`.** The code replaces `{{1}}` in the button URL. |

```json
{"to":"whatsapp_id","type":"template","template":{
  "namespace":"template-namespace","name":"verification_code",
  "language":{"code":"en","policy":"deterministic"},
  "components":[
    {"type":"body","parameters":[{"type":"text","text":"123456"}]},
    {"type":"button","sub_type":"url","index":"0","parameters":[{"type":"text","text":"123456"}]}
  ]}}
```

> **`OAuthException: Invalid parameter`** on an authentication send usually means: the `sub_type` doesn't match the template's button type (e.g. `quick_reply` instead of `url`); the button parameters are missing or malformed; or the `index` doesn't match the button position. Call [List templates](#87-message-templates-graph-compatible) and read the button `type` before building the send.

**Nuance, creation vs sending.** You *create* an authentication template with an `otp` / `copy_code` button (8.7). The *list* response shows that same button as `type: "URL"` with a `url` containing `{{1}}`. You *send* it as `sub_type: "url"`. Always send based on the listed structure.

**E. Removed: `hsm`.** `"type": "hsm"` is rejected. Use `template`.

### 4.6 Interactive messages

`type: "interactive"` with an `interactive` object. The docs state "Currently, button and list types are supported" (location request is documented too). They follow WhatsApp's interactive-message format.

#### 4.6.1 Reply buttons (`interactive.type = "button"`)

| Field | Required | Notes |
|---|---|---|
| `interactive.header` | No | `type` is `text`, `image`, `video` or `document` (variants below) |
| `interactive.body.text` | Yes | Body text |
| `interactive.footer.text` | No | Footer text |
| `interactive.action.buttons[]` | Yes | Each: `{"type":"reply","reply":{"id":"...","title":"..."}}` |

Header variants (use exactly one that matches `header.type`):
```jsonc
{"type":"text","text":"your text"}
{"type":"document","document":{"id":"your-media-id","filename":"some-file-name"}}
{"type":"document","document":{"link":"provider-name/protocol://the-url","provider":{"name":"provider-name"},"filename":"some-file-name"}}
{"type":"video","video":{"id":"your-media-id"}}
{"type":"video","video":{"link":"provider-name/protocol://the-url","provider":{"name":"provider-name"}}}
{"type":"image","image":{"id":"your-media-id"}}
{"type":"image","image":{"link":"http(s)://the-url","provider":{"name":"provider-name"}}}
```

```json
{"to":"whatsapp_id","type":"interactive","interactive":{
  "type":"button",
  "body":{"text":"your-text-body-content"},
  "footer":{"text":"your-text-footer-content"},
  "action":{"buttons":[
    {"type":"reply","reply":{"id":"unique-postback-id","title":"First Button's Title"}},
    {"type":"reply","reply":{"id":"unique-postback-id","title":"Second Button's Title"}}
  ]}}}
```

**Nuances**
- `reply.id` is the postback ID you get back when the user taps. Make each one unique (the docs' own example reuses a placeholder, but the label says "unique-postback-id").
- Media headers can reference an uploaded `id` or a `link` with a `provider`.
- **[DOC GAP]** Turn gives no limits on button count, title length or body length. These are WhatsApp limits, see Appendix C.

#### 4.6.2 Start a journey from a reply button (alpha)

> **Alpha.** "This API is still in alpha and subject to change. Features, endpoints, and data structures may be modified or removed in future releases."

Set the button's `reply.id` to `turn-start-journey:<JOURNEY-ID>`. When the contact taps it, Turn.io starts that journey.

```json
{"to":"whatsapp_id","type":"interactive","interactive":{
  "type":"button","body":{"text":"How can we help?"},
  "action":{"buttons":[
    {"type":"reply","reply":{"id":"turn-start-journey:018f2df5-3dad-7eb2-b706-8930546a94c6","title":"Sales"}},
    {"type":"reply","reply":{"id":"turn-start-journey:018f2df6-20e0-7354-9f4c-6a3a43daf896","title":"Support"}}
  ]}}}
```

The docs' own wording is slightly inconsistent about the field (the prose says "button's `id`"; the example puts it in `reply.id`). Use `reply.id`.

#### 4.6.3 List (`interactive.type = "list"`)

| Field | Notes |
|---|---|
| `header` | `{"type":"text","text":"..."}` |
| `body.text` | Message text |
| `footer.text` | Footer text |
| `action.button` | Label of the button that opens the list |
| `action.sections[]` | Each section: `title` plus `rows[]` |
| `rows[]` | Each row: `id`, `title`, `description` |

```json
{"to":"whatsapp_id","type":"interactive","interactive":{
  "type":"list",
  "header":{"type":"text","text":"your-header-content"},
  "body":{"text":"your-text-message-content"},
  "footer":{"text":"your-footer-content"},
  "action":{"button":"cta-button-content","sections":[
    {"title":"your-section-title-content","rows":[{"id":"unique-row-identifier","title":"row-title-content","description":"row-description-content"}]},
    {"title":"your-section-title-content","rows":[{"id":"unique-row-identifier","title":"row-title-content","description":"row-description-content"}]}
  ]}}}
```
The docs' list example has trailing commas after `description`, which is invalid JSON. Don't copy them.

#### 4.6.4 Location request (`interactive.type = "location_request_message"`)

Asks the user to share their location.
```json
{"to":"whatsapp_id","type":"interactive","interactive":{
  "type":"location_request_message",
  "body":{"text":"Please let us know where you are?"},
  "action":{"name":"send_location"}}}
```
The user's reply arrives as an inbound `location` message (see 6.3).

### 4.7 Start a journey from a template quick-reply button

Set the button payload to `turn-start-journey:<JOURNEY-ID>` (e.g. `turn-start-journey:8515561e-2e82-431d-b8f3-e4bac8189183`). Turn.io starts that journey when the user taps the button.

```json
{"to":"whatsapp_id","type":"template","template":{
  "namespace":"template-namespace","name":"template-name",
  "language":{"code":"en","policy":"deterministic"},
  "components":[
    {"type":"body","parameters":[{"type":"text","text":"body placeholder 1 value"}]},
    {"type":"button","sub_type":"quick_reply","index":"0","parameters":[{"type":"payload","payload":"turn-start-journey:018f2df5-3dad-7eb2-b706-8930546a94c6"}]},
    {"type":"button","sub_type":"quick_reply","index":"1","parameters":[{"type":"payload","payload":"turn-start-journey:018f2df6-20e0-7354-9f4c-6a3a43daf896"}]}
  ]}}
```
Journey IDs are UUIDs (v4 and v7 appear in the docs).

---

## 5. Media

Upload once, get an `id`, then reference it in messages (`<type>.id`) or journeys.

| Action | Request | Notes |
|---|---|---|
| Upload | `POST /v1/media` | Body is the raw binary. `Content-Type` must be the file's MIME type. |
| Retrieve | `GET /v1/media/<media-id>` | The docs' example sends no auth header. Send your Bearer token. |
| Delete | `DELETE /v1/media/<media-id>` | Same note on auth. |

```bash
curl -X POST https://whatsapp.turn.io/v1/media \
  -H 'Authorization: Bearer token' \
  -H 'Content-Type: image/jpeg' \
  --data-binary @your-file-path
```
```json
{"media":[{"id":"f043afd0-f0ae-4b9c-ab3d-696fb4c8cd68"}]}
```

**How storage works**
- Turn.io stores the binary in **its own permanent storage** and uploads a copy to WhatsApp's media cache.
- The returned `id` is a **durable reference** you can use indefinitely, including in journeys.
- WhatsApp's cache only keeps files for about **30 days**. Turn.io re-uploads from permanent storage transparently, so you do not need to refresh IDs.
- Uploading a PDF here is equivalent to dragging it into a Document card in the journey canvas. Both give a permanent media ID from the same storage.

**Retrieving.** Mainly for inbound user media. When a user sends media, the client downloads it, then notifies your webhook. Take the media `id` from that notification and `GET` it.

**Deleting.** Use an ID from an upload response, or from an inbound media message in a webhook.

**Upload size.** 64 MB maximum to the media node. WhatsApp then processes the file and applies the per-type limits below.

**Use in journeys.** The `id` replaces a public URL in journey DSL functions: `document(id, filename: "...")`, `image(id)`, `video(id)`, `audio(id)`. This is handy when migrating journeys from another platform: upload your files, then reference IDs instead of self-hosting.
```
card SendTerms do
  document("f043afd0-f0ae-4b9c-ab3d-696fb4c8cd68", filename: "Terms.pdf")
  text("Please review the attached terms.")
end
```

### 5.1 Supported types

Turn.io only guarantees sending and receiving of these types.

| Media | Supported types |
|---|---|
| `audio` | `audio/aac`, `audio/mp4`, `audio/mpeg`, `audio/amr`, `audio/ogg` (**opus codecs only**; plain `audio/ogg` is not supported) |
| `document` | `text/plain`, `application/pdf`, `application/vnd.ms-powerpoint`, `application/msword`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `image` | `image/jpeg`, `image/png`. Must be **8-bit, RGB or RGBA**. |
| `sticker` | `image/webp` |
| `video` | `video/mp4`, `video/3gp`. **H.264 video and AAC audio only.** A single audio stream or none. |

### 5.2 Post-processing limits

WhatsApp will not deliver a message whose media exceeds these sizes after processing.

| Type | Limit |
|---|---|
| audio | 16 MB |
| document | 100 MB |
| image | 5 MB |
| sticker, animated | 500 KB |
| sticker, static | 100 KB |
| video | 16 MB |

**Stickers:** transparent background, **exactly 512 × 512 px**, under 100 KB, `webp` only. Convert other formats with a service such as cloudconvert.

**Troubleshooting.** If an image fails to upload, hidden attributes in the file may be the cause. Strip them with an image compressor (the docs suggest imagecompressor.com) and retry.

---

## 6. Webhooks

Webhooks forward messages from Turn to a service you operate. They are configured in the Turn UI, not via the API (except the primary webhook, see [9.1](#91-application-primary-webhook)).

### 6.1 Subscriptions

Every webhook needs **at least one** subscription. The subscription is sent with each delivery:

```
X-Turn-Hook-Subscription: whatsapp
```

| Subscription | For | Delivers |
|---|---|---|
| `whatsapp` (default) | WhatsApp numbers | Everything the WhatsApp Enterprise Client produces: inbound messages and outbound status notifications |
| `turn` | WhatsApp numbers | Outbound messages dispatched via `POST /v1/messages` |
| `journey_outbound` | WhatsApp numbers | Outbound messages sent by journey automations (journey blocks, AI agent turns, etc.). Same shape as `turn`. |
| `channel` | Channel HTTP API numbers | All inbound and outbound events, in the format a Channel Connector expects |

**Combinations**
- WhatsApp numbers: any mix of `whatsapp`, `turn`, `journey_outbound`.
- Channel HTTP API numbers: subscribe to `channel` only. `whatsapp` and `journey_outbound` also fire on those numbers, but adding them delivers every event **a second time in a WhatsApp-shaped payload** that a connector isn't built for.

**Nuances**
- **Enforce a uniqueness check on message ID.** Double deliveries happen (retries, overlapping subscriptions).
- `journey_outbound` lets you observe every journey message separately from your own API-sent messages (`turn`).
- The `channel` payload spec is on the Channel API page, which is not covered here.

### 6.2 Verifying signatures

| Item | Value |
|---|---|
| Per-webhook settings | `hmac_digest`, `hmac_secret` |
| Algorithm | **SHA256 only** |
| Header | `X-Turn-Hook-Signature` |
| Encoding | Base64 of the raw HMAC digest |

```python
>>> import hmac, base64
>>> from hashlib import sha256
>>> h = hmac.new("secret", '{"foo":"bar"}', sha256)
>>> base64.b64encode(h.digest())
'PzqzmGtlarsXrz6xRD7WwI74//n+qDkVkJ0bQhrsib4='
```
Headers on a delivery:
```
X-Turn-Hook-Subscription: whatsapp
X-Turn-Hook-Signature: PzqzmGtlarsXrz6xRD7WwI74//n+qDkVkJ0bQhrsib4=
```

**Nuances.** The example signs the **payload string as sent**. Compute the HMAC over the raw request body bytes before any JSON parsing or re-serialisation, and compare in constant time. Python 3 needs bytes for key and message (the doc's snippet is Python 2 style).

### 6.3 Inbound messages (`whatsapp`)

Top level: `contacts[]` (each `{"profile":{"name":...},"wa_id":...}`) and `messages[]`.

| Message field | Description |
|---|---|
| `from` | Sender's WhatsApp ID |
| `id` | Message ID |
| `timestamp` | Message timestamp |
| `type` | `audio`, `document`, `image`, `location`, `system`, `text`, `video`, `voice`, `contacts`, and `reaction` (6.4) |
| `context` | Optional. `from` and `id` of the message this one replies to. |
| `errors` | Optional. **Only present on error.** Array of error objects (6.8). |

| `type` | Object | Fields |
|---|---|---|
| `text` | `text` | `body` |
| `image` | `image` | `file`, `id`, `link`, `mime_type`, `sha256`, `caption` |
| `document` | `document` | `file`, `id`, `link`, `mime_type`, `sha256`, `caption` |
| `audio` | `audio` | `file`, `id`, `link`, `mime_type`, `sha256` |
| `voice` | `voice` | `file`, `id`, `link`, `mime_type`, `sha256` |
| `video` | `video` | `file`, `id`, `link`, `mime_type`, `sha256` |
| `location` | `location` | `address`, `latitude`, `longitude`, `name` |
| `system` | `system` | `body` |
| `contacts` | `contacts[]` | Contact cards: `addresses[]` (`city`, `country`, `country_code`, `state`, `street`, `type`, `zip`), `birthday`, `contact_image` (base64 JPEG), `emails[]` (`email`, `type`), `ims[]` (`service`, `user_id`), `name` (`first_name`, `formatted_name`, `last_name`), `org` (`company`), `phones[]` (`phone`, `type`, optional `wa_id`), `urls[]` (`url`, `type`) |

**Nuances**
- In media objects, **`file` is an absolute path on Turn's core app** (not useful to you). **`link` points to the file.** Use `id` with `GET /v1/media/<id>` to fetch it.
- `voice` (voice notes) is a separate type from `audio`.
- `contacts` is an array of cards inside `messages[]`, and `contact_image` can be very large.
- **[DOC GAP]** The page does not document the inbound payloads for **interactive replies** (a tapped reply button or list row) or template quick-reply taps. They are only described as carrying your `id`/`payload`. Capture a real payload from your own webhook before building parsers.

### 6.4 Inbound reactions

```json
{"contacts":[{"profile":{"name":"Kerry Fisher"},"wa_id":"16315551234"}],
 "messages":[{"from":"sender_wa_id","id":"message_id","timestamp":"message_timestamp",
   "type":"reaction","reaction":{"message_id":"the-message-id-that-was-reacted-to","emoji":"👍"}}]}
```
When the customer **removes** a reaction, `emoji` is **omitted**.

### 6.5 Outbound messages (`turn`, `journey_outbound`)

The webhook receives the payload that was submitted to the API, plus Turn-added metadata: `from`, `id`, `timestamp`, `_vnd`, `preview_url`, `recipient_type`.

```json
{"from":"<business wa_id>","id":"<message id>","type":"text","text":{"body":"..."},
 "to":"<recipient wa_id>","timestamp":"<unix timestamp>","recipient_type":"individual",
 "preview_url":false,"_vnd":{"v1":{...}}}
```

- `_vnd` holds Turn-specific metadata (chat state, author, labels, ...). It is not part of the original submission.
- The HTTP header **`X-WhatsApp-Id: <whatsapp's message id>`** accompanies the payload. It is the ID WhatsApp assigned, and **delivery status updates reference this ID**, so store it to correlate statuses.
- These events fire **only after** the WhatsApp Enterprise Client has accepted the message for delivery.
- If you set `X-Turn-In-Reply-To` when sending, you can later look up the inbound message this outbound replied to.

### 6.6 Outbound status notifications (`whatsapp`)

```json
{"statuses":[{"id":"ABGGFlA5FpafAgo6tHcNmNjXmuSf","status":"sent","timestamp":"1518694700","message":{"recipient_id":"16315555555"}}]}
```

| `status` | Meaning |
|---|---|
| `sent` | Received by the server |
| `delivered` | Delivered to the user's device |
| `read` | Read by the user. **Only if the user has read receipts enabled**; otherwise you only get `delivered`. |
| `failed` | Failed to send |

**Nuances**
- **Order is not guaranteed.** Use `timestamp`, not arrival order.
- **`delivered` can be skipped.** If a message is delivered and read almost simultaneously (user already in the chat), WhatsApp discards `delivered`, because read implies delivered. Don't require `delivered` before accepting `read`.
- `id` here is the WhatsApp message ID (the `X-WhatsApp-Id` value from 6.5), not the ID returned by `POST /v1/messages`.

### 6.7 Mark as read and typing indicator

`PUT /v1/messages/<message-id>` with `Authorization: Bearer token`.

```json
{"status":"read"}
```
Returns `{}`.

Add a typing indicator (same format as the WhatsApp Cloud API):
```json
{"status":"read","typing_indicator":{"type":"text"}}
```

**Nuances.** The indicator clears after **25 seconds** or when you send your next message. Show it **only if you intend to reply**. Send `Content-Type: application/json` (the docs' examples omit it).

### 6.8 Errors in notifications

When sending or receiving a notification fails, an `errors` array describes it. Causes include transient network errors, invalid credentials, and controllers in an unavailable state.

```json
{"errors":[{"code":"<error-code>","title":"<error-title>","details":"<error-description>","href":"location for error detail"}]}
```

### 6.9 Performance and queueing

> Turn enforces a **strict 5-second timeout** on webhooks. If your service doesn't respond in 5 s, Turn retries (6.10).

Events are queued in Turn.io before dispatch (normally milliseconds). There are three queues, `low`, `default`, `high`. `high` gets the most resources.

Your endpoint's response time is **sampled once every 20 deliveries**, and the result decides which queue the **following** events go to.

| Queue | Your response time |
|---|---|
| `high` | 200 ms or less |
| `default` | more than 200 ms, under 1 s |
| `low` | 1 s or more |

You move up or down automatically as your speed changes. **Practical rule:** acknowledge fast (return 2xx immediately) and process asynchronously.

### 6.10 Retry strategy

| Condition | Behaviour | Example |
|---|---|---|
| 4XX client error | **Cancel retries** | `404 Not Found` |
| Unresolvable domain (permanent) | **Cancel retries** | `502 Bad Gateway (Unresolvable Domain)` |
| Network error (temporary) | Retry | `504 Gateway Timeout` |
| Other errors | Retry | `500 Internal Server Error` |

- Up to **5 retries** with incremental backoff: roughly **17 s**, then **19 s, 24 s, 31 s, 47 s** after the previous failure. Jitter is added.
- Events are **dropped** if your endpoint stays offline for more than about **140 seconds**.
- **Do not return 4xx for transient problems.** Turn will stop retrying that event.

---

## 7. Contacts

Contacts are the people you message. Fields live in a **flat** schema: no nested or relational data. Manage fields in the UI at Settings > People, or via the API below.

### 7.1 Contact identifier

`<contact-id>` accepts a phone number (digits only, no `+`) or a BSUID (a Meta-assigned ID unique per user within your business portfolio).

### 7.2 Default fields

| Field | Type | Notes |
|---|---|---|
| `name` | STRING | nullable |
| `surname` | STRING | nullable |
| `location` | LOCATION | nullable |
| `language` | ENUM | ISO-639-3 codes (e.g. `ENG`), nullable |
| `opted_in` | BOOLEAN | defaults to `false` |
| `opted_in_at` | DATETIME | nullable |
| `birthday` | DATETIME | nullable |
| `whatsapp_profile_name` | STRING | nullable |
| `whatsapp_id` | STRING | nullable |

The schema response also lists system fields: `last_seen_at`, `first_message_received_at`, `last_message_sent_at`, `last_message_received_at` (DATETIME, nullable) and `is_blocked` (BOOLEAN, default `false`, not nullable). Custom fields are created **in addition to** these.

### 7.3 Schema API

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/contacts/schemas` | Current schema: `fields`, `uuid`, `version` (currently `"0.0.1-alpha"`) |
| GET | `/v1/contacts/schemas/<uuid>` | An earlier schema |
| POST | `/v1/contacts/schemas` | Create a new schema (new `uuid`) |

Headers: `Authorization`, `Accept: application/vnd.v1+json`, `Content-Type: application/json`.

Each field in a GET response: `name`, `display`, `type`, `default`, `null`, `is_private`, `custom`, plus `enum` for ENUM fields (e.g. `{"custom":false,"default":null,"display":"Name","is_private":true,"name":"name","null":true,"type":"STRING"}`).

**Create request**
```json
{"version":"0.0.1-alpha","fields":[
  {"name":"consent","display":"Consent Given","type":"BOOLEAN","default":false,"is_private":true},
  {"name":"gender","display":"Gender","type":"ENUM","null":false,"is_private":false,"default":"UNDISCLOSED",
   "enum":[{"value":"MALE","display":"Male"},{"value":"FEMALE","display":"Female"},{"value":"OTHER","display":"Other"},{"value":"UNDISCLOSED","display":"Undisclosed"}]}
]}
```
The response echoes the schema with the new `uuid`.

> ### Destructive: a POST replaces the whole custom schema
> Posting a schema **completely replaces** the previous custom schema (default fields are unaffected). Any custom field you leave out is **permanently lost and no longer editable**, for all contacts. Safe procedure: (1) `GET /v1/contacts/schemas`; (2) copy every existing custom field from `fields`; (3) append your new fields; (4) POST the complete list.
> Migrating profile data between schemas is **your** responsibility.

**Field types**

| Type | Rule |
|---|---|
| `DATETIME` | ISO 8601 timestamps in UTC |
| `BOOLEAN` | JSON `true`/`false`. Needs a `default` of `true` or `false`. **Cannot be nullable.** |
| `STRING`, `FLOAT`, `INTEGER` | |
| `ENUM` | Needs an `enum` list of `{value, display}` objects |
| `LOCATION` | `{"latitude": ..., "longitude": ...}` |

**Field rules**
- `name`: lowercase, starts with a letter, only lowercase alphanumerics and `_`.
- `enum[].value`: uppercase, starts with a letter, only uppercase alphanumerics and `_`.
- `display`: human-friendly label.
- Every field needs a `default`. It may be `null` only if `"null": true` (never for BOOLEAN).
- `null` is set per field; `is_private` controls privacy.
- Reads follow the schema you ask for; **writes follow the most recently created schema.**

**Capacity**

| Field type | Internal fields used |
|---|---|
| `STRING` | 2 |
| `LOCATION` | 3 |
| `BOOLEAN`, `DATETIME`, `ENUM`, `INTEGER`, `FLOAT` | 1 |

Hard cap 1,000 internal fields, about 15 used by system fields. So about **490** custom STRING fields, or about **980** single-slot fields, or a mix. Hitting the cap makes field creation fail with an error about the total field limit. **Deleting custom fields does not free capacity** (the search index keeps their slots), but re-adding a deleted field with its original type is free. Contact support@turn.io to raise the cap. Design tip from the docs: one progress field per journey instead of a field per step, use Write Results for question answers, and WhatsApp Flows for quizzes.

### 7.4 Contact endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/contacts/<contact-id>/profile` | Fetch profile. **Creates the contact if missing.** Optional `?schema=<uuid>`. |
| POST | `/v1/contacts/<contact-id>` | Create contact with optional fields. `409 Conflict` if it exists. |
| PUT | `/v1/contacts/<wa-id>/profile` | Replace the full profile |
| PATCH | `/v1/contacts/<wa-id>/profile` | Partial update |
| PATCH | `/v1/contacts/<contact-id>` | Set `is_fallback_active` **only** |
| DELETE | `/v1/contacts/<wa-id>/profile` | Reset profile to defaults |

Headers for all: `Authorization`, `Accept: application/vnd.v1+json`; add `Content-Type: application/json` on writes.

**GET profile response**
```json
{"version":"0.0.1-alpha","schema":"<the-schema-uuid>","generation":0,
 "fields":{"language":"ENG","age":2,"consent":false,"location":null,"name":null,"risk_profile":2.0,"surname":null,"birthday":null,"opted_in":false,"opted_in_at":null,"whatsapp_id":null,"whatsapp_profile_name":null}}
```

**POST create**: body `{"name":"John Doe","language":"eng"}` (or `{}`). Response includes `schema`, `generation` (null), `uuid`, `updated_at`, `is_staging_user`, and all `fields` including system fields.

**PATCH fallback flag**: body `{"is_fallback_active": false}`. Response `{"id":"<contact-uuid>","is_fallback_active":false,"failure_count":0,"type":"DEFAULT"}`.

**Nuances**
- **GET creates contacts without checking reachability.** A created contact is not necessarily on WhatsApp.
- **GET returns only explicitly persisted fields.** A newly added field does not appear in the response until a value has been set and saved, even though the default is shown wherever the field is referenced in the UI or journeys.
- `generation` increments by 1 on **every** profile change.
- **PUT** applies schema defaults to any field you omit (it replaces, it does not merge). **PATCH** inherits everything from the previous generation and changes only what you send.
- Both PUT and PATCH require the contact to **already exist**, and validate against the **latest schema**.
- **DELETE profile resets, it does not delete the contact.** To delete the contact and its chat data use [Delete chat](#84-chats).
- **PATCH `/v1/contacts/<contact-id>`** has **no `/profile` suffix**, accepts only `is_fallback_active` (creates the contact if needed), and returns `400` if you send profile fields.
- The docs mention both `/v1/contacts/schema` (in prose) and `/v1/contacts/schemas` (in endpoints). Use **`schemas`**.

### 7.5 Bulk CSV import

`POST /v1/contacts` with `Content-Type: text/csv` and the CSV as the body.

```bash
curl -X POST -H 'Content-Type: text/csv' -H 'Authorization: Bearer token' \
  --data-binary $'urn,name,surname\n+27123456789,spider,ham\n+27123456790,peter,parker' \
  https://whatsapp.turn.io/v1/contacts
```

| Rule | Detail |
|---|---|
| Required column | **`urn`**, the phone number |
| Behaviour | Existing profile found: updated with the supplied columns only (other values untouched). Not found: created. |
| Typing | Values are cast to the schema types. Cast failure is an error for that cell. |
| Unknown columns | **Silently dropped**, and not echoed back |
| Max size | **1 MB per file.** Split larger sets, each file with its own header row. |

**Response.** Streamed back **as CSV in real time**, showing values **after** parsing and casting:
- URNs are normalised to **E.164** (`+27...`).
- `"true"` becomes boolean `true` for BOOLEAN fields.
- A bad value is reported **inline** at that field's position, prefixed `ERROR`, e.g. `+27123456789,,,ERROR: cannot cast value of 'yes' to boolean`.
- A malformed `urn` puts the error in the **second** column.

**Timing.** Contacts are written to the primary database immediately and are available for messaging. They are indexed **asynchronously** into the search database, so it can take **a minute or two** before they show up in Reminders and Triggers.

### 7.6 Deprecated

- `/v1/export/contacts/details`: use the Data Export API (`/docs/api/data_export_api#export-contact-details`, not covered here).
- The old WhatsApp **status check** contact endpoint (from WhatsApp Business API v2.43) **no longer tells you if a number is on WhatsApp.** It returns `valid` plus a `wa_id` for every request, never `invalid`, and the `wa_id` may not be real. `processing` and `failed` still behave as before. Don't use it for validity checks.

---

## 8. API extensions

### 8.1 Message history

`GET /v1/contacts/<wa-id>/messages` with `Accept: application/vnd.v1+json` and `Authorization`.

```json
{"chat":{"owner":"<wa-id>",
   "assigned_to":{"id":"account assignment id","name":"name of account holder","type":"OPERATOR"},
   "state":"OPEN","state_reason":"Re-opened by inbound message.","unread_count":1},
 "messages":[{"to":"wa-id","from":"another-wa-id","type":"text","...":"...",
   "_vnd":{"v1":{"direction":"outbound","in_reply_to":"an-earlier-inbound-external-id",
     "author":{"name":"the name of the author","type":"SYSTEM | OPERATOR"}}}}]}
```

**Nuances**
- **Only the 50 most recent messages**, sent and received, ordered by `timestamp` **descending**. There is no paging parameter documented.
- Messages are the original WhatsApp payload plus the vendor `_vnd.v1` key (`direction`, `in_reply_to`, `author`).
- `assigned_to` can be `null`.

### 8.2 Labels

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/labels` | All labels linked to the number, in one result |
| GET | `/v1/labels/<label-uuid>/messages` | Messages carrying a label |
| POST | `/v1/messages/<message-id>/labels` | Label a message |

Headers: `Accept: application/vnd.v1+json`, `Authorization`.

`GET /v1/labels` → `{"labels":[{"uuid":"the-uuid","value":"the-label-name","color":"the-label-color"}]}`. Pagination "may be added in the future".

`GET /v1/labels/<label-uuid>/messages` → 
```json
{"has_more":true,"next":"/v1/labels/<label-uuid>/messages?p=1",
 "message_labels":[{"confidence":0.8,"metadata":{},"deleted":false,"message":{"...":"message payload"}}]}
```
Batches of **50**. Follow `next` while `has_more` is `true`.

**Label a message**
```json
{"labels":["compliment","other",{"label":"question","confidence":0.9}]}
```
`labels` mixes plain label-name strings and `{label, confidence}` objects. Labels are **promoted to the chat** and appear in the UI in real time. **Confidence is API-only** (not shown in the UI). **Labels not defined in the UI are silently ignored**, so create them first.

### 8.3 Handled / unhandled

`PATCH /v1/messages/<message-id>` with `Accept: application/vnd.v1+json`.
```json
{"is_handled": true}
```
Boolean, **defaults to `null`** if never set (so `null` means "never marked", not "unhandled"). Humans or bots can set it. The UI shows an icon so operators can spot pending questions.

### 8.4 Chats

Both endpoints work for **all channel types** (WhatsApp and other channels configured in Turn).

**Archive:** `POST /v1/chats/<contact-id>/archive`

Headers: `Authorization`, `Accept: application/vnd.v1+json`, `Content-Type: application/json`.
```json
{"before":"the-message-id","reason":"the reason for archiving"}
```

| Body field | Required | Meaning |
|---|---|---|
| `before` | Yes | Message ID. The chat is archived only if the **last inbound** message equals this one. |
| `reason` | Yes | Free text |

| Status | Meaning |
|---|---|
| `201 Created` | Archived. Returns the updated chat object. |
| `200 OK` | **Not** archived because a newer message exists. Chat unchanged. |
| `400 Bad Request` | `before` or `reason` missing |
| `404 Not Found` | Chat or referenced message not found |

**Nuance.** `200` is the *safe, nothing-happened* outcome of a race (the customer wrote again). It is not an error. The use case is auto-archiving chats a bot has fully handled.

**Delete all contact, chat and message data:** `DELETE /v1/chats/<contact-id>`

```bash
curl -X DELETE "https://whatsapp.turn.io/v1/chats/<contact-id>" \
  -H "Authorization: Bearer token" -H "Accept: application/vnd.v1+json" \
  -H "Content-Type: application/json" -d '{"timeout": 60000}'
```
`200` response: `{"chat":{"state":"CLOSED","state_reason":"Chat culled","owner":"<uuid>","unread_count":0}}`

| Parameter | Type | Meaning |
|---|---|---|
| `timeout` | integer | Max ms to wait, **100 to 60000**, default 60000. Out-of-range or non-numeric returns `400` (it does **not** fall back to the maximum). |

| Status | Meaning |
|---|---|
| `200 OK` | Chat fully deleted |
| `202 Accepted` | Timed out mid-deletion. Body is an empty JSON object. **Call again.** |
| `400 Bad Request` | Invalid `timeout` |
| `404 Not Found` | Chat does not exist |
| `500 Internal Server Error` | Database error |

**Nuances**
- A big chat may not delete in one call. It deletes as much as it can within the timeout. **Loop until you get `200`.**
- What stays: **one anonymised record** as a historical artefact. All messages, attachments and contact details are permanently removed from Turn's database.
- What is **not** removed: messages on the recipient's device, and anything already relayed to webhooks, API calls or integrations such as BigQuery. **Deleting those is the account owner's responsibility.**

### 8.5 Linking an outbound message to an inbound

Add the header `X-Turn-In-Reply-To: <external-id>` to `POST /v1/messages`. Value is stored as-is and **not validated**. Useful for auditing, analysis and ML training data. Webhook consumers can then resolve the inbound message an outbound replied to.

### 8.6 Content export and import

Moves **FAQs and Automators** in and out (useful for translation workflows or your own content pipeline).

| Method | Path | Behaviour |
|---|---|---|
| GET | `/v1/export` | JSON of FAQ and Automator items. Excludes items flagged `is_deleted`. Add `?include_deleted=true` to include them. |
| POST | `/v1/import` | **Replaces** everything: existing content is deleted and only the imported content remains. **A failed import deletes nothing.** |
| PUT | `/v1/import` | **Updates**: entries with a matching UUID are updated, entries without a UUID are created, the rest untouched. A failed import changes nothing. |

Headers: `Authorization`, `Accept: application/vnd.v1+json`, and `Content-Type: application/json` on imports.
```bash
curl -X GET  "https://whatsapp.turn.io/v1/export" -H "Authorization: Bearer token" -H "Accept: application/vnd.v1+json" > content.json
curl -X POST "https://whatsapp.turn.io/v1/import" -H "Authorization: Bearer token" -H "Content-Type: application/json" -H "Accept: application/vnd.v1+json" -d @content.json
curl -X PUT  "https://whatsapp.turn.io/v1/import" -H "Authorization: Bearer token" -H "Content-Type: application/json" -H "Accept: application/vnd.v1+json" -d @content.json
```

**Nuances.** Export output is valid import input. **PUT can also delete and undelete** FAQs and Automators by changing `is_deleted` on items with a matching UUID. Use **PUT** for edits and **POST** only when you truly want a full replacement.

### 8.7 Message templates (Graph-compatible)

Hosted under `/graph/v14.0/` because it mirrors Facebook's Graph API. **Only `v14.0` is supported.**

Base: `https://whatsapp.turn.io/graph/v14.0/<phone number without leading +>/message_templates`

| Method | Purpose |
|---|---|
| POST | Create a template (submits it to Facebook for approval) |
| GET | List templates |

**Auth.** Either `Authorization: Bearer ...` with a JSON body, or form-encoded posts with an `access_token` field (kept for compatibility). For GET pass `?access_token=<whatsapp-api-token>`.

**Limits and enums**

| Item | Values |
|---|---|
| `name` | up to 512 characters |
| `content` | up to 1024 characters |
| `category` | `AUTHENTICATION`, `MARKETING`, `UTILITY` |
| `status` | `APPROVED`, `PENDING`, `REJECTED`, `PENDING_DELETION`, `DELETED` |
| Header `format` | `TEXT`, `DOCUMENT` (PDF), `VIDEO`, `IMAGE` |
| Button `type` | `PHONE_NUMBER`, `URL`, `QUICK_REPLY` |
| `language` | see [Appendix B](#appendix-b-template-language-codes) |

> **Note.** The doc's own examples use `"category": "ISSUE_RESOLUTION"`, which is **not** in its valid-category list. Treat the three listed categories as authoritative. **[DOC GAP]**

**A. Text template** (JSON body)
```json
{"access_token":"<whatsapp-api-token>","category":"ISSUE_RESOLUTION","name":"test_template","language":"en_US",
 "components":[
  {"type":"HEADER","format":"TEXT","text":"Welcome {{1}}","example":{"header_text":["Jane","John"]}},
  {"type":"BODY","text":"Hi {{1}}, you are now registered as a {{2}}.",
   "example":{"body_text":[["Jane","beta tester"],["John","support hero"]]}},
  {"type":"FOOTER","text":"Thanks again for signing up!"}
 ]}
```
Placeholders are `{{1}}`, `{{2}}`, ... and each needs example values.

**B. Authentication template** (OTP, "Copy code")
```json
{"name":"<TEMPLATE_NAME>","language":"<TEMPLATE_LANGUAGE>","category":"authentication",
 "message_send_ttl_seconds":<TIME_TO_LIVE>,
 "components":[
  {"type":"body","add_security_recommendation":<true|false>},
  {"type":"footer","code_expiration_minutes":<CODE_EXPIRATION>},
  {"type":"buttons","buttons":[{"type":"otp","otp_type":"copy_code","text":"<COPY_CODE_BUTTON_TEXT>"}]}
 ]}
```
`message_send_ttl_seconds`, `add_security_recommendation`, `code_expiration_minutes` and the button `text` are all **optional**. The docs' example supplies no body `text` for an authentication template, only the optional flags (WhatsApp's own docs say it generates that text).

**C. Media template** (form-encoded; `components` is a JSON string)
```
access_token=<token>&category=ISSUE_RESOLUTION&name=test_media_template&language=en_US&components=[
 {"type":"HEADER","format":"IMAGE","example":{"header_handle":["example-file-handle","another-example-file-handle"]}},
 {"type":"BODY","text":"Hi {{1}}, you are now registered as a {{2}}.","example":{"body_text":[["Jane","beta tester"],["John","support hero"]]}}]
```
**Example media is mandatory for Facebook's review.** Upload sample files first with the resumable upload (below), then put the returned handles in `example.header_handle`.

**D. Interactive (buttons) template**
```json
{"type":"BUTTONS","buttons":[
  {"type":"PHONE_NUMBER","text":"Call us","phone_number":"+1(650) 555-1111"},
  {"type":"URL","text":"Visit out website","url":"https://www.website.com/{{1}}",
   "example":["https://www.website.com/welcome","https://www.website.com/register"]}]}
```
Button types: `PHONE_NUMBER` dials a number, `URL` opens a URL (may contain one `{{1}}` placeholder; supply `example` values), `QUICK_REPLY` submits an automatic reply.

**List response**
```json
{"data":[{"id":"123456789","name":"order_confirmation","status":"APPROVED","category":"UTILITY",
  "components":[{"type":"BODY","text":"Your order {{1}} has been confirmed."}],"language":"en_US"}]}
```
Authentication template as listed:
```json
{"id":"987654321","name":"verification_code","status":"APPROVED","category":"AUTHENTICATION",
 "components":[
  {"type":"BODY","text":"*{{1}}* is your verification code. For your security, do not share this code."},
  {"type":"FOOTER","text":"Expires in 10 minutes."},
  {"type":"BUTTONS","buttons":[{"type":"URL","text":"Copy code",
    "url":"https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code_expiration_minutes=10&code=otp{{1}}"}]}],
 "language":"en"}
```

> **Always list a template before building its send request.** The listed component types and button sub-types determine exactly which parameters you must supply (see 4.5 D).

**Resumable upload API** (example media for templates)

Two phases:
```bash
# 1. open an upload session
curl -X POST "https://whatsapp.turn.io/graph/v14.0/app/uploads" \
  -d 'number=<phone without leading +>' -d 'access_token=<token>' \
  -d 'file_length=<bytes>' -d 'file_type=<mime-type>'
# -> {"id":"<upload-session-id>"}          (looks like upload:###?sig=###)

# 2. upload the file (multipart)
curl "https://whatsapp.turn.io/graph/<upload-session-id>" \
  -F 'number=<phone without leading +>' -F 'access_token=<token>' \
  -F 'file=@"/path/to/file.ext"' -H 'file_offset: 0'
# -> {"h":"<file-handle>"}                 (looks like 4::###)
```
Use standard MIME types (`image/jpeg`, `video/mp4`, ...). The returned file handle `h` is what goes in `example.header_handle`. Note the session path is `/graph/<id>`, **without** the version segment.

### 8.8 Conversation claiming

Lets an external system take over a conversation for a limited time.

> While a lease is active, **all webhooks and all automations in Turn.io are bypassed for that conversation.**

**Setup (Turn UI)**
1. Settings > Webhooks: add your webhook as normal, mark it **enabled**, but **not subscribed to any inbound or outbound traffic**. It is then registered but receives no regular messages.
2. Automation: pick a trigger. Step 2 "Add an Action" > **Call a webhook**. Step 3: choose that webhook.
3. **Turn on the toggle that allows the webhook to claim the conversation.**

**Lifecycle**
- When the trigger fires, a lease is created and your webhook receives an HTTP request with **`X-Turn-Claim: <claim-uuid>`**.
- The lease lasts **at most 5 minutes**. If you don't act, Turn expires it and takes control back.
- On outbound `POST /v1/messages` you can pass the claim UUID in a header:

| Header (value = the claim UUID) | Effect |
|---|---|
| `X-Turn-Claim-Extend: <claim-uuid>` | Extend the claim another 5 minutes |
| `X-Turn-Claim-Release: <claim-uuid>` | Release the claim, return control to Turn |

```bash
curl -X POST "https://whatsapp.turn.io/v1/messages" -H "Authorization: Bearer token" \
  -H "X-Turn-Claim-Extend: <claim-uuid>" -H "Content-Type: application/json" \
  -d '{"to":"whatsapp-id","type":"text","text":{"body":"..."}}'
```

**Release and re-evaluate.** `POST /v1/messages/<message-id>/automation` with `X-Turn-Claim-Release: <uuid>` releases the claim **and resubmits that message to Turn's Automation rules**. Use it to fall back to Turn for things like "Reply 📌 Menu to return to the main menu". Returns `{}`.

**Inspect or force-release a claim** (debugging only, not for large-scale use). Useful when a conversation is stuck, e.g. a loop or a timeout in a journey (the docs call these "stacks").
```bash
curl -X GET    "https://whatsapp.turn.io/v1/contacts/<wa_id>/claim" -H "Authorization: Bearer token" -H "Accept: application/vnd.v1+json"
curl -X DELETE "https://whatsapp.turn.io/v1/contacts/<wa_id>/claim" -H "Authorization: Bearer token" -H "Accept: application/vnd.v1+json"
```
GET returns `claimed_at`, `claimed_until`, `inserted_at`, `message_uuid`, `metadata`, `scope` (e.g. `"stack"`), `scope_id`, `updated_at`, `uuid`. DELETE returns `{"claim_uuid":"<uuid>"}`.

---

## 9. Settings

Turn exposes only a **subset** of the WhatsApp Business API settings. All successful calls return `200 OK` with `{}`, `null` or an empty body for writes. Most of these are on-prem leftovers, so check the status column.

| Area | Endpoint | Status |
|---|---|---|
| Primary webhook | `PATCH` / `GET` / `DELETE /v1/settings/application` | Active |
| Business profile | `POST` / `GET /v1/settings/business/profile` | Active |
| Profile photo (set) | `POST /v1/settings/profile/photo` | Active |
| About text | `PATCH` / `GET /v1/settings/profile/about` | **Removed** for Cloud API numbers |
| Profile photo (get) | `GET /v1/settings/profile/photo` | **Removed** for Cloud API numbers |
| Two-step verification | `POST` / `DELETE /v1/settings/account/two-step` | **Fully removed** |

For removed items, manage the values in the Turn.io Settings UI. All numbers have migrated to the Cloud API.

### 9.1 Application (primary webhook)

```bash
curl -X PATCH https://whatsapp.turn.io/v1/settings/application \
  -H 'Authorization: Bearer token' -H 'Content-Type: application/json' \
  -d '{"webhooks":{"url":"https://example.com"}}'            # -> {}

curl -X GET https://whatsapp.turn.io/v1/settings/application -H 'Authorization: Bearer token'
# -> {"settings":{"application":{"webhooks":{"url":"https://example.com"}}}}

curl -X DELETE https://whatsapp.turn.io/v1/settings/application -H 'Authorization: Bearer token'
```
The **primary webhook gets priority** when Turn relays messages to your endpoints. `DELETE` resets settings; today that only **clears the primary webhook**. See 6.9 and 6.10 for performance and retries.

### 9.2 Business profile

`POST /v1/settings/business/profile`, `GET /v1/settings/business/profile`.

| Field | Type | Limit |
|---|---|---|
| `address` | string | 256 chars |
| `description` | string | 256 chars |
| `email` | string | 128 chars |
| `vertical` | string (industry) | 128 chars |
| `websites` | array of strings | **max 2** items, 256 chars each (website, Facebook page, Instagram, ...) |

```json
{"address":"your-business-address","description":"your-business-description","email":"your-business-email","vertical":"your-business-industry","websites":["your-website-1","your-website-2"]}
```
GET returns the same fields nested under `settings.business.profile`.

**Nuance.** Settings can **only be set as a group** (POST the full set each time; omitted fields are not documented as preserved). Individual updates may come in future.

### 9.3 Profile photo

`POST /v1/settings/profile/photo`, body is the raw image, `Content-Type: image/jpeg`.
```bash
curl -X POST https://whatsapp.turn.io/v1/settings/profile/photo -H 'Authorization: Bearer token' \
  -H 'Content-Type: image/jpeg' --data-binary @your-path-to-image
```
Any dimension and size is accepted. The client scales and crops to a **square, max edge 640 px, max 63 KB** before upload. **640 × 640 recommended.** If a JPEG won't upload, strip hidden attributes (e.g. with imagecompressor.com).

### 9.4 Removed endpoints (for reference)

- **About text:** `PATCH`/`GET /v1/settings/profile/about`, field `text`, max 139 chars. On-premise only.
- **Get profile photo:** `GET /v1/settings/profile/photo`. On-premise only.
- **Two-step verification:** the platform manages PINs internally, and the API cannot control them.

---

## 10. Errors

**Turn defines no error codes of its own.**

| Source | What to do |
|---|---|
| **Meta error codes** | Turn forwards core REST calls to Meta, so debug using Meta's Cloud API error codes (10.1) |
| **Turn REST API extension errors** | If a message is unclear about what went wrong or how to fix it, email **support@turn.io** with the request details |
| **HTTP status codes** | Standard HTTP semantics |

Turn-specific statuses you will meet are documented where they occur: `429` (3), `409` on contact create (7.4), archive and delete-chat codes (8.4), `202` retry-me on chat deletion (8.4).

### 10.1 Meta Cloud API error codes

Copied from Meta's reference, grouped by family. Meta publishes HTTP statuses only for its Marketing Messages rows. For anything not listed, use Meta's page: `https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes`.

**Authorization**

| Code | Meaning | Action |
|---|---|---|
| 0 | App user couldn't be authenticated (token expired, invalidated, or access revoked) | Get a new token |
| 3 | Missing capability or permission | Check token permissions |
| 10 | Permission not granted or removed (also Flows allowlisting and eligibility) | Verify permissions |
| 190 | Access token expired | Get a new token |
| 200 | No access token on certain GET endpoints | Include a valid token |
| 200–299 | Permission not granted or removed (range) | Verify app permissions |

**Integrity**

| Code | Meaning | Action |
|---|---|---|
| 368 | WABA restricted or disabled for a platform policy violation | Review policy enforcement |
| 130497 | WABA restricted from messaging users in certain countries | Check allowed countries for your business category |
| 131031 | WABA restricted for policy violation, or request data didn't match account data (e.g. wrong two-step PIN) | Review enforcement; check Health Status |

**Throttling**

| Code | Meaning | Action |
|---|---|---|
| 4 | App API call rate limit reached | Retry later or reduce calls |
| 80007 | WABA rate limit reached | Retry later or reduce calls |
| 130429 | Cloud API message throughput reached | Retry later, slow sending |
| 131048 | Sending restricted for this number (blocks or spam flags) | Check quality status in WhatsApp Manager |
| 131056 | Too many messages between the same sender and recipient in a short time | Wait before retrying that recipient |
| 133016 | Too many registration or deregistration attempts | Retry after the number is unblocked |
| 131064 | Messaging limited due to template classification violations | Correct template categories; restriction lifts after the enforcement period |

**Sending and delivery**

| Code | Meaning | Action |
|---|---|---|
| 1 | Invalid request or possible server error | Check platform status and request format |
| 2 | Temporary downtime or overload | Check status, then retry |
| 33 | Business phone number was deleted | Verify the phone number ID |
| 100 | Unsupported or misspelled parameter | Check the endpoint reference, key formats and length limits |
| 130403 | Business blocked by the end user | Do not retry; the user must unblock |
| 130472 | Message not sent as part of an experiment | See Meta's marketing-message experiment docs |
| 131000 | Unknown error | Retry; open a support ticket if it persists |
| 131005 | Permission not granted or removed | Verify permissions |
| 131008 | Required parameter missing | Add required parameters |
| 131009 | One or more parameter values invalid | Check supported values |
| 131016 | Service temporarily unavailable | Check status, then retry |
| 131021 | Sender and recipient are the same number | Use a different recipient |
| 131026 | Undeliverable: recipient not on WhatsApp, hasn't accepted the latest terms, or has an outdated client | User to confirm, accept terms, update the app |
| 131037 | Phone number lacks an approved display name | Change the display name |
| 131042 | Payment method error | Verify billing setup |
| 131045 | Phone number registration error | Register the number, retry |
| 131047 | **More than 24 hours since the user's last reply** | **Send a template message** |
| 131049 | Not delivered to protect ecosystem engagement | Wait at least 24 hours before resending |
| 131050 | Recipient opted out of marketing messages | Don't retry; subscribe to the `user_preferences` webhook |
| 131051 | Unsupported message type | Use a supported type |
| 131052 | Unable to download user-sent media | Check webhook error details; ask the user to resend another way |
| 131053 | Unable to upload media (e.g. unsupported type) | Verify the file type |
| 131057 | Business account in maintenance mode | Wait; may be a throughput upgrade |
| 131063 | Marketing templates disabled on Cloud API | Use the Marketing Messages API or re-enable |
| 135000 | Unknown error with request parameters | Check endpoint syntax; contact support if it persists |

**Templates**

| Code | Meaning | Action |
|---|---|---|
| 132000 | Parameter count doesn't match the template | Supply all template parameters |
| 132001 | Template missing for this language, or not approved | Confirm approval, name and locale |
| 132005 | Translated text too long | Check the translation in WhatsApp Manager |
| 132007 | Template violates policy | Review template guidelines |
| 132012 | Parameter values formatted incorrectly | Match the template's parameter format |
| 132015 | Template paused for low quality | Edit the template; resend once approved |
| 132016 | Template permanently disabled after repeated pauses | Create a new template |
| 2388019 | Template limit exceeded (250 for a Messaging account) | Reduce templates |
| 2388039 | Template status can't be changed (e.g. while in review) | Wait for approval or rejection; mind edit limits |
| 2388040 | Character limit exceeded | Shorten the field |
| 2388047 / 2388072 / 2388073 | Header / body / footer format incorrect | Follow the format details in the error |
| 2388293 | Parameter-to-words ratio exceeds the limit | Reduce variables or lengthen the message |
| 2388299 | Leading or trailing parameters not allowed | Move variables away from start and end |

**Flows:** 132068 (Flow is blocked), 132069 (Flow throttled after 10 messages per hour).

**Registration and phone migration:** 133000 (previous deregistration failed), 133004 (server temporarily unavailable), 133005 (incorrect two-step PIN), 133006 (verify before registering), 133008 (too many PIN attempts), 133009 (PIN entered too quickly), 133010 (not registered), 133015 (recently deleted; wait 5 min), 2388012 (number already on the account), 2388091/2388093 (not eligible for a registration code), 2388103 (various "cannot migrate" causes), 2494100 (account in maintenance mode, retry in a few minutes).

**Other families** (see Meta's page for detail): template insights 200005–200007; WABA ownership 2593079, 2593085; synchronisation 2593107, 2593108; payments 134011; Marketing Messages API 100, 131009, 131055, 132018, 134100–134102, 1752041.

---

## 11. Health

`GET /v1/health`, no parameters or body. `Authorization: Bearer token`.

> **Only available for on-prem numbers and will be deprecated soon.** Treat as legacy and don't build new work on it.

It samples the health of the gateway and returns JSON.

**Standard**
```json
{"health":{"gateway_status":"connected | connecting | uninitialized | unregistered"},
 "meta":{"api_status":"stable","version":"v2.35.4"}}
```

**Multiconnect** (one entry per node, keyed `hostname:container-id`)
```json
{"health":{
   "your-hostname1:your-container-id1":{"gateway_status":"connected | connecting | disconnected | uninitialized | unregistered","role":"primary_master | secondary_master | coreapp"},
   "your-hostname2:your-container-id2":{"gateway_status":"...","role":"..."}},
 "meta":{"api_status":"stable","version":"v2.35.4"}}
```

| Field | Values |
|---|---|
| `health.gateway_status` (single node) | `connected`, `connecting`, `uninitialized`, `unregistered` |
| per-node `gateway_status` (Multiconnect) | the above plus `disconnected` |
| per-node `role` | `primary_master`, `secondary_master`, `coreapp`. Meanings are defined in Meta's WhatsApp Health API docs (`developers.facebook.com/docs/whatsapp/api/health/`). |
| `meta.api_status` | e.g. `stable` |
| `meta.version` | e.g. `v2.35.4` |

---

## 12. Cookbook

Short, copy-pasteable flows. Replace `token`, IDs and phone numbers.

**Send a text, handling rate limits**
```bash
curl -si -X POST https://whatsapp.turn.io/v1/messages \
  -H "Authorization: Bearer token" -H "Content-Type: application/json" \
  -d '{"to":"27123456789","type":"text","text":{"body":"Hello *there*"}}'
# 200 -> {"messages":[{"id":"..."}]}
# 429 -> sleep for the Retry-After seconds, then retry
# X-throttling: 1 on the response -> the call was held open; slow down
```

**Upload a PDF and send it as a document**
```bash
ID=$(curl -s -X POST https://whatsapp.turn.io/v1/media -H "Authorization: Bearer token" \
  -H "Content-Type: application/pdf" --data-binary @terms.pdf | jq -r '.media[0].id')
curl -X POST https://whatsapp.turn.io/v1/messages -H "Authorization: Bearer token" -H "Content-Type: application/json" \
  -d "{\"to\":\"27123456789\",\"type\":\"document\",\"document\":{\"id\":\"$ID\",\"caption\":\"Terms\"}}"
```

**Message a contact who hasn't written in 24 h**
1. `GET /graph/v14.0/<phone>/message_templates?access_token=...` and pick an `APPROVED` template.
2. Read its `components` and build the matching send body (4.5).
3. If you get Meta `131047`, you are outside the window and must use a template.

**Receive and acknowledge webhooks safely**
1. Verify `X-Turn-Hook-Signature` = base64(HMAC-SHA256(secret, raw body)).
2. Return `2xx` immediately (under 200 ms to stay in the `high` queue; the hard limit is 5 s).
3. De-duplicate on message `id`, then process asynchronously.
4. Optionally `PUT /v1/messages/<id>` with `{"status":"read"}`.
5. For media, `GET /v1/media/<id>` using the media `id`, not `file` or `link`.
6. Never answer 4xx for a transient fault (retries stop on 4xx).

**Correlate sends with delivery status**
Store the `id` from `POST /v1/messages` and also the `X-WhatsApp-Id` header from your `turn` webhook. Status notifications (`sent/delivered/read/failed`) reference the **WhatsApp ID**.

**Add a custom contact field safely**
`GET /v1/contacts/schemas` → copy all `custom: true` fields → add yours → `POST /v1/contacts/schemas` with the full list. Then write values with `PATCH /v1/contacts/<id>/profile`.

**Bulk-load contacts**
Split the CSV under 1 MB per file, each with a `urn` header. Read the streamed response for `ERROR` cells. Allow a minute or two before expecting them in search-backed features.

**Delete a contact's data (erasure request)**
`DELETE /v1/chats/<id>` in a loop until `200` (a `202` means call again). Then delete downstream copies yourself (webhook receivers, BigQuery, etc.). Turn only removes its own data and keeps one anonymised record.

---

## Appendix A: Endpoint index

| Method | Path | Section |
|---|---|---|
| POST | `/v1/users/login` | 2.2 |
| POST | `/v1/messages` | 4 |
| PUT | `/v1/messages/<id>` (read, typing) | 6.7 |
| PATCH | `/v1/messages/<id>` (`is_handled`) | 8.3 |
| POST | `/v1/messages/<id>/labels` | 8.2 |
| POST | `/v1/messages/<id>/automation` | 8.8 |
| POST / GET / DELETE | `/v1/media`, `/v1/media/<id>` | 5 |
| GET / POST | `/v1/contacts/schemas`, `/v1/contacts/schemas/<uuid>` | 7.3 |
| GET | `/v1/contacts/<id>/profile` | 7.4 |
| POST / PATCH | `/v1/contacts/<id>` | 7.4 |
| PUT / PATCH / DELETE | `/v1/contacts/<wa-id>/profile` | 7.4 |
| POST (CSV) | `/v1/contacts` | 7.5 |
| GET | `/v1/contacts/<wa-id>/messages` | 8.1 |
| GET / DELETE | `/v1/contacts/<wa_id>/claim` | 8.8 |
| GET | `/v1/labels`, `/v1/labels/<uuid>/messages` | 8.2 |
| POST | `/v1/chats/<id>/archive` | 8.4 |
| DELETE | `/v1/chats/<id>` | 8.4 |
| GET / POST / PUT | `/v1/export`, `/v1/import` | 8.6 |
| POST / GET | `/graph/v14.0/<phone>/message_templates` | 8.7 |
| POST | `/graph/v14.0/app/uploads`, `/graph/<session-id>` | 8.7 |
| PATCH / GET / DELETE | `/v1/settings/application` | 9.1 |
| POST / GET | `/v1/settings/business/profile` | 9.2 |
| POST | `/v1/settings/profile/photo` | 9.3 |
| GET | `/v1/health` (on-prem, legacy) | 11 |

## Appendix B: Template language codes

Valid `language` values for template creation (code: language).

| | | | |
|---|---|---|---|
| `af` Afrikaans | `sq` Albanian | `ar` Arabic | `ar_EG` Arabic (EGY) |
| `ar_AE` Arabic (UAE) | `ar_LB` Arabic (LBN) | `ar_MA` Arabic (MAR) | `ar_QA` Arabic (QAT) |
| `az` Azerbaijani | `be_BY` Belarusian | `bn` Bengali | `bn_IN` Bengali (IND) |
| `bg` Bulgarian | `ca` Catalan | `zh_CN` Chinese (CHN) | `zh_HK` Chinese (HKG) |
| `zh_TW` Chinese (TAI) | `hr` Croatian | `cs` Czech | `da` Danish |
| `prs_AF` Dari | `nl` Dutch | `nl_BE` Dutch (BEL) | `en` English |
| `en_GB` English (UK) | `en_US` English (US) | `en_AE` English (UAE) | `en_AU` English (AUS) |
| `en_CA` English (CAN) | `en_GH` English (GHA) | `en_IE` English (IRL) | `en_IN` English (IND) |
| `en_JM` English (JAM) | `en_MY` English (MYS) | `en_NZ` English (NZL) | `en_QA` English (QAT) |
| `en_SG` English (SGP) | `en_UG` English (UGA) | `en_ZA` English (ZAF) | `et` Estonian |
| `fil` Filipino | `fi` Finnish | `fr` French | `fr_BE` French (BEL) |
| `fr_CA` French (CAN) | `fr_CH` French (CHE) | `fr_CI` French (CIV) | `fr_MA` French (MAR) |
| `ka` Georgian | `de` German | `de_AT` German (AUT) | `de_CH` German (CHE) |
| `el` Greek | `gu` Gujarati | `ha` Hausa | `he` Hebrew |
| `hi` Hindi | `hu` Hungarian | `id` Indonesian | `ga` Irish |
| `it` Italian | `ja` Japanese | `kn` Kannada | `kk` Kazakh |
| `rw_RW` Kinyarwanda | `ko` Korean | `ky_KG` Kyrgyz | `lo` Lao |
| `lv` Latvian | `lt` Lithuanian | `mk` Macedonian | `ms` Malay |
| `ml` Malayalam | `mr` Marathi | `nb` Norwegian | `ps_AF` Pashto |
| `fa` Persian | `pl` Polish | `pt_BR` Portuguese (BR) | `pt_PT` Portuguese (POR) |
| `pa` Punjabi | `ro` Romanian | `ru` Russian | `sr` Serbian |
| `si_LK` Sinhala | `sk` Slovak | `sl` Slovenian | `es` Spanish |
| `es_AR` Spanish (ARG) | `es_CL` Spanish (CHL) | `es_CO` Spanish (COL) | `es_CR` Spanish (CRI) |
| `es_DO` Spanish (DOM) | `es_EC` Spanish (ECU) | `es_HN` Spanish (HND) | `es_MX` Spanish (MEX) |
| `es_PA` Spanish (PAN) | `es_PE` Spanish (PER) | `es_ES` Spanish (SPA) | `es_UY` Spanish (URY) |
| `sw` Swahili | `sv` Swedish | `ta` Tamil | `te` Telugu |
| `th` Thai | `tr` Turkish | `uk` Ukrainian | `ur` Urdu |
| `uz` Uzbek | `vi` Vietnamese | `zu` Zulu | |

The send-time `template.language.code` uses the same codes (`en`, `pt_BR`, ...). Use the exact code the template was created with.

## Appendix C: Doc gaps and contradictions

Verify these with Turn.io or Meta before relying on them.

1. **Interactive message limits are not documented by Turn.** There are no stated limits on number of reply buttons, button title length, body length, list sections or rows, or header sizes. These come from WhatsApp; check Meta's interactive-message docs.
2. **Inbound interactive and button replies are not documented** in the webhook page. Only the outbound ids/payloads are described, so capture a real payload.
3. **Media message `type` table is garbled** and omits `video`. Prose and example support `video` (including `caption`), while the caption row says image or document only.
4. **Template examples use `category: ISSUE_RESOLUTION`**, which is absent from the valid-category list (`AUTHENTICATION`, `MARKETING`, `UTILITY`).
5. **Template `content` limit** is stated as 1024 characters, but the examples use `components[].text`. The mapping is not explained.
6. **Authentication token details missing:** scopes, default expiry, renewal. For login tokens, `expires_after` is the only expiry signal.
7. **Rate limiting wording:** one sentence says "scope of the number and the message type", another "per number, not per account", consistent with the three buckets. Contacts, labels and export endpoints are not assigned a bucket.
8. **Business profile GET example** in the source is malformed (missing closing brace). The shape shown here is reconstructed from the surrounding text.
9. **Settings write behaviour:** "can only be configured as a group". Whether omitted fields are cleared or kept is not stated. Send the full set.
10. **Claim GET sample** shows `claimed_until` three days after `claimed_at` (and a `=>` typo) even though leases last at most 5 minutes. Treat the sample values as illustrative.
11. **Graph version:** only `v14.0` is stated as supported.
12. **Webhook HMAC input** is shown with a literal string. Using the raw request body is the safe reading.
13. **`GET`/`DELETE /v1/media/<id>` examples show no auth header.** Send `Authorization: Bearer token`.
14. **Health endpoint** is "on-prem only, deprecated soon" while Settings says all numbers have moved to the Cloud API. Treat it as legacy.
15. **Inbound `type` list** in the webhook table omits `reaction`, which is documented separately (6.4).
16. **Not covered here** (other pages on the Turn docs site): Context, Journeys API (`stacks`), Channel API, Fallback Channel, Events API, Data Export API, Flow Results API, WhatsApp Flows and endpoints, Journeys Simulation, Journeys MCP, Apps, Calling.
