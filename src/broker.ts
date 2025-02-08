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
  ICancelOrderRiskManager,
  IMarketProvider,
  IPlaceOrderRiskManager,
  IRuntimeEngine,
  IStrategy,
  ITickReceiver,
  ITraderProvider,
} from "./interfaces.js";

export class Broker implements IRuntimeEngine {
  private readonly trader: ITraderProvider;
  private readonly market: IMarketProvider;
  private readonly strategies: IStrategy[] = [];
  private readonly placeOrderRiskManagers: IPlaceOrderRiskManager[] = [];
  private readonly cancelOrderRiskManagers: ICancelOrderRiskManager[] = [];

  constructor(trader: ITraderProvider, market: IMarketProvider) {
    this.trader = trader;
    this.market = market;
  }

  start() {}

  stop() {}

  addStrategy(strategy: IStrategy) {
    this.strategies.push(strategy);
  }

  addPlaceOrderRiskManager(riskMgr: IPlaceOrderRiskManager) {
    this.placeOrderRiskManagers.push(riskMgr);
  }

  addCancelOrderRiskManager(riskMgr: ICancelOrderRiskManager) {
    this.cancelOrderRiskManagers.push(riskMgr);
  }

  emitCustomRisk(reason: string) {
    this.strategies.forEach((strategy) =>
      strategy.onRisk("custom-risk", reason),
    );
  }

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
