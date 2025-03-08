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

import { OffsetType, OrderData, OrderFlag, SideType } from "./typedef.js";
import { BarGenerator, createBarGenerator } from "bar.js";
import {
  ICancelOrderResultReceiver,
  ErrorType,
  ICancelOrderRiskManager,
  ICommissionRateReceiver,
  IErrorReceiver,
  IInstrumentReceiver,
  IInstrumentsReceiver,
  ILifecycleListener,
  IMarginRateReceiver,
  IMarketProvider,
  IOrdersReceiver,
  IPlaceOrderRiskManager,
  IPositionsReceiver,
  IRuntimeEngine,
  IStrategy,
  ITickReceiver,
  ITraderProvider,
  ITradingAccountsReceiver,
  IPlaceOrderResultReceiver,
  IPositionReceiver,
  IPositionDetailsReceiver,
  IBarReceiver,
} from "./interfaces.js";

export class Broker implements IRuntimeEngine {
  private readonly trader: ITraderProvider;
  private readonly market: IMarketProvider;
  private readonly traderLifecycle: ILifecycleListener;
  private readonly marketLifecycle: ILifecycleListener;
  private readonly strategies: IStrategy[] = [];
  private readonly placeOrderRiskManagers: IPlaceOrderRiskManager[] = [];
  private readonly cancelOrderRiskManagers: ICancelOrderRiskManager[] = [];
  private readonly generators: Map<string, BarGenerator>;

  constructor(
    trader: ITraderProvider,
    market: IMarketProvider,
    errorReceiver?: IErrorReceiver,
  ) {
    this.trader = trader;
    this.market = market;
    this.generators = new Map();

    this.marketLifecycle = {
      onOpen: () => {
        if (this.market.hasRecorder()) {
          this.trader.queryInstruments({
            onInstruments: (instruments) => {
              if (instruments) {
                this.market.startRecorder(instruments);
              }
            },
          });
        }

        this.strategies.forEach((strategy) => strategy.onInit(this));
      },
      onClose: () => {
        this.strategies.forEach((strategy) => strategy.onDestroy(this));
        this.market.stopRecorder();
      },
      onError: (error: ErrorType, message: string) => {
        if (errorReceiver) {
          errorReceiver.onError(error, message);
        }
      },
    };

    this.traderLifecycle = {
      onOpen: () => {
        this.market.open(this.marketLifecycle);
      },
      onClose: () => {
        this.market.close(this.marketLifecycle);
      },
      onError: (error: ErrorType, message: string) => {
        if (errorReceiver) {
          errorReceiver.onError(error, message);
        }
      },
    };
  }

  start() {
    return this.trader.open(this.traderLifecycle);
  }

  stop() {
    return this.trader.close(this.traderLifecycle);
  }

  addStrategy(strategy: IStrategy) {
    if (!this.strategies.includes(strategy)) {
      this.strategies.push(strategy);
      this.trader.addReceiver(strategy);
    }
  }

  removeStrategy(strategy: IStrategy) {
    const index = this.strategies.indexOf(strategy);

    if (index < 0) {
      return;
    }

    this.strategies.splice(index, 1);
    this.trader.removeReceiver(strategy);
  }

  addPlaceOrderRiskManager(riskMgr: IPlaceOrderRiskManager) {
    if (!this.placeOrderRiskManagers.includes(riskMgr)) {
      this.placeOrderRiskManagers.push(riskMgr);
    }
  }

  addCancelOrderRiskManager(riskMgr: ICancelOrderRiskManager) {
    if (!this.cancelOrderRiskManagers.includes(riskMgr)) {
      this.cancelOrderRiskManagers.push(riskMgr);
    }
  }

  subscribe(symbols: string[], receiver: ITickReceiver) {
    return this.market.subscribe(symbols, receiver);
  }

  unsubscribe(symbols: string[], receiver: ITickReceiver) {
    return this.market.unsubscribe(symbols, receiver);
  }

