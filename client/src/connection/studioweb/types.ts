// Copyright © 2024, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { BaseConfig } from "..";

export interface Config extends BaseConfig {
  endpoint: string; // Base URL e.g. https://sas8.example.com (no trailing slash)
}
