# SAS Studio Web API Documentation

This document describes the SAS Studio Web API endpoints used by the VS Code extension for files and libraries operations.

> **Last Updated:** March 13, 2026  
> **Source:** Browser-based exploration of SAS Studio 3.8 instance  
> **Instance:** http://192.168.0.141/SASStudio/38/main

## Overview

This API enables programmatic interaction with SAS Studio for:

- Executing SAS code asynchronously with real-time log streaming
- Browsing and accessing server file systems
- Querying SAS libraries and datasets
- Managing user sessions and preferences

## Base URL Structure

### Standard Deployment

```
https://{host}/sasexec
```

**Example:** `https://sas8.pf.echonet/sasexec`

### SAS Studio Web Interface (with context path)

When accessing SAS Studio through the web interface, the base URL includes the SAS Studio context:

```
http://{host}/SASStudio/{version}/sasexec
```

**Example:** `http://192.168.0.141/SASStudio/38/sasexec`

**Key Differences:**

- The web interface uses a longer base path with version number
- All API endpoints are relative to this base path
- Session management and authentication work the same way

## Authentication

All requests require:

- **RemoteSession-Id header**: The remote session UUID (e.g., `939a74d4-e309-4f88-8e85-fd81a02b8eb5`)

**Cookie requirements differ by environment:**

- **Production instances**: An authorization token cookie (e.g., `35ab575d..._Cluster2=value`) obtained from the SAS Studio login flow **must** be included in **every** API request, including session creation.
- **Dev instance (`192.168.0.141`)**: No authorization cookie is required. Session creation and all API calls work without any auth cookie.

---

## Code Execution API

### Submit SAS Code (Async)

Executes SAS code asynchronously and returns a submission ID for polling.

**Endpoint:**