  subscribeBar(symbols: string[], receiver: IBarReceiver) {
    symbols.forEach((symbol) => {
      let generator = this.generators.get(symbol);

      if (!generator) {
        generator = createBarGenerator();

        this.generators.set(symbol, generator);
        this.subscribe([symbol], generator);
      }

      generator.addReceiver(receiver);
    });
  }

  unsubscribeBar(symbols: string[], receiver: IBarReceiver) {
    symbols.forEach((symbol) => {
      const generator = this.generators.get(symbol);

      if (!generator) {
        return;
      }

      generator.removeReceiver(receiver);

      if (!generator.isWorking) {
        this.unsubscribe([symbol], generator);
        this.generators.delete(symbol);
      }
    });
  }

  placeOrder(
    strategy: IStrategy,
    symbol: string,
    offset: OffsetType,
    side: SideType,
    volume: number,
    price: number,
    flag: OrderFlag,
    receiver: IPlaceOrderResultReceiver,
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
          receiver.onPlaceOrderError("Risk Rejected");
          return;
        }
      } else {
        strategy.onRisk("place-order-risk", result);
        receiver.onPlaceOrderError("Risk Rejected");
        return;
      }
    }

    return this.trader.placeOrder(
      symbol,
      offset,
      side,
      volume,
      price,
      flag,
      receiver,
    );
  }

  cancelOrder(
    strategy: IStrategy,
    order: OrderData,
    receiver: ICancelOrderResultReceiver,
  ) {
    for (const cancelOrderRiskManager of this.cancelOrderRiskManagers) {
      const result = cancelOrderRiskManager.onCancelOrder(order);

      if (typeof result === "boolean") {
        if (!result) {
          strategy.onRisk("cancel-order-risk");
          receiver.onCancelOrderError("Risk Rejected");
          return;
        }
      } else {
        strategy.onRisk("cancel-order-risk", result);
        receiver.onCancelOrderError("Risk Rejected");
        return;
      }
    }

    return this.trader.cancelOrder(order, receiver);
  }

  buyOpen(
    strategy: IStrategy,
    symbol: string,
    volume: number,
    price: number,
    receiver: IPlaceOrderResultReceiver,
  ) {
    return this.placeOrder(
      strategy,
      symbol,
      "open",
      "long",
      volume,
      price,
      "limit",
      receiver,
    );
  }

  buyClose(
    strategy: IStrategy,
    symbol: string,
    volume: number,
    price: number,
    isToday: boolean,
    receiver: IPlaceOrderResultReceiver,
  ) {
    return this.placeOrder(
      strategy,
      symbol,
      isToday ? "close-today" : "close",
      "long",
      volume,
      price,
      "limit",
      receiver,
    );
  }

  sellOpen(
    strategy: IStrategy,
    symbol: string,
    volume: number,
    price: number,
    receiver: IPlaceOrderResultReceiver,
  ) {
    return this.placeOrder(
      strategy,
      symbol,
      "open",
      "short",
      volume,
      price,
      "limit",
      receiver,
    );
  }

  sellClose(
    strategy: IStrategy,
    symbol: string,
    volume: number,
    price: number,
    isToday: boolean,
    receiver: IPlaceOrderResultReceiver,
  ) {
    return this.placeOrder(
      strategy,
      symbol,
      isToday ? "close-today" : "close",
      "short",
      volume,
      price,
      "limit",
      receiver,
    );
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

  queryPosition(symbol: string, receiver: IPositionReceiver) {
    return this.trader.queryPosition(symbol, receiver);
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

  queryPositionDetails(receiver: IPositionDetailsReceiver) {
    return this.trader.queryPositionDetails(receiver);
  }

  queryOrders(receiver: IOrdersReceiver) {
    return this.trader.queryOrders(receiver);
  }
}

export const createBroker = (
  trader: ITraderProvider,
  market: IMarketProvider,
  errorReceiver?: IErrorReceiver,
) => new Broker(trader, market, errorReceiver);
