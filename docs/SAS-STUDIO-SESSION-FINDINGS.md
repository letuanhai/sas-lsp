# SAS Studio Web Session Management Findings

**Date:** 2025-03-19 (verified 2026-03-19)
**Server:** 192.168.0.141 (SAS Studio 3.8 - University Edition)
**Context:** Testing session lifecycle and authentication for VS Code extension

---

## Summary

The SAS Studio Web dev instance allows **anonymous session creation** without authentication. Sessions can be created via a simple POST request and are identified by a UUID returned in the response. Sessions expire after a period of inactivity (up to 240 hours based on server configuration).

**Key Finding:** There is **no way to check session status client-side** without making an HTTP request to the server. The session object does not contain a client-checkable expiration timestamp.

---

## Authentication Notes

### Dev instance (192.168.0.141)

- **No login credentials** required for session creation
- **No auth cookies** needed in the request — just `POST {}` to create a session
- However, the server **always sets a `JSESSIONID` cookie** in the session creation response
- This `JSESSIONID` must be stored and sent for endpoints that require server-side session association (specifically: **reset**)
- Always capture cookies from session creation: `curl -c cookies.txt ...`

### Production instances

- Authentication cookies (e.g. from a login flow) are required before session creation
- The `JSESSIONID` returned from login must be included in all subsequent API calls
- The `RemoteSession-Id` header is required in addition to the auth cookie

---

## Session Creation

### Endpoint

```
POST /SASStudio/38/sasexec/sessions
Content-Type: application/json
```

### Request Body

Empty JSON object `{}` (no authentication required for dev instance)

### Response (HTTP 200)

Also sets `Set-Cookie: JSESSIONID=<token>; Path=/SASStudio; HttpOnly` — capture this.

```json
{
  "baseURL": "http://192.168.0.141/SASStudio/",
  "version": "3.8",
  "javaVersion": "1.8.0_181",
  "javaHome": "/opt/sasinside/SASHome/SASPrivateJavaRuntimeEnvironment/9.4/jre",
  "javaVendor": "Azul Systems, Inc.",
  "jarVersion": "308000.3.0.20181107190000_d4dms38",
  "clientMode": "basic",
  "sasSysStreamingLog": "true",
  "objectUUID": "e6b46160-025b-453d-968f-0883e987113b",
  "osName": "Linux",
  "osVersion": "2.6.32-754.35.1.el6.x86_64",
  "ftpFileRefs": [],
  "running": false,
  "queued": 0,
  "timeZone": null,
  "ctmHost": null,
  "workspaceConnectionError": 0,
  "workspaceConnectionErrorMessage": "",
  "sasOS": "Linux LIN X64 2.6.32-754.35.1.el6.x86_64",
  "sasSysUserId": "sasdemo",
  "sasSysUserName": "sasdemo",
  "links": [],
  "owner": "sasdemo",
  "date": "2021-01-26 15:34:00.6",
  "lastAccessedTime": 1611675241324,
  "lastPingTime": 1611675240600,
  "creationTime": 1611675240600,
  "remoteHost": "0:0:0:0:0:0:0:1",
  "remoteAddr": "0:0:0:0:0:0:0:1",
  "userAgent": "curl/7.88.1",
  "sasVersionLong": "9.04.01M6P11072018",
  "sasVersion": 9.46,
  "sasHost": "Linux LIN X64 2.6.32-754.35.1.el6.x86_64",
  "sasHostForJavascript": "LOCALHOST",
  "clientHost": "192.168.1.9",
  "siteName": "UNIVERSITY EDITION 2.8.1 9.4 M6",
  "siteNum": "7.0245736E7",
  "grace": 0,
  "warn": 48,
  "warningPeriod": 1623801600000,
  "finalExpiration": 1627948800000,
  "expiration": 1623801600000,
  "workspaceServerList": ["localhost"],
  "ftpShortcuts": [],
  "ftpShortcutsLoaded": false,
  "serverName": "localhost",
  "lastSubmissionID": null,
  "sasSysHostName": "localhost",
  "userDirectory": "/folders/myfolders",
  "studioDataDirectory": "/folders/myfolders/.sasstudio",
  "totalQueuedCount": 0,
  "totalRunningCount": 0,
  "webwork": "/folders/myfolders/.sasstudio/webwork/RS2504",
  "envSetting": null,
  "id": "dda5780e-bc30-4cd7-ba6a-f23b80ad58d0"
}
```