```
POST /sessions/{sessionId}/asyncSubmissions
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|--------|--------------------------------------|
| label | string | Program label (e.g., "Program%201") |
| uri | string | Program URI (e.g., "Program%201") |
| pdf | string | Include PDF output ("true"/"false") |
| rtf | string | Include RTF output ("true"/"false") |

**Headers:**

```
Content-Type: text/plain; charset=UTF-8
RemoteSession-Id: {sessionId}
Cookie: {session_cookie}
```

**Request Body:** SAS code as plain text

**Response:**

```json
{
  "id": "submission-uuid-here",
  "status": "pending"
}
```

### Poll for Execution Results

Long-polling endpoint that returns messages (log chunks, completion status).

**Endpoint:**

```
GET /sessions/{sessionId}/messages/longpoll
```

**Headers:**

```
RemoteSession-Id: {sessionId}
Cookie: {session_cookie}
```

**Response:** Array of message objects

```json
[
  {
    "messageType": "LogChunk",
    "payload": {
      "chunk": "<div>1          The SAS System</div>"
    }
  },
  {
    "messageType": "SubmitComplete",
    "payload": {
      "dataSets": [{ "library": "WORK", "member": "TEMP" }],
      "links": [
        {
          "rel": "results",
          "uri": "/sessions/{id}/results/{resultId}",
          "href": "..."
        }
      ]
    }
  }
]
```

**Message Types:**

- `LogChunk` - HTML-formatted log output
- `LogEnd` - End of log
- `SubmitComplete` - Execution finished, contains results link

### Cancel Submission

Cancels a running code submission.

**Endpoint:**

```
DELETE /sessions/{sessionId}/submissions?id={submissionId}
```

**Headers:**

```
RemoteSession-Id: {sessionId}
Cookie: {session_cookie}
```

---

## File Operations API

### List Directory Contents

Lists files and folders in a directory.

**Endpoint:**

```
GET /sessions/{sessionId}/workspace/~~ds~~{path}
```

**Parameters:**

- `path` - Directory path (e.g., `/home/user/projects`)

**Headers:**

```
RemoteSession-Id: {sessionId}
Cookie: {session_cookie}
```

**Response:** Array of workspace entries

```json
[
  {
    "name": "file.sas",
    "uri": "/home/user/projects/file.sas",
    "path": "/home/user/projects/file.sas",
    "type": "file",
    "isDirectory": false,
    "category": 1,
    "size": 1024,
    "modifiedTimeStamp": "2024-01-15T10:30:00Z",
    "creationTimeStamp": "2024-01-10T08:00:00Z",
    "parentFolderUri": "/home/user/projects"
  },
  {
    "name": "subdir",
    "uri": "/home/user/projects/subdir",
    "type": "directory",
    "isDirectory": true,
    "category": 0
  }
]
```

**Entry Types:**

- `category: 0` - Directory
- `category: 1+` - File
- `type: "directory" | "dir"` - Directory
- `type: "file"` - File

### Get File Content

Retrieves the text content of a file.

**Endpoint:**

```
GET /sessions/{sessionId}/workspace/~~ds~~{path}
```

**Query Parameters:**
| Parameter | Value | Description |
|-----------|--------------------------------|----------------------|
| ct | text/plain;charset=UTF-8 | Content type |
| ct | text/plain;charset=ISO-8859-1 | Latin-1 encoding |

**Example:**

```
GET /sessions/{sessionId}/workspace/~~ds~~/home/user/program.sas?ct=text/plain;charset=UTF-8
```

**Response:** Raw file content as text

**Alternative Workspace Endpoint:**
Some deployments use a workspace prefix for file access:

```
GET /sasexec/sessions/{sessionId}/workspace/{filePath}
```

**Example:**

```
GET /sasexec/sessions/{id}/workspace//folders/myfolders/test.sas
```

### Create/Update File

Creates a new file or updates an existing file.

**Endpoint:**

```
POST /sessions/{sessionId}/workspace/~~ds~~{path}
```

**Query Parameters:**
| Parameter | Value | Description |
|-----------|--------------------------------|----------------------|
| ct | text/plain;charset=UTF-8 | Content type |

**Headers:**

```
Content-Type: text/plain;charset=UTF-8
RemoteSession-Id: {sessionId}
Cookie: {session_cookie}
```

**Request Body:** File content as plain text

**Response:** Empty on success (HTTP 200)

### Delete File

Deletes a file.

**Endpoint:**

```
DELETE /sessions/{sessionId}/workspace/~~ds~~{path}
```

**Query Parameters:**
| Parameter | Value | Description |
|-----------|--------------------------------|----------------------|
| ct | text/plain;charset=UTF-8 | Content type |

**Headers:**

```
RemoteSession-Id: {sessionId}
Cookie: {session_cookie}
```

### Create Directory

Creates a new directory (folder).

**Endpoint:**

```
POST /sessions/{sessionId}/workspace/~~ds~~{path}/
```

**Note:** The trailing slash `/` indicates directory creation.

**Query Parameters:**
| Parameter | Value | Description |
|-----------|--------------------------------|----------------------|
| ct | text/plain;charset=UTF-8 | Content type |

**Headers:**

```
Content-Type: text/plain;charset=UTF-8
RemoteSession-Id: {sessionId}
Cookie: {session_cookie}
```

**Request Body:** Empty string

### Get Root Directory

Retrieves the home/starting directory information.

**Endpoint:**

```
GET /{sessionId}/_root_
```

**Headers:**

```
RemoteSession-Id: {sessionId}
Cookie: {session_cookie}
```

**Response:** Single entry or array of entries representing the root

---

## Library & Dataset Operations API

### Libraries Data Model

The libraries API uses a hierarchical tree structure with a consistent node format across all endpoints. Each node represents either a library, a table, or a column.

#### Node Structure

```typescript
interface LibdataNode {
  // Identification
  id: string; // Unique identifier (e.g., "libraries~SASHELP~CLASS")
  name: string; // Display name (e.g., "SASHELP", "CLASS")
  uri: string | null; // API path (e.g., "libraries/SASHELP", "libraries~SASHELP/CLASS.DATA")

  // Type flags
  isLibrary: boolean; // true if this is a library
  table: boolean; // true if this is a data table
  isReadOnly: boolean; // Read-only status
  isHadoop: boolean; // Hadoop-related flag
  isDBMS: boolean; // DBMS-related flag

  // Data properties
  type: string | null; // "DATA" for tables, "LIBRARY" for libraries, "Char"/"Numeric" for columns
  dataType: string | null; // "DATA" for tables
  engine: string; // Storage engine (e.g., "V9")
  format: string; // SAS format
  informat: string; // SAS informat
  length: number; // Field length (8 for most numeric/char columns)
  numRows: number; // Row count (0 for libraries, actual count for tables)

  // Hierarchy
  children: LibdataNode[]; // Child nodes (tables for libraries, columns for tables)

