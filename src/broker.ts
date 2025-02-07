/*
 * broker.ts
 *
 * Copyright (c) 2025 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/shixiongfei/hft.js
 */

import {
  IMarketProvider,
  IRuntimeEngine,
  ITickReceiver,
  ITraderProvider,
} from "./interfaces.js";

export class Broker implements IRuntimeEngine {
  private readonly trader: ITraderProvider;
  private readonly market: IMarketProvider;

  constructor(trader: ITraderProvider, market: IMarketProvider) {
    this.trader = trader;
    this.market = market;
  }

  start() {}

  stop() {}

  subscribe(symbols: string[], receiver: ITickReceiver) {
    this.market.subscribe(symbols, receiver);
  }

  unsubscribe(symbols: string[], receiver: ITickReceiver) {
    this.market.unsubscribe(symbols, receiver);
  }
}

export const createBroker = (
  trader: ITraderProvider,
  market: IMarketProvider,
) => new Broker(trader, market);