### Key Fields

- `id` - The session UUID (used in `RemoteSession-Id` header)
- `sasSysUserId` - The authenticated user (`sasdemo` for dev instance)
- `userDirectory` - User's home directory (`/folders/myfolders`)
- `creationTime` - Unix timestamp when session was created
- `lastAccessedTime` - Unix timestamp of last activity
- `lastPingTime` - Unix timestamp of last ping
- `running` - Boolean indicating if code is currently executing
- `lastSubmissionID` - UUID of the last code submission (null if none)
- `expiration` - **SAS license expiration** (not session timeout!)

---

## Session Status Check (Ping)

### Endpoint

```
GET /SASStudio/38/sasexec/sessions/{sessionId}/ping
RemoteSession-Id: {sessionId}
Accept: */*
```

No cookie required for ping.

### Response (HTTP 200 - Valid Session)

```json
{
  "lastAccessedTime": 1611675475921,
  "running": false,
  "queued": 0,
  "lastAccessedSpanInMilliseconds": 1003
}
```

### Response (HTTP 404 - Expired/Invalid Session)

Empty body, status code 404

### Response (HTTP 503 - Server Overloaded)

Server may return 503 when too many sessions are created in parallel with active workloads.

---

## Session Reset

Resets the SAS workspace without creating a new session. This clears libraries, file shortcuts, and workspace state while keeping the same session ID.

### Endpoint

```
GET /SASStudio/38/sasexec/sessions/{sessionId}/reset
RemoteSession-Id: {sessionId}
Cookie: JSESSIONID={token}
```

**⚠️ The `JSESSIONID` cookie is required.** Without it, the server returns HTTP 404 with a server-side error. The `JSESSIONID` is issued in the `Set-Cookie` header of the session creation response — capture it then.

### Response (HTTP 200 - Success)

Returns the **full session object** (same format as session creation), reflecting post-reset state. Not an empty body.

### Response (HTTP 404 - Missing Cookie)

Empty body with error header:
```
Exception: An%20unknown%20error%20occurred%20while%20processing%20your%20request...
```

This is a misleading 404 — the endpoint exists but the server cannot associate the request with a valid HTTP session without the `JSESSIONID` cookie.

### UI Behavior

The "Reset SAS Session (F9)" button in the UI triggers a confirmation dialog: "If you continue, all of the libraries and file shortcuts that you created during this session will be deleted. Do you want to continue?" — clicking Yes calls this endpoint.

### Use Case

Useful for clearing workspace state between tests without the overhead of creating a new session.

### Example

```bash
# Create session and capture JSESSIONID cookie
curl -s -c /tmp/sas_cookies.txt \
  'http://192.168.0.141/SASStudio/38/sasexec/sessions' \
  -X POST -H 'Content-Type: application/json' -d '{}'

SESSION_ID=$(cat /tmp/sas_session.json | jq -r '.id')

# Reset (requires the cookie)
curl -s -b /tmp/sas_cookies.txt \
  "http://192.168.0.141/SASStudio/38/sasexec/sessions/${SESSION_ID}/reset" \
  -H "RemoteSession-Id: ${SESSION_ID}"
```

---

## Session Deletion/Cleanup

**✅ Sessions CAN be explicitly deleted via API.**

### Endpoint

```
DELETE /SASStudio/38/sasexec/sessions/{sessionId}
RemoteSession-Id: {sessionId}
```

No cookie required for deletion.

### Response (HTTP 200 - Success)

Empty body, status code 200

### Verification

After deletion, subsequent requests to the session return HTTP 404:

```bash
# Before delete
GET /sessions/{id}/ping → 200 OK

# Delete
DELETE /sessions/{id} → 200 OK

# After delete
GET /sessions/{id}/ping → 404 Not Found
```

### Notes

- The DELETE endpoint exists but is **not used by the SAS Studio Web UI**
- The UI relies on automatic session expiration (240 hours of inactivity)
- For testing, explicit deletion is recommended to free up server resources
- The current VS Code extension does not call this endpoint in `_close()`

