/*
 * broker.ts
 *
 * Copyright (c) 2025 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/hft-js/hft.js
 */

import {
  OffsetType,
  OrderData,
  OrderFlag,
  SideType,
  TradeData,
} from "./typedef.js";
import {
  ICancelOrderRiskManager,
  ICommissionRateReceiver,
  IInstrumentReceiver,
  IInstrumentsReceiver,
  ILifecycleListener,
  IMarginRateReceiver,
  IMarketProvider,
  IOrderReceiver,
  IOrdersReceiver,
  IPlaceOrderRiskManager,
  IPositionsReceiver,
  IRuntimeEngine,
  IStrategy,
  ITickReceiver,
  ITraderProvider,
  ITradingAccountsReceiver,
} from "./interfaces.js";

export class Broker implements IRuntimeEngine, IOrderReceiver {
  private readonly trader: ITraderProvider;
  private readonly market: IMarketProvider;
  private readonly traderLifecycle: ILifecycleListener;
  private readonly marketLifecycle: ILifecycleListener;
  private readonly strategies: IStrategy[] = [];
  private readonly placeOrderRiskManagers: IPlaceOrderRiskManager[] = [];
  private readonly cancelOrderRiskManagers: ICancelOrderRiskManager[] = [];

  constructor(trader: ITraderProvider, market: IMarketProvider) {
    this.trader = trader;
    this.market = market;

    this.marketLifecycle = {
      onInit: () => {
        this.strategies.forEach((strategy) => strategy.onInit(this));
      },
      onDestroy: () => {
        this.strategies.forEach((strategy) => strategy.onDestroy(this));
      },
    };

    this.traderLifecycle = {
      onInit: () => {
        this.market.login(this.marketLifecycle);
      },
      onDestroy: () => {
        this.market.logout(this.marketLifecycle);
      },
    };

    this.trader.addReceiver(this);
  }

  onEntrust(order: OrderData) {
    this.strategies.forEach((strategy) => strategy.onEntrust(order));
  }

  onTrade(order: OrderData, trade: TradeData) {
    this.strategies.forEach((strategy) => strategy.onTrade(order, trade));
  }

  onCancel(order: OrderData) {
    this.strategies.forEach((strategy) => strategy.onCancel(order));
  }

  onReject(order: OrderData) {
    this.strategies.forEach((strategy) => strategy.onReject(order));
  }

  start() {
    return this.trader.login(this.traderLifecycle);
  }

  stop() {
    return this.trader.logout(this.traderLifecycle);
  }

  addStrategy(strategy: IStrategy) {
    this.strategies.push(strategy);
  }

  addPlaceOrderRiskManager(riskMgr: IPlaceOrderRiskManager) {
    this.placeOrderRiskManagers.push(riskMgr);
  }

  addCancelOrderRiskManager(riskMgr: ICancelOrderRiskManager) {
    this.cancelOrderRiskManagers.push(riskMgr);
  }

  subscribe(symbols: string[], receiver: ITickReceiver) {
    return this.market.subscribe(symbols, receiver);
  }

  unsubscribe(symbols: string[], receiver: ITickReceiver) {
    return this.market.unsubscribe(symbols, receiver);
  }

  placeOrder(
    strategy: IStrategy,
    symbol: string,
    offset: OffsetType,
    side: SideType,
    volume: number,
    price: number,
    flag: OrderFlag,
  ) {
    for (const placeOrderRiskManager of this.placeOrderRiskManagers) {
      const result = placeOrderRiskManager.onPlaceOrder(
        symbol,
        offset,
        side,
        volume,
        price,
        flag,
      );

      if (typeof result === "boolean") {
        if (!result) {
          strategy.onRisk("place-order-risk");
          return undefined;
        }
      } else {
        strategy.onRisk("place-order-risk", result);
        return undefined;
      }
    }

    return this.trader.placeOrder(symbol, offset, side, volume, price, flag);
  }

  cancelOrder(strategy: IStrategy, order: OrderData) {
    for (const cancelOrderRiskManager of this.cancelOrderRiskManagers) {
      const result = cancelOrderRiskManager.onCancelOrder(order);

      if (typeof result === "boolean") {
        if (!result) {
          strategy.onRisk("cancel-order-risk");
          return false;
        }
      } else {
        strategy.onRisk("cancel-order-risk", result);
        return false;
      }
    }

    return this.trader.cancelOrder(order);
  }

  getTradingDay() {
    return this.trader.getTradingDay();
  }

  queryCommissionRate(symbol: string, receiver: ICommissionRateReceiver) {
    return this.trader.queryCommissionRate(symbol, receiver);
  }

  queryMarginRate(symbol: string, receiver: IMarginRateReceiver) {
    return this.trader.queryMarginRate(symbol, receiver);
  }

  queryInstrument(symbol: string, receiver: IInstrumentReceiver) {
    return this.trader.queryInstrument(symbol, receiver);
  }

  queryInstruments(receiver: IInstrumentsReceiver) {
    return this.trader.queryInstruments(receiver);
  }

  queryTradingAccounts(receiver: ITradingAccountsReceiver) {
    return this.trader.queryTradingAccounts(receiver);
  }

  queryPositions(receiver: IPositionsReceiver) {
    return this.trader.queryPositions(receiver);
  }

  queryOrders(receiver: IOrdersReceiver) {
    return this.trader.queryOrders(receiver);
  }
}

export const createBroker = (
  trader: ITraderProvider,
  market: IMarketProvider,
) => new Broker(trader, market);