  // Context
  library: string | null; // Parent library name (null for root/libraries)
  path: string | null; // Physical file path
  tableName: string; // Table name context
  desc: string; // Description
  options: string; // Library/table options
  serverName: string; // Server identifier
}
```

#### Hierarchy Pattern

```
_root_
└── libraries (virtual container)
    ├── SASHELP (library)
    │   ├── CLASS (table)
    │   │   ├── Name (column)
    │   │   ├── Sex (column)
    │   │   └── ...
    │   └── ...
    ├── WORK (library)
    └── ...
```

#### URL Encoding for Paths

Library and table names use tilde (`~`) as a delimiter in URLs:

- `/libdata/{sessionId}/libraries~{libref}` - Access a library
- `/libdata/{sessionId}/libraries~{libref}~{table}` - Access a table
- `/libdata/{sessionId}/libraries~{libref}~{table}~{column}` - Access a column

### List Libraries

Retrieves the root node containing all accessible SAS libraries as children.

**Endpoints:**

```
GET /libdata/{sessionId}/_root_
GET /libdata/{sessionId}/libraries
```

**Headers:**

```
RemoteSession-Id: {sessionId}
Cookie: {session_cookie}
```

**Response Structure:**

```json
{
  "id": "libraries",
  "name": "Libraries",
  "isLibrary": true,
  "isReadOnly": false,
  "engine": "",
  "uri": null,
  "children": [
    {
      "id": "libraries~SASHELP",
      "name": "SASHELP",
      "isLibrary": true,
      "isReadOnly": true,
      "engine": "V9",
      "uri": "libraries/SASHELP",
      "library": null,
      "data": {
        "id": "SASHELP",
        "name": "SASHELP",
        "readOnly": true,
        "engine": "V9",
        "isLibrary": true,
        "concats": [
          {
            "engineName": "V9",
            "readOnly": false,
            "physicalName": "/opt/sasinside/SASHome/SASFoundation/9.4/sashelp",
            "infoProperties": {
              "Owner Name": "sas",
              "Filename": "/opt/sasinside/SASHome/SASFoundation/9.4/sashelp",
              "File Size": "20KB",
              "Access Permission": "rwxr-xr-x"
            }
          }
        ]
      },
      "children": []
    }
  ],
  "table": false,
  "numRows": 0
}
```

**Key Fields for Libraries:**

| Field                           | Description                                      |
| ------------------------------- | ------------------------------------------------ |
| `data.id`                       | Library reference name (e.g., "SASHELP")         |
| `data.name`                     | Display name                                     |
| `data.readOnly`                 | Whether library is read-only                     |
| `data.engine`                   | Storage engine (e.g., "V9")                      |
| `data.concats`                  | Array of physical storage locations              |
| `data.concats[].physicalName`   | Physical path on server                          |
| `data.concats[].infoProperties` | File metadata (owner, size, permissions)         |
| `data.isLibrary`                | Always true for libraries                        |
| `data.temp`                     | Whether this is a temporary library (e.g., WORK) |
| `data.userCreated`              | Whether user created this library                |

### List Tables in Library

Retrieves all tables/datasets in a specific library as children of a library node.

**Endpoint:**

```
GET /libdata/{sessionId}/libraries~{libref}
```

**Parameters:**

- `libref` - Library reference (e.g., `SASHELP`, `WORK`)

**Headers:**

```
RemoteSession-Id: {sessionId}
Cookie: {session_cookie}
```

**Response Structure:**

```json
{
  "id": "libraries~SASHELP",
  "name": "SASHELP",
  "isLibrary": true,
  "isReadOnly": true,
  "engine": "V9",
  "uri": "libraries/SASHELP",
  "children": [
    {
      "id": "libraries~SASHELP~CLASS",
      "name": "CLASS",
      "isLibrary": false,
      "table": true,
      "isReadOnly": true,
      "type": "DATA",
      "dataType": null,
      "engine": "V9",
      "library": "SASHELP",
      "uri": "libraries~SASHELP/CLASS.DATA",
      "numRows": 19,
      "children": [],
      "desc": "Student Data"
    }
  ],
  "table": false,
  "numRows": 0
}
```

**Key Fields for Tables:**

| Field       | Description                                                       |
| ----------- | ----------------------------------------------------------------- |
| `id`        | Unique ID (e.g., "libraries~SASHELP~CLASS")                       |
| `name`      | Table name without extension                                      |
| `table`     | Always `true` for tables                                          |
| `isLibrary` | Always `false` for tables                                         |
| `type`      | Always "DATA" for data tables                                     |
| `library`   | Parent library name                                               |
| `numRows`   | Number of rows in the table                                       |
| `desc`      | Table description                                                 |
| `uri`       | API path to access this table's details                           |
| `children`  | Empty array at this level (populated when fetching table details) |

### Get Table Details (Columns)

Retrieves a table node containing all columns as children. This is the preferred method for getting table metadata including column definitions.

**Endpoint:**

```
GET /libdata/{sessionId}/libraries~{libref}~{table}
```

**Parameters:**

- `libref` - Library reference (e.g., `SASHELP`)
- `table` - Table name (e.g., `CLASS`)

**Headers:**

```
RemoteSession-Id: {sessionId}
Cookie: {session_cookie}
```

**Response Structure:**

```json
{
  "id": null,
  "name": null,
  "isLibrary": false,
  "table": false,
  "isReadOnly": false,
  "dataType": "DATA",
  "desc": "Student Data",
  "numRows": 19,
  "children": [
    {
      "id": "libraries~SASHELP~CLASS~Name",
      "name": "Name",
      "isLibrary": false,
      "table": false,
      "isReadOnly": true,
      "type": "Char",
      "dataType": null,
      "length": 8,
      "library": "columns",
      "tableName": "CLASS",
      "engine": "V9",
      "uri": "libraries~SASHELP~CLASS/Name",
      "children": []
    },
    {
      "id": "libraries~SASHELP~CLASS~Sex",
      "name": "Sex",
      "isLibrary": false,
      "table": false,
      "isReadOnly": true,
      "type": "Char",
      "length": 1,
      "library": "columns",
      "tableName": "CLASS",
      "engine": "V9",
      "children": []
    },
    {
      "id": "libraries~SASHELP~CLASS~Age",
      "name": "Age",
      "isLibrary": false,
      "table": false,
      "isReadOnly": true,
      "type": "Numeric",
      "length": 8,
      "library": "columns",
      "tableName": "CLASS",
      "engine": "V9",
      "children": []
    }
  ]
}
```

**Key Fields for Columns:**

| Field        | Description                                      |
| ------------ | ------------------------------------------------ |
| `id`         | Unique ID (e.g., "libraries~SASHELP~CLASS~Name") |
| `name`       | Column name                                      |
| `table`      | Always `false` for columns                       |
| `isLibrary`  | Always `false` for columns                       |
| `type`       | SAS data type: "Char" or "Numeric"               |
| `length`     | Field length in bytes                            |
| `library`    | Always "columns" for column nodes                |
| `tableName`  | Parent table name                                |
| `isReadOnly` | Always `true` for columns                        |
| `engine`     | Storage engine (e.g., "V9")                      |

**Parent Table Fields:**

| Field      | Description                       |
| ---------- | --------------------------------- |
| `numRows`  | Total number of rows in the table |
| `desc`     | Table description                 |
| `dataType` | Always "DATA" for tables          |
| `children` | Array of column nodes             |

### Get Table Columns (Alternative)

Retrieves column metadata using the sessions endpoint (alternative approach).

**Endpoint:**

```
POST /sessions/{sessionId}/tables/{library}/{table}/
```

**Query Parameters:**
| Parameter | Value | Description |
|---------------------|---------|---------------------------------|
| getViewColumnCount | true | Include view column count |

**Headers:**

```
Content-Type: application/json
RemoteSession-Id: {sessionId}
Cookie: {session_cookie}
```

**Request Body:**

```json
{
  "isMultipleWorkspace": "",
  "serverName": "",
  "dataSetKey": "",
  "clearCache": "false"
}
```

**Response:**

```json
{
  "items": [
    {
      "name": "date",
      "label": "Date",
      "type": "num",
      "length": 8,
      "format": { "name": "DATE9.", "width": 9, "precision": 0 },
      "informat": { "name": "DATE9.", "width": 9, "precision": 0 }
    },
    {
      "name": "air",
      "label": "Air Passengers",
      "type": "num",
      "length": 8
    }
  ]
}
```

**Column Types:**

- `num` - Numeric
- `char` - Character/string

### Query Table Data (SQL)

Executes SQL to retrieve table data with pagination.

**Endpoint:**

```
POST /sessions/{sessionId}/sql
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|--------|-------------------------------------|
| numobs | number | Maximum number of observations |

