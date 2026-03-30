# SAS Studio File Encoding API Behavior

> Findings from live API exploration against SAS Studio 3.8 at `192.168.0.141`.

## Server Encoding Configuration

The server's default text encoding is stored as a user preference:

```
GET /sasexec/{sessionId}/preferences/get?key=SWE.optionPreferencesGeneral.key
```

Response (relevant field):

```json
{ "defaultTextEncoding": "ISO-8859-1" }
```

This is the encoding SAS Studio uses for reading/writing text files on disk. It is **independent** of the SAS session's `ENCODING` option (which governs SAS datasets). For example, the SAS session may report `ENCODING=UTF-8` via `%sysfunc(getoption(encoding))` while `defaultTextEncoding` is `ISO-8859-1`.

## Available Encodings

```
GET /sasexec/{sessionId}/encodings
```

Returns an array of 171 supported encodings (Big5, EUC-JP, ISO-8859-1, UTF-8, etc.):

```json
[
  { "displayName": "Big5", "name": "Big5" },
  { "displayName": "ISO-8859-1", "name": "ISO-8859-1" },
  { "displayName": "UTF-8", "name": "UTF-8" }
]
```

SAS Studio fetches this list to populate the "Open with Text Encoding" dialog.

## Reading Files

### Endpoint

```
GET /sasexec/sessions/{sessionId}/workspace/{path}
```

### Behavior

The server **always returns raw bytes** with no transcoding. The file content is returned exactly as stored on disk.

### Query Parameters

| Parameter | Effect |
|-----------|--------|
| `ct` | Sets the response `Content-Type` header (e.g., `ct=text/plain;charset=ISO-8859-1` → `Content-Type: text/plain;charset=ISO-8859-1`). **No byte transformation occurs.** This is a hint so browser-based `XMLHttpRequest` decodes bytes using the specified charset automatically. |
| `dojo.preventCache` | Cache-busting timestamp, no functional effect. |

### How SAS Studio UI Reads Files

```
GET .../workspace//folders/myfolders/file.sas?ct=text/plain;charset=ISO-8859-1&dojo.preventCache=...
```

The `ct` parameter tells the browser to interpret the raw bytes as ISO-8859-1. The browser's `XMLHttpRequest` handles decoding via the `Content-Type` charset.

### How VS Code Extension Reads Files

```typescript
const response = await axios.get(url, { responseType: "arraybuffer" });
return new TextDecoder(getServerEncoding()).decode(response.data);
```

Uses `arraybuffer` response type to get raw bytes, then decodes manually with `TextDecoder` using the server encoding. This is equivalent to (and more reliable than) relying on `ct`.

### Verification

| File on disk | Raw bytes (no `ct`) | With `ct=...;charset=ISO-8859-1` | With `ct=...;charset=UTF-8` |
|---|---|---|---|
| ISO-8859-1 encoded, 16 bytes | 16 bytes (ISO-8859-1) | 16 bytes (same, header changed) | 16 bytes (same, header changed) |

The `ct` parameter **only** affects the `Content-Type` response header — the bytes are always identical.

## Writing Files

### Endpoint

```
POST /sasexec/sessions/{sessionId}/workspace/{path}
```

### Behavior

The request body is expected to be UTF-8 text. The server can optionally transcode from UTF-8 to a target encoding before writing to disk.

### Query Parameters

| Parameter | Effect |
|-----------|--------|
| `encoding` | Target encoding for transcoding. Server transcodes **from UTF-8 → target encoding** before writing to disk. Without this parameter, raw bytes from the body are stored as-is. |
| `addbom` | When `true`, prepends a BOM (Byte Order Mark) to the file. SAS Studio uses this for `autoexec.sas` (`?encoding=UTF-8&addbom=true`). |

### Headers

```
Content-Type: text/plain;charset=UTF-8
```

### How SAS Studio UI Writes Files

```
POST .../workspace//folders/myfolders/file.sas?encoding=ISO-8859-1
Content-Type: text/plain; charset=utf-8

<file content as UTF-8 text>
```

SAS Studio sends UTF-8 text in the body and passes `?encoding=ISO-8859-1` so the server transcodes to ISO-8859-1 before writing.

### How VS Code Extension Writes Files

```typescript
const encoding = getServerEncoding();
const encodingParam = encoding.toUpperCase() === "UTF-8" ? {} : { encoding };
await axios.post(url, content, {
  params: encodingParam,
  headers: { "Content-Type": "text/plain;charset=UTF-8" },
});
```

Skips the `encoding` param when server is UTF-8 (no transcoding needed); otherwise passes it so the server transcodes.

### Verification

| Write params | File on disk | Size | Roundtrip |
|---|---|---|---|
| No `encoding` param, body="Hello üéñ café" (UTF-8) | UTF-8 bytes stored as-is | 34 bytes | ✅ Reads back correctly with `TextDecoder("UTF-8")` |
| `?encoding=ISO-8859-1`, body="Hello üéñ café" (UTF-8) | ISO-8859-1 bytes (transcoded) | 27 bytes | ✅ Reads back correctly with `TextDecoder("ISO-8859-1")` |
| `?encoding=ISO-8859-1`, body="你好世界" (CJK, UTF-8) | `????` (data loss — CJK not in ISO-8859-1) | lossy | ⚠️ Characters replaced with `?` |

## Autoexec Save Pattern

SAS Studio uses a specific pattern for saving `autoexec.sas`:

```
POST .../workspace//folders/myfolders/autoexec.sas?encoding=UTF-8&addbom=true
Content-Type: text/plain; charset=utf-8
```

This explicitly saves as UTF-8 with a BOM marker, regardless of the server's `defaultTextEncoding`.

## Summary

| Operation | Server behavior | Client responsibility |
|-----------|----------------|----------------------|
| **Read** | Returns raw bytes, no transcoding | Decode with `TextDecoder(serverEncoding)` |
| **Write** | Transcodes UTF-8 body → target encoding if `?encoding` is set | Send UTF-8 body + `?encoding=X` when server is not UTF-8 |
| **Encoding detection** | `defaultTextEncoding` from preferences endpoint | Fetch once at session start, store in state |

---

_Generated from live API exploration of SAS Studio 3.8 at `http://192.168.0.141/SASStudio/38`, March 2026._
