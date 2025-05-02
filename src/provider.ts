/*
 * provider.ts
 *
 * Copyright (c) 2025 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/shixiongfei/hft.js
 */

import fs from "node:fs";
import ctp from "napi-ctp";
import { ErrorType, ILifecycleListener } from "./interfaces.js";

export class CTPProvider {
  protected readonly flowPath: string;
  protected readonly frontAddrs: string | string[];

  constructor(flowPath: string, frontAddrs: string | string[]) {
    this.flowPath = flowPath;
    this.frontAddrs = frontAddrs;

    try {
      fs.accessSync(this.flowPath);
    } catch {
      fs.mkdirSync(this.flowPath, { recursive: true });
    }
  }

  private _sleep(ms: number) {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  protected async _withRetry(request: () => number | undefined, ms = 100) {
    for (;;) {
      const retval = request();

      if (retval === 0) {
        return ctp.getLastRequestId();
      }

      if (-2 === retval || -3 === retval) {
        await this._sleep(ms);
        continue;
      }

      return retval;
    }
  }

  protected _isErrorResp(
    lifecycle: ILifecycleListener,
    options: ctp.CallbackOptions,
    error: ErrorType,
  ) {
    if (!options.rspInfo) {
      return false;
    }

    lifecycle.onError(
      error,
      `${options.rspInfo.ErrorID}:${options.rspInfo.ErrorMsg}`,
    );

    return true;
  }

  protected _parseTime(time: string) {
    const [hour, minute, second] = time.split(":").map((x) => parseInt(x));
    return hour * 10000 + minute * 100 + second;
  }
}