**Headers:**

```
Content-Type: application/json
RemoteSession-Id: {sessionId}
Cookie: {session_cookie}
```

**Request Body:** SQL query string

**Example:**

```sql
select * from SASHELP.'AIR'n(firstobs=1 obs=101)
```

**Response:**

```json
{
  "colNames": ["date", "air"],
  "rows": [
    ["14419", "112"],
    ["14450", "118"],
    ["14478", "132"]
  ],
  "count": 144
}
```

**Notes:**

- `firstobs` and `obs` are dataset options for pagination
- `count` is total row count (if available)
- All values are returned as strings

### Get Table Row Count

Retrieves the total number of rows in a table.

**Endpoint:**

```
POST /sessions/{sessionId}/sql
```

**Headers:**

```
Content-Type: application/json
RemoteSession-Id: {sessionId}
Cookie: {session_cookie}
```

**Request Body:**

```sql
select count(*) as N from {library}.'{table}'n
```

**Response:**

```json
{
  "colNames": ["N"],
  "rows": [["144"]],
  "count": 1
}
```

---

## Additional API Patterns Discovered

### URL Path Encoding

SAS Studio uses special encoding for file paths in URLs:

**Tilde Notation:**

- `~ps~` = path separator (/)
- `~dot~` = dot (.)
- `~` = space or special character

