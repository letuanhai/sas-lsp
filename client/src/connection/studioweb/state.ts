// Copyright © 2024, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import axios, { AxiosInstance } from "axios";

export interface StudioWebCredentials {
  endpoint: string; // e.g. https://sas8.example.com
  sessionId: string;
  cookieString: string; // raw Cookie header value, e.g. "name=value; name2=value2"
}

let _credentials: StudioWebCredentials | undefined;
let _axios: AxiosInstance | undefined;

export function getCredentials(): StudioWebCredentials | undefined {
  return _credentials;
}

export function getAxios(): AxiosInstance | undefined {
  return _axios;
}

export function setCredentials(creds: StudioWebCredentials | undefined): void {
  _credentials = creds;
  if (creds) {
    _axios = axios.create({
      baseURL: `${creds.endpoint}/sasexec`,
      headers: {
        Cookie: creds.cookieString,
        "RemoteSession-Id": creds.sessionId,
      },
    });
  } else {
    _axios = undefined;
  }
}
