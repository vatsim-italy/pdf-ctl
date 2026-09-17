# pdf-ctl

Backend API for generating VATEUD exam report PDFs. Given exam session data and a controller rating (`S2`, `S3`, `C1`), it fills the matching official form template and returns the finished PDF — either as a downloadable file or as base64 in a JSON response.

## Features

- Fills PDF form fields (text, dropdown, checkbox, radio) from JSON input
- Rating-specific field mapping (`S2` / `S3` / `C1`)
- Auto-splits combined "facility - callsign" strings (e.g. `Linate Tower - LIML_TWR`)
- Supports up to two local examiners passed as structured data
- In-memory PDF generation — no files written to disk, no race conditions between concurrent requests
- API key auth, CORS allowlist, request size limits

## Requirements


- PDF form templates for each rating, placed in `templates/` (`S2.pdf`, `S3.pdf`, `C1.pdf`) — **not included in this repo**, see [Templates](#templates)

## Setup

```bashubun install
cp .env.example .env
# edit .env with your own values
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Port to listen on (default `3001`) |
| `NODE_ENV` | No | `development` or `production` |
| `PDF_API_KEY` | Yes, in production | API key clients must send in the `x-api-key` header |
| `ALLOWED_ORIGINS` | No | Comma-separated list of origins allowed by CORS |
| `TEMPLATE_DIR` | No | Path to the PDF templates directory (default `./templates`) |

## Running

```bash
bun run index.js
```

### Docker

```bash
docker compose up --build
```

## API

All endpoints except `/health` require the `x-api-key` header when `PDF_API_KEY` is set.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/pdfapi/controlcenter` | Returns the generated PDF as a binary file |
| `POST` | `/pdfapi/json` | Returns the generated PDF as base64 in a JSON response |
| `GET` | `/pdfapi/test/:rating` | Lists the form field names/types in a template (dev only) |

Request body (`controlcenter` / `json`) must include a `rating` of `S2`, `S3`, or `C1`, plus the session fields defined in `fieldMap.js`.

## Templates

The `templates/` directory (official VATSIM exam report PDF forms) and `output/` (generated PDFs) are intentionally excluded from version control — see `.gitignore`. Obtain the templates separately and place them in `templates/` before running the app.