**Example:**

```
/folders/myfolders/test.sas
```

Becomes:

```
~ps~folders~ps~myfolders~ps~test~dot~sas~
```

**Full URL Example:**

```
GET /sasexec/{sessionId}/~ps~folders~ps~myfolders~ps~test~dot~sas~
```

### Session ID in URL Patterns

Two different URL patterns are used depending on the endpoint:

1. **Session-scoped endpoints:**

   ```
   /sasexec/sessions/{sessionId}/...
   ```

2. **Direct session endpoints (older pattern):**
   ```
   /sasexec/{sessionId}/...
   ```

### Cache-Busting Parameters

The web interface uses cache-busting query parameters:

- `dojo.preventCache={timestamp}` - Used in GET requests
- `request.preventCache={timestamp}` - Used in longpoll requests
- `time={encoded_datetime}` - Used in folder/library listing

**Example:**

```
GET /sasexec/sessions/{id}/messages/longpoll?request.preventCache=1773409335063
```

### Workspace File Access

Files are accessed through the workspace endpoint:

```
GET /sasexec/sessions/{sessionId}/workspace/{filePath}
```

**Example:**

```
GET /sasexec/sessions/{id}/workspace/PHOLDER~ps~.git~ps~HEAD
```

### Results Retrieval

After code execution, results are fetched using the submission ID:

```
GET /sasexec/submissions/{submissionId}/results
```

This endpoint is called after receiving the `SubmitComplete` message from longpoll.

---

## Error Handling

### Common HTTP Status Codes

| Status | Description                              |
| ------ | ---------------------------------------- |
| 200    | Success                                  |
| 401    | Unauthorized - Invalid session or cookie |
| 404    | Not Found - File/table does not exist    |
| 500    | Server Error - SAS execution error       |

### Error Response Format

```json
{
  "errorCode": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": "Additional error details"
}
```

---

## TypeScript Implementation Reference

### Axios Configuration

```typescript
import axios from "axios";

// Production: authCookie is the authorization token from the SAS Studio login flow.
// Dev instance: no authorization cookie needed; pass an empty string or omit the Cookie header.
const axiosInstance = axios.create({
  baseURL: `${endpoint}/sasexec`,
  headers: {
    ...(authCookie ? { Cookie: authCookie } : {}),
    "RemoteSession-Id": sessionId,
  },
});
```

### File Path Encoding

The `/sessions/{id}/workspace/` endpoint uses a double-slash before the path (since `filePath` starts with `/`):

```typescript
const fileUrl = `/sessions/${sessionId}/workspace/${filePath}`;
// e.g. /sessions/{id}/workspace//folders/myfolders/file.sas
```

> **Note:** The `~~ds~~` prefix does NOT work with the `/sessions/{id}/workspace/` endpoint (returns 404). It is only used with the non-session directory listing endpoint `/{sessionId}/~ps~encoded~ps~path`.

### Polling Pattern

```typescript
while (!done) {
  const { data: messages } = await axios.get(
    `/sessions/${sessionId}/messages/longpoll`,
  );

  if (!messages || messages.length === 0) {
    break; // Execution complete
  }

  for (const message of messages) {
    if (message.messageType === "SubmitComplete") {
      done = true;
      // Process results...
    }
  }
}
```

