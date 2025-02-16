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
import { ILifecycleListener } from "./interfaces.js";
import { ProviderErrors } from "./errors.js";

export type ProviderErrorType = ProviderErrors["code"];

export type UserInfo = {
  BrokerID: string;
  UserID: string;
  Password: string;
  InvestorID: string;
  UserProductInfo: string;
  AuthCode: string;
  AppID: string;
};

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

  protected _isErrorResp(
    lifecycle: ILifecycleListener,
    options: ctp.CallbackOptions,
    error: ProviderErrorType,
  ) {
    if (!options.rspInfo) {
      return false;
    }

    lifecycle.onError(
      Object.freeze({
        code: error,
        message: `${options.rspInfo.ErrorID}:${options.rspInfo.ErrorMsg}`,
      }),
    );

    return true;
  }

  protected _parseTime(time: string) {
    const [hour, minute, second] = time.split(":").map(parseInt);
    return hour * 10000 + minute * 100 + second;
  }
}