### Example

```bash
# Create a session (saving cookies)
curl -s -c /tmp/sas_cookies.txt \
  'http://192.168.0.141/SASStudio/38/sasexec/sessions' \
  -X POST -H 'Content-Type: application/json' -d '{}' | jq -r '.id'

# Use the session for testing...

# Clean up when done (no cookie needed for delete)
curl -s -X DELETE "http://192.168.0.141/SASStudio/38/sasexec/sessions/${SESSION_ID}" \
  -H "RemoteSession-Id: ${SESSION_ID}"
```

---

## Session Query

### Endpoint

```
GET /SASStudio/38/sasexec/sessions/{sessionId}
RemoteSession-Id: {sessionId}
```

### Response

Same as session creation response (full session object)

---

## Code Submission

### Endpoint

```
POST /SASStudio/38/sasexec/sessions/{sessionId}/asyncSubmissions?label={label}&uri={uri}
Content-Type: text/plain; charset=UTF-8
RemoteSession-Id: {sessionId}
```

Query parameters `label` and `uri` are required (any string values work).

### Response (HTTP 200)

Returns submission UUID as a plain quoted string (not JSON object):

```
"34494e90-8382-421c-bd46-fe99b0d6c19d"
```

Also sets a `JSESSIONID` cookie if one wasn't already present.

---

## Polling for Results

### Endpoint

```
GET /SASStudio/38/sasexec/sessions/{sessionId}/messages/longpoll
RemoteSession-Id: {sessionId}
Accept: application/json
```

Long-polls up to ~30 seconds, returns when messages are available or times out.

### Response (HTTP 200)

Array of message objects. Each message has:

- `messageType` — string identifying the message type
- `payload` — object with message-specific data

**Message types observed:**

| `messageType`         | Description                                   |
| --------------------- | --------------------------------------------- |
| `LogChunk`            | Chunk of SAS log output (HTML)                |
| `ExecutionStatusUpdate` | Status updates during execution             |
| `ServerMessage`       | Server-level messages                         |
| `LogEnd`              | Signals end of log output                     |
| `SubmitComplete`      | Execution finished; payload contains `links`  |

**`SubmitComplete` payload** includes a `links` array with a `results` link to fetch HTML output.

### Empty responses

- `{}` — server still processing, poll again
- `[]` — no pending messages (all consumed)

---

## Cancel Submission

### Endpoint

```
DELETE /SASStudio/38/sasexec/sessions/{sessionId}/submissions?id={submissionId}
RemoteSession-Id: {sessionId}
```

### Response (HTTP 200)

Empty body, status code 200

---

## Session Expiration Behavior

### Server Configuration

```
webdms.maxSessionTimeoutInHours=240  # 10 days maximum
webdms.longPollingHoldTimeSeconds=30
```

### Client-Side Implications

- **No client-side expiration check possible** - You cannot check if a session is expired without making an HTTP request
- Session object contains timestamps (`creationTime`, `lastAccessedTime`, `lastPingTime`) but these don't indicate expiration
- The `expiration` field in the session object is the **SAS license expiration**, not the HTTP session timeout
- Sessions expire due to **inactivity**, not absolute time

### Reliable Session Status Check

The only reliable way to check session status:

```bash
# Returns 200 with ping data if alive
curl 'http://192.168.0.141/SASStudio/38/sasexec/sessions/{sessionId}/ping' \
  -H 'RemoteSession-Id: {sessionId}' \
  -H 'Accept: */*'

# Returns 404 if session is expired/invalid
```

---

## Server Limitations

### Memory Constraints

The dev SAS Studio server has limited memory. Be conservative with parallel sessions:

- **Parallel session creation** - 6 concurrent creates succeeded in testing, but the server may 503 under higher load or with active code execution
- **Recommendation** - Reuse sessions across tests when possible; don't create a new session per test

### Testing Best Practices

1. Create one session per test suite (not per test)
2. Use `before` hook to create session, `after` hook to clean up
3. Avoid parallel test execution that creates sessions concurrently
4. Handle 503 errors with retry logic if needed

---

## API Endpoints Summary