---

## Real-World API Examples

### Observed API Calls from Browser Exploration

Based on browser network monitoring of SAS Studio at `http://192.168.0.141/SASStudio/38/main`:

**Session Initialization:**

```
POST /SASStudio/38/sasexec/sessions
→ Returns: {sessionId: "526b2d56-b727-4613-82e7-e9ac640aeb6d", ...}
```

**Code Submission:**

```
POST /SASStudio/38/sasexec/sessions/{id}/asyncSubmissions?label=Program%201&uri=Program%201&pdf=true&rtf=true
Content-Type: text/plain; charset=UTF-8

Request Body: proc print data=sashelp.class; run;

→ Returns: {id: "261473b8-3fcb-4cba-8293-0c52a450e018", status: "running"}
```

**Long-Polling for Messages:**

```
GET /SASStudio/38/sasexec/sessions/{id}/messages/longpoll?request.preventCache=1773409335063
→ Returns: [{messageType: "LogChunk", payload: {...}}, {messageType: "SubmitComplete", ...}]
```

**Results Retrieval:**

```
GET /SASStudio/38/sasexec/submissions/{submissionId}/results?dojo.preventCache=1773409335440
→ Returns: HTML results content
```

**Library Root Listing:**

```
GET /SASStudio/38/sasexec/libdata/{sessionId}/_root_?tableName=&time=Fri,%2013%20Mar%202026%2013:44:03%20GMT
→ Returns: [{library: "SASHELP", ...}, {library: "WORK", ...}]
```

**File System Root:**

```
GET /SASStudio/38/sasexec/{sessionId}/_root_
→ Returns: [{name: "My Folders", uri: "/folders/myfolders", type: "directory", ...}]
```

**Reading File Content:**

```
GET /SASStudio/38/sasexec/{sessionId}/~ps~folders~ps~myfolders~ps~test~dot~sas~
→ Returns: File content as text
```

**Session Keep-Alive:**

```
GET /SASStudio/38/sasexec/sessions/{id}/ping?dojo.preventCache=1773409266027
→ Returns: {status: "ok"}
```

**SQL Query Execution:**

```
POST /SASStudio/38/sasexec/sessions/{id}/sql
Content-Type: application/json

Request Body: select * from sashelp.class (firstobs=1 obs=101)

→ Returns: {colNames: ["Name", "Sex", "Age", "Height", "Weight"], rows: [...], count: 19}
```

---

## Libraries Sidebar Implementation Guide

This section provides guidance for implementing the Libraries sidebar in the VS Code extension using the StudioWeb connection type.

### Tree Structure

The libraries sidebar should display a hierarchical tree:

```
My Libraries (root)
├── BCS (library)
│   ├── table1 (table)
│   └── table2 (table)
├── SASHELP (library)
│   ├── CLASS (table)
│   │   ├── Name (column)
│   │   ├── Sex (column)
│   │   ├── Age (column)
│   │   ├── Height (column)
│   │   └── Weight (column)
│   └── ...
├── SASUSER (library)
├── WEBWORK (library)
└── WORK (library)
```

### Implementation Steps

#### 1. Fetch Root Libraries

```typescript
const response = await axios.get(`/libdata/${sessionId}/libraries`);
const libraries = response.data.children; // Array of library nodes
```

#### 2. Create Library Tree Items

For each library node, create a tree item:

- **Label**: `library.name` (e.g., "SASHELP")
- **CollapsibleState**: `Expanded` or `Collapsed`
- **Icon**: Library icon (differentiate read-only vs writable)
- **Context Value**: `"library"`
- **Tooltip**: Show `library.data.concats[0].physicalName` (physical path)

**Read-only Check**: `library.isReadOnly` or `library.data.readOnly`

#### 3. Expand Library to Show Tables

When user expands a library:

```typescript
const response = await axios.get(`/libdata/${sessionId}/libraries~${libref}`);
const tables = response.data.children; // Array of table nodes
```

For each table node:

- **Label**: `table.name` (e.g., "CLASS")
- **CollapsibleState**: `Collapsed` (lazy-load columns)
- **Icon**: Table icon
- **Context Value**: `"table"`
- **Tooltip**: Show `table.desc` (description) and `table.numRows` (row count)

#### 4. Expand Table to Show Columns

When user expands a table:

