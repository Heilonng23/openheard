# openheard API v1

All endpoints live under `/api/v1/` and require a Bearer token.

## Authentication

Create an API key in **Dashboard → Settings → API keys** (or use the script below for local dev).

```
Authorization: Bearer oh_<your-key>
```

Every key is scoped to one workspace. Revoked keys return `401`.

### Local dev: generate a key

```bash
OPENHEARD_LOCAL=1 bun run apps/web/src/scripts/make-api-key.ts
```

## Rate limits

All API endpoints are rate-limited to **60 requests per minute** per API key (or per IP if no key is provided).

When you exceed the limit the server returns `429 Too Many Requests` with a JSON body and a `Retry-After` header (seconds until the window resets):

```json
{ "error": "Too many requests" }
```

Back off for the number of seconds in `Retry-After` before retrying.

## Error shape

Every error returns JSON:

```json
{ "error": "Human-readable message" }
```

Status codes: `401` (bad/missing key), `404` (not found), `422` (validation), `405` (wrong method), `500` (server).

---

## Endpoints

### GET /api/v1/posts

List posts. Returns `{ posts, total, limit, offset }`.

| Param    | Type   | Default   | Description                            |
|----------|--------|-----------|----------------------------------------|
| board    | string | —         | Filter by board ID                     |
| status   | string | —         | Filter by status key                   |
| q        | string | —         | Search title and body                  |
| sort     | string | trending  | `top`, `new`, or `trending`            |
| limit    | number | 30        | 1–100                                  |
| offset   | number | 0         | Pagination offset                      |

```bash
curl -H "Authorization: Bearer $KEY" \
  "http://localhost:3001/api/v1/posts?sort=top&limit=5"
```

### GET /api/v1/posts/:id

Single post with comments and activity timeline.

```bash
curl -H "Authorization: Bearer $KEY" \
  http://localhost:3001/api/v1/posts/1
```

### POST /api/v1/posts

Create a post. Returns `{ id }` with status `201`.

```json
{
  "title": "Add dark mode",
  "body": "Optional longer description",
  "board": "features",
  "author_email": "user@example.com"
}
```

- `title` (required, 4–140 chars)
- `board` (required, must be a valid board ID)
- `body` (optional, max 5000 chars)
- `author_email` (optional, links to existing user)

### POST /api/v1/posts/:id/status

Change a post's status.

```json
{ "status": "planned" }
```

Accepts a status key (`open`, `review`, `planned`, `progress`, `done`, `closed`) or the workspace's custom label.

### POST /api/v1/posts/:id/comments

Add a comment. Returns `{ id }` with status `201`.

```json
{ "body": "Thanks for the feedback!" }
```

### GET /api/v1/statuses

List workspace statuses. Returns `{ statuses: [{ key, label, color, kind, onRoadmap }] }`.

### GET /api/v1/boards

List workspace boards. Returns `{ boards: [{ id, name, description }] }`.

### GET /api/v1/changelog

List published changelog entries. Returns `{ entries: [{ id, title, body, version, publishedAt, posts }] }`.

### POST /api/v1/changelog

Create a draft changelog entry. Returns `{ id }` with status `201`.

```json
{
  "title": "v1.2 – Dark mode",
  "body": "Markdown body here",
  "version": "v1.2.0",
  "post_ids": [1, 4, 7]
}
```

### POST /api/v1/changelog/:id/publish

Publish a draft entry. Linked posts are moved to the "done" status automatically.

---

## curl cheat sheet

```bash
# Set your key
export KEY="oh_..."

# List top posts
curl -s -H "Authorization: Bearer $KEY" http://localhost:3001/api/v1/posts?sort=top | jq

# Create a post
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"API test post","board":"features"}' \
  http://localhost:3001/api/v1/posts | jq

# Change status
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"status":"planned"}' \
  http://localhost:3001/api/v1/posts/1/status | jq
```