| Method | Endpoint                                        | Cookie needed? | Description           | Response                        |
| ------ | ----------------------------------------------- | -------------- | --------------------- | ------------------------------- |
| POST   | `/sasexec/sessions`                             | No             | Create new session    | Session object + sets JSESSIONID |
| GET    | `/sasexec/sessions/{id}`                        | No             | Get session details   | Session object (HTTP 200)       |
| GET    | `/sasexec/sessions/{id}/ping`                   | No             | Check session status  | Ping data (HTTP 200) or 404     |
| GET    | `/sasexec/sessions/{id}/reset`                  | **Yes**        | Reset workspace state | Session object (HTTP 200)       |
| DELETE | `/sasexec/sessions/{id}`                        | No             | Delete session        | Empty (HTTP 200)                |
| POST   | `/sasexec/sessions/{id}/asyncSubmissions`       | No             | Submit SAS code       | Submission UUID string (HTTP 200) |
| GET    | `/sasexec/sessions/{id}/messages/longpoll`      | No             | Poll for results      | Messages array (HTTP 200)       |
| DELETE | `/sasexec/sessions/{id}/submissions?id={subId}` | No             | Cancel submission     | Empty (HTTP 200)                |

---

## API Request Patterns

### Creating a Session (capturing JSESSIONID)

```bash
curl -s -c /tmp/sas_cookies.txt \
  'http://192.168.0.141/SASStudio/38/sasexec/sessions' \
  -X POST -H 'Content-Type: application/json' -d '{}' \
  -o /tmp/sas_session.json

SESSION_ID=$(jq -r '.id' /tmp/sas_session.json)
```

### Checking Session Status

```bash
curl -s "http://192.168.0.141/SASStudio/38/sasexec/sessions/${SESSION_ID}/ping" \
  -H "RemoteSession-Id: ${SESSION_ID}" \
  -H 'Accept: */*' \
  -w "\nHTTP Status: %{http_code}\n"
```

### Resetting Session (requires cookie)

```bash
curl -s -b /tmp/sas_cookies.txt \
  "http://192.168.0.141/SASStudio/38/sasexec/sessions/${SESSION_ID}/reset" \
  -H "RemoteSession-Id: ${SESSION_ID}"
```

### Submitting Code

```bash
# Note: pass label/uri as query params in the URL, not with -G
curl -s \
  "http://192.168.0.141/SASStudio/38/sasexec/sessions/${SESSION_ID}/asyncSubmissions?label=Test&uri=Test" \
  -X POST \
  -H 'Content-Type: text/plain; charset=UTF-8' \
  -H "RemoteSession-Id: ${SESSION_ID}" \
  -d 'proc print data=sashelp.class; run;'
```

### Polling for Results

```bash
# Poll until SubmitComplete messageType appears
curl -s --max-time 35 \
  "http://192.168.0.141/SASStudio/38/sasexec/sessions/${SESSION_ID}/messages/longpoll" \
  -H "RemoteSession-Id: ${SESSION_ID}" \
  -H 'Accept: application/json'
```

---

## Conclusion

For the VS Code extension tests:

1. **Session creation is trivial** - Single POST request, no auth needed for dev instance
2. **Capture JSESSIONID on creation** - Required for reset; use `-c cookiefile` with curl
3. **Session checking requires HTTP request** - Use `/ping` endpoint for lightweight checks
4. **Session cleanup is available** - Use `DELETE /sessions/{id}` to explicitly delete sessions
5. **Poll message field is `messageType`** - Not `type`; payload is in `payload` field
6. **Reuse sessions** - Don't create new sessions for every test due to server limitations
7. **Clean up after tests** - Always delete sessions in `after`/`afterEach` hooks

The recommended approach is to create a session once at the start of a test suite and reuse it across tests, then explicitly delete it when done:

```typescript
let sessionId: string;
let cookies: string; // JSESSIONID for reset endpoint

before(async () => {
  // Create once for all tests; capture JSESSIONID cookie
  const { id, jsessionId } = await createStudioWebSession();
  sessionId = id;
  cookies = jsessionId;
});

after(async () => {
  // Clean up when done
  await deleteStudioWebSession(sessionId);
});
```