```typescript
const response = await axios.get(
  `/libdata/${sessionId}/libraries~${libref}~${tableName}`,
);
const columns = response.data.children; // Array of column nodes
```

For each column node:

- **Label**: `column.name` (e.g., "Name")
- **CollapsibleState**: `None` (columns are leaf nodes)
- **Icon**: Column icon (differentiate Char vs Numeric)
- **Context Value**: `"column"`
- **Tooltip**: Show `column.type` (Char/Numeric) and `column.length`

**Type Check**: `column.type` is "Char" or "Numeric"

### Key Implementation Notes

#### Node Type Detection

```typescript
function getNodeType(
  node: LibdataNode,
): "library" | "table" | "column" | "root" {
  if (node.id === "_root_" || node.id === "libraries") return "root";
  if (node.isLibrary || (node.data && node.data.isLibrary)) return "library";
  if (node.table) return "table";
  if (!node.isLibrary && !node.table && node.library === "columns")
    return "column";
  return "unknown";
}
```

#### ID Parsing

The `id` field uses tilde (`~`) as delimiter:

```typescript
// Parse library~table~column IDs
function parseNodeId(id: string): {
  libref?: string;
  table?: string;
  column?: string;
} {
  const parts = id.split("~");
  if (parts.length >= 2) return { libref: parts[1] };
  if (parts.length >= 3) return { libref: parts[1], table: parts[2] };
  if (parts.length >= 4)
    return { libref: parts[1], table: parts[2], column: parts[3] };
  return {};
}
```

#### API Endpoints by Node Type

| Node Type | Endpoint Pattern                                  | Example                    |
| --------- | ------------------------------------------------- | -------------------------- |
| Root      | `/libdata/{sessionId}/_root_`                     | All libraries container    |
| Library   | `/libdata/{sessionId}/libraries~{libref}`         | `/libraries~SASHELP`       |
| Table     | `/libdata/{sessionId}/libraries~{libref}~{table}` | `/libraries~SASHELP~CLASS` |
| Column    | Same as parent table (children array)             | N/A                        |

#### Error Handling

Common errors when fetching libraries:

| HTTP Status | Meaning                        | Action                           |
| ----------- | ------------------------------ | -------------------------------- |
| 401         | Unauthorized (invalid session) | Prompt user to reconnect         |
| 404         | Library/table not found        | Show "Not Found" message         |
| 500         | SAS execution error            | Show error details from response |

#### Caching Strategy

- **Libraries list**: Cache for the session duration
- **Tables list**: Cache per library, refresh on manual refresh
- **Columns**: Cache per table, refresh on manual refresh
- **Row counts**: Cache but refresh when table is expanded

---

## VS Code Extension Integration

### Implemented Features

**Library Navigator (`StudioWebLibraryAdapter.ts`):**

- ✅ List libraries (`getLibraries`)
- ✅ List tables in library (`getTables`)
- ✅ Get table columns (`getColumns`)
- ✅ Get table data with pagination (`getRows`)
- ✅ Get row count (`getTableRowCount`)
- ✅ Delete table (`deleteTable`)
- ✅ Get table info (`getTableInfo`)

**Server/File Navigator (`StudioWebServerAdapter.ts`):**

- ✅ List directory contents (`getChildItems`)
- ✅ Get file content (`getContentOfItem`)
- ✅ Create/update file (`updateContentOfItem`)
- ✅ Delete file (`deleteItem`)
- ✅ Create new file (`createNewItem`)
- ✅ Create new folder (`createNewFolder`)
- ⚠️ Rename item (`renameItem`) - Not supported by API
- ⚠️ Move item (`moveItem`) - Not supported by API

**Code Execution (`StudioWebSession.ts`):**

- ✅ Submit SAS code (`_run`)
- ✅ Cancel execution (`cancel`)
- ✅ Stream log output (via polling)
- ✅ Fetch HTML results

---

## Notes

1. **Session Management**: Credentials are stored in memory only (`state.ts`), never persisted to disk
2. **Long Polling**: The `/messages/longpoll` endpoint blocks until messages are available
3. **Empty Response**: An empty array `[]` from longpoll indicates execution has ended
4. **HTML Log**: Log chunks are HTML-formatted; strip tags for plain text display
5. **Path Format**: File paths use forward slashes `/` regardless of OS
6. **Dataset Options**: SAS dataset options like `firstobs` and `obs` work in SQL queries
7. **Table Names**: Use `'TABLENAME'n` syntax for names with special characters
