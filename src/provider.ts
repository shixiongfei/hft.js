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

import ctp from "napi-ctp";

export type UserInfo = {};

export class CTPProvider {
  protected readonly flowPath: string;
  protected readonly frontAddrs: string | string[];
  protected readonly userInfo: UserInfo;

  constructor(
    flowPath: string,
    frontAddrs: string | string[],
    userInfo: UserInfo,
  ) {
    this.flowPath = flowPath;
    this.frontAddrs = frontAddrs;
    this.userInfo = userInfo;
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

      if (-2 !== retval && -3 !== retval) {
        return retval;
      }

      await this._sleep(ms);
    }
  }

  protected _symbolToInstrumentId(symbol: string) {
    return symbol.split(".")[0];
  }
}
